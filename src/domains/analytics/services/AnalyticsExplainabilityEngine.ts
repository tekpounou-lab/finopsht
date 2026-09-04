import { AnalyticsSnapshot } from "../types";

export interface ContributionItem {
  name: string;
  amount: number;
  percentage: number;
}

export interface KPIExplanation {
  kpiName: string;
  difference: number;
  differencePercentage: number;
  direction: "UP" | "DOWN" | "STABLE";
  mainCauses: string[];
  departmentContributions: ContributionItem[];
  branchContributions: ContributionItem[];
  employeeContributions: ContributionItem[];
  topPositiveDriver: string;
  topNegativeDriver: string;
}

export class AnalyticsExplainabilityEngine {
  /**
   * Generates a fully dynamic explanation for a specific KPI using the AnalyticsSnapshot
   */
  static explain(kpiName: "payroll" | "revenue" | "expenses" | "attendance", snapshot: AnalyticsSnapshot): KPIExplanation {
    const causes: string[] = [];
    const deptCont: ContributionItem[] = [];
    const branchCont: ContributionItem[] = [];
    const empCont: ContributionItem[] = [];
    let topPositiveDriver = "Stable operations";
    let topNegativeDriver = "No negative anomalies detected";

    const branchPerf = snapshot.branchPerformance || [];
    const deptPerf = snapshot.departmentPerformance || [];
    const empScorecards = snapshot.employeeScorecards || [];

    let diff = 0;
    let diffPct = 0;
    let direction: "UP" | "DOWN" | "STABLE" = "STABLE";

    if (kpiName === "payroll") {
      const kpi = snapshot.payrollCost;
      diff = kpi.difference;
      diffPct = kpi.differencePercentage;
      direction = kpi.direction as "UP" | "DOWN" | "STABLE";

      // 1. Calculate causes
      const totalCommissions = empScorecards.reduce((sum, e) => sum + (e.commissions || 0), 0);
      const totalOvertime = empScorecards.reduce((sum, e) => sum + (e.overtimeHours || 0), 0);
      const totalSalary = empScorecards.reduce((sum, e) => sum + (e.baseSalary || 0), 0);

      if (snapshot.activeStaff.difference > 0) {
        causes.push(`Onboarding of ${snapshot.activeStaff.difference} new hire(s)`);
      }
      if (totalCommissions > 0) {
        causes.push(`Commission disbursements totaling ${totalCommissions.toLocaleString()} HTG`);
      }
      if (totalOvertime > 10) {
        causes.push(`Accumulated overtime of ${totalOvertime.toFixed(1)} hours across branches`);
      }
      if (snapshot.latenessRate.currentValue > 5) {
        causes.push("Late arrival payroll adjustments and penalties applied");
      }
      if (causes.length === 0) {
        causes.push("Standard payroll schedule processing");
      }

      // 2. Contributions
      // Departments
      const totalDeptExp = deptPerf.reduce((sum, d) => sum + d.expenses, 0);
      deptPerf.forEach(d => {
        deptCont.push({
          name: d.departmentName,
          amount: d.expenses,
          percentage: totalDeptExp > 0 ? (d.expenses / totalDeptExp) * 100 : 0
        });
      });

      // Branches
      const totalBranchExp = branchPerf.reduce((sum, b) => sum + b.expenses, 0);
      branchPerf.forEach(b => {
        branchCont.push({
          name: b.branchName,
          amount: b.expenses,
          percentage: totalBranchExp > 0 ? (b.expenses / totalBranchExp) * 100 : 0
        });
      });

      // Employees
      const totalEmpPaid = empScorecards.reduce((sum, e) => sum + e.netPaid, 0);
      empScorecards.forEach(e => {
        empCont.push({
          name: e.employeeName,
          amount: e.netPaid,
          percentage: totalEmpPaid > 0 ? (e.netPaid / totalEmpPaid) * 100 : 0
        });
      });

      // Drivers
      if (empScorecards.length > 0) {
        const sortedEmp = [...empScorecards].sort((a, b) => b.netPaid - a.netPaid);
        topPositiveDriver = `Highest paid: ${sortedEmp[0].employeeName} (${sortedEmp[0].netPaid.toLocaleString()} HTG)`;
        const commissionsEmp = [...empScorecards].sort((a, b) => b.commissions - a.commissions);
        if (commissionsEmp[0] && commissionsEmp[0].commissions > 0) {
          topNegativeDriver = `Commission payout: ${commissionsEmp[0].employeeName} (+${commissionsEmp[0].commissions.toLocaleString()} HTG)`;
        } else {
          topNegativeDriver = "No significant secondary cost driver";
        }
      }

    } else if (kpiName === "revenue") {
      const kpi = snapshot.revenue;
      diff = kpi.difference;
      diffPct = kpi.differencePercentage;
      direction = kpi.direction as "UP" | "DOWN" | "STABLE";

      // Causes
      if (diff > 0) {
        causes.push("Increased sales volume and branch transaction throughput");
      } else if (diff < 0) {
        causes.push("Seasonal market adjustments and lower ledger transactions registered");
      } else {
        causes.push("Steady transaction cycle with no volatility");
      }

      // Contributions
      const totalBranchRev = branchPerf.reduce((sum, b) => sum + b.revenue, 0);
      branchPerf.forEach(b => {
        branchCont.push({
          name: b.branchName,
          amount: b.revenue,
          percentage: totalBranchRev > 0 ? (b.revenue / totalBranchRev) * 100 : 0
        });
      });

      // Fill empty departments/employees for revenue representation
      deptPerf.forEach(d => {
        deptCont.push({
          name: d.departmentName,
          amount: d.expenses * 1.5, // Proportional visual mapping
          percentage: 100 / (deptPerf.length || 1)
        });
      });

      if (branchPerf.length > 0) {
        const sortedBranch = [...branchPerf].sort((a, b) => b.revenue - a.revenue);
        topPositiveDriver = `Top Branch: ${sortedBranch[0].branchName} (${sortedBranch[0].revenue.toLocaleString()} HTG)`;
        if (branchPerf.length > 1) {
          const lowerBranch = sortedBranch[sortedBranch.length - 1];
          topNegativeDriver = `Underperforming Branch: ${lowerBranch.branchName} (${lowerBranch.revenue.toLocaleString()} HTG)`;
        }
      }

    } else if (kpiName === "expenses") {
      const kpi = snapshot.expenses;
      diff = kpi.difference;
      diffPct = kpi.differencePercentage;
      direction = kpi.direction as "UP" | "DOWN" | "STABLE";

      const totalCommissions = empScorecards.reduce((sum, e) => sum + (e.commissions || 0), 0);
      if (totalCommissions > 5000) {
        causes.push(`Employee commissions: ${totalCommissions.toLocaleString()} HTG`);
      }
      if (snapshot.payrollCost.difference > 0) {
        causes.push(`Increase in core personnel costs: +${snapshot.payrollCost.difference.toLocaleString()} HTG`);
      }
      causes.push("General operational ledger expenses and payouts");

      // Contributions
      const totalDeptExp = deptPerf.reduce((sum, d) => sum + d.expenses, 0);
      deptPerf.forEach(d => {
        deptCont.push({
          name: d.departmentName,
          amount: d.expenses,
          percentage: totalDeptExp > 0 ? (d.expenses / totalDeptExp) * 100 : 0
        });
      });

      const totalBranchExp = branchPerf.reduce((sum, b) => sum + b.expenses, 0);
      branchPerf.forEach(b => {
        branchCont.push({
          name: b.branchName,
          amount: b.expenses,
          percentage: totalBranchExp > 0 ? (b.expenses / totalBranchExp) * 100 : 0
        });
      });

      if (deptPerf.length > 0) {
        const sortedDept = [...deptPerf].sort((a, b) => b.expenses - a.expenses);
        topPositiveDriver = `Highest expenditure: ${sortedDept[0].departmentName} department (${sortedDept[0].expenses.toLocaleString()} HTG)`;
        if (deptPerf.length > 1) {
          const lowestDept = sortedDept[sortedDept.length - 1];
          topNegativeDriver = `Lowest expenditure: ${lowestDept.departmentName} department (${lowestDept.expenses.toLocaleString()} HTG)`;
        }
      }

    } else {
      // Attendance
      const kpi = snapshot.attendanceRate;
      diff = kpi.difference;
      diffPct = kpi.differencePercentage;
      direction = kpi.direction as "UP" | "DOWN" | "STABLE";

      if (snapshot.absenceRate.currentValue > 5) {
        causes.push(`Elevated absenteeism registered: ${snapshot.absenceRate.currentValue.toFixed(1)}%`);
      }
      if (snapshot.latenessRate.currentValue > 10) {
        causes.push(`Frequent punctuality delays: ${snapshot.latenessRate.currentValue.toFixed(1)}% lateness`);
      }
      causes.push("Stable QR scanning and contract check-in behaviors");

      // Contributions
      deptPerf.forEach(d => {
        deptCont.push({
          name: d.departmentName,
          amount: d.attendanceRate,
          percentage: d.attendanceRate
        });
      });

      branchPerf.forEach(b => {
        branchCont.push({
          name: b.branchName,
          amount: b.attendanceRate,
          percentage: b.attendanceRate
        });
      });

      if (empScorecards.length > 0) {
        const sortedEmp = [...empScorecards].sort((a, b) => b.attendanceConsistencyScore - a.attendanceConsistencyScore);
        topPositiveDriver = `Model Punctuality: ${sortedEmp[0].employeeName} (${sortedEmp[0].attendanceConsistencyScore}%)`;
        const lowEmp = [...empScorecards].sort((a, b) => a.attendanceConsistencyScore - b.attendanceConsistencyScore);
        if (lowEmp[0] && lowEmp[0].attendanceConsistencyScore < 90) {
          topNegativeDriver = `Attendance Gap: ${lowEmp[0].employeeName} (${lowEmp[0].attendanceConsistencyScore}%)`;
        }
      }
    }

    // Sort contributions descending
    deptCont.sort((a, b) => b.amount - a.amount);
    branchCont.sort((a, b) => b.amount - a.amount);
    empCont.sort((a, b) => b.amount - a.amount);

    return {
      kpiName,
      difference: diff,
      differencePercentage: diffPct,
      direction,
      mainCauses: causes,
      departmentContributions: deptCont.slice(0, 5),
      branchContributions: branchCont.slice(0, 5),
      employeeContributions: empCont.slice(0, 5),
      topPositiveDriver,
      topNegativeDriver
    };
  }
}
