import { Employee, Department, Branch, LedgerTransaction } from "../../../types";
import { DepartmentAliasEngine } from "../../organization/services/DepartmentAliasEngine";
import { ReferenceResolver } from "../../../services/ReferenceResolver";
import { applyDoubleEntryRules } from "../../../services/AccountingEngine";

export type RHResolutionStatus =
  | "RESOLVED" // Fully resolved through RH hierarchy or consistent CSV matching
  | "NON_EMPLOYEE" // Valid non-employee financial transaction (e.g. rent, vendor, tax)
  | "UNKNOWN_EMPLOYEE" // Employee specified in CSV but not found in RH Master
  | "AMBIGUOUS_EMPLOYEE_MATCH" // Multiple employee candidates match the name
  | "DEPARTMENT_MISMATCH" // CSV department contradicts RH Employee department
  | "BRANCH_MISMATCH" // CSV branch contradicts RH Department branch
  | "UNRESOLVED_DEPARTMENT" // CSV department specified but not in Master
  | "UNRESOLVED_BRANCH"; // CSV branch specified but not in Master

export interface RawImportRow {
  date?: string;
  type?: string;
  category?: string;
  description?: string;
  amount?: string | number;
  currency?: string;

  // Organizational candidates from CSV
  employee_id?: string;
  employeeId?: string;
  id_employe?: string;
  employee_code?: string;
  matricule?: string;

  employee_email?: string;
  employeeEmail?: string;
  email?: string;
  courriel?: string;

  employee_name?: string;
  employeeName?: string;
  name?: string;
  nom?: string;
  employe?: string;
  associate?: string;
  collaborateur?: string;

  department_code?: string;
  departmentCode?: string;
  department_name?: string;
  departmentName?: string;
  department_id?: string;
  departmentId?: string;
  department?: string;
  departement?: string;

  branch_code?: string;
  branchCode?: string;
  branch_name?: string;
  branchName?: string;
  branch_id?: string;
  branchId?: string;
  branch?: string;
  succursale?: string;

  // Generic index / line tracking
  rowIndex?: number;
}

export interface ResolvedImportRow {
  rowIndex: number;
  isFinanciallyValid: boolean;
  financialErrors: string[];
  
  // RH status
  rhStatus: RHResolutionStatus;
  statusLabel: string;
  warnings: string[];

  // Normalized financial payload
  financialData: {
    date: string;
    type: 'INCOME' | 'EXPENSE' | 'ADVANCE' | 'TRANSFER' | 'PAYROLL' | 'REFUND' | 'CORRECTION' | 'BONUS' | 'PENALTY' | string;
    category: string;
    description: string;
    amount: number;
    amount_cents: number;
    currency: 'HTG' | 'USD';
    debit_account?: string;
    credit_account?: string;
  };

  // Resolved RH entities
  resolvedEmployee?: Employee;
  resolvedDepartment?: Department;
  resolvedBranch?: Branch;

  // Specific resolution output fields
  employeeId?: string;
  employee_id?: string;
  employeeName?: string;
  employee_name?: string;
  employeeEmail?: string;
  employee_email?: string;

  departmentId?: string;
  department_id?: string;
  departmentName?: string;
  department_name?: string;
  departmentCode?: string;
  department_code?: string;

  branchId?: string;
  branch_id?: string;
  branchName?: string;
  branch_name?: string;
  branchCode?: string;
  branch_code?: string;

  cost_center_id?: string;

  // Metadata for unresolved candidates
  candidateEmployees?: Employee[];
  rawInputs: {
    rawEmployee?: string;
    rawDepartment?: string;
    rawBranch?: string;
  };
}

export interface ImportValidationReport {
  totalAnalyzed: number;
  financiallyValidCount: number;
  rhResolvedCount: number;
  rhNeedsResolutionCount: number;
  nonEmployeeCount: number;
  unknownEmployeesCount: number;
  ambiguousEmployeesCount: number;
  departmentMismatchCount: number;
  branchMismatchCount: number;
  financiallyInvalidCount: number;
  rejectedCount: number;
  
