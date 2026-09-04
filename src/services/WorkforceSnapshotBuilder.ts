import {
  Employee,
  LedgerTransaction,
  AttendanceRecord,
  PayrollRecord,
  Department,
  Branch,
  CommissionPlan,
  EmployeePerformanceSnapshot,
  DepartmentPerformanceSnapshot,
  BranchPerformanceSnapshot,
  BusinessPerformanceSnapshot,
  EmployeeDepartmentActivity,
} from "../types";
import { RevenueAttributionService } from "./RevenueAttributionService";
import { CommissionEngine } from "./CommissionEngine";
import { SalesAggregator } from "./workforce/SalesAggregator";
import { WorkforcePerformanceRepository } from "../repositories/WorkforcePerformanceRepository";
import { EmployeeOperationalAttributionService } from "./workforce/EmployeeOperationalAttributionService";

export class WorkforceSnapshotBuilder {
  /**
   * Builds and persists time-bucketed performance snapshots across:
   * 1. Employee Performance Snapshots
   * 2. Department Performance Snapshots
   * 3. Branch Performance Snapshots
   * 4. Business Performance Snapshots
   */
  static async buildAndPersistSnapshots(
    businessId: string,
    periodKey: string, // e.g. "2026-08" or "2026-Q3"
    periodType: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY",
    employees: Employee[],
    transactions: LedgerTransaction[],
    attendanceLogs: AttendanceRecord[],
    payrollRecords: PayrollRecord[],
    departments: Department[],
    branches: Branch[],
    commissionPlans: CommissionPlan[]
  ): Promise<{
    employeeSnapshots: EmployeePerformanceSnapshot[];
    departmentSnapshots: DepartmentPerformanceSnapshot[];
    branchSnapshots: BranchPerformanceSnapshot[];
    businessSnapshot: BusinessPerformanceSnapshot;
  }> {
    // Filter by businessId
    const businessEmps = employees.filter(
      (e) => !e.business_id || e.business_id === businessId
    );
    const businessTxs = transactions.filter(
      (t) => (!t.business_id || t.business_id === businessId) && t.status !== "REVERSED"
    );
    const businessAttendance = attendanceLogs.filter(
      (a) => !a.business_id || a.business_id === businessId
    );
    const businessPayroll = payrollRecords.filter(
      (p) => !p.business_id || p.business_id === businessId
    );
    const businessDepts = departments.filter(
      (d) => !d.business_id || d.business_id === businessId
    );
    const businessBranches = branches.filter(
      (b) => !b.business_id || b.business_id === businessId
    );

    // Fetch operational attributions from Firestore
    const activities = await EmployeeOperationalAttributionService.fetchAttributions(businessId);

    // 1. Build Employee Performance Snapshots
    const employeeSnapshots: EmployeePerformanceSnapshot[] = [];

    // Calculate preliminary metrics for ranking
    const empPerformanceMap = businessEmps.map((emp) => {
      const empTxs = businessTxs.filter(
        (t) => (t.employeeId === emp.id || (t as any).employee_id === emp.id) && t.type === "INCOME"
      );
      const totalRev = empTxs.reduce((sum, t) => sum + (t.amount || 0), 0);

      // Attribution
      const attribution = RevenueAttributionService.calculateEmployeeAttribution(
        emp,
        businessTxs,
        businessDepts,
        activities
      );

      // Commissions (STRICT ID-BASED PIPELINE: employee_id -> GL Transactions -> department_id -> Sales Aggregator -> Commission)
      const salesByDept = SalesAggregator.aggregateSalesByEmployeeAndDept(emp.id, businessTxs);
      const totalSales = Object.values(salesByDept).reduce((sum, s) => sum + s.salesAmount, 0);
      const commRate = CommissionEngine.resolveCommissionRate(emp);
      const totalComm = (totalSales > 0 && commRate > 0)
        ? Number((totalSales * commRate).toFixed(2))
        : CommissionEngine.calculateEmployeeCommissionsFromSales(
            emp,
            salesByDept,
            commissionPlans,
            commRate
          ).totalCommission;

      // Attendance
      const empAttendance = businessAttendance.filter(
        (a) => a.employeeId === emp.id || (a as any).employee_id === emp.id
      );
      const workedDays = empAttendance.filter(
        (a) => a.status === "NORMAL" || a.status === "LATE" || a.status === "OVERTIME"
      ).length;
      const totalHoursReal = empAttendance.reduce(
        (s, a) => s + (a.realHours || 8),
        workedDays > 0 ? 0 : 176
      );
      const attendanceScore = workedDays > 0 ? Math.min(100, Math.round((workedDays / 22) * 100)) : 100;

      // Payroll
      const payrollRec = businessPayroll.find(
        (p) => p.employeeId === emp.id || p.employee_id === emp.id
      );
      const baseSalary = payrollRec
        ? payrollRec.grossSalary || (payrollRec.gross_salary_cents ? payrollRec.gross_salary_cents / 100 : 0)
        : emp.salaryBaseHtg || emp.baseSalary || 0;

      const totalLaborCost = baseSalary + totalComm;
      const laborCostPercentage = totalRev > 0 ? Math.round((totalLaborCost / totalRev) * 100) : 0;
      const profitGenerated = totalRev - totalLaborCost;
      const productivityIndex = totalHoursReal > 0 ? Math.round(totalRev / totalHoursReal) : 0;

      return {
        emp,
        totalRev,
        attribution,
        totalComm,
        baseSalary,
        totalLaborCost,
        laborCostPercentage,
        profitGenerated,
        workedDays,
        totalHoursReal,
        attendanceScore,
        productivityIndex,
        txCount: empTxs.length,
        avgTicket: empTxs.length > 0 ? Math.round(totalRev / empTxs.length) : 0,
      };
    });

    // Rank employees by revenue generated
    const sortedByRev = [...empPerformanceMap].sort((a, b) => b.totalRev - a.totalRev);

    sortedByRev.forEach((item, index) => {
      const { emp, totalRev, attribution, totalComm, baseSalary, totalLaborCost, laborCostPercentage, profitGenerated, workedDays, totalHoursReal, attendanceScore, productivityIndex, txCount, avgTicket } = item;
      const snapId = `${businessId}_${emp.id}_${periodType}_${periodKey}`;

      const snap: EmployeePerformanceSnapshot = {
        id: snapId,
        business_id: businessId,
        employee_id: emp.id,
        employee_name: emp.name,
        home_department_id: emp.departmentId || "general",
        home_branch_id: emp.branchId || "main",
        period_type: periodType,
        period_key: periodKey,
        total_revenue_generated: totalRev,
        total_gross_margin: profitGenerated,
        total_units_sold: txCount,
        transaction_count: txCount,
        average_ticket: avgTicket,
        operational_department_distribution: attribution.operationalDistribution,
        allocated_base_payroll: baseSalary,
        total_commission_earned: totalComm,
        total_labor_cost: totalLaborCost,
        labor_cost_percentage: laborCostPercentage,
        profit_generated: profitGenerated,
        days_worked: workedDays,
        total_hours_real: totalHoursReal,
        attendance_score: attendanceScore,
        productivity_index: productivityIndex,
        department_rank: index + 1,
        branch_rank: index + 1,
        business_rank: index + 1,
        trend_vs_prior_period: 0,
        ai_recommendation:
          profitGenerated > 50000
            ? "Rendement financier exceptionnel. Éligible pour bonus de rétention d'équipe."
            : laborCostPercentage > 75
            ? "Ratio coût salarial élevé sur chiffre d'affaires. Recommander révision d'affectation opérationnelle."
            : "Performance stable et conforme aux prévisions du département.",
      };

      employeeSnapshots.push(snap);
      WorkforcePerformanceRepository.saveEmployeeSnapshot(snap).catch((err) =>
        console.warn("[SnapshotBuilder] Save employee snapshot warning:", err)
      );
    });

    // 2. Build Department Performance Snapshots
    const departmentSnapshots: DepartmentPerformanceSnapshot[] = [];
    businessDepts.forEach((dept) => {
      const summary = RevenueAttributionService.calculateDepartmentProfitability(
        dept,
        businessEmps,
        businessTxs,
        businessPayroll,
        activities
      );

      const snapId = `${businessId}_${dept.id}_${periodType}_${periodKey}`;
      const deptSnap: DepartmentPerformanceSnapshot = {
        id: snapId,
        business_id: businessId,
        department_id: dept.id,
        department_name: dept.name,
        branch_id: dept.branch_id || "main",
        period_type: periodType,
        period_key: periodKey,
        operational_revenue: summary.operationalRevenue,
        direct_expenses: 0,
        indirect_expenses_allocated: 0,
        home_employee_payroll_cost: summary.homeEmployeePayrollCost,
        commission_payout_cost: summary.commissionPayoutCost,
        total_direct_labor_cost: summary.totalDirectLaborCost,
        gross_margin: summary.contributionMargin,
        gross_margin_percentage: summary.operatingMarginPercentage,
        contribution_margin: summary.contributionMargin,
        operating_margin: summary.contributionMargin,
        operating_margin_percentage: summary.operatingMarginPercentage,
        headcount_home: summary.headcountHome,
        active_selling_employees: summary.activeSellingEmployees,
        revenue_trend: 0,
        margin_trend: 0,
        ai_performance_narrative: `Marge contributive de ${summary.contributionMargin.toLocaleString()} HTG (${summary.operatingMarginPercentage}% de rentabilité).`,
      };

      departmentSnapshots.push(deptSnap);
      WorkforcePerformanceRepository.saveDepartmentSnapshot(deptSnap).catch((err) =>
        console.warn("[SnapshotBuilder] Save department snapshot warning:", err)
      );
    });

    // 3. Build Branch Performance Snapshots
    const branchSnapshots: BranchPerformanceSnapshot[] = [];
    businessBranches.forEach((branch) => {
      const branchDepts = businessDepts.filter(
        (d) => d.branch_id === branch.id || (d as any).branchId === branch.id
      );
      const branchDeptSnaps = departmentSnapshots.filter((ds) =>
        branchDepts.some((d) => d.id === ds.department_id)
      );

      const totalRev = branchDeptSnaps.reduce((s, d) => s + d.operational_revenue, 0);
      const totalPayroll = branchDeptSnaps.reduce((s, d) => s + d.home_employee_payroll_cost, 0);
      const totalComm = branchDeptSnaps.reduce((s, d) => s + d.commission_payout_cost, 0);
      const contribution = branchDeptSnaps.reduce((s, d) => s + d.contribution_margin, 0);

      const snapId = `${businessId}_${branch.id}_${periodType}_${periodKey}`;
      const branchSnap: BranchPerformanceSnapshot = {
        id: snapId,
        business_id: businessId,
        branch_id: branch.id,
        branch_name: branch.name,
        period_type: periodType,
        period_key: periodKey,
        total_revenue: totalRev,
        total_payroll_cost: totalPayroll,
        total_commission_cost: totalComm,
        contribution_margin: contribution,
        headcount: branchDeptSnaps.reduce((s, d) => s + d.headcount_home, 0),
        department_count: branchDepts.length,
      };

      branchSnapshots.push(branchSnap);
      WorkforcePerformanceRepository.saveBranchSnapshot(branchSnap).catch((err) =>
        console.warn("[SnapshotBuilder] Save branch snapshot warning:", err)
      );
    });

    // 4. Build Business Performance Snapshot
    const totalRev = departmentSnapshots.reduce((s, d) => s + d.operational_revenue, 0);
    const totalLabor = departmentSnapshots.reduce((s, d) => s + d.total_direct_labor_cost, 0);
    const contribution = totalRev - totalLabor;

    const bizSnapId = `${businessId}_${periodType}_${periodKey}`;
    const businessSnapshot: BusinessPerformanceSnapshot = {
      id: bizSnapId,
      business_id: businessId,
      period_type: periodType,
      period_key: periodKey,
      total_revenue: totalRev,
      total_labor_cost: totalLabor,
      gross_margin: contribution,
      net_profit: contribution,
      total_headcount: businessEmps.length,
      ai_executive_summary: `Chiffre d'affaires global de ${totalRev.toLocaleString()} HTG avec une masse salariale directe de ${totalLabor.toLocaleString()} HTG (Ratio: ${
        totalRev > 0 ? Math.round((totalLabor / totalRev) * 100) : 0
      }%).`,
    };

    WorkforcePerformanceRepository.saveBusinessSnapshot(businessSnapshot).catch((err) =>
      console.warn("[SnapshotBuilder] Save business snapshot warning:", err)
    );

    return {
      employeeSnapshots,
      departmentSnapshots,
      branchSnapshots,
      businessSnapshot,
    };
  }
}
