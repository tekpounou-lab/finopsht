import { collection, query, where, getDocs, doc, writeBatch, serverTimestamp, getDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { LedgerTransaction } from "../../types";
import { BusinessSettingsRepository } from "../../repositories/organization";
import { ForensicLogRepository } from "../../repositories/ForensicLogRepository";
import { EventBus } from "../../modules/runtime/EventBus";

export interface LedgerOrphanRemediationReport {
  businessId: string;
  totalScanned: number;
  orphanCount: number;
  correctedCount: number;
  defaultBranchId: string;
  defaultDepartmentId: string;
  fixedTransactionIds: string[];
  forensicLogId: string;
  signature: string;
  timestamp: string;
  details: {
    fixedTransactions: Array<{
      id: string;
      before: { branchId?: string; departmentId?: string; branch_id?: string; department_id?: string };
      after: { branchId: string; departmentId: string; branch_id: string; department_id: string };
    }>;
  };
}

export interface RemediationOptions {
  businessId: string;
  defaultBranchId?: string;
  defaultDepartmentId?: string;
  actor?: {
    uid: string;
    email?: string;
    name?: string;
  };
  customTransactions?: LedgerTransaction[];
  persistToDb?: boolean;
}

export class LedgerOrphanRemediationService {
  /**
   * Checks if a ledger transaction is an orphan in terms of structural attribution
   * (missing branchId/branch_id or departmentId/department_id).
   */
  public static isOrphan(tx: Partial<LedgerTransaction>): boolean {
    const hasBranch = Boolean(
      (tx.branchId && tx.branchId.trim() !== "" && tx.branchId !== "none" && tx.branchId !== "ORPHAN" && tx.branchId !== "UNASSIGNED") ||
      (tx.branch_id && tx.branch_id.trim() !== "" && tx.branch_id !== "none" && tx.branch_id !== "ORPHAN" && tx.branch_id !== "UNASSIGNED")
    );

    const hasDepartment = Boolean(
      (tx.departmentId && tx.departmentId.trim() !== "" && tx.departmentId !== "none" && tx.departmentId !== "ORPHAN" && tx.departmentId !== "UNASSIGNED") ||
      (tx.department_id && tx.department_id.trim() !== "" && tx.department_id !== "none" && tx.department_id !== "ORPHAN" && tx.department_id !== "UNASSIGNED")
    );

    return !hasBranch || !hasDepartment;
  }

  /**
   * Scans and returns all orphan transactions for a given business.
   */
  public static async findOrphans(
    businessId: string,
    customTransactions?: LedgerTransaction[]
  ): Promise<LedgerTransaction[]> {
    if (!businessId) return [];

    let transactions: LedgerTransaction[] = [];

    if (customTransactions && customTransactions.length > 0) {
      transactions = customTransactions.filter((tx) => tx.business_id === businessId);
    } else {
      try {
        const q = query(
          collection(db, "ledger_transactions"),
          where("business_id", "==", businessId)
        );
        const snap = await getDocs(q);
        transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerTransaction));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, "ledger_transactions");
        return [];
      }
    }

    return transactions.filter((tx) => this.isOrphan(tx));
  }

  /**
   * Resolves default branch and department IDs for an enterprise tenant
   * by inspecting business_settings, falling back to organization defaults.
   */
  public static async resolveDefaults(
    businessId: string,
    explicitBranchId?: string,
    explicitDeptId?: string
  ): Promise<{ defaultBranchId: string; defaultDepartmentId: string }> {
    let defaultBranchId = explicitBranchId || "";
    let defaultDepartmentId = explicitDeptId || "";

    if (!defaultBranchId || !defaultDepartmentId) {
      try {
        const settings = await BusinessSettingsRepository.getByBusiness(businessId);
        if (settings) {
          defaultBranchId = defaultBranchId || (settings as any).default_branch_id || (settings as any).defaultBranchId || "";
          defaultDepartmentId = defaultDepartmentId || (settings as any).default_department_id || (settings as any).defaultDepartmentId || "";
        }
      } catch (e) {
        console.warn(`[LedgerOrphanRemediationService] Could not read settings for ${businessId}:`, e);
      }
    }

    // Standard institutional fallbacks if unconfigured
    if (!defaultBranchId) {
      defaultBranchId = "main";
    }
    if (!defaultDepartmentId) {
      defaultDepartmentId = "operations";
    }

    return { defaultBranchId, defaultDepartmentId };
  }

  /**
   * Executes remediation of orphan transactions:
   * 1. Finds all orphan transactions lacking branchId or departmentId.
   * 2. Resolves default attribution from business_settings.
   * 3. Patches transaction documents.
   * 4. Cryptographically seals and persists an audit record in forensic_logs with SHA-256.
   * 5. Returns a structured remediation report.
   */
  public static async remediateOrphans(
    options: RemediationOptions
  ): Promise<LedgerOrphanRemediationReport> {
    const {
      businessId,
      defaultBranchId: overrideBranch,
      defaultDepartmentId: overrideDept,
      actor,
      customTransactions,
      persistToDb = true
    } = options;

    if (!businessId) {
      throw new Error("[LedgerOrphanRemediationService] businessId is required.");
    }

    const { defaultBranchId, defaultDepartmentId } = await this.resolveDefaults(
      businessId,
      overrideBranch,
      overrideDept
    );

    // 1. Gather all transactions to inspect
    let allTransactions: LedgerTransaction[] = [];
    if (customTransactions) {
      allTransactions = customTransactions.filter((tx) => tx.business_id === businessId);
    } else {
      try {
        const q = query(
          collection(db, "ledger_transactions"),
          where("business_id", "==", businessId)
        );
        const snap = await getDocs(q);
        allTransactions = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerTransaction));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, "ledger_transactions");
        throw error;
      }
    }

    // 2. Identify orphans
    const orphans = allTransactions.filter((tx) => this.isOrphan(tx));
    const now = new Date().toISOString();
    const fixedDetails: LedgerOrphanRemediationReport["details"]["fixedTransactions"] = [];
    const fixedIds: string[] = [];

    // 3. Prepare updates
    const updatedTransactions: Array<{ id: string; data: Partial<LedgerTransaction> }> = [];

    for (const orphan of orphans) {
      const beforeBranch = orphan.branchId || orphan.branch_id;
      const beforeDept = orphan.departmentId || orphan.department_id;

      const targetBranch = beforeBranch && beforeBranch !== "none" && beforeBranch !== "ORPHAN" && beforeBranch !== "UNASSIGNED"
        ? beforeBranch
        : defaultBranchId;

      const targetDept = beforeDept && beforeDept !== "none" && beforeDept !== "ORPHAN" && beforeDept !== "UNASSIGNED"
        ? beforeDept
        : defaultDepartmentId;

      const patchData: Partial<LedgerTransaction> = {
        branchId: targetBranch,
        branch_id: targetBranch,
        departmentId: targetDept,
        department_id: targetDept,
        updated_at: now,
        metadata: {
          ...(orphan.metadata || {}),
          remediatedAt: now,
          remediationReason: "ORPHAN_ATTRIBUTION_CORRECTION",
          remediatedBy: actor?.uid || "system"
        }
      };

      updatedTransactions.push({ id: orphan.id, data: patchData });
      fixedIds.push(orphan.id);

      fixedDetails.push({
        id: orphan.id,
        before: {
          branchId: orphan.branchId,
          departmentId: orphan.departmentId,
          branch_id: orphan.branch_id,
          department_id: orphan.department_id
        },
        after: {
          branchId: targetBranch,
          departmentId: targetDept,
          branch_id: targetBranch,
          department_id: targetDept
        }
      });

      // Update in-memory if custom transactions supplied
      Object.assign(orphan, patchData);
    }

    // 4. Persist to Firestore in batches (if database mode)
    if (persistToDb && updatedTransactions.length > 0) {
      try {
        const BATCH_SIZE = 400;
        for (let i = 0; i < updatedTransactions.length; i += BATCH_SIZE) {
          const batch = writeBatch(db);
          const chunk = updatedTransactions.slice(i, i + BATCH_SIZE);

          for (const item of chunk) {
            const ref = doc(db, "ledger_transactions", item.id);
            batch.update(ref, {
              ...item.data,
              _server_timestamp: serverTimestamp()
            });
          }

          await batch.commit();
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, "ledger_transactions/remediate");
        throw error;
      }
    }

    // 5. Generate and seal Forensic Log with SHA-256
    const forensicLog = await ForensicLogRepository.createAndSignLog({
      business_id: businessId,
      action: "LEDGER_ORPHAN_REMEDIATION",
      actorId: actor?.uid || "system",
      userName: actor?.name || "System Remediation Agent",
      userRole: "SUPER_ADMIN",
      userEmail: actor?.email || "system@finops.internal",
      timestamp: now,
      details: JSON.stringify({
        totalScanned: allTransactions.length,
        orphanCount: orphans.length,
        correctedCount: fixedIds.length,
        defaultBranchId,
        defaultDepartmentId,
        fixedTransactionIds: fixedIds
      }),
      beforeState: {
        orphanCount: orphans.length,
        orphanIds: orphans.map((o) => o.id)
      },
      afterState: {
        orphanCount: 0,
        fixedCount: fixedIds.length
      }
    });

    if (persistToDb) {
      try {
        await ForensicLogRepository.writeForensicLog(forensicLog);
      } catch (logErr) {
        console.error("[LedgerOrphanRemediationService] Failed to write forensic log:", logErr);
      }
    }

    // 6. Emit runtime event
    EventBus.publish(
      EventBus.createEvent({
        correlationId: `corr_remediate_${businessId}_${Date.now()}`,
        businessId,
        module: "FINANCIAL_LEDGER",
        aggregate: "OrphanRemediation",
        type: "ORPHAN_TRANSACTIONS_REMEDIATED",
        source: "LedgerOrphanRemediationService",
        payload: {
          businessId,
          correctedCount: fixedIds.length,
          forensicLogId: forensicLog.id
        }
      })
    );

    return {
      businessId,
      totalScanned: allTransactions.length,
      orphanCount: orphans.length,
      correctedCount: fixedIds.length,
      defaultBranchId,
      defaultDepartmentId,
      fixedTransactionIds: fixedIds,
      forensicLogId: forensicLog.id,
      signature: forensicLog.signature,
      timestamp: now,
      details: {
        fixedTransactions: fixedDetails
      }
    };
  }
}
