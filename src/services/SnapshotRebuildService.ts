import { WorkforceSnapshotBuilder } from "./WorkforceSnapshotBuilder";
import { AnalyticsEngine } from "../domains/analytics/services/AnalyticsEngine";
import { AnalyticsSnapshotRepository } from "../repositories/AnalyticsRepository";
import { AnalyticsRepository } from "../domains/analytics/repositories/AnalyticsRepository";
import { EventBus } from "../modules/runtime/EventBus";
import { ForensicLogRepository } from "../repositories/ForensicLogRepository";
import { sha256Sync } from "./analytics/TransactionDeduplicationService";
import { EventOrchestratorClient } from "./orchestrator/EventOrchestratorClient";
import { EmployeeOperationalAttributionService } from "./workforce/EmployeeOperationalAttributionService";
import {
  Employee,
  LedgerTransaction,
  AttendanceRecord,
  PayrollRecord,
  Department,
  Branch,
  EmployeeContract,
  CommissionPlan,
} from "../types";

export interface RebuildAllSnapshotsParams {
  businessId: string;
  employees: Employee[];
  transactions: LedgerTransaction[];
  attendanceLogs?: AttendanceRecord[];
  payrollRecords?: PayrollRecord[];
  departments: Department[];
  branches: Branch[];
  contracts?: EmployeeContract[];
  commissionPlans?: CommissionPlan[];
  periodKey?: string;
  periodType?: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  language?: "fr" | "ht" | "en";
}


export class SnapshotRebuildService {
  private static isListening = false;

  public static startListener() {
    if (this.isListening) return;
    this.isListening = true;
    
    // Listen for reversal events to automatically rebuild snapshots
    EventBus.subscribe("LEDGER_TRANSACTION_REVERSED", async (event) => {
      const businessId = event.payload?.businessId || event.businessId;
      if (businessId) {
        console.log(`[SnapshotRebuildService] Detected LEDGER_TRANSACTION_REVERSED. Queuing rebuild for ${businessId}`);
        // We can just rebuild the activity table directly
        await this.rebuildActivityTable(businessId);
      }
    });
  }

