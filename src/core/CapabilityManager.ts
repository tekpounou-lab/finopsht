
import { globalCommandBus } from "./bus/CommandBus";
import { DisbursePayrollUseCase } from "./usecases/payroll/DisbursePayrollUseCase";
import { RollbackPayrollUseCase } from "./usecases/payroll/RollbackPayrollUseCase";

import { LogAttendanceUseCase } from "./usecases/workforce/LogAttendanceUseCase";

export class CapabilityManager {
  private static isInitialized = false;

  static initialize(handlers: {
    ledger: (tx: any) => Promise<void>;
    payroll: (cycle: any) => Promise<void>;
    audit: (log: any) => Promise<void>;
    attendance: (records: any[]) => Promise<void>;
  }) {
    if (this.isInitialized) {
      console.warn("[CapabilityManager] Capabilities already initialized. Skipping.");
      return;
    }

    // Register Payroll Use Cases
    globalCommandBus.register(
      "DISBURSE_PAYROLL", 
      new DisbursePayrollUseCase({
        ledger: { create: handlers.ledger },
        payroll: { update: (_id: string, cycle: any) => handlers.payroll(cycle) },
        audit: { create: handlers.audit }
      })
    );

    globalCommandBus.register(
      "ROLLBACK_PAYROLL",
      new RollbackPayrollUseCase({
        ledger: { create: handlers.ledger },
        payroll: { update: (_id: string, cycle: any) => handlers.payroll(cycle) },
        audit: { create: handlers.audit }
      })
    );

    globalCommandBus.register(
      "LOG_ATTENDANCE",
      new LogAttendanceUseCase({
        attendance: { update: (recs: any[]) => handlers.attendance(recs) },
        audit: { create: handlers.audit }
      })
    );

    console.log("[CapabilityManager] All capabilities initialized and registered to CommandBus");
    this.isInitialized = true;
  }
}
