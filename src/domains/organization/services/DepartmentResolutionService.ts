import { Department } from "../../../types/organization";
import { DepartmentNormalizer } from "./DepartmentNormalizer";
import { DepartmentRepository } from "../../../repositories/organization";
import { OrganizationCodeService } from "../../../services/organization/OrganizationCodeService";
import {
  BulkImportActorContext,
  OrgImportContext,
  OrgResolutionError,
  ResolveDepartmentResult,
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
  ResolveDepartmentResult
} from "./orgResolutionShared";
export { OrgResolutionError } from "./orgResolutionShared";

export interface ResolveOrCreateDepartmentParams {
  businessId: string;
  departmentName: string;
  branchId?: string;
  departmentCode?: string;
  actor?: BulkImportActorContext | null;
  importContext?: OrgImportContext;
}

export function resolveDepartmentPlanSync(params: {
  businessId: string;
  departmentName: string;
  branchId?: string;
  departmentCode?: string;
  existingDepartments: Department[];
  departmentCache?: Map<string, Department>;
  actor?: BulkImportActorContext | null;
}): ResolveDepartmentResult {
  const cleanBizId = (params.businessId || "").trim();
  if (!cleanBizId) {
    throw new OrgResolutionError({
      code: "INVALID_BUSINESS_ID",
      message: "Identifiant d'entreprise manquant pour la résolution de département.",
      statusCode: 400,
      entityType: "tenant"
    });
  }

  const rawInput = params.departmentName === undefined || params.departmentName === null ? "" : String(params.departmentName);
  const trimmed = rawInput.normalize("NFKC").trim();
  if (!trimmed) {
    throw new OrgResolutionError({
      code: "MISSING_DEPARTMENT_REFERENCE",
      message: "Référence de département manquante (department_name requis).",
      statusCode: 400,
      entityType: "department"
    });
  }
  if (isInvalidOrgReference(trimmed)) {
    throw new OrgResolutionError({
      code: "INVALID_ORG_REFERENCE",
      message: `Référence de département invalide : "${trimmed}".`,
      statusCode: 400,
      entityType: "department"
    });
  }

  const normalized = DepartmentNormalizer.normalize(trimmed);
  const canonical = DepartmentNormalizer.getCanonicalId(trimmed);
  if (!canonical) {
    throw new OrgResolutionError({
      code: "INVALID_ORG_REFERENCE",
      message: `Nom de département invalide (aucun caractère alphanumérique) : "${trimmed}".`,
      statusCode: 400,
      entityType: "department"
    });
  }

  let canCreateDepartment = true;
  if (params.actor !== undefined) {
    const verdict = evaluateBulkImportActorPermissions(params.actor, cleanBizId);
    if (!verdict.allowedToImportEmployees && !verdict.canCreateDepartment) {
      throw new OrgResolutionError({
        code: verdict.denialCode || "UNAUTHORIZED_IMPORT_ROLE",
        message: verdict.denialReason || "Acteur non autorisé à résoudre ou importer des départements.",
        statusCode: 403,
        entityType: "actor"
      });
    }
    canCreateDepartment = verdict.canCreateDepartment;
  }

  const cleanBranchId = (params.branchId || "").trim();
  const scopedKey = cleanBranchId ? `${cleanBranchId}::${canonical}` : canonical;
  const cacheKey = `${cleanBizId}::${scopedKey}`;

  const cachedDept = params.departmentCache?.get(cacheKey);
  if (cachedDept) {
    return {
      status: "REUSED",
      department: cachedDept,
      created: false,
      matchedBy: "cache"
    };
  }

  const codeUpper = params.departmentCode ? params.departmentCode.normalize("NFKC").trim().toUpperCase() : "";

  const activeMatches: Array<{ dept: Department; matchedBy: ResolveDepartmentResult["matchedBy"] }> = [];
  const inactiveMatches: Department[] = [];
  const crossTenantMatches: Department[] = [];
  const conflictingTenantMatches: Department[] = [];
  const tenantDepartments: Department[] = [];

  for (const d of params.existingDepartments) {
    if (!d) continue;
    const tenantClass = classifyEntityTenant(d, cleanBizId);

    // Deterministic matching only (ID, code, normalized name, canonical name, registered aliases)
    let matchedBy: ResolveDepartmentResult["matchedBy"] | null = null;
    if (d.id && d.id === trimmed) {
      matchedBy = "id";
    } else if (d.code && codeUpper && d.code.trim().toUpperCase() === codeUpper) {
      matchedBy = "code";
    } else if (d.code && d.code.trim().toUpperCase() === trimmed.toUpperCase()) {
      matchedBy = "code";
    } else if (
      (d.normalized_name && DepartmentNormalizer.normalize(d.normalized_name) === normalized) ||
      (d.name && DepartmentNormalizer.normalize(d.name) === normalized)
    ) {
      matchedBy = "normalized_name";
    } else if (d.name && DepartmentNormalizer.getCanonicalId(d.name) === canonical) {
      matchedBy = "canonical_name";
    } else if (
      Array.isArray(d.aliases) &&
      d.aliases.some(
        (a) =>
          DepartmentNormalizer.normalize(String(a || "")) === normalized ||
          DepartmentNormalizer.getCanonicalId(String(a || "")) === canonical
      )
    ) {
      matchedBy = "alias";
    }

    if (tenantClass === "CONFLICT") {
      if (matchedBy) conflictingTenantMatches.push(d);
      continue;
    }
    if (tenantClass === "CROSS_TENANT") {
      if (matchedBy) crossTenantMatches.push(d);
      continue;
    }

    tenantDepartments.push(d);
    if (!matchedBy) continue;

    if (cleanBranchId) {
      const dBranch = (d.branch_id || d.branchId || "").trim();
      if (dBranch && dBranch !== cleanBranchId) {
        continue;
      }
    }

    if (isOrgEntityActive(d)) {
      activeMatches.push({ dept: d, matchedBy });
    } else {
      inactiveMatches.push(d);
    }
  }

  const uniqueActiveMap = new Map<string, { dept: Department; matchedBy: ResolveDepartmentResult["matchedBy"] }>();
  for (const m of activeMatches) {
    if (!uniqueActiveMap.has(m.dept.id)) {
      uniqueActiveMap.set(m.dept.id, m);
    }
  }
  const uniqueActive = Array.from(uniqueActiveMap.values());

  if (uniqueActive.length > 1) {
    throw new OrgResolutionError({
      code: "AMBIGUOUS_DEPARTMENT_REFERENCE",
      message: `Référence de département ambiguë "${trimmed}" : ${uniqueActive.length} départements actifs correspondent.`,
      statusCode: 409,
      entityType: "department",
      details: { candidateIds: uniqueActive.map((m) => m.dept.id) }
    });
  }

  if (uniqueActive.length === 1) {
    const matched = uniqueActive[0];
    params.departmentCache?.set(cacheKey, matched.dept);
    return {
      status: "REUSED",
      department: matched.dept,
      created: false,
      matchedBy: matched.matchedBy
    };
  }

  if (conflictingTenantMatches.length > 0) {
    throw new OrgResolutionError({
      code: "CONFLICTING_TENANT_FIELDS",
      message: `Incohérence tenant sur le département correspondant à "${trimmed}".`,
      statusCode: 403,
      entityType: "department"
    });
  }

  if (inactiveMatches.length > 0) {
    throw new OrgResolutionError({
      code: "INACTIVE_ORG_REFERENCE",
      message: `Le département "${inactiveMatches[0].name || trimmed}" existe mais est inactif.`,
      statusCode: 409,
      entityType: "department"
    });
  }

  if (crossTenantMatches.length > 0) {
    throw new OrgResolutionError({
      code: "CROSS_TENANT_ORG_REFERENCE",
      message: `Référence de département inter-tenant interdite pour "${trimmed}".`,
      statusCode: 403,
      entityType: "department"
    });
  }

  if (!canCreateDepartment) {
    throw new OrgResolutionError({
      code: "UNAUTHORIZED_DEPARTMENT_CREATION",
      message: `Permission 'department.create' requise pour créer automatiquement le nouveau département "${trimmed}".`,
      statusCode: 403,
      entityType: "department"
    });
  }

  const cachedKnownDepts = params.departmentCache ? Array.from(params.departmentCache.values()) : [];
  const codePool = [...tenantDepartments, ...cachedKnownDepts];
  const generatedCode = codeUpper || OrganizationCodeService.generateDepartmentCode(codePool);
  const deptId = generateDeterministicOrgId("d_auto", cleanBizId, scopedKey);
  const now = new Date().toISOString();

  const plannedDept: Department = stripUndefinedFields({
    id: deptId,
    business_id: cleanBizId,
    businessId: cleanBizId,
    ...(cleanBranchId ? { branch_id: cleanBranchId, branchId: cleanBranchId } : {}),
    name: trimmed,
    normalized_name: normalized,
    normalizedName: normalized,
    code: generatedCode,
    status: "ACTIVE",
    is_active: true,
    isActive: true,
    budget: 50000,
    source: "BULK_IMPORT",
    is_system_generated: true,
    isSystemGenerated: true,
    created_by: params.actor?.uid || params.actor?.id || "SYSTEM_IMPORT",
    aliases: Array.from(new Set([canonical, normalized])),
    createdAt: now,
    updatedAt: now,
    created_at: now,
    updated_at: now
  }) as Department;

  params.departmentCache?.set(cacheKey, plannedDept);

  return {
    status: "CREATED",
    department: plannedDept,
    created: true,
    matchedBy: "created"
  };
}

