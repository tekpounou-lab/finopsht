
import { Command, IUseCase, UseCaseResponse } from "../../types";
import { BusinessRuleEngine } from "../../engine/BusinessRuleEngine";
import { PayrollCycle, LedgerTransaction } from "../../../types";
import { calculatePayrollPostingDate } from "../../../lib/payrollPostingDate";

export interface DisbursePayrollCommand extends Command<{
  cycle: PayrollCycle;
  transactions: LedgerTransaction[];
}> {}

export class DisbursePayrollUseCase implements IUseCase<DisbursePayrollCommand, { txCount: number }> {
  constructor(
    private repositories: {
      ledger: any;
      payroll: any;
      audit: any;
    }
  ) {}

  async execute(command: DisbursePayrollCommand): Promise<UseCaseResponse<{ txCount: number }>> {
    const { cycle, transactions } = command.payload;
    const { metadata } = command;

    // 1. Validate Business Rules
    const ruleCheck = BusinessRuleEngine.validate("CAN_DISBURSE_FUNDS", { currentRole: metadata.role }, cycle);
    if (!ruleCheck.allowed) {
      return {
        success: false,
        error: { code: ruleCheck.code || "RULE_VIOLATION", message: ruleCheck.message || "Rule check failed" }
      };
    }

    try {
      const postingDate = calculatePayrollPostingDate(cycle);
      const executionTimestamp = new Date().toISOString();

      // 2. Execute Business Logic (Persistence)
      // Enforce posting date on ledger entries while preserving execution timestamp in metadata
      for (const tx of transactions) {
        const enrichedTx: LedgerTransaction = {
          ...tx,
          date: postingDate,
          metadata: {
            ...tx.metadata,
            effectiveAccountingDate: postingDate,
            executionDate: executionTimestamp.split("T")[0],
            executionTimestamp,
            cycleType: cycle.cycleType || (cycle.label === "Q1" ? "REGULAR_FIRST_HALF" : "REGULAR_SECOND_HALF")
          }
        };
        await this.repositories.ledger.create(enrichedTx);
      }

      await this.repositories.payroll.update(cycle.id, {
        ...cycle,
        effectiveAccountingDate: postingDate,
        status: "PAID",
        disbursedAt: executionTimestamp,
        disbursedBy: metadata.userId
      });

      // 3. Audit log preserving both execution date and effective accounting date
      await this.repositories.audit.create({
        id: "flog_pay_" + Math.random().toString(36).substring(2, 9),
        timestamp: executionTimestamp,
        userId: metadata.userId,
        userRole: metadata.role,
        business_id: metadata.business_id,
        action: "PAYROLL_DISBURSED",
        details: `Disbursed ${transactions.length} transactions for cycle ${cycle.cycleName} (Effective Accounting Date: ${postingDate}, Execution Date: ${executionTimestamp.split("T")[0]})`,
        severity: "critical"
      });

      return {
        success: true,
        data: { txCount: transactions.length },
        events: [{
          type: "PAYROLL_DISBURSED",
          payload: { cycleId: cycle.id, amount: transactions.reduce((sum, t) => sum + t.amount_cents, 0), effectiveAccountingDate: postingDate },
          occurredAt: executionTimestamp,
          business_id: metadata.business_id,
          correlationId: metadata.correlationId
        }]
      };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "PERSISTENCE_ERROR", message: error.message }
      };
    }
  }
}