  /**
   * Automatically rebuilds Business Snapshot, Department Snapshot, Employee Snapshot,
   * and Analytics Snapshot post-import with zero manual refresh required.
   */
  static async rebuildAllSnapshots(params: RebuildAllSnapshotsParams) {
    const {
      businessId,
      employees,
      transactions,
      attendanceLogs = [],
      payrollRecords = [],
      departments,
      branches,
      contracts = [],
      commissionPlans = [],
      periodKey = new Date().toISOString().substring(0, 7), // e.g. "2026-08"
      periodType = "MONTHLY",
      language = "fr",
    } = params;

    console.log(`[SnapshotRebuildService] Initiating automated snapshot rebuild for business ${businessId}...`);

    // 1. Invalidate caches to guarantee fresh data calculation
    AnalyticsRepository.invalidateCache();

    // 1.5 Rebuild Employee Operational Attributions first
    const activities = await EmployeeOperationalAttributionService.rebuildAttributions(
      businessId,
      employees,
      transactions,
      departments,
      payrollRecords
    );

    // 2. Rebuild Employee, Department, Branch & Business Performance Snapshots
    const workforceSnapshots = await WorkforceSnapshotBuilder.buildAndPersistSnapshots(
      businessId,
      periodKey,
      periodType,
      employees,
      transactions,
      attendanceLogs,
      payrollRecords,
      departments,
      branches,
      commissionPlans
    );

    // 3. Rebuild Analytics Snapshot
    const rawSnapshot = AnalyticsEngine.generateSnapshot(
      "MONTH",
      undefined,
      employees,
      transactions,
      attendanceLogs,
      payrollRecords,
      branches,
      departments,
      contracts,
      businessId,
      language,
      activities
    );

    const generatedAt = new Date().toISOString();
    const checksumString = `${businessId}_${periodKey}_${rawSnapshot.revenue.currentValue}_${rawSnapshot.expenses.currentValue}`;
    const checksum = `sha256:${sha256Sync(checksumString)}`;

    const analyticsSnapshot = {
      ...rawSnapshot,
      businessId,
      business_id: businessId,
      periodKey,
      generatedAt,
      checksum,
      isFrozen: true,
      isSealed: true,
    };

    // Persist Analytics Snapshot to Firestore `/analytics_snapshots`
    try {
      await AnalyticsSnapshotRepository.create(businessId, analyticsSnapshot as any);
      console.log(`[SnapshotRebuildService] Successfully persisted AnalyticsSnapshot ${periodKey} for business ${businessId}`);
    } catch (persistErr) {
      console.warn("[SnapshotRebuildService] Error persisting AnalyticsSnapshot to Firestore:", persistErr);
    }

    // 4. Emit event to EventBus & orchestrator for background persistence & logging
    try {
      EventBus.publish(
        EventBus.createEvent({
          correlationId: `analytics_rebuilt_${businessId}_${Date.now()}`,
          businessId,
          module: "ANALYTICS",
          aggregate: "AnalyticsSnapshot",
          type: "ANALYTICS_SNAPSHOT_REBUILT",
          payload: {
            businessId,
            periodKey,
            checksum,
            isFrozen: true,
            isSealed: true,
            timestamp: generatedAt,
          },
        })
      );
    } catch (busErr) {
      console.warn("[SnapshotRebuildService] Failed to publish ANALYTICS_SNAPSHOT_REBUILT on EventBus:", busErr);
    }

    await EventOrchestratorClient.orchestrateEvent("FINANCE", {
      action: "SNAPSHOTS_AUTOMATICALLY_REBUILT",
      businessId,
      periodKey,
      timestamp: generatedAt,
    });

    // Record Forensic Audit Log
    try {
      const forensicLog = await ForensicLogRepository.createAndSignLog({
        business_id: businessId,
        timestamp: generatedAt,
        userId: "SYSTEM_SNAPSHOT_REBUILD_SERVICE",
        userName: "SYSTEM_SNAPSHOT_REBUILD_SERVICE",
        userEmail: "system@finops.internal",
        userRole: "SYSTEM",
        action: "ANALYTICS_SNAPSHOT_REBUILT",
        details: `Rebuilt and sealed analytics snapshot for period ${periodKey}. Checksum: ${checksum}`,
        ipAddress: "127.0.0.1",
        userAgent: "FinOps-SnapshotRebuildService/1.0",
      });
      await ForensicLogRepository.writeForensicLog(forensicLog);
    } catch (forensicErr) {
      console.warn("[SnapshotRebuildService] Failed to record forensic audit log:", forensicErr);
    }

    // 5. Trigger instant local window event for real-time UI synchronization without manual refresh
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("finops:snapshots_rebuilt", {
          detail: { businessId, periodKey, workforceSnapshots, analyticsSnapshot },
        })
      );
    }

    return {
      workforceSnapshots,
      analyticsSnapshot,
    };
  }

  /**
   * High-fidelity internal parameter loader to automatically gather business state for rebuilds.
   */
  private static async loadAllParams(businessId: string): Promise<RebuildAllSnapshotsParams> {
    const { collection, getDocs, query, where } = await import("firebase/firestore");
    const { db } = await import("../lib/firebase");

    const [empSnap, txSnap, attSnap, paySnap, deptSnap, branchSnap] = await Promise.all([
      getDocs(query(collection(db, "employees"), where("business_id", "==", businessId))),
      getDocs(query(collection(db, "ledger_transactions"), where("business_id", "==", businessId))),
      getDocs(query(collection(db, "attendance_logs"), where("business_id", "==", businessId))),
      getDocs(query(collection(db, "payroll_records"), where("business_id", "==", businessId))),
      getDocs(query(collection(db, "departments"), where("business_id", "==", businessId))),
      getDocs(query(collection(db, "branches"), where("business_id", "==", businessId)))
    ]);

    const employees = empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
    const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() } as LedgerTransaction));
    const attendanceLogs = attSnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
    const payrollRecords = paySnap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRecord));
    const departments = deptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department));
    const branches = branchSnap.docs.map(d => ({ id: d.id, ...d.data() } as Branch));

    return {
      businessId,
      employees,
      transactions,
      attendanceLogs,
      payrollRecords,
      departments,
      branches
    };
  }

  /**
   * Rebuilds snapshots partially/fully for a single employee
   */
  static async rebuildForEmployee(businessId: string, employeeId: string): Promise<void> {
    console.log(`[SnapshotRebuildService] Partial rebuild triggered for employee ${employeeId}`);
    const params = await this.loadAllParams(businessId);
    await this.rebuildAllSnapshots(params);
  }

  /**
   * Rebuilds snapshots partially/fully for a single department
   */
  static async rebuildForDepartment(businessId: string, departmentId: string): Promise<void> {
    console.log(`[SnapshotRebuildService] Partial rebuild triggered for department ${departmentId}`);
    const params = await this.loadAllParams(businessId);
    await this.rebuildAllSnapshots(params);
  }

  /**
   * Forces rebuild of activity tables and snapshots
   */
  static async rebuildActivityTable(businessId: string): Promise<void> {
    console.log(`[SnapshotRebuildService] Forcing activity table rebuild for business ${businessId}`);
    const params = await this.loadAllParams(businessId);
    await this.rebuildAllSnapshots(params);
  }
}
