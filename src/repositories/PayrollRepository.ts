import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp, 
  writeBatch 
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { PayrollCycle, Payslip, LedgerTransaction, ForensicLog, Employee } from "../types";
import { MessageQueue } from "../modules/runtime/EnterpriseMessageQueue";
import { RuntimeEvent } from "../modules/runtime/types";
import { PaginatedRepository, PaginatedResult } from "./PaginatedRepository";

export interface SealPayrollParams {
  cycle: PayrollCycle;
  payslips: Payslip[];
  ledgerTransactions: LedgerTransaction[];
  forensicLog: ForensicLog;
}

export interface RollbackPayrollParams {
  cycle: PayrollCycle;
  reversalTransactions: LedgerTransaction[];
  forensicLog: ForensicLog;
  rollbackReason: string;
  userId: string;
}

export const PayrollRepository = {
  /**
   * Fetches all payroll cycles for a business tenant from Firestore.
   */
  async listCyclesByBusiness(businessId: string): Promise<PayrollCycle[]> {
    if (!businessId) return [];
    const path = `payroll_cycles`;
    try {
      const q = query(
        collection(db, "payroll_cycles"),
        where("business_id", "==", businessId)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollCycle));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  /**
   * Fetches payroll cycles with cursor-based pagination.
   */
  async listCyclesByBusinessPaginated(
    businessId: string,
    options: { pageSize?: number; lastDoc?: any } = {}
  ): Promise<PaginatedResult<PayrollCycle>> {
    if (!businessId) {
      return { items: [], lastDoc: null, hasMore: false, totalFetched: 0 };
    }

    return await PaginatedRepository.getPaginated<PayrollCycle>({
      collectionPath: "payroll_cycles",
      constraints: [where("business_id", "==", businessId)],
      pageSize: options.pageSize || 25,
      lastDoc: options.lastDoc,
      orderByField: "startDate",
      orderDirection: "desc",
      transform: (d) => ({ id: d.id, ...d.data() } as PayrollCycle)
    });
  },

  /**
   * Fetches a single payroll cycle by ID.
   */
  async getCycleById(cycleId: string): Promise<PayrollCycle | null> {
    if (!cycleId) return null;
    const path = `payroll_cycles/${cycleId}`;
    try {
      const ref = doc(db, "payroll_cycles", cycleId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as PayrollCycle;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
      return null;
    }
  },

  /**
   * Creates a new payroll cycle.
   */
  async createCycle(cycle: PayrollCycle): Promise<void> {
    if (!cycle.business_id) {
      throw new Error("Multi-Tenancy Violation: business_id is strictly required for PayrollCycle.");
    }

    const event: RuntimeEvent = {
      eventId: `evt_pay_cycle_created_${cycle.id}_${Date.now()}`,
      correlationId: `corr_pay_${cycle.id}`,
      businessId: cycle.business_id,
      module: "PAYROLL",
      aggregate: "PayrollCycle",
      type: "PAYROLL_CYCLE_CREATED",
      eventType: "PAYROLL_CYCLE_CREATED",
      source: "PayrollRepository",
      payload: {
        cycleId: cycle.id,
        cycleName: cycle.cycleName,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        business_id: cycle.business_id
      },
      version: "1.0.0",
      status: "PENDING",
      timestamp: new Date().toISOString()
    };

    try {
      await MessageQueue.persistAndPublishWithBatch(
        cycle.business_id,
        (batch) => {
          const ref = doc(db, "payroll_cycles", cycle.id);
          batch.set(ref, {
            ...cycle,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
          });
        },
        event
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `payroll_cycles/${cycle.id}`);
    }
  },

  /**
   * Updates an existing payroll cycle.
   */
  async updateCycle(cycleId: string, updates: Partial<PayrollCycle> & { business_id: string }): Promise<void> {
    if (!updates.business_id) {
      throw new Error("Multi-Tenancy Violation: business_id is required to update PayrollCycle.");
    }

    try {
      const ref = doc(db, "payroll_cycles", cycleId);
      await setDoc(ref, {
        ...updates,
        updated_at: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `payroll_cycles/${cycleId}`);
    }
  },

  /**
   * Validates that every active employee in a cycle has a valid contract & base salary.
   * Throws explicit error if any active employee is missing contract data.
   */
  validateEmployeeContractsForPayroll(
    employees: Employee[],
    contractsMap?: Record<string, any>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const activeEmployees = employees.filter(e => e.status !== "TERMINATED" && e.status !== "ARCHIVED");

    activeEmployees.forEach(emp => {
      const contract = contractsMap ? contractsMap[emp.id] : (emp as any).contract;
      const baseSalary = contract?.baseSalary ?? emp.baseSalary ?? emp.salaryBaseHtg ?? (emp as any).base_salary_cents ? ((emp as any).base_salary_cents / 100) : 0;

      if (!baseSalary || baseSalary <= 0) {
        errors.push(`Validation Paie Impossible: L'employé ${emp.name} (${emp.id}) n'a pas de salaire de base ou contrat valide configuré.`);
      }
    });

    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }

    return { valid: true, errors: [] };
  },

  /**
   * Seals a payroll cycle atomically along with payslips, ledger entries, forensic log, and outbox event.
   */
  async sealCycleAtomic(params: SealPayrollParams): Promise<void> {
    const { cycle, payslips, ledgerTransactions, forensicLog } = params;
    const businessId = cycle.business_id;

    if (!businessId) {
      throw new Error("Multi-Tenancy Violation: business_id is required for sealing payroll cycle.");
    }

    const event: RuntimeEvent = {
      eventId: `evt_pay_sealed_${cycle.id}_${Date.now()}`,
      correlationId: `corr_seal_${cycle.id}`,
      businessId,
      module: "PAYROLL",
      aggregate: "PayrollCycle",
      type: "PAYROLL_CYCLE_SEALED",
      eventType: "PAYROLL_CYCLE_SEALED",
      source: "PayrollRepository",
      payload: {
        cycleId: cycle.id,
        employeeCount: payslips.length,
        totalGross: payslips.reduce((acc, p) => acc + ((p as any).grossSalary ?? (p.amount_cents ? p.amount_cents / 100 : 0)), 0),
        totalNet: payslips.reduce((acc, p) => acc + ((p as any).netPaid ?? (p.amount_cents ? p.amount_cents / 100 : 0)), 0),
        effectiveAccountingDate: cycle.effectiveAccountingDate || cycle.endDate,
        business_id: businessId
      },
      version: "1.0.0",
      status: "PENDING",
      timestamp: new Date().toISOString()
    };

    try {
      await MessageQueue.persistAndPublishWithBatch(
        businessId,
        (batch) => {
          // 1. Update cycle status to SEALED
          const cycleRef = doc(db, "payroll_cycles", cycle.id);
          batch.set(cycleRef, {
            ...cycle,
            status: "SEALED",
            sealedAt: new Date().toISOString(),
            updated_at: serverTimestamp()
          }, { merge: true });

          // 2. Persist Payslips
          payslips.forEach((payslip) => {
            const payslipRef = doc(db, "payslips", payslip.id || `ps_${cycle.id}_${payslip.employeeId}`);
            batch.set(payslipRef, {
              ...payslip,
              business_id: businessId,
              payroll_cycle_id: cycle.id,
              status: "SEALED",
              updated_at: serverTimestamp()
            }, { merge: true });
          });

          // 3. Persist General Ledger Transactions (Balanced Double-Entry)
          ledgerTransactions.forEach((tx) => {
            const txRef = doc(db, "ledger_transactions", tx.id);
            batch.set(txRef, {
              ...tx,
              business_id: businessId,
              date: cycle.effectiveAccountingDate || cycle.endDate || tx.date,
              status: "POSTED",
              updatedAt: serverTimestamp()
            }, { merge: true });
          });

          // 4. Persist Forensic Audit Trail Log
          const logRef = doc(db, "forensic_logs", forensicLog.id);
          batch.set(logRef, {
            ...forensicLog,
            business_id: businessId,
            _server_timestamp: serverTimestamp()
          });
        },
        event
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `payroll_cycles/${cycle.id}/seal`);
      throw error;
    }
  },

  /**
   * Rollback a sealed payroll cycle, writing reversal transactions and marking cycle as VOID or LOCKED.
   */
  async rollbackCycleAtomic(params: RollbackPayrollParams): Promise<void> {
    const { cycle, reversalTransactions, forensicLog, rollbackReason, userId } = params;
    const businessId = cycle.business_id;

    if (!businessId) {
      throw new Error("Multi-Tenancy Violation: business_id is required for rolling back payroll cycle.");
    }

    const event: RuntimeEvent = {
      eventId: `evt_pay_rollback_${cycle.id}_${Date.now()}`,
      correlationId: `corr_rollback_${cycle.id}`,
      businessId,
      module: "PAYROLL",
      aggregate: "PayrollCycle",
      type: "PAYROLL_CYCLE_ROLLED_BACK",
      eventType: "PAYROLL_CYCLE_ROLLED_BACK",
      source: "PayrollRepository",
      payload: {
        cycleId: cycle.id,
        reversalCount: reversalTransactions.length,
        reason: rollbackReason,
        business_id: businessId
      },
      version: "1.0.0",
      status: "PENDING",
      timestamp: new Date().toISOString()
    };

    try {
      await MessageQueue.persistAndPublishWithBatch(
        businessId,
        (batch) => {
          // 1. Revert cycle state to LOCKED or DRAFT, archiving sealed state
          const cycleRef = doc(db, "payroll_cycles", cycle.id);
          batch.set(cycleRef, {
            ...cycle,
            status: "LOCKED",
            rolledBackAt: new Date().toISOString(),
            rolledBackBy: userId,
            rollbackReason,
            updated_at: serverTimestamp()
          }, { merge: true });

          // Archive cycle in payroll_cycle_archives
          const archiveRef = doc(db, "payroll_cycle_archives", `archive_${cycle.id}_${Date.now()}`);
          batch.set(archiveRef, {
            ...cycle,
            archivedAt: new Date().toISOString(),
            archiveReason: "ROLLBACK",
            business_id: businessId
          });

          // 2. Persist Reversal Ledger Transactions
          reversalTransactions.forEach((tx) => {
            const txRef = doc(db, "ledger_transactions", tx.id);
            batch.set(txRef, {
              ...tx,
              business_id: businessId,
              date: cycle.effectiveAccountingDate || cycle.endDate || tx.date,
              status: "POSTED",
              updatedAt: serverTimestamp()
            }, { merge: true });
          });

          // 3. Persist Forensic Audit Log
          const logRef = doc(db, "forensic_logs", forensicLog.id);
          batch.set(logRef, {
            ...forensicLog,
            business_id: businessId,
            _server_timestamp: serverTimestamp()
          });
        },
        event
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `payroll_cycles/${cycle.id}/rollback`);
      throw error;
    }
  },

  /**
   * Fetches payslips for a given cycle.
   */
  async getPayslipsByCycle(businessId: string, cycleId: string): Promise<Payslip[]> {
    if (!businessId || !cycleId) return [];
    try {
      const q = query(
        collection(db, "payslips"),
        where("business_id", "==", businessId),
        where("payroll_cycle_id", "==", cycleId)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Payslip));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "payslips");
      return [];
    }
  }
};