export async function resolveOrCreateDepartment(
  params: ResolveOrCreateDepartmentParams
): Promise<ResolveDepartmentResult> {
  const cleanBizId = (params.businessId || "").trim();
  const cleanBranchId = (params.branchId || "").trim();
  const canonical = DepartmentNormalizer.getCanonicalId(String(params.departmentName || "").normalize("NFKC").trim());
  const scopedKey = cleanBranchId ? `${cleanBranchId}::${canonical}` : canonical;
  const ctx = params.importContext;
  const cacheKey = `${cleanBizId}::${scopedKey}`;

  if (cleanBizId && canonical) {
    const cachedDept = ctx?.departmentCache?.get(cacheKey);
    if (cachedDept) {
      return {
        status: "REUSED",
        department: cachedDept,
        created: false,
        matchedBy: "cache"
      };
    }

    const existingFlight = ctx?.inFlightDepartments?.get(cacheKey);
    if (existingFlight) {
      const firstResult = await existingFlight;
      return {
        status: "REUSED",
        department: firstResult.department,
        created: false,
        matchedBy: "cache"
      };
    }
  }

  const executeResolution = async (): Promise<ResolveDepartmentResult> => {
    const rawDepts =
      ctx?.existingDepartments !== undefined
        ? ctx.existingDepartments
        : await DepartmentRepository.listByBusiness(cleanBizId);

    const planned = resolveDepartmentPlanSync({
      businessId: cleanBizId,
      departmentName: params.departmentName,
      branchId: cleanBranchId || undefined,
      departmentCode: params.departmentCode,
      existingDepartments: rawDepts,
      departmentCache: ctx?.departmentCache,
      actor: params.actor
    });

    if (!planned.created) {
      return planned;
    }

    const shouldPersist = !ctx?.dryRun && ctx?.persist !== false;
    if (shouldPersist) {
      const { id, created_at, updated_at, ...deptData } = planned.department;
      let finalId = id;
      if (typeof DepartmentRepository.createWithId === "function") {
        finalId = await DepartmentRepository.createWithId(id, stripUndefinedFields(deptData));
      } else {
        finalId = await DepartmentRepository.create(stripUndefinedFields(deptData));
      }
      if (finalId !== planned.department.id) {
        planned.department = { ...planned.department, id: finalId };
        if (canonical) {
          ctx?.departmentCache?.set(cacheKey, planned.department);
        }
      }
    }

    return planned;
  };

  const promise = executeResolution();
  if (ctx?.inFlightDepartments && cleanBizId && canonical) {
    ctx.inFlightDepartments.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      ctx.inFlightDepartments.delete(cacheKey);
    }
  }
  return promise;
}

