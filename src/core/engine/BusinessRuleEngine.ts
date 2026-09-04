
import { BusinessContextState } from "../../contexts/BusinessContext";

export interface RuleResult {
  allowed: boolean;
  message?: string;
  code?: string;
}

export class BusinessRuleEngine {
  static validate(ruleName: string, context: { currentRole: string }, data: any): RuleResult {
    switch (ruleName) {
      case "CAN_ROLLBACK_PAYROLL":
        return this.checkRollbackPayroll(context, data);
      case "CAN_DISBURSE_FUNDS":
        return this.checkDisburseFunds(context, data);
      case "CAN_MODIFY_LOCKED_CYCLE":
        return { allowed: false, message: "Impossible de modifier un cycle verrouillé.", code: "CYCLE_LOCKED" };
      default:
        return { allowed: true };
    }
  }

  private static checkRollbackPayroll(context: { currentRole: string }, data: any): RuleResult {
    const allowedRoles = ["OWNER", "SUPER_ADMIN", "ADMIN", "DIRIGEANT"];
    if (!allowedRoles.includes(context.currentRole)) {
      return { 
        allowed: false, 
        message: "Accès Refusé: Permissions insuffisantes pour annuler un décaissement.",
        code: "UNAUTHORIZED_ROLE"
      };
    }
    return { allowed: true };
  }

  private static checkDisburseFunds(context: { currentRole: string }, data: any): RuleResult {
    const allowedRoles = ["OWNER", "SUPER_ADMIN", "ADMIN", "DIRIGEANT"];
    if (!allowedRoles.includes(context.currentRole)) {
      return {
        allowed: false,
        message: "Accès Refusé: Permissions insuffisantes pour autoriser le décaissement.",
        code: "UNAUTHORIZED_ROLE"
      };
    }
    if (data.status !== "LOCKED") {
      return {
        allowed: false,
        message: "Le cycle doit être VERROUILLÉ avant le décaissement.",
        code: "INVALID_CYCLE_STATUS"
      };
    }
    return { allowed: true };
  }
}
