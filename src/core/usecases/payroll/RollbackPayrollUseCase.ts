
import { Command, IUseCase, UseCaseResponse } from "../../types";
import { BusinessRuleEngine } from "../../engine/BusinessRuleEngine";
import { PayrollCycle, LedgerTransaction } from "../../../types";

export interface RollbackPayrollCommand extends Command<{
  cycle: PayrollCycle;
  reversals: LedgerTransaction[];
}> {}

export class RollbackPayrollUseCase implements IUseCase<RollbackPayrollCommand, { txCount: number }> {
  constructor(
    private repositories: {
      ledger: any;
      payroll: any;
      audit: any;
    }
  ) {}

  async execute(command: RollbackPayrollCommand): Promise<UseCaseResponse<{ txCount: number }>> {
    const { cycle, reversals } = command.payload;
    const { metadata } = command;

    // 1. Validate Business Rules
    const ruleCheck = BusinessRuleEngine.validate("CAN_ROLLBACK_PAYROLL", { currentRole: metadata.role }, cycle);
    if (!ruleCheck.allowed) {
      return {
        success: false,
        error: { code: ruleCheck.code || "RULE_VIOLATION", message: ruleCheck.message || "Rule check failed" }
      };
    }

    try {
      // 2. Execute Reversals
      for (const tx of reversals) {
        await this.repositories.ledger.create(tx);
      }

      // 3. Update Cycle
      await this.repositories.payroll.update(cycle.id, {
        ...cycle,
        status: "LOCKED",
        updatedAt: new Date().toISOString()
      });

      // 4. Audit
      await this.repositories.audit.create({
        id: "flog_rollback_" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        userId: metadata.userId,
        userRole: metadata.role,
        business_id: metadata.business_id,
        action: "PAYROLL_ROLLBACK",
        severity: "critical"
      });

      return {
        success: true,
        data: { txCount: reversals.length },
        events: [{
          type: "PAYROLL_ROLLBACK_COMPLETED",
          payload: { cycleId: cycle.id },
          occurredAt: new Date().toISOString(),
          business_id: metadata.business_id,
          correlationId: metadata.correlationId
        }]
      };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "ROLLBACK_ERROR", message: error.message }
      };
    }
  }
}