export class DepartmentResolutionService {
  public static resolvePlanSync = resolveDepartmentPlanSync;
  public static resolveOrCreateWithContext = resolveOrCreateDepartment;

  /**
   * Legacy 3-argument signature preserved for existing ledger/unit callers.
   */
  public static async resolveOrCreate(
    businessId: string,
    rawDepartmentName: string,
    branchId?: string
  ): Promise<Department> {
    const trimmed = (rawDepartmentName || "").normalize("NFKC").trim();
    const normalized = DepartmentNormalizer.normalize(trimmed);
    const canonical = DepartmentNormalizer.getCanonicalId(trimmed);

    const departments = await DepartmentRepository.listByBusiness(businessId);
    const existing = departments.find(
      (d) =>
        (d.normalized_name && d.normalized_name === normalized) ||
        DepartmentNormalizer.getCanonicalId(d.name) === canonical ||
        (d.code && DepartmentNormalizer.getCanonicalId(d.code) === canonical) ||
        (d.aliases && d.aliases.some((a) => DepartmentNormalizer.getCanonicalId(a) === canonical))
    );

    if (existing) {
      return existing;
    }

    const newDept: Omit<Department, "id" | "created_at" | "updated_at"> = stripUndefinedFields({
      business_id: businessId,
      name: trimmed,
      normalized_name: normalized,
      code: canonical.substring(0, 10).toUpperCase(),
      ...(branchId ? { branch_id: branchId } : {}),
      status: "ACTIVE",
      is_active: true,
      source: "GL_IMPORT",
      is_system_generated: true,
      created_by: "SYSTEM_IMPORT",
      aliases: [canonical]
    });

    const newId = await DepartmentRepository.create(newDept);

    return {
      id: newId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...newDept
    };
  }
}
