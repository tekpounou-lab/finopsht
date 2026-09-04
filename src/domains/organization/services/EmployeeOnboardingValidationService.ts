import { ValidationResult } from "../../payroll/types/payrollDomain";

export interface EmployeeInvitationInput {
  email: string;
  name: string;
  phone?: string;
  position?: string;
  payRegime?: "FIXED" | "COMMISSION" | "HYBRID";
  baseSalary?: number;
  commissionRate?: number;
  role?: string;
  branchId?: string;
  deptId?: string;
}

export class EmployeeOnboardingValidationService {
  /**
   * Validates employee invitation / onboarding payload.
   */
  public static validateInvitation(input: EmployeeInvitationInput): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!input.email || !input.email.includes("@") || !input.email.includes(".")) {
      errors.push("Adresse email valide requise pour l'invitation.");
    }

    if (!input.name || input.name.trim().length === 0) {
      errors.push("Le nom complet du collaborateur est obligatoire.");
    }

    if (input.payRegime !== "COMMISSION") {
      if (input.baseSalary === undefined || isNaN(input.baseSalary) || input.baseSalary < 0) {
        errors.push("Le salaire de base doit être un montant valide non négatif.");
      }
    }

    if (input.payRegime === "COMMISSION" || input.payRegime === "HYBRID") {
      if (input.commissionRate === undefined || isNaN(input.commissionRate) || input.commissionRate < 0 || input.commissionRate > 100) {
        errors.push("Le taux de commission doit être compris entre 0% et 100%.");
      }
    }

    if (!input.branchId) {
      warnings.push("Aucune succursale assignée lors de l'invitation.");
    }

    if (!input.deptId) {
      warnings.push("Aucun département assigné lors de l'invitation.");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}
