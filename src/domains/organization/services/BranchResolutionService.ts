import { Branch } from "../../../types/organization";
import { BranchNormalizer } from "./BranchNormalizer";
import { BranchRepository } from "../../../repositories/organization";
import { OrganizationCodeService } from "../../../services/organization/OrganizationCodeService";
import {
  BulkImportActorContext,
  OrgImportContext,
  OrgResolutionError,
  ResolveBranchResult,
  classifyEntityTenant,
  evaluateBulkImportActorPermissions,
  generateDeterministicOrgId,
  isInvalidOrgReference,
  isOrgEntityActive,
  stripUndefinedFields
} from "./orgResolutionShared";

export type {
  BulkImportActorContext,
  OrgImportContext,
  ResolveBranchResult
} from "./orgResolutionShared";
export { OrgResolutionError } from "./orgResolutionShared";

export interface ResolveOrCreateBranchParams {
  businessId: string;
  branchName: string;
  branchCode?: string;
  actor?: BulkImportActorContext | null;
  importContext?: OrgImportContext;
}

export function resolveBranchPlanSync(params: {
  businessId: string;
  branchName: string;
  branchCode?: string;
  existingBranches: Branch[];
  branchCache?: Map<string, Branch>;
  actor?: BulkImportActorContext | null;
}): ResolveBranchResult {
  const cleanBizId = (params.businessId || "").trim();
  if (!cleanBizId) {
    throw new OrgResolutionError({
      code: "INVALID_BUSINESS_ID",
      message: "Identifiant d'entreprise manquant pour la résolution de succursale.",
      statusCode: 400,
      entityType: "tenant"
    });
  }

  const rawInput = params.branchName === undefined || params.branchName === null ? "" : String(params.branchName);
  const trimmed = rawInput.normalize("NFKC").trim();
  if (!trimmed) {
    throw new OrgResolutionError({
      code: "MISSING_BRANCH_REFERENCE",
      message: "Référence de succursale manquante (branch_name requis).",
      statusCode: 400,
      entityType: "branch"
    });
  }
  if (isInvalidOrgReference(trimmed)) {
    throw new OrgResolutionError({
      code: "INVALID_ORG_REFERENCE",
      message: `Référence de succursale invalide : "${trimmed}".`,
      statusCode: 400,
      entityType: "branch"
    });
  }

  const normalized = BranchNormalizer.normalize(trimmed);
  const canonical = BranchNormalizer.getCanonicalId(trimmed);
  if (!canonical) {
    throw new OrgResolutionError({
      code: "INVALID_ORG_REFERENCE",
      message: `Nom de succursale invalide (aucun caractère alphanumérique) : "${trimmed}".`,
      statusCode: 400,
      entityType: "branch"
    });
  }

  let canCreateBranch = true;
  if (params.actor !== undefined) {
    const verdict = evaluateBulkImportActorPermissions(params.actor, cleanBizId);
    if (!verdict.allowedToImportEmployees && !verdict.canCreateBranch) {
      throw new OrgResolutionError({
        code: verdict.denialCode || "UNAUTHORIZED_IMPORT_ROLE",
        message: verdict.denialReason || "Acteur non autorisé à résoudre ou importer des succursales.",
        statusCode: 403,
        entityType: "actor"
      });
    }
    canCreateBranch = verdict.canCreateBranch;
  }

  const cacheKey = `${cleanBizId}::${canonical}`;
  const cachedBranch = params.branchCache?.get(cacheKey);
  if (cachedBranch) {
    return {
      status: "REUSED",
      branch: cachedBranch,
      created: false,
      matchedBy: "cache"
    };
  }

  const codeUpper = params.branchCode ? params.branchCode.normalize("NFKC").trim().toUpperCase() : "";

  const activeMatches: Array<{ branch: Branch; matchedBy: ResolveBranchResult["matchedBy"] }> = [];
  const inactiveMatches: Branch[] = [];
  const crossTenantMatches: Branch[] = [];
  const conflictingTenantMatches: Branch[] = [];
  const tenantBranches: Branch[] = [];

  for (const b of params.existingBranches) {
    if (!b) continue;
    const tenantClass = classifyEntityTenant(b, cleanBizId);

    let matchedBy: ResolveBranchResult["matchedBy"] | null = null;
    if (b.id && b.id === trimmed) {
      matchedBy = "id";
    } else if (b.code && codeUpper && b.code.trim().toUpperCase() === codeUpper) {
      matchedBy = "code";
    } else if (b.code && b.code.trim().toUpperCase() === trimmed.toUpperCase()) {
      matchedBy = "code";
    } else if (b.name && BranchNormalizer.normalize(b.name) === normalized) {
      matchedBy = "normalized_name";
    } else if (b.name && BranchNormalizer.getCanonicalId(b.name) === canonical) {
      matchedBy = "canonical_name";
    } else if (
      Array.isArray((b as any).aliases) &&
      ((b as any).aliases as string[]).some(
        (a) =>
          BranchNormalizer.normalize(String(a || "")) === normalized ||
          BranchNormalizer.getCanonicalId(String(a || "")) === canonical
      )
    ) {
      matchedBy = "alias";
    }

    if (tenantClass === "CONFLICT") {
      if (matchedBy) conflictingTenantMatches.push(b);
      continue;
    }
    if (tenantClass === "CROSS_TENANT") {
      if (matchedBy) crossTenantMatches.push(b);
      continue;
    }

    tenantBranches.push(b);
    if (!matchedBy) continue;

    if (isOrgEntityActive(b)) {
      activeMatches.push({ branch: b, matchedBy });
    } else {
      inactiveMatches.push(b);
    }
  }

  const uniqueActiveMap = new Map<string, { branch: Branch; matchedBy: ResolveBranchResult["matchedBy"] }>();
  for (const m of activeMatches) {
    if (!uniqueActiveMap.has(m.branch.id)) {
      uniqueActiveMap.set(m.branch.id, m);
    }
  }
  const uniqueActive = Array.from(uniqueActiveMap.values());

  if (uniqueActive.length > 1) {
    throw new OrgResolutionError({
      code: "AMBIGUOUS_BRANCH_REFERENCE",
      message: `Référence de succursale ambiguë "${trimmed}" : ${uniqueActive.length} succursales actives correspondent dans l'entreprise.`,
      statusCode: 409,
      entityType: "branch",
      details: { candidateIds: uniqueActive.map((m) => m.branch.id) }
    });
  }

  if (uniqueActive.length === 1) {
    const matched = uniqueActive[0];
    params.branchCache?.set(cacheKey, matched.branch);
    return {
      status: "REUSED",
      branch: matched.branch,
      created: false,
      matchedBy: matched.matchedBy
    };
  }

  if (conflictingTenantMatches.length > 0) {
    throw new OrgResolutionError({
      code: "CONFLICTING_TENANT_FIELDS",
      message: `Incohérence tenant sur la succursale correspondante à "${trimmed}".`,
      statusCode: 403,
      entityType: "branch"
    });
  }

  if (inactiveMatches.length > 0) {
    throw new OrgResolutionError({
      code: "INACTIVE_ORG_REFERENCE",
      message: `La succursale "${inactiveMatches[0].name || trimmed}" existe mais est inactive.`,
      statusCode: 409,
      entityType: "branch"
    });
  }

  if (crossTenantMatches.length > 0) {
    throw new OrgResolutionError({
      code: "CROSS_TENANT_ORG_REFERENCE",
      message: `Référence de succursale inter-tenant interdite pour "${trimmed}".`,
      statusCode: 403,
      entityType: "branch"
    });
  }

  if (!canCreateBranch) {
    throw new OrgResolutionError({
      code: "UNAUTHORIZED_BRANCH_CREATION",
      message: `Permission 'branch.create' requise pour créer automatiquement la nouvelle succursale "${trimmed}".`,
      statusCode: 403,
      entityType: "branch"
    });
  }

  const cachedKnownBranches = params.branchCache ? Array.from(params.branchCache.values()) : [];
  const codePool = [...tenantBranches, ...cachedKnownBranches];
  const generatedCode = codeUpper || OrganizationCodeService.generateBranchCode(codePool);
  const branchId = generateDeterministicOrgId("b_auto", cleanBizId, canonical);
  const now = new Date().toISOString();

  const plannedBranch: Branch = stripUndefinedFields({
    id: branchId,
    business_id: cleanBizId,
    businessId: cleanBizId,
    name: trimmed,
    code: generatedCode,
    status: "ACTIVE",
    is_active: true,
    isActive: true,
    address: "Adresse Principale",
    location: trimmed,
    createdAt: now,
    updatedAt: now,
    created_at: now,
    updated_at: now
  }) as Branch;

  params.branchCache?.set(cacheKey, plannedBranch);

  return {
    status: "CREATED",
    branch: plannedBranch,
    created: true,
    matchedBy: "created"
  };
}

