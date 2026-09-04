import {
  ValidationResult,
  PayrollValidationResult,
  SalaryStructureValidationInput,
  AdvanceRequestValidationInput,
  BonusValidationInput,
  DeductionValidationInput
} from "../types/payrollDomain";

export class PayrollValidationService {
  /**
   * Validates salary structure compensation amounts.
   */
  public static validateSalaryStructure(input: SalaryStructureValidationInput): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (isNaN(input.baseSalary) || input.baseSalary < 0) {
      errors.push("Le salaire de base doit être un montant positif.");
    }

    if (input.transportAllowance !== undefined && input.transportAllowance < 0) {
      errors.push("L'allocation de transport ne peut pas être négative.");
    }

    if (input.housingAllowance !== undefined && input.housingAllowance < 0) {
      errors.push("L'allocation de logement ne peut pas être négative.");
    }

    if (input.baseSalary === 0) {
      warnings.push("Le salaire de base est égal à zéro (Employé bénévole ou commission pure).");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validates salary advance requests according to financial risk boundaries (max 50% base salary).
   */
  public static validateAdvanceRequest(input: AdvanceRequestValidationInput): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const maxRatio = input.maxAdvanceRatio ?? 0.5;

    if (isNaN(input.requestedAmount) || input.requestedAmount <= 0) {
      errors.push("Le montant de l'avance doit être supérieur à zéro.");
    }

    if (input.monthlyBaseSalary <= 0) {
      errors.push("L'employé doit avoir un salaire de base valide pour demander une avance.");
    }

    const maxAllowedAdvance = input.monthlyBaseSalary * maxRatio;
    const totalExposure = input.requestedAmount + input.existingOutstandingAdvances;

    if (totalExposure > maxAllowedAdvance) {
      errors.push(
        `L'avance demandée dépasse la limite de ${maxRatio * 100}% du salaire de base (Maximum autorisé: ${maxAllowedAdvance.toLocaleString()} HTG, Exposition totale: ${totalExposure.toLocaleString()} HTG).`
      );
    }

    if (input.existingOutstandingAdvances > 0) {
      warnings.push(`L'employé a déjà un solde d'avance impayé de ${input.existingOutstandingAdvances.toLocaleString()} HTG.`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validates bonus allocations.
   */
  public static validateBonus(input: BonusValidationInput): ValidationResult {
    const errors: string[] = [];

    if (isNaN(input.amount) || input.amount <= 0) {
      errors.push("Le montant de la prime doit être strictement supérieur à zéro.");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates custom deductions.
   */
  public static validateDeduction(input: DeductionValidationInput): ValidationResult {
    const errors: string[] = [];

    if (isNaN(input.amount) || input.amount <= 0) {
      errors.push("Le montant de la déduction doit être supérieur à zéro.");
    }

    if (input.monthlyBaseSalary > 0 && input.amount > input.monthlyBaseSalary * 0.3) {
      errors.push("La déduction ne peut pas dépasser 30% du salaire brut mensuel.");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates a payroll cycle creation payload.
   */
  public static validateCycleCreation(
    month: number,
    year: number,
    startDate?: string,
    endDate?: string
  ): PayrollValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (month < 1 || month > 12) {
      errors.push("Le mois sélectionné est invalide (doit être entre 1 et 12).");
    }

    if (year < 2020 || year > 2100) {
      errors.push("L'année sélectionnée est en dehors des bornes valides.");
    }

    if (startDate && endDate) {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      if (isNaN(start) || isNaN(end)) {
        errors.push("Les dates du cycle sont invalides.");
      } else if (start >= end) {
        errors.push("La date de début doit être antérieure à la date de fin.");
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}
