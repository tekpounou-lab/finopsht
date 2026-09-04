import { collection, query, where, getDocs } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { PerformanceService } from "../performance/PerformanceService";
import { isOperationalEmployee } from "../workforce/EmployeeEligibilityService";

export interface DashboardMetricsDTO {
  activeEmployeesCount: number;
  pendingLeavesCount: number;
  recentCyclesCount: number;
  pendingInvitationsCount: number;
}

interface CacheEntry {
  data: DashboardMetricsDTO;
  expiry: number;
}

export class DashboardQueryService {
  private static cache = new Map<string, CacheEntry>();
  private static TTL_MS = 15000; // 15s

  public static invalidateCache(businessId?: string) {
    if (businessId) {
      this.cache.delete(businessId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Fetches high-level counts and totals for executive dashboard cards.
   */
  public static async queryMetrics(businessId: string): Promise<DashboardMetricsDTO> {
    if (!businessId) {
      return {
        activeEmployeesCount: 0,
        pendingLeavesCount: 0,
        recentCyclesCount: 0,
        pendingInvitationsCount: 0
      };
    }

    const cached = this.cache.get(businessId);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    return PerformanceService.trackExecution("query", `DashboardMetrics:${businessId}`, async () => {
      try {
        // 1. Query Active Employees
        const qEmps = query(
          collection(db, "employees"),
          where("business_id", "==", businessId),
          where("status", "==", "ACTIVE")
        );

        // 2. Query Pending Leaves
        const qLeaves = query(
          collection(db, "leaves"),
          where("business_id", "==", businessId),
          where("status", "==", "PENDING")
        );

        // 3. Query Payroll Cycles
        const qCycles = query(
          collection(db, "payroll_cycles"),
          where("business_id", "==", businessId)
        );

        // 4. Query Invitations
        const qInvites = query(
          collection(db, "invitations"),
          where("business_id", "==", businessId),
          where("status", "==", "PENDING")
        );

        // Batch execution in parallel
        const [empsSnap, leavesSnap, cyclesSnap, invitesSnap] = await Promise.all([
          getDocs(qEmps),
          getDocs(qLeaves),
          getDocs(qCycles),
          getDocs(qInvites)
        ]);

        const metrics: DashboardMetricsDTO = {
          activeEmployeesCount: empsSnap.docs.filter((d) => isOperationalEmployee(d.data())).length,
          pendingLeavesCount: leavesSnap.size,
          recentCyclesCount: cyclesSnap.size,
          pendingInvitationsCount: invitesSnap.size
        };

        this.cache.set(businessId, {
          data: metrics,
          expiry: Date.now() + this.TTL_MS
        });

        return metrics;
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, "dashboard_metrics");
        throw error;
      }
    });
  }
}
