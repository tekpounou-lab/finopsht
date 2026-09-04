import { ValidationResult, OperationResult } from "../../payroll/types/payrollDomain";

export interface MassImportEmployeeRow {
  firstName: string;
  lastName: string;
  email?: string;
  nationalId?: string;
  baseSalary?: number | string;
  position?: string;
}

export class EmployeeValidationService {
  /**
   * Validates if employee status transition is legal.
   */
  public static validateStatusTransition(
    currentStatus: string,
    targetStatus: "ACTIVE" | "SUSPENDED" | "TERMINATED"
  ): OperationResult<boolean> {
    if (currentStatus === targetStatus) {
      return {
        success: false,
        message: `L'employé a déjà le statut ${targetStatus}.`,
        data: false
      };
    }

    if (currentStatus === "TERMINATED") {
      return {
        success: false,
        message: "Impossible de modifier le statut d'un employé licencié/archivé.",
        data: false
      };
    }

    return {
      success: true,
      message: `Changement de statut autorisé de ${currentStatus} vers ${targetStatus}.`,
      data: true
    };
  }

  /**
   * Validates imported employee CSV / JSON row.
   */
  public static validateImportRow(row: MassImportEmployeeRow, index: number): ValidationResult {
    const errors: string[] = [];

    if (!row.firstName || !row.lastName) {
      errors.push(`Ligne ${index + 1}: Prénom et Nom sont obligatoires.`);
    }

    if (row.email && (!row.email.includes("@") || !row.email.includes("."))) {
      errors.push(`Ligne ${index + 1}: Format de l'email '${row.email}' invalide.`);
    }

    if (row.baseSalary !== undefined) {
      const parsedSalary = typeof row.baseSalary === "number" ? row.baseSalary : parseFloat(row.baseSalary);
      if (isNaN(parsedSalary) || parsedSalary < 0) {
        errors.push(`Ligne ${index + 1}: Salaire de base '${row.baseSalary}' invalide.`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
