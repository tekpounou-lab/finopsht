import { 
  Employee, 
  Invitation, 
  EmployeeBadge, 
  EmployeeContract, 
  Branch, 
  Department, 
  Role 
} from "../../types";
import {
  resolveOrCreateBranch,
  resolveBranchPlanSync
} from "../../domains/organization/services/BranchResolutionService";
import {
  resolveOrCreateDepartment,
  resolveDepartmentPlanSync
} from "../../domains/organization/services/DepartmentResolutionService";
import {
  BulkImportActorContext,
  BulkImportPermissionVerdict,
  OrgImportContext,
  OrgResolutionError,
  ResolveBranchResult,
  ResolveDepartmentResult,
  evaluateBulkImportActorPermissions,
  stripUndefinedFields
} from "../../domains/organization/services/orgResolutionShared";
import { EmployeeRepository } from "../../repositories/EmployeeRepository";
import { EventBus } from "../../modules/runtime/EventBus";
import { finopsEventOrchestrator } from "../finopsEventOrchestrator";
import { CacheInvalidationService } from "../performance/CacheInvalidationService";
import { toDateOnly } from "../../utils/dateNormalization";
import {
  CanonicalOperationalProfile,
  TELLER_ROLES,
  extractRawOperationalProfileFromRecord,
  validateRoleOperationalProfileCompatibility
} from "../../domains/rbac/operationalProfilePolicy";

export {
  resolveOrCreateBranch,
  resolveOrCreateDepartment,
  evaluateBulkImportActorPermissions,
  OrgResolutionError
};
export type {
  BulkImportActorContext,
  BulkImportPermissionVerdict,
  OrgImportContext,
  ResolveBranchResult,
  ResolveDepartmentResult
};

export const EMPLOYEE_IMPORT_TEMPLATE_COLUMNS = [
  "displayName",
  "email",
  "phone",
  "position",
  "role",
  "contract_type",
  "pay_regime",
  "salary_base_htg",
  "commission_rate",
  "branch_name",
  "department_name",
  "hire_date"
] as const;

export function generateEmployeeImportTemplateCsv(): string {
  const headers = EMPLOYEE_IMPORT_TEMPLATE_COLUMNS.join(",");
  const sampleRows = [
    "Rodson Charles,rodson.example@finops.ht,50936907553,Barber,EMPLOYEE,cdd,Commission,0,0.45,Bureau Central,Barber Shop,2026-01-01",
    "Sheelove Pierre,sheelove.example@finops.ht,50944411183,Caisse,EMPLOYEE,cdd,Hybrid,20000,0.05,Bureau Central,Transfer,2026-01-01",
    "Esther Marcellus,esther.example@finops.ht,50939218951,Caisse,SUPERVISOR,cdd,Hybrid,14000,0.05,Bureau Central,Supervision,2026-01-01",
    "Roseline Jean,roseline.example@finops.ht,50947515151,Nail Tech,EMPLOYEE,cdd,Fixe,8500,,Bureau Central,Logistic & Securite,2026-01-01",
    "Josela Jeudi,josela.example@finops.ht,50947007167,Nail Tech,MANAGER,cdd,Hybrid,0,0,Bureau Central,Administration,2026-01-01"
  ];
  return `${headers}\n${sampleRows.join("\n")}`;
}

