export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

export interface PayrollValidationResult extends ValidationResult {
  invalidEmployeeIds?: string[];
  blockerCount?: number;
}

export interface SalaryStructureValidationInput {
  baseSalary: number;
  transportAllowance?: number;
  housingAllowance?: number;
  performanceBonusThreshold?: number;
}

export interface AdvanceRequestValidationInput {
  requestedAmount: number;
  monthlyBaseSalary: number;
  existingOutstandingAdvances: number;
  maxAdvanceRatio?: number; // e.g. 0.50 for 50%
}

export interface BonusValidationInput {
  amount: number;
  bonusType?: string;
  reason?: string;
}

export interface DeductionValidationInput {
  amount: number;
  monthlyBaseSalary: number;
  deductionType?: string;
}