  unknownEmployees: string[];
  ambiguousMatches: { rawName: string; candidates: string[] }[];
  mismatches: string[];
  validationWarnings: string[];
}

export class OrganizationalDimensionResolver {
  /**
   * Normalizes strings for robust matching without accents or punctuation.
   */
  public static normalizeString(str: string | undefined | null): string {
    if (!str) return "";
    return str
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  /**
   * Resolves a single row through the full RH master hierarchy with strict tenant isolation.
   * NEVER defaults to primary branch or current branch!
   */
  public static resolveRow(
    rawRow: RawImportRow,
    businessId: string,
    allEmployees: Employee[],
    allDepartments: Department[],
    allBranches: Branch[],
    rowIndex: number = 0,
    defaultAccountingDate: string = new Date().toISOString().split("T")[0]
  ): ResolvedImportRow {
    // 0. Strict Tenant Isolation
    const employees = allEmployees.filter(
      (e) => !e.business_id || e.business_id === businessId
    );
    const departments = allDepartments.filter(
      (d) => !d.business_id || d.business_id === businessId
    );
    const branches = allBranches.filter(
      (b) => !b.business_id || b.business_id === businessId
    );

    const warnings: string[] = [];
    const financialErrors: string[] = [];

    // --- 1. FINANCIAL VALIDATION ---
    const rawDate = rawRow.date || defaultAccountingDate;
    const rawType = (rawRow.type || "INCOME").toUpperCase().trim();
    const rawCategory = (rawRow.category || "GENERAL").trim();
    const rawDescription = (rawRow.description || `Transaction ${rawCategory}`).trim();
    const rawCurrency = (rawRow.currency || "HTG").toUpperCase().trim() === "USD" ? "USD" : "HTG";

    let amount = 0;
    if (typeof rawRow.amount === "number") {
      amount = rawRow.amount;
    } else if (typeof rawRow.amount === "string") {
      const parsedAmount = parseFloat(rawRow.amount.replace(/[^0-9.-]/g, ""));
      amount = isNaN(parsedAmount) ? 0 : parsedAmount;
    }

    if (amount <= 0) {
      financialErrors.push(`Montant invalide (${rawRow.amount}): doit être un nombre strictement positif.`);
    }

    if (!rawDate || isNaN(new Date(rawDate).getTime())) {
      financialErrors.push(`Date invalide (${rawDate}).`);
    }

    const isFinanciallyValid = financialErrors.length === 0;

    // Apply Double-Entry Rules according to type
    const templateTx: Partial<LedgerTransaction> = {
      type: rawType as any,
      amount,
      amount_cents: Math.round(amount * 100),
      currency: rawCurrency,
      date: rawDate,
      category: rawCategory,
      description: rawDescription,
      business_id: businessId
    };
    const doubleEntryTx = applyDoubleEntryRules(templateTx);

    // --- 2. EXTRACT RAW ORGANIZATIONAL INPUTS ---
    const rawEmpId = (
      rawRow.employee_id ||
      rawRow.employeeId ||
      rawRow.id_employe ||
      rawRow.employee_code ||
      rawRow.matricule ||
      ""
    ).trim();

    const rawEmpEmail = (
      rawRow.employee_email ||
      rawRow.employeeEmail ||
      rawRow.email ||
      rawRow.courriel ||
      ""
    ).trim();

    const rawEmpName = (
      rawRow.employee_name ||
      rawRow.employeeName ||
      rawRow.name ||
      rawRow.nom ||
      rawRow.employe ||
      rawRow.associate ||
      rawRow.collaborateur ||
      ""
    ).trim();

    const rawDept = (
      rawRow.department_code ||
      rawRow.departmentCode ||
      rawRow.department_name ||
      rawRow.departmentName ||
      rawRow.department_id ||
      rawRow.departmentId ||
      rawRow.department ||
      rawRow.departement ||
      ""
    ).trim();

    const rawBranch = (
      rawRow.branch_code ||
      rawRow.branchCode ||
      rawRow.branch_name ||
      rawRow.branchName ||
      rawRow.branch_id ||
      rawRow.branchId ||
      rawRow.branch ||
      rawRow.succursale ||
      ""
    ).trim();

    const hasEmployeeIndicator = Boolean(rawEmpId || rawEmpEmail || rawEmpName);

    let resolvedEmp: Employee | undefined = undefined;
    let candidateEmployees: Employee[] = [];
    let rhStatus: RHResolutionStatus = hasEmployeeIndicator ? "UNKNOWN_EMPLOYEE" : "NON_EMPLOYEE";
    let statusLabel = hasEmployeeIndicator ? "Employé non résolu" : "Transaction sans employé (Frais/Général)";

    // --- 3. EMPLOYEE RESOLUTION HIERARCHY ---
    if (hasEmployeeIndicator) {
      // Niveau 1 — Employee ID
      if (rawEmpId) {
        const byId = employees.find(
          (e) =>
            e.id === rawEmpId ||
            (e as any).employeeId === rawEmpId ||
            (e as any).employee_id === rawEmpId ||
            (e as any).matricule === rawEmpId
        );
        if (byId) {
          resolvedEmp = byId;
          rhStatus = "RESOLVED";
          statusLabel = "Employé résolu par ID";
        } else {
          warnings.push(`Identifiant employé introuvable dans le référentiel RH : "${rawEmpId}"`);
        }
      }

      // Niveau 2 — Email (if not resolved by ID)
      if (!resolvedEmp && rawEmpEmail) {
        const normEmail = rawEmpEmail.toLowerCase();
        const byEmail = employees.find(
          (e) => (e.email || "").trim().toLowerCase() === normEmail
        );
        if (byEmail) {
          resolvedEmp = byEmail;
          rhStatus = "RESOLVED";
          statusLabel = "Employé résolu par Email";
        } else {
          warnings.push(`Email employé introuvable dans le référentiel RH : "${rawEmpEmail}"`);
        }
      }

      // Niveau 3 — Nom de l'employé (if not resolved by ID or Email)
      if (!resolvedEmp && rawEmpName) {
        const normSearch = this.normalizeString(rawEmpName);
        
        // Exact name matches
        const exactMatches = employees.filter(
          (e) => this.normalizeString(e.name) === normSearch
        );

        if (exactMatches.length === 1) {
          resolvedEmp = exactMatches[0];
          rhStatus = "RESOLVED";
          statusLabel = "Employé résolu par Nom";
        } else if (exactMatches.length > 1) {
          rhStatus = "AMBIGUOUS_EMPLOYEE_MATCH";
          candidateEmployees = exactMatches;
          statusLabel = "Correspondance ambiguë (plusieurs employés avec ce nom)";
          warnings.push(
            `Ambiguïté RH : Plusieurs employés correspondent au nom "${rawEmpName}" (${exactMatches.map((e) => e.name).join(", ")}). Résolution automatique refusée.`
          );
        } else {
          // Controlled First/Last or parts matching
          const partialMatches = employees.filter((e) => {
            const empNorm = this.normalizeString(e.name);
            if (!empNorm) return false;
            return empNorm.includes(normSearch) || normSearch.includes(empNorm);
          });

          if (partialMatches.length === 1) {
            resolvedEmp = partialMatches[0];
            rhStatus = "RESOLVED";
            statusLabel = "Employé résolu par Nom (partiel)";
          } else if (partialMatches.length > 1) {
            rhStatus = "AMBIGUOUS_EMPLOYEE_MATCH";
            candidateEmployees = partialMatches;
            statusLabel = "Correspondance ambiguë (plusieurs candidats potentiels)";
            warnings.push(
              `Ambiguïté RH : Plusieurs candidats correspondent à "${rawEmpName}" (${partialMatches.map((e) => e.name).join(", ")}). Résolution automatique refusée.`
            );
          } else {
            rhStatus = "UNKNOWN_EMPLOYEE";
            statusLabel = "Employé introuvable dans le référentiel RH";
            warnings.push(`Employé introuvable dans le référentiel RH : "${rawEmpName}"`);
          }
        }
      }
    }

    // --- 4. DEPARTMENT RESOLUTION FROM RH & CSV VALIDATION ---
    let resolvedDept: Department | undefined = undefined;

    if (resolvedEmp) {
      // 4.1 Lookup employee's RH department
      const empDeptId = resolvedEmp.departmentId || (resolvedEmp as any).department_id;
      const rhDept = empDeptId
        ? departments.find(
            (d) =>
              d.id === empDeptId ||
              d.code?.toLowerCase() === empDeptId.toLowerCase() ||
              d.name?.toLowerCase() === empDeptId.toLowerCase()
          )
        : undefined;

      // 4.2 Check if CSV also provided a department
      if (rawDept) {
        const csvDept = DepartmentAliasEngine.resolveDepartment(departments, rawDept);
        if (csvDept && rhDept) {
          if (csvDept.id === rhDept.id || csvDept.code?.toLowerCase() === rhDept.code?.toLowerCase()) {
            resolvedDept = rhDept;
          } else {
            // Mismatch between CSV and RH Master!
            rhStatus = "DEPARTMENT_MISMATCH";
            statusLabel = "Incohérence Département (CSV vs Référentiel RH)";
            warnings.push(
              `Incohérence département : L'employé "${resolvedEmp.name}" appartient au département RH "${rhDept.name}", mais le CSV indique "${csvDept.name || rawDept}".`
            );
            // We preserve rhDept as the truth but flag the mismatch
            resolvedDept = rhDept;
          }
        } else if (rhDept && !csvDept) {
          // CSV department could not be resolved, but RH has department
          resolvedDept = rhDept;
          warnings.push(`Département CSV "${rawDept}" non trouvé dans le référentiel. Utilisation du département RH "${rhDept.name}".`);
        } else if (!rhDept && csvDept) {
          resolvedDept = csvDept;
        }
      } else {
        // No department in CSV, use RH Master
        resolvedDept = rhDept;
      }
    } else if (rawDept) {
      // Non-employee or unresolved employee: try resolving department from CSV
      const csvDept = DepartmentAliasEngine.resolveDepartment(departments, rawDept);
      if (csvDept) {
        resolvedDept = csvDept;
      } else {
        if (rhStatus === "NON_EMPLOYEE") {
          rhStatus = "UNRESOLVED_DEPARTMENT";
          statusLabel = "Département CSV introuvable dans le référentiel";
        }
        warnings.push(`Département CSV "${rawDept}" introuvable dans le référentiel.`);
      }
    }

    // --- 5. BRANCH RESOLUTION FROM RH & CSV VALIDATION ---
    let resolvedBranch: Branch | undefined = undefined;

    if (resolvedDept) {
      // 5.1 Lookup department's RH branch
      const deptBranchId = resolvedDept.branch_id || (resolvedDept as any).branchId;
      const rhBranch = deptBranchId
        ? branches.find(
            (b) =>
              b.id === deptBranchId ||
              b.code?.toUpperCase() === deptBranchId.toUpperCase() ||
              b.name?.toUpperCase() === deptBranchId.toUpperCase()
          )
        : undefined;

      // 5.2 Check if CSV also provided a branch
      if (rawBranch) {
        const csvBranch = ReferenceResolver.resolveBranch(branches, rawBranch);
        if (csvBranch && rhBranch) {
          if (
            csvBranch.id === rhBranch.id ||
            (csvBranch.code && rhBranch.code && csvBranch.code.toUpperCase() === rhBranch.code.toUpperCase())
          ) {
            resolvedBranch = rhBranch;
          } else {
            // Mismatch between CSV and RH Master!
            if (rhStatus === "RESOLVED" || rhStatus === "NON_EMPLOYEE") {
              rhStatus = "BRANCH_MISMATCH";
              statusLabel = "Incohérence Succursale (CSV vs Référentiel RH)";
            }
            warnings.push(
              `Incohérence succursale : Le département "${resolvedDept.name}" est rattaché à la succursale RH "${rhBranch.name}", mais le CSV indique "${csvBranch.name || rawBranch}".`
            );
            // We preserve rhBranch as the truth but flag the mismatch
            resolvedBranch = rhBranch;
          }
        } else if (rhBranch && !csvBranch) {
          resolvedBranch = rhBranch;
          warnings.push(`Succursale CSV "${rawBranch}" non trouvée dans le référentiel. Utilisation de la succursale RH "${rhBranch.name}".`);
        } else if (!rhBranch && csvBranch) {
          resolvedBranch = csvBranch;
        }
      } else {
        // No branch in CSV, use RH Master
        resolvedBranch = rhBranch;
      }
    } else if (rawBranch) {
      // No resolved department: try resolving branch directly from CSV
      const csvBranch = ReferenceResolver.resolveBranch(branches, rawBranch);
      if (csvBranch) {
        resolvedBranch = csvBranch;
      } else {
        if (rhStatus === "NON_EMPLOYEE") {
          rhStatus = "UNRESOLVED_BRANCH";
          statusLabel = "Succursale CSV introuvable dans le référentiel";
        }
        warnings.push(`Succursale CSV "${rawBranch}" introuvable dans le référentiel.`);
      }
    }

    // --- 6. FINAL STATUS CLASSIFICATION ---
    if (resolvedEmp) {
      if (rhStatus !== "DEPARTMENT_MISMATCH" && rhStatus !== "BRANCH_MISMATCH") {
        rhStatus = "RESOLVED";
        statusLabel = "Attribution RH complète";
      }
    } else if (!hasEmployeeIndicator) {
      if (rhStatus !== "UNRESOLVED_DEPARTMENT" && rhStatus !== "UNRESOLVED_BRANCH") {
        rhStatus = "NON_EMPLOYEE";
        statusLabel = "Transaction financière valide (Sans employé)";
      }
    }

    // --- 7. CONSTRUCT RESOLVED ROW ---
    return {
      rowIndex,
      isFinanciallyValid,
      financialErrors,
      rhStatus,
      statusLabel,
      warnings,
      financialData: {
        date: rawDate,
        type: rawType,
        category: rawCategory,
        description: rawDescription,
        amount,
        amount_cents: Math.round(amount * 100),
        currency: rawCurrency,
        debit_account: doubleEntryTx.debit_account,
        credit_account: doubleEntryTx.credit_account
      },
      resolvedEmployee: resolvedEmp,
      resolvedDepartment: resolvedDept,
      resolvedBranch: resolvedBranch,
      
      // Output fields (DO NOT default to primary branch if undefined!)
      employeeId: resolvedEmp?.id,
      employee_id: resolvedEmp?.id,
      employeeName: resolvedEmp?.name,
      employee_name: resolvedEmp?.name,
      employeeEmail: resolvedEmp?.email,
      employee_email: resolvedEmp?.email,

      departmentId: resolvedDept?.id,
      department_id: resolvedDept?.id,
      departmentName: resolvedDept?.name,
      department_name: resolvedDept?.name,
      departmentCode: resolvedDept?.code,
      department_code: resolvedDept?.code,

      branchId: resolvedBranch?.id,
      branch_id: resolvedBranch?.id,
      branchName: resolvedBranch?.name,
      branch_name: resolvedBranch?.name,
      branchCode: resolvedBranch?.code,
      branch_code: resolvedBranch?.code,

      cost_center_id: resolvedBranch?.id || resolvedDept?.id || undefined,

      candidateEmployees,
      rawInputs: {
        rawEmployee: rawEmpId || rawEmpEmail || rawEmpName,
        rawDepartment: rawDept,
        rawBranch: rawBranch
      }
    };
  }

  /**
   * Generates a comprehensive, verifiable validation report for the batch import.
   */
  public static generateValidationReport(
    resolvedRows: ResolvedImportRow[]
  ): ImportValidationReport {
    let financiallyValidCount = 0;
    let rhResolvedCount = 0;
    let rhNeedsResolutionCount = 0;
    let nonEmployeeCount = 0;
    let unknownEmployeesCount = 0;
    let ambiguousEmployeesCount = 0;
    let departmentMismatchCount = 0;
    let branchMismatchCount = 0;
    let financiallyInvalidCount = 0;

    const unknownEmployeesSet = new Set<string>();
    const ambiguousMatchesMap = new Map<string, string[]>();
    const mismatchesList: string[] = [];
    const allWarnings: string[] = [];

    for (const row of resolvedRows) {
      if (!row.isFinanciallyValid) {
        financiallyInvalidCount++;
      } else {
        financiallyValidCount++;

        switch (row.rhStatus) {
          case "RESOLVED":
            rhResolvedCount++;
            break;
          case "NON_EMPLOYEE":
            nonEmployeeCount++;
            break;
          case "UNKNOWN_EMPLOYEE":
            rhNeedsResolutionCount++;
            unknownEmployeesCount++;
            if (row.rawInputs.rawEmployee) {
              unknownEmployeesSet.add(row.rawInputs.rawEmployee);
            }
            break;
          case "AMBIGUOUS_EMPLOYEE_MATCH":
            rhNeedsResolutionCount++;
            ambiguousEmployeesCount++;
            if (row.rawInputs.rawEmployee && row.candidateEmployees) {
              ambiguousMatchesMap.set(
                row.rawInputs.rawEmployee,
                row.candidateEmployees.map((e) => e.name)
              );
            }
            break;
          case "DEPARTMENT_MISMATCH":
            rhNeedsResolutionCount++;
            departmentMismatchCount++;
            row.warnings.forEach((w) => mismatchesList.push(w));
            break;
          case "BRANCH_MISMATCH":
            rhNeedsResolutionCount++;
            branchMismatchCount++;
            row.warnings.forEach((w) => mismatchesList.push(w));
            break;
          case "UNRESOLVED_DEPARTMENT":
          case "UNRESOLVED_BRANCH":
            rhNeedsResolutionCount++;
            break;
        }
      }

      row.warnings.forEach((w) => {
        if (!allWarnings.includes(w)) {
          allWarnings.push(w);
        }
      });
    }

    const ambiguousMatches = Array.from(ambiguousMatchesMap.entries()).map(
      ([rawName, candidates]) => ({ rawName, candidates })
    );

    return {
      totalAnalyzed: resolvedRows.length,
      financiallyValidCount,
      rhResolvedCount,
      rhNeedsResolutionCount,
      nonEmployeeCount,
      unknownEmployeesCount,
      ambiguousEmployeesCount,
      departmentMismatchCount,
      branchMismatchCount,
      financiallyInvalidCount,
      rejectedCount: financiallyInvalidCount,
      unknownEmployees: Array.from(unknownEmployeesSet),
      ambiguousMatches,
      mismatches: mismatchesList,
      validationWarnings: allWarnings
    };
  }

  /**
   * Resolves a batch of raw rows sequentially.
   */
  public static resolveBatch(
    rawRows: RawImportRow[],
    businessId: string,
    allEmployees: Employee[],
    allDepartments: Department[],
    allBranches: Branch[],
    defaultAccountingDate: string = new Date().toISOString().split("T")[0]
  ): ResolvedImportRow[] {
    return rawRows.map((row, index) =>
      OrganizationalDimensionResolver.resolveRow(
        row,
        businessId,
        allEmployees,
        allDepartments,
        allBranches,
        index,
        defaultAccountingDate
      )
    );
  }

  /**
   * Alias for generateValidationReport.
   */
  public static generateReport(
    resolvedRows: ResolvedImportRow[]
  ): ImportValidationReport {
    return OrganizationalDimensionResolver.generateValidationReport(resolvedRows);
  }
}