export async function resolveOrCreateBranch(
  params: ResolveOrCreateBranchParams
): Promise<ResolveBranchResult> {
  const cleanBizId = (params.businessId || "").trim();
  const canonical = BranchNormalizer.getCanonicalId(String(params.branchName || "").normalize("NFKC").trim());
  const ctx = params.importContext;
  const cacheKey = `${cleanBizId}::${canonical}`;

  if (cleanBizId && canonical) {
    const cachedBranch = ctx?.branchCache?.get(cacheKey);
    if (cachedBranch) {
      return {
        status: "REUSED",
        branch: cachedBranch,
        created: false,
        matchedBy: "cache"
      };
    }

    const existingFlight = ctx?.inFlightBranches?.get(cacheKey);
    if (existingFlight) {
      const firstResult = await existingFlight;
      return {
        status: "REUSED",
        branch: firstResult.branch,
        created: false,
        matchedBy: "cache"
      };
    }
  }

  const executeResolution = async (): Promise<ResolveBranchResult> => {
    const rawBranches =
      ctx?.existingBranches !== undefined
        ? ctx.existingBranches
        : await BranchRepository.listByBusiness(cleanBizId);

    const planned = resolveBranchPlanSync({
      businessId: cleanBizId,
      branchName: params.branchName,
      branchCode: params.branchCode,
      existingBranches: rawBranches,
      branchCache: ctx?.branchCache,
      actor: params.actor
    });

    if (!planned.created) {
      return planned;
    }

    const shouldPersist = !ctx?.dryRun && ctx?.persist !== false;
    if (shouldPersist) {
      const { id, created_at, updated_at, ...branchData } = planned.branch;
      let finalId = id;
      if (typeof BranchRepository.createWithId === "function") {
        finalId = await BranchRepository.createWithId(id, stripUndefinedFields(branchData));
      } else {
        finalId = await BranchRepository.create(stripUndefinedFields(branchData));
      }
      if (finalId !== planned.branch.id) {
        planned.branch = { ...planned.branch, id: finalId };
        if (canonical) {
          ctx?.branchCache?.set(cacheKey, planned.branch);
        }
      }
    }

    return planned;
  };

  const promise = executeResolution();
  if (ctx?.inFlightBranches && cleanBizId && canonical) {
    ctx.inFlightBranches.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      ctx.inFlightBranches.delete(cacheKey);
    }
  }
  return promise;
}

export class BranchResolutionService {
  public static resolvePlanSync = resolveBranchPlanSync;
  public static resolveOrCreateWithContext = resolveOrCreateBranch;

  /**
   * Legacy 3-argument signature preserved for existing internal callers.
   */
  public static async resolveOrCreate(
    businessId: string,
    rawBranchName: string,
    rawBranchCode?: string
  ): Promise<Branch> {
    const result = await resolveOrCreateBranch({
      businessId,
      branchName: rawBranchName,
      branchCode: rawBranchCode
    });
    return result.branch;
  }
}
