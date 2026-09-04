import { 
  Employee, 
  Invitation, 
  EmployeeBadge, 
  EmployeeContract, 
  Branch, 
  Department, 
  Role 
} from "../../types";
import { DepartmentNormalizer } from "../../domains/organization/services/DepartmentNormalizer";
import { BranchNormalizer } from "../../domains/organization/services/BranchNormalizer";
import { DepartmentAliasEngine } from "../../domains/organization/services/DepartmentAliasEngine";
import { EmployeeRepository } from "../../repositories/EmployeeRepository";
import { EventBus } from "../../modules/runtime/EventBus";
import { finopsEventOrchestrator } from "../finopsEventOrchestrator";
import { CacheInvalidationService } from "../performance/CacheInvalidationService";

export interface ParsedEmployeeRow {
  name: string;
  email: string;
  phone: string;
  position: string;
  role: Role;
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

  // Resolution metadata
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

    // Prefix or substring match for truncated headers (e.g. pay_regim, salary_base_h, commission_rat)
    for (const [canonKey, origKey] of normalizedKeyMap.entries()) {
      if (canonKey.length >= 4 && (canonKey.startsWith(canonAlias) || canonAlias.startsWith(canonKey))) {
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
function parseSalaryBaseHtg(rawVal: any, defaultVal = 28000): number {
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
 * Robust parser for commission rates (handles e.g. "4.5%", "4,5%", 4.5, 0.045, "5 %").
 */
function parseCommissionRate(rawVal: any): number | undefined {
  if (rawVal === undefined || rawVal === null || rawVal === "") {
    return undefined;
  }
  if (typeof rawVal === "number") {
    if (isNaN(rawVal) || rawVal <= 0) return undefined;
    return rawVal > 0 && rawVal <= 1 ? Number((rawVal * 100).toFixed(4)) : rawVal;
  }
  const str = String(rawVal).trim();
  if (!str) return undefined;

  let clean = str.replace(/%/g, "").replace(/[^\d.,\-]/g, "").trim();
  if (!clean) return undefined;

  clean = clean.replace(/,/g, ".");
  const parsed = parseFloat(clean);
  if (isNaN(parsed) || parsed <= 0) return undefined;

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
  branchesToCreate: Branch[];
  departmentsToCreate: Department[];
  validationErrors: string[];
  warnings: string[];
  summary: {
    totalRows: number;
    validRows: number;
    newBranchesCount: number;
    newDepartmentsCount: number;
    newBranchesNames: string[];
    newDepartmentsNames: string[];
  };
}

export interface BulkImportExecutionResult {
  success: boolean;
  importedEmployeesCount: number;
  createdBranchesCount: number;
  createdDepartmentsCount: number;
  createdBranches: Branch[];
  createdDepartments: Department[];
  createdEmployees: Employee[];
  createdInvitations: Invitation[];
  createdBadges: EmployeeBadge[];
  createdContracts: EmployeeContract[];
  logs: string[];
  error?: string;
}

export class BulkEmployeeImportService {
  /**
   * Analyzes raw imported records from XLSX / CSV and resolves
   * branch and department links (auto-creating missing ones).
   */
  public static resolveImportPlan(
    businessId: string,
    rawRecords: any[],
    existingBranches: Branch[],
    existingDepartments: Department[],
    activeStaff: Employee[]
  ): BulkImportResolutionPlan {
    const parsedRows: ParsedEmployeeRow[] = [];
    const generalValidationErrors: string[] = [];
    const warnings: string[] = [];

    const branchesToCreateMap = new Map<string, Branch>();
    const departmentsToCreateMap = new Map<string, Department>();

    const seenEmailsInFile = new Set<string>();

    for (let idx = 0; idx < rawRecords.length; idx++) {
      const record = rawRecords[idx];
      const rowErrors: string[] = [];

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
        "position", "poste", "title", "role_title", "titre", "job", "job_title", "fonction"
      ]);
      const position = (rawPosition || "Agent").toString().trim();

      // 2. Resolve Role
      const rawRoleVal = (getRecordValue(record, [
        "role", "profil", "profile", "user_role", "userrole", "role_type", "type_role"
      ]) || "EMPLOYEE").toString().toUpperCase().trim();

      let role: Role = "EMPLOYEE";
      if (rawRoleVal === "PROPRIÉTAIRE" || rawRoleVal === "PROPRIETAIRE" || rawRoleVal === "OWNER") {
        role = "OWNER";
      } else if (rawRoleVal === "DIRECTEUR" || rawRoleVal === "GERANT" || rawRoleVal === "GÉRANT" || rawRoleVal === "MANAGER") {
        role = "MANAGER";
      } else if (rawRoleVal === "SUPERVISEUR" || rawRoleVal === "SUPERVISOR") {
        role = "SUPERVISOR";
      } else {
        role = "EMPLOYEE";
      }

      // 3. Resolve Contract, Pay Regime, Salary & Commission
      const rawContract = (getRecordValue(record, [
        "contract_type", "contract_typ", "contracttype", "type_contrat", "typecontrat", 
        "contrat", "contract", "contract_t"
      ]) || "cdi").toString().toLowerCase().trim();

      const contractType: "cdi" | "cdd" | "freelance" = 
        rawContract === "cdd" ? "cdd" : (rawContract === "freelance" ? "freelance" : "cdi");

      // Extract raw salary and commission first
      const rawSalaryInput = getRecordValue(record, [
        "salary_base_htg", "salary_base_h", "salary_base", "salarybasehtg", "salarybase", 
        "salary_htg", "salaryhtg", "base_salary", "basesalary", "baseSalary", "salaryBaseHtg", 
        "salaire_base_htg", "salaire_base_h", "salaire_base", "salaire_htg", "salairebase", 
        "salaire", "salary", "base_htg", "basehtg", "salaire_mensuel", "monthly_salary", 
        "salaire_fixe", "salaire_brut", "base"
      ]);
      const baseSalary = parseSalaryBaseHtg(rawSalaryInput, 28000);

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
      const hireDate = rawHireDate ? rawHireDate.toString().trim() : undefined;

      // 4. Resolve / Auto-Create Branch
      const rawBranchInput = (getRecordValue(record, [
        "branch_name", "branchname", "branchName", "succursale", "succursale_name", 
        "succursale_id", "branch", "branch_id", "branchId", "site", "agence"
      ]) || "").toString().trim();

      const rawBranchCode = (getRecordValue(record, [
        "branch_code", "branchCode", "succursale_code", "code_succursale", "code_branche"
      ]) || "").toString().trim();

      let resolvedBranchId = "";
      let resolvedBranchName = "";
      let isNewBranch = false;

      if (rawBranchInput) {
        const normBranch = BranchNormalizer.normalize(rawBranchInput);
        const canonBranch = BranchNormalizer.getCanonicalId(rawBranchInput);
        const codeUpper = rawBranchCode ? rawBranchCode.toUpperCase() : canonBranch.substring(0, 10).toUpperCase();

        // Check in existing branches
        const matchExisting = existingBranches.find(b => 
          b.id === rawBranchInput ||
          (b.code && b.code.toUpperCase() === codeUpper) ||
          (b.name && BranchNormalizer.normalize(b.name) === normBranch) ||
          (b.name && BranchNormalizer.getCanonicalId(b.name) === canonBranch) ||
          ((b as any).aliases && ((b as any).aliases as string[]).some((a: string) => BranchNormalizer.getCanonicalId(a) === canonBranch))
        );

        if (matchExisting) {
          resolvedBranchId = matchExisting.id;
          resolvedBranchName = matchExisting.name;
        } else if (branchesToCreateMap.has(canonBranch)) {
          const planned = branchesToCreateMap.get(canonBranch)!;
          resolvedBranchId = planned.id;
          resolvedBranchName = planned.name;
          isNewBranch = true;
        } else {
          // Auto-generate missing branch
          const newBranchId = `b_auto_${canonBranch}_${Math.random().toString(36).substring(2, 7)}`;
          const newBranchName = rawBranchInput;
          const newBranchObj: Branch = {
            id: newBranchId,
            business_id: businessId,
            name: newBranchName,
            code: codeUpper || canonBranch.substring(0, 6).toUpperCase(),
            status: "ACTIVE",
            is_active: true,
            address: "Adresse Principale",
            location: newBranchName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          branchesToCreateMap.set(canonBranch, newBranchObj);
          resolvedBranchId = newBranchId;
          resolvedBranchName = newBranchName;
          isNewBranch = true;
        }
      } else {
        // Fallback branch if no branch specified in row
        if (existingBranches.length > 0) {
          resolvedBranchId = existingBranches[0].id;
          resolvedBranchName = existingBranches[0].name;
        } else if (branchesToCreateMap.size > 0) {
          const firstPlanned = Array.from(branchesToCreateMap.values())[0];
          resolvedBranchId = firstPlanned.id;
          resolvedBranchName = firstPlanned.name;
          isNewBranch = true;
        } else {
          const defaultBranchId = `b_auto_central_${Math.random().toString(36).substring(2, 7)}`;
          const defaultBranch: Branch = {
            id: defaultBranchId,
            business_id: businessId,
            name: "Bureau Central",
            code: "BC",
            status: "ACTIVE",
            is_active: true,
            address: "Adresse Principale",
            location: "Bureau Central",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          branchesToCreateMap.set("bureaucentral", defaultBranch);
          resolvedBranchId = defaultBranchId;
          resolvedBranchName = "Bureau Central";
          isNewBranch = true;
        }
      }

      // 5. Resolve / Auto-Create Department
      const rawDeptInput = (
        record.department_name || 
        record.departmentName || 
        record.departement || 
        record.departement_name || 
        record.department || 
        record.department_id || 
        record.departmentId || 
        ""
      ).toString().trim();

      const rawDeptCode = (
        record.department_code || 
        record.departmentCode || 
        record.departement_code || 
        ""
      ).toString().trim();

      let resolvedDeptId = "";
      let resolvedDeptName = "";
      let isNewDepartment = false;

      if (rawDeptInput) {
        const normDept = DepartmentNormalizer.normalize(rawDeptInput);
        const canonDept = DepartmentNormalizer.getCanonicalId(rawDeptInput);
        const deptCodeUpper = rawDeptCode ? rawDeptCode.toUpperCase() : canonDept.substring(0, 10).toUpperCase();

        // Check with DepartmentAliasEngine & direct match
        const matchExistingDept = DepartmentAliasEngine.resolveDepartment(existingDepartments, rawDeptInput) ||
          existingDepartments.find(d => 
            d.id === rawDeptInput ||
            (d.code && d.code.toUpperCase() === deptCodeUpper) ||
            (d.normalized_name && d.normalized_name === normDept) ||
            (d.name && DepartmentNormalizer.getCanonicalId(d.name) === canonDept)
          );

        if (matchExistingDept) {
          resolvedDeptId = matchExistingDept.id;
          resolvedDeptName = matchExistingDept.name;
        } else if (departmentsToCreateMap.has(canonDept)) {
          const planned = departmentsToCreateMap.get(canonDept)!;
          resolvedDeptId = planned.id;
          resolvedDeptName = planned.name;
          isNewDepartment = true;
        } else {
          // Auto-generate missing department
          const newDeptId = `d_auto_${canonDept}_${Math.random().toString(36).substring(2, 7)}`;
          const newDeptName = rawDeptInput;
          const newDeptObj: Department = {
            id: newDeptId,
            business_id: businessId,
            branch_id: resolvedBranchId,
            branchId: resolvedBranchId,
            name: newDeptName,
            normalized_name: normDept,
            code: deptCodeUpper || canonDept.substring(0, 8).toUpperCase(),
            status: "ACTIVE",
            is_active: true,
            budget: 50000, // Safe default positive budget
            aliases: [canonDept, rawDeptInput.toLowerCase()],
            source: "BULK_IMPORT",
            is_system_generated: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          departmentsToCreateMap.set(canonDept, newDeptObj);
          resolvedDeptId = newDeptId;
          resolvedDeptName = newDeptName;
          isNewDepartment = true;
        }
      } else {
        // Fallback department
        if (existingDepartments.length > 0) {
          resolvedDeptId = existingDepartments[0].id;
          resolvedDeptName = existingDepartments[0].name;
        } else if (departmentsToCreateMap.size > 0) {
          const firstPlanned = Array.from(departmentsToCreateMap.values())[0];
          resolvedDeptId = firstPlanned.id;
          resolvedDeptName = firstPlanned.name;
          isNewDepartment = true;
        } else {
          const defaultDeptId = `d_auto_admin_${Math.random().toString(36).substring(2, 7)}`;
          const defaultDept: Department = {
            id: defaultDeptId,
            business_id: businessId,
            branch_id: resolvedBranchId,
            branchId: resolvedBranchId,
            name: "Administration",
            normalized_name: "administration",
            code: "ADMIN",
            status: "ACTIVE",
            is_active: true,
            budget: 50000,
            aliases: ["administration", "admin"],
            source: "BULK_IMPORT",
            is_system_generated: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          departmentsToCreateMap.set("administration", defaultDept);
          resolvedDeptId = defaultDeptId;
          resolvedDeptName = "Administration";
          isNewDepartment = true;
        }
      }

      // 6. Validate Row Integrity
      if (!email || !email.includes("@")) {
        rowErrors.push(`Format d'email invalide: "${rawEmail || 'vide'}"`);
      } else {
        if (seenEmailsInFile.has(email)) {
          rowErrors.push(`Email en doublon dans le fichier: "${email}"`);
        } else {
          seenEmailsInFile.add(email);
        }

        const isAlreadyActive = activeStaff.some(emp => 
          emp.email && emp.email.toLowerCase().trim() === email
        );
        if (isAlreadyActive) {
          rowErrors.push(`Collaborateur existant avec l'email "${email}"`);
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
        isNewBranch,
        isNewDepartment,
        isValid: rowErrors.length === 0,
        validationErrors: rowErrors
      });
    }

    const branchesToCreate = Array.from(branchesToCreateMap.values());
    const departmentsToCreate = Array.from(departmentsToCreateMap.values());

    return {
      businessId,
      parsedRows,
      branchesToCreate,
      departmentsToCreate,
      validationErrors: generalValidationErrors,
      warnings,
      summary: {
        totalRows: parsedRows.length,
        validRows: parsedRows.filter(r => r.isValid).length,
        newBranchesCount: branchesToCreate.length,
        newDepartmentsCount: departmentsToCreate.length,
        newBranchesNames: branchesToCreate.map(b => b.name),
        newDepartmentsNames: departmentsToCreate.map(d => d.name)
      }
    };
  }

  /**
   * Executes the atomic creation of missing branches, departments,
   * employees, invitations, badges, and contracts.
   */
  public static async executeImportPlan(
    plan: BulkImportResolutionPlan,
    actor?: { uid: string; name?: string; role?: Role }
  ): Promise<BulkImportExecutionResult> {
    const validRows = plan.parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      return {
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
        error: "Aucune ligne valide à intégrer."
      };
    }

    const createdEmployees: Employee[] = [];
    const createdInvitations: Invitation[] = [];
    const createdBadges: EmployeeBadge[] = [];
    const createdContracts: EmployeeContract[] = [];
    const logs: string[] = [];

    // Track auto-created branches & departments
    if (plan.branchesToCreate.length > 0) {
      logs.push(`Création de ${plan.branchesToCreate.length} nouvelle(s) succursale(s) : ${plan.branchesToCreate.map(b => b.name).join(", ")}`);
    }
    if (plan.departmentsToCreate.length > 0) {
      logs.push(`Création de ${plan.departmentsToCreate.length} nouveau(x) département(s) : ${plan.departmentsToCreate.map(d => d.name).join(", ")}`);
    }

    // Build entities
    for (const row of validRows) {
      const empId = `emp_${Math.random().toString(36).substring(2, 9)}`;
      const inviteId = `inv_${Math.random().toString(36).substring(2, 9)}`;

      const newEmp: Employee = {
        id: empId,
        business_id: plan.businessId,
        branchId: row.branchId,
        branch_id: row.branchId,
        branch_name: row.branchName,
        departmentId: row.departmentId,
        department_id: row.departmentId,
        department_name: row.departmentName,
        name: row.name,
        email: row.email,
        normalizedEmail: row.email.toLowerCase().trim(),
        role: row.role,
        baseSalary: row.baseSalary,
        salaryBaseHtg: row.baseSalary,
        paymentModel: row.paymentModel,
        phone: row.phone,
        position: row.position,
        onboardingComplete: false,
        contractType: row.contractType,
        payRegime: row.payRegime,
        hireDate: row.hireDate,
        isActive: true,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (row.commissionRate !== undefined && !isNaN(row.commissionRate)) {
        newEmp.commissionRate = row.commissionRate;
        newEmp.commission_rate = row.commissionRate > 1 ? row.commissionRate / 100 : row.commissionRate;
      }

      const newInvite: Invitation = {
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
        branchId: row.branchId,
        branch_name: row.branchName,
        departmentId: row.departmentId,
        department_name: row.departmentName,
        commissionRate: newEmp.commissionRate,
        status: "PENDING",
        invitedAt: new Date().toISOString()
      };

      const badgeSig = `HMAC::${btoa(empId + plan.businessId).substring(0, 16).toUpperCase()}`;
      const badgePayload = {
        employee_id: empId,
        business_id: plan.businessId,
        branch_id: row.branchId,
        department_id: row.departmentId,
        role: row.role,
        signature: badgeSig
      };

      const newBadge: EmployeeBadge = {
        id: `bad_${empId}`,
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
      };

      const newContract: EmployeeContract = {
        id: `con_${Math.random().toString(36).substring(2, 9)}`,
        employeeId: empId,
        business_id: plan.businessId,
        fileUrl: `https://storage.googleapis.com/finops-contracts/${empId}-contract-${row.contractType}.pdf`,
        contractType: row.contractType,
        payRegime: row.payRegime,
        salaryBaseHtg: row.baseSalary,
        commissionRate: newEmp.commissionRate || null,
        generatedAt: new Date().toISOString(),
        status: "active"
      };

      createdEmployees.push(newEmp);
      createdInvitations.push(newInvite);
      createdBadges.push(newBadge);
      createdContracts.push(newContract);
      logs.push(`Préparation de ${row.name} (${row.position}) -> Succursale: ${row.branchName}, Département: ${row.departmentName}`);
    }

    try {
      // 1. Commit all entities atomically via EmployeeRepository
      await EmployeeRepository.createBulkImportBatch(
        createdEmployees,
        createdInvitations,
        createdBadges,
        createdContracts,
        plan.branchesToCreate,
        plan.departmentsToCreate
      );

      // 2. Publish Domain Events
      for (const branch of plan.branchesToCreate) {
        EventBus.publish(EventBus.createEvent({
          correlationId: `bulk_branch_${branch.id}`,
          businessId: plan.businessId,
          module: "ORGANIZATION",
          aggregate: "BRANCH",
          type: "BranchCreated",
          payload: branch
        }));
      }

      for (const dept of plan.departmentsToCreate) {
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
          importedEmployeesCount: createdEmployees.length,
          createdBranchesCount: plan.branchesToCreate.length,
          createdDepartmentsCount: plan.departmentsToCreate.length
        }
      }));

      // Orchestrator Telemetry
      try {
        await finopsEventOrchestrator.emit("WORKFORCE", plan.businessId, {
          action: "WORKFORCE_MASS_IMPORTED",
          importedRows: createdEmployees.length,
          createdBranches: plan.branchesToCreate.length,
          createdDepartments: plan.departmentsToCreate.length,
          triggeredBy: actor?.role || "OWNER"
        });
      } catch (orchErr) {
        console.warn("[BulkEmployeeImportService] Orchestrator notification warning:", orchErr);
      }

      // Sweep local cache
      try {
        CacheInvalidationService.sweepLocal(plan.businessId);
      } catch (cacheErr) {
        console.warn("[BulkEmployeeImportService] Cache sweep warning:", cacheErr);
      }

      logs.push(`Intégration réussie : ${createdEmployees.length} collaborateurs, ${plan.branchesToCreate.length} succursales, et ${plan.departmentsToCreate.length} départements enregistrés.`);

      return {
        success: true,
        importedEmployeesCount: createdEmployees.length,
        createdBranchesCount: plan.branchesToCreate.length,
        createdDepartmentsCount: plan.departmentsToCreate.length,
        createdBranches: plan.branchesToCreate,
        createdDepartments: plan.departmentsToCreate,
        createdEmployees,
        createdInvitations,
        createdBadges,
        createdContracts,
        logs
      };
    } catch (err: any) {
      console.error("[BulkEmployeeImportService] Atomic import failure:", err);
      return {
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
        logs: [...logs, `Échec de l'intégration atomique : ${err.message}`],
        error: err.message
      };
    }
  }
}
