import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import { resilientGetDocs } from "../utils/resilientFirestore";
import { PICFilters, RawPerformanceDataSet } from "../domains/performance/types";

export class PerformanceRepository {
  /**
   * Fetches raw multi-domain dataset required for Performance Intelligence Center
   * with server-side scoped queries where indexed, plus resilient fallback.
   */
  static async getPerformanceData(
    businessId: string,
    filters?: Partial<PICFilters>
  ): Promise<RawPerformanceDataSet> {
    const filterSummary = {
      period: filters?.period || "all",
      startDate: filters?.startDate || "unbounded",
      endDate: filters?.endDate || "unbounded",
      branchId: filters?.branchId || "ALL",
      departmentId: filters?.departmentId || "ALL",
      metricType: filters?.metricType || "all",
    };

    console.info(`[PIC] [PerformanceRepository] Fetching performance data for business: ${businessId}`, filterSummary);

    try {
      // 1. Fetch Employees
      const empQuery = query(
        collection(db, "employees"),
        where("business_id", "==", businessId)
      );
      const empSnap = await resilientGetDocs(empQuery, `pic_emp_${businessId}`);
      const employees = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 2. Fetch Ledger Transactions
      let txQuery = query(
        collection(db, "ledger_transactions"),
        where("business_id", "==", businessId)
      );
      const txSnap = await resilientGetDocs(txQuery, `pic_tx_${businessId}`);
      const transactions = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 3. Fetch Payroll Records
      const payrollQuery = query(
        collection(db, "payroll_records"),
        where("business_id", "==", businessId)
      );
      const payrollSnap = await resilientGetDocs(payrollQuery, `pic_payroll_${businessId}`);
      const payrollRecords = payrollSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 4. Fetch Attendance Records
      const attendanceQuery = query(
        collection(db, "attendance_records"),
        where("business_id", "==", businessId)
      );
      const attendanceSnap = await resilientGetDocs(attendanceQuery, `pic_attendance_${businessId}`);
      const attendanceRecords = attendanceSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 5. Fetch Branches & Departments
      const branchQuery = query(
        collection(db, "branches"),
        where("business_id", "==", businessId)
      );
      const branchSnap = await resilientGetDocs(branchQuery, `pic_branch_${businessId}`);
      const branches = branchSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const deptQuery = query(
        collection(db, "departments"),
        where("business_id", "==", businessId)
      );
      const deptSnap = await resilientGetDocs(deptQuery, `pic_dept_${businessId}`);
      const departments = deptSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 6. Fetch Snapshots
      const snapQuery = query(
        collection(db, "analytics_snapshots"),
        where("business_id", "==", businessId)
      );
      const snapSnap = await resilientGetDocs(snapQuery, `pic_snap_${businessId}`);
      const snapshots = snapSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      console.info(
        `[PIC] [PerformanceRepository] Successfully fetched data for business ${businessId}:`,
        {
          employeesCount: employees.length,
          transactionsCount: transactions.length,
          payrollRecordsCount: payrollRecords.length,
          attendanceRecordsCount: attendanceRecords.length,
          branchesCount: branches.length,
          departmentsCount: departments.length,
          snapshotsCount: snapshots.length,
        }
      );

      return {
        employees,
        transactions,
        payrollRecords,
        attendanceRecords,
        branches,
        departments,
        snapshots,
      };
    } catch (error) {
      console.error(`[PIC] [PerformanceRepository] Error fetching performance dataset:`, error);
      throw error;
    }
  }

  /**
   * Fetches historical performance snapshots with optional date range bounds
   */
  static async getSnapshots(
    businessId: string,
    startDate?: string,
    endDate?: string
  ): Promise<any[]> {
    console.info(`[PIC] [PerformanceRepository] Fetching snapshots for ${businessId} (${startDate || "start"} -> ${endDate || "end"})`);
    try {
      const snapQuery = query(
        collection(db, "analytics_snapshots"),
        where("business_id", "==", businessId)
      );
      const snapSnap = await resilientGetDocs(snapQuery, `pic_snapshots_${businessId}`);
      let records = snapSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (startDate) {
        records = records.filter((r: any) => (r.snapshotDate || r.generatedAt || "") >= startDate);
      }
      if (endDate) {
        records = records.filter((r: any) => (r.snapshotDate || r.generatedAt || "") <= endDate);
      }

      console.info(`[PIC] [PerformanceRepository] Retrieved ${records.length} snapshots matching filters`);
      return records;
    } catch (error) {
      console.warn(`[PIC] [PerformanceRepository] Snapshot fetch warning:`, error);
      return [];
    }
  }
}
