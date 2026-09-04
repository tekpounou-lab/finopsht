import { ValidationResult, OperationResult } from "../../payroll/types/payrollDomain";

export interface BranchInput {
  name: string;
  code?: string;
  location?: string;
}

export interface DepartmentInput {
  name: string;
  code?: string;
}

export interface BranchDeptLinkInput {
  branchId: string;
  departmentId: string;
}

export class OrganizationValidationService {
  /**
   * Validates Branch creation / edit input.
   */
  public static validateBranch(input: BranchInput, existingBranchCodes: string[] = []): ValidationResult {
    const errors: string[] = [];

    if (!input.name || input.name.trim().length === 0) {
      errors.push("Le nom de la succursale est obligatoire.");
    }

    if (input.code && input.code.trim().length > 0) {
      const formattedCode = input.code.trim().toUpperCase();
      if (existingBranchCodes.map((c) => c.toUpperCase()).includes(formattedCode)) {
        errors.push(`Le code de succursale '${formattedCode}' est déjà utilisé.`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates Department creation / edit input.
   */
  public static validateDepartment(input: DepartmentInput, existingDeptNames: string[] = []): ValidationResult {
    const errors: string[] = [];

    if (!input.name || input.name.trim().length === 0) {
      errors.push("Le nom du département est obligatoire.");
    } else {
      const normName = input.name.trim().toLowerCase();
      if (existingDeptNames.map((n) => n.trim().toLowerCase()).includes(normName)) {
        errors.push(`Un département nommé '${input.name.trim()}' existe déjà.`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates link request between a branch and department.
   */
  public static validateBranchDeptLink(input: BranchDeptLinkInput): ValidationResult {
    const errors: string[] = [];

    if (!input.branchId) {
      errors.push("Veuillez sélectionner une succursale valide.");
    }

    if (!input.departmentId) {
      errors.push("Veuillez sélectionner un département valide.");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
