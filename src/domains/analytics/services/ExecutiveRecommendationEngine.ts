import { AnalyticsSnapshot } from "../types";

export interface ActionableRecommendation {
  id: string;
  title: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  targetMetric: string;
  estimatedImpact: string;
  sourcedKpi: string;
}

export class ExecutiveRecommendationEngine {
  /**
   * Evaluates the corporate snapshot and drafts smart, contextual operational recommendations.
   */
  static generateRecommendations(snapshot: AnalyticsSnapshot): ActionableRecommendation[] {
    const recommendations: ActionableRecommendation[] = [];

    const activeScorecards = snapshot.employeeScorecards || [];
    const branchPerf = snapshot.branchPerformance || [];
    const depts = snapshot.departmentPerformance || [];

    // 1. Reduce overtime recommendations
    const totalOvertime = activeScorecards.reduce((sum, e) => sum + (e.overtimeHours || 0), 0);
    if (totalOvertime > 20) {
      recommendations.push({
        id: "rec_overtime",
        title: "Mitigate Overtime Budget Creep",
        description: `Accumulated overtime reached ${totalOvertime.toFixed(1)} hours. Enforce strict manager authorizations on after-hours check-ins.`,
        priority: "HIGH",
        targetMetric: "Payroll cost savings",
        estimatedImpact: "-8% in personnel expenses",
        sourcedKpi: "Payroll Cost"
      });
    }

    // 2. Attendance declining recommendation
    if (snapshot.attendanceRate.currentValue < 90) {
      recommendations.push({
        id: "rec_attendance_decline",
        title: "Deploy Automated Attendance Prompts",
        description: `With attendance rates hovering at ${snapshot.attendanceRate.currentValue.toFixed(1)}%, absenteeism controls should be deployed across low-performing departments.`,
        priority: "HIGH",
        targetMetric: "Operational efficiency score",
        estimatedImpact: "+5% staff productivity",
        sourcedKpi: "Attendance Rate"
      });
    }

    // 3. Cash reserve warning
    if (snapshot.cashOnHand.currentValue < 60000) {
      recommendations.push({
        id: "rec_cash_reserve",
        title: "Accelerate Accounts Collections Cycle",
        description: `Current liquid cash of ${snapshot.cashOnHand.currentValue.toLocaleString()} HTG is thin. Speed up billing collection times and restrict secondary expenses.`,
        priority: "HIGH",
        targetMetric: "Working Capital Safety",
        estimatedImpact: "+15% liquid buffer",
        sourcedKpi: "Cash Balance"
      });
    }

    // 4. Branch revenue concentration
    if (branchPerf.length > 1) {
      const sortedBranches = [...branchPerf].sort((a, b) => b.revenue - a.revenue);
      const topBranchRev = sortedBranches[0].revenue;
      const totalRev = branchPerf.reduce((sum, b) => sum + b.revenue, 0);
      const concentrationRatio = totalRev > 0 ? (topBranchRev / totalRev) * 100 : 0;

      if (concentrationRatio > 65) {
        recommendations.push({
          id: "rec_revenue_concentration",
          title: "Address Branch Revenue Concentration",
          description: `The top branch "${sortedBranches[0].branchName}" is driving ${concentrationRatio.toFixed(1)}% of total corporate revenues. Boost sales support at smaller branches.`,
          priority: "MEDIUM",
          targetMetric: "Portfolio diversification",
          estimatedImpact: "Stabilized operational risk profile",
          sourcedKpi: "Branch Performance"
        });
      }
    }

    // 5. Increase staffing / capacity limits
    const avgHrs = snapshot.avgHoursWorked.currentValue;
    if (avgHrs > 45 && snapshot.activeStaff.currentValue < 15) {
      recommendations.push({
        id: "rec_increase_staffing",
        title: "Initiate Part-Time Resource Onboarding",
        description: `Active staff are averaging ${avgHrs.toFixed(1)} hours weekly, which is leading to burn-out risk. Hire temporary, contract-based support resources.`,
        priority: "MEDIUM",
        targetMetric: "Retention stability score",
        estimatedImpact: "-12% average overtime hours",
        sourcedKpi: "Active Staff"
      });
    }

    // 6. Review department profitability / high spend
    if (depts.length > 0) {
      const sortedDepts = [...depts].sort((a, b) => b.expenses - a.expenses);
      if (sortedDepts[0].expenses > snapshot.expenses.currentValue * 0.4) {
        recommendations.push({
          id: "rec_dept_profitability",
          title: `Audit Expenditures in ${sortedDepts[0].departmentName}`,
          description: `The ${sortedDepts[0].departmentName} department accounts for over 40% of general operating costs. Audit their recent procurement registers.`,
          priority: "MEDIUM",
          targetMetric: "Departmental ROI",
          estimatedImpact: "+10% operational margin",
          sourcedKpi: "Department Performance"
        });
      }
    }

    // Default recommendation for steady state operations
    if (recommendations.length === 0) {
      recommendations.push({
        id: "rec_perfect_pacing",
        title: "Maintain Balanced Capital Reinvestments",
        description: "All core business metrics are healthy and balanced. Use the current period surplus to reinforce employee retention programs.",
        priority: "LOW",
        targetMetric: "Staff retention",
        estimatedImpact: "+3% year-over-year growth",
        sourcedKpi: "General Analytics"
      });
    }

    return recommendations.slice(0, 4);
  }
}
