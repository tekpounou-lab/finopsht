import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  deleteDoc,
  serverTimestamp, 
  writeBatch 
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { PayrollCycle, Payslip, LedgerTransaction, ForensicLog, Employee, PayrollRecord } from "../types";
import { MessageQueue } from "../modules/runtime/EnterpriseMessageQueue";
import { RuntimeEvent } from "../modules/runtime/types";
import { EventBus } from "../modules/runtime/EventBus";
import { PaginatedRepository, PaginatedResult } from "./PaginatedRepository";
import { PayrollService } from "../services/payroll/PayrollService";
import { FinopsException } from "../modules/runtime/FinopsException";

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
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() } as PayrollCycle))
        .filter(c => !(c as any).deleted && (c as any).deleted !== "true");
    } catch (error) {
      console.warn("[PayrollRepository] Failed to fetch cycles list (quota/offline fallback):", error);
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

    // Deduplication check: verify no cycle with the same name exists for this business
    const targetName = (cycle.cycleName || cycle.label || "").trim();
    if (targetName) {
      try {
        const existingCycles = await this.listCyclesByBusiness(cycle.business_id);
        const duplicate = existingCycles.find(
          (c) => (c.cycleName || c.label || "").trim().toLowerCase() === targetName.toLowerCase()
        );
        if (duplicate) {
          throw new FinopsException(
            `Un cycle de paie nommé "${targetName}" existe déjà pour cette entreprise.`,
            {
              businessId: cycle.business_id,
              actorId: "system",
              module: "PAYROLL",
              operation: "createCycle",
              correlationId: `create_cycle_${cycle.id}`,
              severity: "HIGH",
              errorCode: "CYCLE_ALREADY_EXISTS",
              cycleName: targetName,
            }
          );
        }
      } catch (err: any) {
        if (err instanceof FinopsException) throw err;
        console.warn("[PayrollRepository] Skipping deduplication check due to quota or network issue:", err);
      }
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

      try {
        EventBus.publish(event);
      } catch (busErr) {
        console.warn("[PayrollRepository] EventBus publish warning:", busErr);
      }
    } catch (error: any) {
      const errStr = String(error?.message || error || "");
      if (
        errStr.includes("Quota limit exceeded") ||
        errStr.includes("RESOURCE_EXHAUSTED") ||
        errStr.includes("quota") ||
        errStr.includes("Quota limite")
      ) {
        console.warn("[PayrollRepository] Quota limit exceeded during saveCycle. Local state preserved.", error);
        return;
      }
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

      // If excludedEmployeeIds are updated, clean up existing records for those employees
      if (Array.isArray(updates.excludedEmployeeIds) && updates.excludedEmployeeIds.length > 0) {
        try {
          const q = query(
            collection(db, "payroll_records"),
            where("business_id", "==", updates.business_id),
            where("payroll_cycle_id", "==", cycleId)
          );
          const snap = await getDocs(q);
          for (const d of snap.docs) {
            const recData = d.data();
            if (updates.excludedEmployeeIds.includes(recData.employeeId)) {
              await updateDoc(d.ref, {
                deleted: true,
                isExcluded: true,
                deleted_at: serverTimestamp()
              }).catch(() => {});
            }
          }
        } catch (err) {
          console.warn("[PayrollRepository] Cleaning excluded employee records had error:", err);
        }
      }
    } catch (error: any) {
      const errStr = String(error?.message || error || "");
      if (errStr.includes("Quota limit exceeded") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota")) {
        console.warn("[PayrollRepository] Quota limit exceeded during updateCycle. Applied locally.", error);
        return;
      }
      handleFirestoreError(error, OperationType.WRITE, `payroll_cycles/${cycleId}`);
    }
  },

  /**
   * Soft-deletes a single payroll record.
   */
  async deletePayrollRecord(recordId: string, businessId: string): Promise<void> {
    if (!businessId || !recordId) return;
    try {
      const ref = doc(db, "payroll_records", recordId);
      await updateDoc(ref, {
        deleted: true,
        deleted_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
    } catch (error) {
      console.warn(`[PayrollRepository] deletePayrollRecord fallback for ${recordId}:`, error);
      try {
        const ref = doc(db, "payroll_records", recordId);
        await deleteDoc(ref);
      } catch (delErr) {
        handleFirestoreError(delErr, OperationType.DELETE, `payroll_records/${recordId}`);
      }
    }
  },

  /**
   * Deletes a DRAFT payroll cycle (soft delete with deleted: true, child payroll_records soft delete, and forensic audit log).
   */
  async deleteCycle(cycleId: string, businessId: string, actorId: string = "system"): Promise<void> {
    if (!businessId) {
      throw new Error("Multi-Tenancy Violation: business_id is strictly required to delete PayrollCycle.");
    }

    console.debug(`[Payroll] Delete draft requested for cycle: ${cycleId}`);
    console.debug(`[Payroll] Deleting cycle from Firestore...`);

    const markLocalDeleted = () => {
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          const key = `deleted_cycles_${businessId}`;
          const existing: string[] = JSON.parse(localStorage.getItem(key) || "[]");
          if (!existing.includes(cycleId)) {
            existing.push(cycleId);
            localStorage.setItem(key, JSON.stringify(existing));
          }
        }
      } catch (e) {
        console.warn("[PayrollRepository] Local deletion marker failed:", e);
      }
    };

    const ref = doc(db, "payroll_cycles", cycleId);
    let cycleData: Partial<PayrollCycle> = { id: cycleId, business_id: businessId };

    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        cycleData = snap.data() as PayrollCycle;
        if (cycleData.status === "SEALED") {
          throw new Error("Impossible de supprimer un cycle scellé (SEALED).");
        }
      }
    } catch (readErr: any) {
      if (readErr.message?.includes("SEALED")) throw readErr;
      console.warn("[PayrollRepository] Fetching cycle before delete failed (quota or offline):", readErr);
    }

    // Query associated child payroll_records to soft-delete them as well
    const childRecordRefs: Array<ReturnType<typeof doc>> = [];
    try {
      const qRecs = query(
        collection(db, "payroll_records"),
        where("business_id", "==", businessId),
        where("cycleId", "==", cycleId)
      );
      const recSnap = await getDocs(qRecs);
      recSnap.docs.forEach((d) => {
        childRecordRefs.push(doc(db, "payroll_records", d.id));
      });
    } catch (errRecs) {
      console.warn("[PayrollRepository] Fetching child payroll_records before delete failed:", errRecs);
    }

    const event: RuntimeEvent = {
      eventId: `evt_pay_cycle_deleted_${cycleId}_${Date.now()}`,
      correlationId: `corr_del_${cycleId}`,
      businessId,
      module: "PAYROLL",
      aggregate: "PayrollCycle",
      type: "PAYROLL_CYCLE_DELETED",
      eventType: "PAYROLL_CYCLE_DELETED",
      source: "PayrollRepository",
      payload: {
        cycleId,
        cycleName: cycleData.cycleName || cycleData.label,
        business_id: businessId,
        deletedBy: actorId,
      },
      version: "1.0.0",
      status: "PENDING",
      timestamp: new Date().toISOString()
    };

    const forensicLog: ForensicLog = {
      id: "f_del_cyc_" + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      userId: actorId,
      userName: actorId || "Administrator",
      userRole: "ADMIN",
      action: "PAYROLL_CYCLE_DELETED",
      beforeState: JSON.stringify(cycleData),
      afterState: JSON.stringify({ deleted: true }),
      signature: "seal_del_" + Math.random().toString(36).substring(2, 9),
      business_id: businessId,
    };

    try {
      await MessageQueue.persistAndPublishWithBatch(
        businessId,
        (batch) => {
          // Soft-delete main cycle
          batch.set(ref, {
            deleted: true,
            deletedAt: new Date().toISOString(),
            deletedBy: actorId,
            updated_at: serverTimestamp()
          }, { merge: true });

          // Soft-delete associated child payroll_records
          childRecordRefs.forEach((recRef) => {
            batch.set(recRef, {
              deleted: true,
              deletedAt: new Date().toISOString(),
              deletedBy: actorId,
              updated_at: serverTimestamp()
            }, { merge: true });
          });

          // Write forensic audit log to forensic_logs
          const logRef = doc(db, "forensic_logs", forensicLog.id);
          batch.set(logRef, {
            ...forensicLog,
            business_id: businessId,
            _server_timestamp: serverTimestamp()
          });
        },
        event
      );
      markLocalDeleted();
      console.debug(`[Payroll] Cycle deleted successfully. {softDelete: true, childRecordsMarked: ${childRecordRefs.length}}`);
    } catch (error: any) {
      const errStr = String(error?.message || error || "");
      const isQuotaOrOffline =
        errStr.includes("Quota limit exceeded") ||
        errStr.includes("RESOURCE_EXHAUSTED") ||
        errStr.includes("quota") ||
        errStr.includes("unavailable") ||
        errStr.includes("offline");

      if (isQuotaOrOffline) {
        console.warn("[PayrollRepository] Quota limit exceeded or offline while deleting cycle. Applied local fallback deletion.", error);
        markLocalDeleted();
        return;
      }

      handleFirestoreError(error, OperationType.WRITE, `payroll_cycles/${cycleId}/delete`);
      throw error;
    }
  },

  /**
   * Processes a payroll cycle calculation, generating payroll records and updating cycle state.
   */
  async processCycle(
    cycle: PayrollCycle,
    employees: Employee[],
    businessId: string
  ): Promise<PayrollRecord[]> {
    return await PayrollService.processPayrollCycle(cycle, employees, businessId);
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
