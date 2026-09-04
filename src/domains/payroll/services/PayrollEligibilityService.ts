import { OperationResult } from "../types/payrollDomain";

export class PayrollEligibilityService {
  /**
   * Determines if a payroll cycle can transition to a target status.
   */
  public static canTransitionCycleStatus(
    currentStatus: "DRAFT" | "VALIDATED" | "LOCKED" | "PAID",
    targetStatus: "DRAFT" | "VALIDATED" | "LOCKED" | "PAID"
  ): OperationResult<boolean> {
    const validTransitions: Record<string, string[]> = {
      DRAFT: ["VALIDATED"],
      VALIDATED: ["LOCKED", "DRAFT"],
      LOCKED: ["PAID", "VALIDATED"],
      PAID: []
    };

    const allowed = validTransitions[currentStatus]?.includes(targetStatus) ?? false;

    if (!allowed) {
      return {
        success: false,
        message: `Transition impossible de ${currentStatus} vers ${targetStatus}.`,
        data: false
      };
    }

    return {
      success: true,
      message: `Transition autorisée de ${currentStatus} vers ${targetStatus}.`,
      data: true
    };
  }

  /**
   * Verifies if an employee's net pay satisfies the statutory Survival Floor rule.
   * Net pay must not fall below minimum floor (e.g. 15% of gross or local legal threshold).
   */
  public static verifySurvivalFloor(grossPay: number, totalDeductions: number, floorPercentage = 0.15): OperationResult<{ netPay: number; minFloor: number; holdsFloor: boolean }> {
    const minFloor = grossPay * floorPercentage;
    const netPay = Math.max(0, grossPay - totalDeductions);
    const holdsFloor = netPay >= minFloor;

    if (!holdsFloor) {
      return {
        success: false,
        message: `Violat ion de la règle de Plafond de Survie: Le salaire net (${netPay.toLocaleString()} HTG) est inférieur au minimum vital de ${minFloor.toLocaleString()} HTG (${floorPercentage * 100}% du brut).`,
        data: { netPay, minFloor, holdsFloor }
      };
    }

    return {
      success: true,
      message: "Conforme aux exigences du salaire minimum vital.",
      data: { netPay, minFloor, holdsFloor }
    };
  }

  /**
   * Evaluates employee advance recovery capacity for a quincena cycle.
   */
  public static calculateAdvanceRecoveryCapacity(
    grossQuincenaPay: number,
    existingDeductions: number,
    outstandingAdvance: number
  ): number {
    if (grossQuincenaPay <= 0 || outstandingAdvance <= 0) return 0;
    
    // Max allowable total deduction is 50% of quincena gross
    const maxTotalDeduction = grossQuincenaPay * 0.5;
    const remainingDeductionRoom = Math.max(0, maxTotalDeduction - existingDeductions);

    return Math.min(outstandingAdvance, remainingDeductionRoom);
  }
}