function inferOperationalProfileFromPosition(
  role: Role,
  position: string,
  departmentName?: string
): CanonicalOperationalProfile | undefined {
  if (TELLER_ROLES.has(role)) {
    return "teller";
  }
  if (role === "EMPLOYEE") {
    const context = `${position} ${departmentName || ""}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const serviceKeywords = [
      "barber",
      "nail",
      "coiff",
      "esthet",
      "salon",
      "spa",
      "manic",
      "pedic",
      "beaute",
      "technic",
      "tech",
      "service",
      "polyvalent"
    ];
    if (serviceKeywords.some((kw) => context.includes(kw))) {
      return "polyvalent";
    }
    return "vendeur";
  }
  return undefined;
}


export interface ParsedEmployeeRow {
  name: string;
  email: string;
  phone: string;
  position: string;
  role: Role;
  operational_profile?: CanonicalOperationalProfile | null;
  operationalProfile?: CanonicalOperationalProfile | null;
  contractType: "cdi" | "cdd" | "freelance";
  payRegime: "fixe" | "commission" | "hybrid";
  baseSalary: number;
  salaryBaseHtg: number;
  commissionRate?: number;
  commission_rate?: number;
  paymentModel: "FIXED" | "COMMISSION" | "HYBRID";
  hireDate?: string;

  // Master Data Links
  branchId: string;
  branchName: string;
  departmentId: string;
  departmentName: string;

  // Identity Resolution
  employeeId?: string;
  registrationId?: string;

  // Resolution metadata
  branchResolutionStatus: "EXISTING" | "NEW" | "BLOCKED";
  departmentResolutionStatus: "EXISTING" | "NEW" | "BLOCKED";
  isNewBranch: boolean;
  isNewDepartment: boolean;
  isValid: boolean;
  validationErrors: string[];
}

/**
 * Ultra-resilient key-value extractor for uploaded workforce records.
 * Supports:
 * - Truncated headers (e.g., pay_regim, salary_base_h, commission_rat)
 * - Whitespace in headers (e.g., " pay_regime ", " salary_base_htg ")
 * - Case variations (PAY_REGIME, SalaryBaseHtg)
 * - French / Creole / English variations & abbreviations
 */
function getRecordValue(record: Record<string, any>, aliases: string[]): any {
  if (!record || typeof record !== "object") return undefined;

  // 1. Direct exact key checks
  for (const alias of aliases) {
    if (record[alias] !== undefined && record[alias] !== null && record[alias] !== "") {
      return record[alias];
    }
  }

  // 2. Build canonical key map of the record (lowercase, alphanumeric only)
  const keys = Object.keys(record);
  const normalizedKeyMap = new Map<string, string>();
  for (const k of keys) {
    const canon = k.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (canon && !normalizedKeyMap.has(canon)) {
      normalizedKeyMap.set(canon, k);
    }
  }

  // 3. Match aliases against canonical keys (exact & prefix/truncated matching)
  for (const alias of aliases) {
    const canonAlias = alias.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!canonAlias) continue;

    if (normalizedKeyMap.has(canonAlias)) {
      const origKey = normalizedKeyMap.get(canonAlias)!;
      const val = record[origKey];
      if (val !== undefined && val !== null && val !== "") return val;
    }

    // Prefix match ONLY for genuinely truncated headers (e.g. pay_regim, salary_base_h, commission_rat)
    for (const [canonKey, origKey] of normalizedKeyMap.entries()) {
      if (
        canonKey.length >= 6 &&
        canonKey.length >= Math.floor(canonAlias.length * 0.65) &&
        (canonKey.startsWith(canonAlias) || canonAlias.startsWith(canonKey))
      ) {
        const val = record[origKey];
        if (val !== undefined && val !== null && val !== "") return val;
      }
    }
  }

  return undefined;
}

/**
 * Robust numeric parser for salaries with currencies, separators, spaces, and commas.
 */
function parseSalaryBaseHtg(rawVal: any, defaultVal = 0): number {
  if (rawVal === undefined || rawVal === null || rawVal === "") {
    return defaultVal;
  }
  if (typeof rawVal === "number") {
    return isNaN(rawVal) || rawVal < 0 ? defaultVal : rawVal;
  }
  const str = String(rawVal).trim();
  if (!str) return defaultVal;

  // Strip currency symbols and letters (HTG, Gdes, $, USD, etc.)
  let clean = str.replace(/[^\d.,\-]/g, "").trim();
  if (!clean) return defaultVal;

  // Handle both comma and period
  if (clean.includes(",") && clean.includes(".")) {
    if (clean.lastIndexOf(".") > clean.lastIndexOf(",")) {
      // Form: 32,000.50
      clean = clean.replace(/,/g, "");
    } else {
      // Form: 32.000,50
      clean = clean.replace(/\./g, "").replace(/,/g, ".");
    }
  } else if (clean.includes(",")) {
    const parts = clean.split(",");
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      // Thousands comma: "32,000"
      clean = clean.replace(/,/g, "");
    } else if (parts.length === 2 && parts[1].length <= 2) {
      // Decimal comma: "32000,50"
      clean = clean.replace(/,/g, ".");
    } else {
      clean = clean.replace(/,/g, "");
    }
  } else if (clean.includes(".")) {
    const parts = clean.split(".");
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      // Thousands period: "32.000"
      clean = clean.replace(/\./g, "");
    }
  }

  const parsed = parseFloat(clean);
  return isNaN(parsed) || parsed < 0 ? defaultVal : parsed;
}

/**
 * Robust parser for commission rates (handles e.g. "4.5%", "4,5%", 4.5, 0.045, "5 %", 0).
 */
function parseCommissionRate(rawVal: any): number | undefined {
  if (rawVal === undefined || rawVal === null || rawVal === "") {
    return undefined;
  }
  if (typeof rawVal === "number") {
    if (isNaN(rawVal) || rawVal < 0) return undefined;
    if (rawVal === 0) return 0;
    return rawVal > 0 && rawVal <= 1 ? Number((rawVal * 100).toFixed(4)) : rawVal;
  }
  const str = String(rawVal).trim();
  if (!str) return undefined;

  let clean = str.replace(/%/g, "").replace(/[^\d.,\-]/g, "").trim();
  if (!clean) return undefined;

  clean = clean.replace(/,/g, ".");
  const parsed = parseFloat(clean);
  if (isNaN(parsed) || parsed < 0) return undefined;
  if (parsed === 0) return 0;

  // Convert decimal representation (e.g. 0.045 from Excel formatting) to percentage (4.5%)
  return parsed > 0 && parsed <= 1 ? Number((parsed * 100).toFixed(4)) : parsed;
}

/**
 * Robust resolver for pay regime and payment model.
 */
function parsePayRegime(
  rawVal: any, 
  commRate?: number, 
  baseSalary?: number
): {
  payRegime: "fixe" | "commission" | "hybrid";
  paymentModel: "FIXED" | "COMMISSION" | "HYBRID";
} {
  const str = (rawVal || "").toString().toLowerCase().trim();
  if (str.includes("hybrid") || str.includes("mix") || str.includes("both") || str.includes("+")) {
    return { payRegime: "hybrid", paymentModel: "HYBRID" };
  }
  if (str.includes("comm") || str.includes("var") || str.includes("100%")) {
    return { payRegime: "commission", paymentModel: "COMMISSION" };
  }
  if (str.includes("fix") || str.includes("salari")) {
    return { payRegime: "fixe", paymentModel: "FIXED" };
  }

  // Intelligently infer if pay_regime was not specified in the file
  if (commRate !== undefined && commRate > 0) {
    if (baseSalary !== undefined && baseSalary > 0) {
      return { payRegime: "hybrid", paymentModel: "HYBRID" };
    }
    return { payRegime: "commission", paymentModel: "COMMISSION" };
  }

  return { payRegime: "fixe", paymentModel: "FIXED" };
}

export interface BulkImportResolutionPlan {
  businessId: string;
  parsedRows: ParsedEmployeeRow[];
  blockedRows: ParsedEmployeeRow[];
  branchesToReuse: Branch[];
  branchesToCreate: Branch[];
  departmentsToReuse: Department[];
  departmentsToCreate: Department[];
  actorAuthorization?: BulkImportPermissionVerdict;
  validationErrors: string[];
  warnings: string[];
  summary: {
    totalRows: number;
    validRows: number;
    blockedRowsCount: number;
    reusedBranchesCount: number;
    newBranchesCount: number;
    reusedDepartmentsCount: number;
    newDepartmentsCount: number;
    reusedBranchesNames: string[];
    newBranchesNames: string[];
    reusedDepartmentsNames: string[];
    newDepartmentsNames: string[];
  };
}

export interface BulkImportPlanOptions {
  actor?: BulkImportActorContext | null;
  branchCache?: Map<string, Branch>;
  departmentCache?: Map<string, Department>;
}

export type BulkImportStatus = "PENDING" | "RUNNING" | "SUCCESS" | "PARTIAL_FAILURE" | "FAILED";
export type BulkImportErrorCategory = "VALIDATION" | "PERMISSION" | "SEAT_LIMIT" | "CONFLICT" | "NETWORK" | "INTERNAL";

export interface BulkImportExecutionResult {
  status: BulkImportStatus;
  success: boolean;
  importedEmployeesCount: number;
  createdBranchesCount: number;
  createdDepartmentsCount: number;
  reusedBranchesCount?: number;
  reusedDepartmentsCount?: number;
  createdBranches: Branch[];
  createdDepartments: Department[];
  createdEmployees: Employee[];
  createdInvitations: Invitation[];
  createdBadges: EmployeeBadge[];
  createdContracts: EmployeeContract[];
  committedBatchesCount?: number;
  totalBatchesCount?: number;
  committedEmployeesCount?: number;
  metaCommitted?: boolean;
  failedBatchIndex?: number;
  canRetryIdempotently?: boolean;
  logs: string[];
  error?: string;
  correlationId?: string;
  errorCode?: string;
  errorCategory?: BulkImportErrorCategory;
  failedStep?: string;
}

/**
 * Generates a stable deterministic ID based on businessId and a unique record identifier.
 * Priority order: stable employee ID > registration ID > normalized email.
 * NOTE: When falling back to email-based deterministic identity, email change = identity change.
 */
export function generateDeterministicImportId(prefix: string, businessId: string, identifier: string): string {
  const input = `${businessId}:${identifier.toLowerCase().trim()}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hashStr = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  return `${prefix}_${hashStr}`;
}

export class BulkEmployeeImportService {
  /**
   * Analyzes raw imported records from XLSX / CSV / TSV and resolves
   * branch and department links deterministically with strict tenant isolation & RBAC checks.
   * NEVER writes to Firestore and NEVER falls back to arbitrary default branches/departments.
   */
  public static resolveImportPlan(
    businessId: string,
    rawRecords: any[],
    existingBranches: Branch[],
    existingDepartments: Department[],
    activeStaff: Employee[],
    options?: BulkImportPlanOptions
  ): BulkImportResolutionPlan {
    const parsedRows: ParsedEmployeeRow[] = [];
    const generalValidationErrors: string[] = [];
    const warnings: string[] = [];

    const branchCache = options?.branchCache ?? new Map<string, Branch>();
    const departmentCache = options?.departmentCache ?? new Map<string, Department>();

    const plannedNewBranchesById = new Map<string, Branch>();
    const reusedBranchesById = new Map<string, Branch>();
    const plannedNewDeptsById = new Map<string, Department>();
    const reusedDeptsById = new Map<string, Department>();

    const seenEmailsInFile = new Set<string>();

    let actorAuthorization: BulkImportPermissionVerdict | undefined;
    if (options && "actor" in options) {
      actorAuthorization = evaluateBulkImportActorPermissions(options.actor, businessId);
      if (!actorAuthorization.allowedToImportEmployees) {
        generalValidationErrors.push(
          `${actorAuthorization.denialCode || "UNAUTHORIZED_IMPORT_ROLE"}: ${
            actorAuthorization.denialReason || "Importation refusée par la politique RBAC."
          }`
        );
      }
    }

    for (let idx = 0; idx < rawRecords.length; idx++) {
      const record = rawRecords[idx];
      const rowErrors: string[] = [];

      if (actorAuthorization && !actorAuthorization.allowedToImportEmployees) {
        rowErrors.push(
          `${actorAuthorization.denialCode || "UNAUTHORIZED_IMPORT_ROLE"}: ${
            actorAuthorization.denialReason || "Importation refusée par la politique RBAC."
          }`
        );
      }

      // 1. Extract Identity & Personal Info
      const rawName = getRecordValue(record, [
        "displayName", "display_name", "nom", "name", "full_name", "fullName", 
        "collaborateur", "employee_name", "employe", "prenom_nom"
      ]);
      const name = (rawName || `Collaborateur Importé ${idx + 1}`).toString().trim();

      const rawEmail = (getRecordValue(record, [
        "email", "courriel", "mail", "e_mail", "employee_email", "adresse_email"
      ]) || "").toString().trim();
      const email = rawEmail.toLowerCase();

      const rawPhone = getRecordValue(record, [
        "phone", "telephone", "tel", "cellulaire", "mobile", "contact", "phone_number"
      ]);
      const phone = (rawPhone || "N/A").toString().trim();

      const rawPosition = getRecordValue(record, [
        "position", "poste", "title", "titre", "job", "job_title", "fonction"
      ]);
      const hasPositionField = rawPosition !== undefined && String(rawPosition).trim() !== "";
      const position = (rawPosition || "Agent").toString().trim();

      const rawDeptHint = getRecordValue(record, [
        "department_name", "departmentName", "departement", "departement_name", "department"
      ]);

      // 2. Resolve Role & Operational Profile (strict separation, fail-closed)
      const rawRoleInput = getRecordValue(record, [
        "role", "user_role", "userrole", "role_type", "type_role", "rbac_role"
      ]);
      const rawRoleVal = (rawRoleInput ?? "EMPLOYEE").toString().toUpperCase().trim();

      let role: Role = "EMPLOYEE";
      let roleValid = true;
      if (!rawRoleVal || rawRoleVal === "EMPLOYEE" || rawRoleVal === "EMPLOYE" || rawRoleVal === "EMPLOYÉ") {
        role = "EMPLOYEE";
      } else if (rawRoleVal === "PROPRIÉTAIRE" || rawRoleVal === "PROPRIETAIRE" || rawRoleVal === "OWNER") {
        role = "OWNER";
      } else if (rawRoleVal === "ADMIN" || rawRoleVal === "ADMINISTRATEUR") {
        role = "ADMIN";
      } else if (rawRoleVal === "DIRECTEUR" || rawRoleVal === "GERANT" || rawRoleVal === "GÉRANT" || rawRoleVal === "MANAGER") {
        role = "MANAGER";
      } else if (rawRoleVal === "SUPERVISEUR" || rawRoleVal === "SUPERVISOR") {
        role = "SUPERVISOR";
      } else if (rawRoleVal === "ACCOUNTANT" || rawRoleVal === "COMPTABLE") {
        role = "ACCOUNTANT";
      } else if (rawRoleVal === "AUDITOR" || rawRoleVal === "AUDITEUR") {
        role = "AUDITOR";
      } else if (rawRoleVal === "MASTER_HEAD_TELLER" || rawRoleVal === "MASTER HEAD TELLER") {
        role = "MASTER_HEAD_TELLER";
      } else if (rawRoleVal === "HEAD_TELLER" || rawRoleVal === "HEAD TELLER" || rawRoleVal === "CHEF CAISSIER" || rawRoleVal === "CHEF_CAISSIER") {
        role = "HEAD_TELLER";
      } else if (rawRoleVal === "SENIOR_TELLER" || rawRoleVal === "SENIOR TELLER" || rawRoleVal === "CAISSIER SENIOR" || rawRoleVal === "CAISSIER_SENIOR") {
        role = "SENIOR_TELLER";
      } else if (rawRoleVal === "JUNIOR_TELLER" || rawRoleVal === "JUNIOR TELLER" || rawRoleVal === "CAISSIER JUNIOR" || rawRoleVal === "CAISSIER_JUNIOR") {
        role = "JUNIOR_TELLER";
      } else if (rawRoleVal === "TELLER" || rawRoleVal === "CAISSIER") {
        role = "TELLER";
      } else {
        roleValid = false;
        rowErrors.push(`INVALID_OR_MISSING_ROLE: Rôle RBAC non autorisé ou inconnu "${rawRoleVal}"`);
      }

      const directProfileInfo = extractRawOperationalProfileFromRecord(record);
      const aliasProfileVal = !directProfileInfo.hasValue
        ? getRecordValue(record, [
            "operational_profile",
            "operationalProfile",
            "profil_operationnel",
            "profilOperationnel",
            "profil_op",
            "op_profile"
          ])
        : directProfileInfo.rawValue;

      const hasExplicitProfileField =
        directProfileInfo.hasValue ||
        directProfileInfo.rawValue !== undefined ||
        aliasProfileVal !== undefined;

      let effectiveProfileInput = aliasProfileVal;
      let inferredFromTemplatePosition = false;
      if (roleValid && !hasExplicitProfileField && hasPositionField) {
        const inferred = inferOperationalProfileFromPosition(
          role,
          position,
          rawDeptHint ? String(rawDeptHint) : undefined
        );
        if (inferred) {
          effectiveProfileInput = inferred;
          inferredFromTemplatePosition = true;
        }
      }

      let resolvedOperationalProfile: CanonicalOperationalProfile | null = null;
      if (directProfileInfo.conflict) {
        rowErrors.push(
          "CONFLICTING_OPERATIONAL_PROFILE_FIELDS: Incohérence entre operational_profile et operationalProfile."
        );
      } else if (roleValid) {
        const compat = validateRoleOperationalProfileCompatibility(role, effectiveProfileInput, {
          allowLegacyBarberAlias: true,
          allowMissingForExecutiveOrOversight: true
        });
        if (!compat.valid) {
          rowErrors.push(`${compat.code}: ${compat.reason}`);
        } else {
          resolvedOperationalProfile = compat.normalizedProfile;
          if (compat.legacyAliasApplied) {
            warnings.push(
              `Ligne ${idx + 1} (${name}): Profil hérité 'barber' converti automatiquement en 'vendeur'.`
            );
          } else if (inferredFromTemplatePosition && resolvedOperationalProfile) {
            warnings.push(
              `Ligne ${idx + 1} (${name}): Profil opérationnel '${resolvedOperationalProfile}' déduit du poste '${position}'.`
            );
          }
        }
      }

      // 3. Resolve Contract, Pay Regime, Salary & Commission
      const rawContract = (getRecordValue(record, [
        "contract_type", "contract_typ", "contracttype", "type_contrat", "typecontrat", 
        "contrat", "contract", "contract_t"
      ]) || "cdi").toString().toLowerCase().trim();

      const contractType: "cdi" | "cdd" | "freelance" = 
        rawContract === "cdd" ? "cdd" : (rawContract === "freelance" ? "freelance" : "cdi");

      const rawSalaryInput = getRecordValue(record, [
        "salary_base_htg", "salary_base_h", "salary_base", "salarybasehtg", "salarybase", 
        "salary_htg", "salaryhtg", "base_salary", "basesalary", "baseSalary", "salaryBaseHtg", 
        "salaire_base_htg", "salaire_base_h", "salaire_base", "salaire_htg", "salairebase", 
        "salaire", "salary", "base_htg", "basehtg", "salaire_mensuel", "monthly_salary", 
        "salaire_fixe", "salaire_brut", "base"
      ]);
      const baseSalary = parseSalaryBaseHtg(rawSalaryInput, 0);

      const rawCommissionInput = getRecordValue(record, [
        "commission_rate", "commission_rat", "commission_ra", "commissionrate", "commissionRate", 
        "commissionrat", "comm_rate", "commrate", "com_rate", "comrate", "taux_commission", 
        "taux_comm", "tauxcommission", "tauxcomm", "taux_de_commission", "commission", 
        "comm", "commission_%", "comm_%", "commission_percent", "commission_pourcentage", "comm_percentage"
      ]);
      const commissionRate = parseCommissionRate(rawCommissionInput);
      const commission_rate = commissionRate !== undefined ? (commissionRate > 1 ? commissionRate / 100 : commissionRate) : undefined;

      const rawPayRegimeInput = getRecordValue(record, [
        "pay_regime", "pay_regim", "payregime", "payregim", "pay_reg", "payRegime", 
        "regime_paye", "regime_paie", "regime_de_paie", "regime", "regim", 
        "payment_model", "paymentModel", "modele_paye", "modele_paie", "modele", "modelepaye", 
        "type_remuneration", "pay_type"
      ]);
      const { payRegime, paymentModel } = parsePayRegime(rawPayRegimeInput, commissionRate, baseSalary);

      const rawHireDate = getRecordValue(record, [
        "hire_date", "hiredate", "hireDate", "date_embauche", "date_recrutement", 
        "date_entree", "date_start", "start_date", "embauche"
      ]);
      const hireDate = rawHireDate ? toDateOnly(rawHireDate) || rawHireDate.toString().trim() : undefined;

      // 4. Resolve / Auto-Plan Branch (ZERO silent arbitrary fallback)
      const rawBranchInput = (getRecordValue(record, [
        "branch_name", "branchname", "branchName", "succursale", "succursale_name", 
        "succursale_id", "branch", "branch_id", "branchId", "site", "agence"
      ]) ?? "").toString();

      const rawBranchCode = (getRecordValue(record, [
        "branch_code", "branchCode", "succursale_code", "code_succursale", "code_branche"
      ]) ?? "").toString().trim();

      let resolvedBranchId = "";
      let resolvedBranchName = rawBranchInput.trim();
      let isNewBranch = false;
      let branchResolutionStatus: "EXISTING" | "NEW" | "BLOCKED" = "BLOCKED";
      let resolvedBranchObj: Branch | null = null;

      try {
        const branchResult = resolveBranchPlanSync({
          businessId,
          branchName: rawBranchInput,
          branchCode: rawBranchCode || undefined,
          existingBranches,
          branchCache,
          actor: options && "actor" in options ? options.actor : undefined
        });

        resolvedBranchObj = branchResult.branch;
        resolvedBranchId = branchResult.branch.id;
        resolvedBranchName = branchResult.branch.name;

        const createdInThisPlan = branchResult.created || plannedNewBranchesById.has(branchResult.branch.id);
        isNewBranch = createdInThisPlan;
        branchResolutionStatus = createdInThisPlan ? "NEW" : "EXISTING";

        if (branchResult.created) {
          plannedNewBranchesById.set(branchResult.branch.id, branchResult.branch);
        }
      } catch (err: any) {
        branchResolutionStatus = "BLOCKED";
        isNewBranch = false;
        const code = err instanceof OrgResolutionError ? err.code : "BRANCH_RESOLUTION_ERROR";
        const msg = err?.message || "Succursale invalide ou non résolue.";
        if (!rowErrors.some((e) => e.startsWith(code))) {
          rowErrors.push(`${code}: ${msg}`);
        }
      }

      // 5. Resolve / Auto-Plan Department (ZERO silent arbitrary fallback, deterministic branch link)
      const rawDeptInput = (getRecordValue(record, [
        "department_name", "departmentName", "departement", "departement_name",
        "department", "department_id", "departmentId"
      ]) ?? "").toString();

      const rawDeptCode = (getRecordValue(record, [
        "department_code", "departmentCode", "departement_code"
      ]) ?? "").toString().trim();

      let resolvedDeptId = "";
      let resolvedDeptName = rawDeptInput.trim();
      let isNewDepartment = false;
      let departmentResolutionStatus: "EXISTING" | "NEW" | "BLOCKED" = "BLOCKED";
      let resolvedDeptObj: Department | null = null;

      try {
        const deptResult = resolveDepartmentPlanSync({
          businessId,
          departmentName: rawDeptInput,
          branchId: resolvedBranchId || undefined,
          departmentCode: rawDeptCode || undefined,
          existingDepartments,
          departmentCache,
          actor: options && "actor" in options ? options.actor : undefined
        });

        resolvedDeptObj = deptResult.department;
        resolvedDeptId = deptResult.department.id;
        resolvedDeptName = deptResult.department.name;

        const createdInThisPlan = deptResult.created || plannedNewDeptsById.has(deptResult.department.id);
        isNewDepartment = createdInThisPlan;
        departmentResolutionStatus = createdInThisPlan ? "NEW" : "EXISTING";

        if (deptResult.created) {
          plannedNewDeptsById.set(deptResult.department.id, deptResult.department);
        }
      } catch (err: any) {
        departmentResolutionStatus = "BLOCKED";
        isNewDepartment = false;
        const code = err instanceof OrgResolutionError ? err.code : "DEPARTMENT_RESOLUTION_ERROR";
        const msg = err?.message || "Département invalide ou non résolu.";
        if (!rowErrors.some((e) => e.startsWith(code))) {
          rowErrors.push(`${code}: ${msg}`);
        }
      }

      let resolvedEmployeeId: string | undefined = undefined;
      let resolvedRegistrationId: string | undefined = undefined;

      // 6. Validate Row Integrity (Email & Duplicates)
      if (!email || !email.includes("@")) {
        rowErrors.push(`Format d'email invalide: "${rawEmail || "vide"}"`);
      } else {
        const rawEmpId = (getRecordValue(record, [
          "id", "employee_id", "employeeId", "matricule", "code_employe", "personnel_id", "personnelId"
        ]) || "").toString().trim();

        const rawRegistrationId = (getRecordValue(record, [
          "badge_id", "badgeId", "registration_id", "registrationId", "numero_badge", "badge"
        ]) || "").toString().trim();

        const existingDraftEmployee = activeStaff.find(emp => 
          emp.email && emp.email.toLowerCase().trim() === email && (emp.status === "DRAFT" || emp.status === "PENDING")
        );

        if (seenEmailsInFile.has(email)) {
          rowErrors.push(`Email en doublon dans le fichier: "${email}"`);
        } else {
          seenEmailsInFile.add(email);
        }

        const isAlreadyActive = activeStaff.some(emp => 
          emp.email && emp.email.toLowerCase().trim() === email && (emp.status === "ACTIVE" || emp.isActive === true || emp.is_active === true)
        );
        if (isAlreadyActive) {
          rowErrors.push(`Collaborateur existant et actif avec l'email "${email}"`);
        }

        resolvedEmployeeId = rawEmpId || existingDraftEmployee?.id || undefined;
        resolvedRegistrationId = rawRegistrationId || undefined;
      }

      const rowValid = rowErrors.length === 0 && branchResolutionStatus !== "BLOCKED" && departmentResolutionStatus !== "BLOCKED";

      if (rowValid) {
        if (resolvedBranchObj) {
          if (!isNewBranch) {
            reusedBranchesById.set(resolvedBranchObj.id, resolvedBranchObj);
          }
        }
        if (resolvedDeptObj) {
          if (!isNewDepartment) {
            reusedDeptsById.set(resolvedDeptObj.id, resolvedDeptObj);
          }
        }
      }

      if (rowErrors.length > 0) {
        generalValidationErrors.push(`Ligne ${idx + 1} (${name}): ${rowErrors.join(", ")}`);
      }

      parsedRows.push({
        name,
        email,
        phone,
        position,
        role,
        operational_profile: resolvedOperationalProfile,
        operationalProfile: resolvedOperationalProfile,
        contractType,
        payRegime,
        baseSalary,
        salaryBaseHtg: baseSalary,
        commissionRate,
        commission_rate,
        paymentModel,
        hireDate,
        branchId: resolvedBranchId,
        branchName: resolvedBranchName,
        departmentId: resolvedDeptId,
        departmentName: resolvedDeptName,
        employeeId: resolvedEmployeeId,
        registrationId: resolvedRegistrationId,
        branchResolutionStatus,
        departmentResolutionStatus,
        isNewBranch,
        isNewDepartment,
        isValid: rowValid,
        validationErrors: rowErrors
      });
    }

    // Only commit new branches/departments that are actually referenced by valid employee rows (no orphan creation)
    const validBranchIds = new Set(parsedRows.filter((r) => r.isValid && r.branchId).map((r) => r.branchId));
    const validDeptIds = new Set(parsedRows.filter((r) => r.isValid && r.departmentId).map((r) => r.departmentId));

    const branchesToCreate = Array.from(plannedNewBranchesById.values()).filter((b) => validBranchIds.has(b.id));
    const departmentsToCreate = Array.from(plannedNewDeptsById.values()).filter((d) => validDeptIds.has(d.id));
    const branchesToReuse = Array.from(reusedBranchesById.values());
    const departmentsToReuse = Array.from(reusedDeptsById.values());
    const blockedRows = parsedRows.filter((r) => !r.isValid);
    const validRowsCount = parsedRows.length - blockedRows.length;

    return {
      businessId,
      parsedRows,
      blockedRows,
      branchesToReuse,
      branchesToCreate,
      departmentsToReuse,
      departmentsToCreate,
      actorAuthorization,
      validationErrors: Array.from(new Set(generalValidationErrors)),
      warnings,
      summary: {
        totalRows: parsedRows.length,
        validRows: validRowsCount,
        blockedRowsCount: blockedRows.length,
        reusedBranchesCount: branchesToReuse.length,
        newBranchesCount: branchesToCreate.length,
        reusedDepartmentsCount: departmentsToReuse.length,
        newDepartmentsCount: departmentsToCreate.length,
        reusedBranchesNames: branchesToReuse.map((b) => b.name),
        newBranchesNames: branchesToCreate.map((b) => b.name),
        reusedDepartmentsNames: departmentsToReuse.map((d) => d.name),
        newDepartmentsNames: departmentsToCreate.map((d) => d.name)
      }
    };
  }

  /**
   * Executes the creation of missing branches, departments,
   * employees, invitations, badges, and contracts with RBAC re-verification,
   * undefined-field sanitization, and accurate partial-failure telemetry.
   */
  public static async executeImportPlan(
    plan: BulkImportResolutionPlan,
    actor?: BulkImportActorContext | null
  ): Promise<BulkImportExecutionResult> {
    if (actor !== undefined) {
      const verdict = evaluateBulkImportActorPermissions(actor, plan.businessId);
      if (!verdict.allowedToImportEmployees) {
        return {
          status: "FAILED",
          success: false,
          importedEmployeesCount: 0,
          createdBranchesCount: 0,
          createdDepartmentsCount: 0,
          reusedBranchesCount: 0,
          reusedDepartmentsCount: 0,
          createdBranches: [],
          createdDepartments: [],
          createdEmployees: [],
          createdInvitations: [],
          createdBadges: [],
          createdContracts: [],
          logs: [verdict.denialReason || "Importation refusée par la politique RBAC."],
          error: verdict.denialReason || "Importation refusée par la politique RBAC.",
          errorCode: verdict.denialCode || "UNAUTHORIZED_IMPORT_ROLE",
          errorCategory: "PERMISSION",
          failedStep: "AUTHORIZATION"
        };
      }
      if (plan.branchesToCreate.length > 0 && !verdict.canCreateBranch) {
        const msg = "Permission 'branch.create' requise pour créer les nouvelles succursales du lot.";
        return {
          status: "FAILED",
          success: false,
          importedEmployeesCount: 0,
          createdBranchesCount: 0,
          createdDepartmentsCount: 0,
          createdBranches: [],
          createdDepartments: [],
          createdEmployees: [],
          createdInvitations: [],
          createdBadges: [],
          createdContracts: [],
          logs: [msg],
          error: msg,
          errorCode: "UNAUTHORIZED_BRANCH_CREATION",
          errorCategory: "PERMISSION",
          failedStep: "AUTHORIZATION"
        };
      }
      if (plan.departmentsToCreate.length > 0 && !verdict.canCreateDepartment) {
        const msg = "Permission 'department.create' requise pour créer les nouveaux départements du lot.";
        return {
          status: "FAILED",
          success: false,
          importedEmployeesCount: 0,
          createdBranchesCount: 0,
          createdDepartmentsCount: 0,
          createdBranches: [],
          createdDepartments: [],
          createdEmployees: [],
          createdInvitations: [],
          createdBadges: [],
          createdContracts: [],
          logs: [msg],
          error: msg,
          errorCode: "UNAUTHORIZED_DEPARTMENT_CREATION",
          errorCategory: "PERMISSION",
          failedStep: "AUTHORIZATION"
        };
      }
    }

    const validRows = plan.parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      return {
        status: "FAILED",
        success: false,
        importedEmployeesCount: 0,
        createdBranchesCount: 0,
        createdDepartmentsCount: 0,
        createdBranches: [],
        createdDepartments: [],
        createdEmployees: [],
        createdInvitations: [],
        createdBadges: [],
        createdContracts: [],
        logs: ["Aucune ligne valide à intégrer."],
        error: plan.validationErrors[0] || "Aucune ligne valide à intégrer.",
        errorCode: "NO_VALID_ROWS",
        errorCategory: "VALIDATION",
        failedStep: "VALIDATION"
      };
    }

    const createdEmployees: Employee[] = [];
    const createdInvitations: Invitation[] = [];
    const createdBadges: EmployeeBadge[] = [];
    const createdContracts: EmployeeContract[] = [];
    const logs: string[] = [];

    if (plan.branchesToCreate.length > 0) {
      logs.push(`Création de ${plan.branchesToCreate.length} nouvelle(s) succursale(s) : ${plan.branchesToCreate.map(b => b.name).join(", ")}`);
    }
    if (plan.departmentsToCreate.length > 0) {
      logs.push(`Création de ${plan.departmentsToCreate.length} nouveau(x) département(s) : ${plan.departmentsToCreate.map(d => d.name).join(", ")}`);
    }

    const sanitizedBranches = plan.branchesToCreate.map((b) => stripUndefinedFields({
      ...b,
      business_id: plan.businessId,
      businessId: plan.businessId
    }));
    const sanitizedDepts = plan.departmentsToCreate.map((d) => stripUndefinedFields({
      ...d,
      business_id: plan.businessId,
      businessId: plan.businessId
    }));

    for (const row of validRows) {
      const stableId = row.employeeId || (row.registrationId ? `emp_${row.registrationId}` : undefined);
      const empId = stableId || generateDeterministicImportId("emp", plan.businessId, row.email);
      const inviteId = generateDeterministicImportId("inv", plan.businessId, row.email);
      const badgeId = row.registrationId ? `bad_${row.registrationId}` : `bad_${empId}`;
      const contractId = generateDeterministicImportId("con", plan.businessId, row.email);

      const profileFields = row.operational_profile
        ? {
            operational_profile: row.operational_profile,
            operationalProfile: row.operational_profile
          }
        : {};

      const newEmp: Employee = stripUndefinedFields({
        id: empId,
        business_id: plan.businessId,
        businessId: plan.businessId,
        branchId: row.branchId,
        branch_id: row.branchId,
        branchName: row.branchName,
        branch_name: row.branchName,
        departmentId: row.departmentId,
        department_id: row.departmentId,
        departmentName: row.departmentName,
        department_name: row.departmentName,
        name: row.name,
        displayName: row.name,
        email: row.email,
        normalizedEmail: row.email.toLowerCase().trim(),
        role: row.role,
        ...profileFields,
        baseSalary: row.baseSalary,
        salaryBaseHtg: row.baseSalary,
        paymentModel: row.paymentModel,
        phone: row.phone,
        position: row.position,
        onboardingComplete: false,
        contractType: row.contractType,
        payRegime: row.payRegime,
        ...(row.hireDate ? { hireDate: row.hireDate } : {}),
        badgeId,
        isActive: true,
        is_active: true,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }) as Employee;

      if (row.commissionRate !== undefined && !isNaN(row.commissionRate)) {
        newEmp.commissionRate = row.commissionRate;
        newEmp.commission_rate = row.commissionRate > 1 ? row.commissionRate / 100 : row.commissionRate;
      }

      const newInvite: Invitation = stripUndefinedFields({
        id: inviteId,
        employeeId: empId,
        business_id: plan.businessId,
        businessId: plan.businessId,
        email: row.email,
        normalizedEmail: row.email.toLowerCase().trim(),
        name: row.name,
        phone: row.phone,
        position: row.position,
        paymentModel: row.paymentModel,
        baseSalary: row.baseSalary,
        role: row.role,
        ...profileFields,
        branchId: row.branchId,
        branch_name: row.branchName,
        departmentId: row.departmentId,
        department_name: row.departmentName,
        ...(newEmp.commissionRate !== undefined ? { commissionRate: newEmp.commissionRate } : {}),
        status: "PENDING",
        invitedAt: new Date().toISOString()
      }) as Invitation;

      const badgeSig = `HMAC::${btoa(empId + plan.businessId).substring(0, 16).toUpperCase()}`;
      const badgePayload = {
        employee_id: empId,
        business_id: plan.businessId,
        branch_id: row.branchId,
        department_id: row.departmentId,
        role: row.role,
        signature: badgeSig
      };

      const newBadge: EmployeeBadge = stripUndefinedFields({
        id: badgeId,
        employeeId: empId,
        business_id: plan.businessId,
        branchId: row.branchId,
        branch_name: row.branchName,
        departmentId: row.departmentId,
        department_name: row.departmentName,
        role: row.role,
        issuedAt: new Date().toISOString(),
        signature: badgeSig,
        qrPayload: JSON.stringify(badgePayload)
      }) as EmployeeBadge;

      const newContract: EmployeeContract = stripUndefinedFields({
        id: contractId,
        employeeId: empId,
        business_id: plan.businessId,
        fileUrl: `https://storage.googleapis.com/finops-contracts/${empId}-contract-${row.contractType}.pdf`,
        contractType: row.contractType,
        payRegime: row.payRegime,
        salaryBaseHtg: row.baseSalary,
        commissionRate: newEmp.commissionRate ?? null,
        generatedAt: new Date().toISOString(),
        status: "active"
      }) as EmployeeContract;

      createdEmployees.push(newEmp);
      createdInvitations.push(newInvite);
      createdBadges.push(newBadge);
      createdContracts.push(newContract);
      logs.push(`Préparation de ${row.name} (${row.position}) -> Succursale: ${row.branchName}, Département: ${row.departmentName}`);
    }

    let committedBatches = 0;
    let totalBatches = 0;

    try {
      const batchResult = await EmployeeRepository.createBulkImportBatch(
        createdEmployees,
        createdInvitations,
        createdBadges,
        createdContracts,
        sanitizedBranches,
        sanitizedDepts
      );
      committedBatches = batchResult.committedBatches;
      totalBatches = batchResult.totalBatches;
      const committedEmpCount =
        typeof (batchResult as any).committedEmployeesCount === "number"
          ? (batchResult as any).committedEmployeesCount
          : createdEmployees.length;

      for (const branch of sanitizedBranches) {
        EventBus.publish(EventBus.createEvent({
          correlationId: `bulk_branch_${branch.id}`,
          businessId: plan.businessId,
          module: "ORGANIZATION",
          aggregate: "BRANCH",
          type: "BranchCreated",
          payload: branch
        }));
      }

      for (const dept of sanitizedDepts) {
        EventBus.publish(EventBus.createEvent({
          correlationId: `bulk_dept_${dept.id}`,
          businessId: plan.businessId,
          module: "ORGANIZATION",
          aggregate: "DEPARTMENT",
          type: "DepartmentCreated",
          payload: dept
        }));
      }

      EventBus.publish(EventBus.createEvent({
        correlationId: `bulk_workforce_${Date.now()}`,
        businessId: plan.businessId,
        module: "WORKFORCE",
        aggregate: "EMPLOYEE",
        type: "EmployeesBulkImported",
        payload: {
          importedEmployeesCount: committedEmpCount,
          createdBranchesCount: sanitizedBranches.length,
          createdDepartmentsCount: sanitizedDepts.length
        }
      }));

      try {
        await finopsEventOrchestrator.emit("WORKFORCE", plan.businessId, {
          action: "WORKFORCE_MASS_IMPORTED",
          importedRows: committedEmpCount,
          createdBranches: sanitizedBranches.length,
          createdDepartments: sanitizedDepts.length,
          triggeredBy: actor?.role || "UNASSIGNED"
        });
      } catch (orchErr) {
        console.warn("[BulkEmployeeImportService] Orchestrator notification warning:", orchErr);
      }

      try {
        CacheInvalidationService.sweepLocal(plan.businessId);
      } catch (cacheErr) {
        console.warn("[BulkEmployeeImportService] Cache sweep warning:", cacheErr);
      }

      logs.push(`Intégration réussie : ${committedEmpCount} collaborateurs, ${sanitizedBranches.length} succursales, et ${sanitizedDepts.length} départements enregistrés (${committedBatches} lots validés).`);

      return {
        status: "SUCCESS",
        success: true,
        importedEmployeesCount: committedEmpCount,
        createdBranchesCount: sanitizedBranches.length,
        createdDepartmentsCount: sanitizedDepts.length,
        reusedBranchesCount: plan.branchesToReuse.length,
        reusedDepartmentsCount: plan.departmentsToReuse.length,
        createdBranches: sanitizedBranches,
        createdDepartments: sanitizedDepts,
        createdEmployees,
        createdInvitations,
        createdBadges,
        createdContracts,
        committedBatchesCount: committedBatches,
        totalBatchesCount: totalBatches,
        committedEmployeesCount: committedEmpCount,
        metaCommitted: true,
        logs
      };
    } catch (err: any) {
      const rawMsg = err?.message || (typeof err === "string" ? err : "") || "Erreur inconnue";
      const errCode = err?.code || (err?.name === "FinopsException" ? (err as any).code : undefined);
      const batchProgress = err?.batchProgress as
        | {
            committedBatches?: number;
            totalBatches?: number;
            committedEmployeesCount?: number;
            metaCommitted?: boolean;
            failedBatchIndex?: number;
          }
        | undefined;

      if (batchProgress) {
        committedBatches = batchProgress.committedBatches ?? committedBatches;
        totalBatches = batchProgress.totalBatches ?? totalBatches;
      }

      let category: BulkImportErrorCategory = "INTERNAL";
      let stableCode = "ERR_BULK_IMPORT_INTERNAL";
      let userMessage = "Une erreur inattendue est survenue lors de l'intégration des collaborateurs.";

      if (errCode === "SEAT_LIMIT_EXCEEDED" || rawMsg.includes("limite de collaborateurs") || rawMsg.includes("forfait")) {
        category = "SEAT_LIMIT";
        stableCode = "ERR_SEAT_LIMIT_EXCEEDED";
        userMessage = rawMsg;
      } else if (
        errCode === "FORBIDDEN_TENANT_ACCESS" ||
        errCode === "CROSS_TENANT_ORG_REFERENCE" ||
        rawMsg.toLowerCase().includes("permission") ||
        rawMsg.toLowerCase().includes("insufficient") ||
        errCode === "permission-denied"
      ) {
        category = "PERMISSION";
        stableCode = "ERR_FIRESTORE_PERMISSION_DENIED";
        userMessage = rawMsg.includes("FORBIDDEN_TENANT_ACCESS")
          ? rawMsg
          : "Permissions insuffisantes pour enregistrer les collaborateurs dans cette entreprise.";
      } else if (rawMsg.includes("budget actif") || rawMsg.includes("Erreur de validation") || errCode === "VALIDATION_ERROR" || errCode === "SCHEMA_VALIDATION_ERROR") {
        category = "VALIDATION";
        stableCode = "ERR_VALIDATION_FAILED";
        userMessage = rawMsg;
      } else if ((rawMsg.includes("succursale") && rawMsg.includes("n'existe pas")) || (rawMsg.includes("département") && rawMsg.includes("n'existe pas"))) {
        category = "CONFLICT";
        stableCode = "ERR_INTEGRITY_ENTITY_NOT_FOUND";
        userMessage = rawMsg;
      } else if (rawMsg.toLowerCase().includes("network") || rawMsg.toLowerCase().includes("offline") || rawMsg.toLowerCase().includes("unavailable")) {
        category = "NETWORK";
        stableCode = "ERR_NETWORK_UNAVAILABLE";
        userMessage = "Réseau indisponible. Vérifiez votre connexion internet.";
      } else if (rawMsg && rawMsg !== "Erreur inconnue") {
        userMessage = rawMsg.length > 250 ? rawMsg.substring(0, 250) + "..." : rawMsg;
        stableCode = errCode || "ERR_BULK_IMPORT_FAILED";
      }

      const correlationId = `bulk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const metaCommitted = Boolean(batchProgress?.metaCommitted);
      const committedEmployeesCount = batchProgress?.committedEmployeesCount ?? 0;
      const isPartial = metaCommitted || committedEmployeesCount > 0 || committedBatches > 0;
      const failedStep =
        committedBatches === 0 && !metaCommitted
          ? "METADATA_OR_VALIDATION"
          : `CHUNK_BATCH_${batchProgress?.failedBatchIndex ?? committedBatches + 1}`;

      console.error(`[BulkEmployeeImportService] Import failed [correlationId=${correlationId}, code=${stableCode}, step=${failedStep}, category=${category}]:`, {
        correlationId,
        code: stableCode,
        category,
        step: failedStep,
        message: rawMsg,
        processedRows: validRows.length,
        committedBatches,
        totalBatches,
        committedEmployeesCount,
        metaCommitted
      });

      const status: BulkImportStatus = isPartial ? "PARTIAL_FAILURE" : "FAILED";

      return {
        status,
        success: false,
        importedEmployeesCount: committedEmployeesCount,
        createdBranchesCount: metaCommitted ? sanitizedBranches.length : 0,
        createdDepartmentsCount: metaCommitted ? sanitizedDepts.length : 0,
        reusedBranchesCount: plan.branchesToReuse.length,
        reusedDepartmentsCount: plan.departmentsToReuse.length,
        createdBranches: metaCommitted ? sanitizedBranches : [],
        createdDepartments: metaCommitted ? sanitizedDepts : [],
        createdEmployees: createdEmployees.slice(0, committedEmployeesCount),
        createdInvitations: createdInvitations.slice(0, committedEmployeesCount),
        createdBadges: createdBadges.slice(0, committedEmployeesCount),
        createdContracts: createdContracts.slice(0, committedEmployeesCount),
        committedBatchesCount: committedBatches,
        totalBatchesCount: totalBatches,
        committedEmployeesCount,
        metaCommitted,
        failedBatchIndex: batchProgress?.failedBatchIndex,
        canRetryIdempotently: true,
        logs: [
          ...logs,
          `Échec de l'intégration (${status}) [${stableCode}] : ${userMessage}`,
          ...(isPartial
            ? [
                `État partiel vérifié : ${committedEmployeesCount}/${createdEmployees.length} collaborateurs engagés, réessai idempotent sûr disponible.`
              ]
            : [])
        ],
        error: userMessage,
        correlationId,
        errorCode: stableCode,
        errorCategory: category,
        failedStep
      };
    }
  }
}
