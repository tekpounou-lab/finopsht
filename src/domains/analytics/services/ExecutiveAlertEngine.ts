import { AnalyticsSnapshot, Anomaly } from "../types";

export interface ExecutiveAlert {
  id: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  description: string;
  source: string; // "Affected Branch" or "Affected Department"
  suggestedAction: string;
  relatedKpi: string;
  timestamp: string;
}

export class ExecutiveAlertEngine {
  /**
   * Generates a dynamic array of executive and financial alerts based on the snapshot.
   */
  static generateAlerts(snapshot: AnalyticsSnapshot): ExecutiveAlert[] {
    const alerts: ExecutiveAlert[] = [];
    const nowStr = new Date().toISOString();

    // 1. Revenue drop alert
    const rev = snapshot.revenue;
    if (rev.differencePercentage < -5) {
      alerts.push({
        id: "alert_rev_drop",
        severity: "CRITICAL",
        title: "Significant Revenue Drop Detected",
        description: `Revenue has decreased by ${Math.abs(rev.differencePercentage).toFixed(1)}% compared to the previous period. Current: ${rev.currentValue.toLocaleString()} HTG, Prev: ${rev.previousValue.toLocaleString()} HTG.`,
        source: "All Operations",
        suggestedAction: "Audit branch transaction cycles, evaluate promotional efforts, or cross-verify open ledger entries.",
        relatedKpi: "Revenue",
        timestamp: nowStr,
      });
    }

    // 2. Payroll exceeded forecast
    const payroll = snapshot.payrollCost;
    const forecast = snapshot.forecast;
    // Let's check if current monthly payroll exceeds the 30-days forecast divided or similar
    if (payroll.differencePercentage > 10) {
      alerts.push({
        id: "alert_payroll_spike",
        severity: "WARNING",
        title: "Personnel Budget Overrun Alert",
        description: `Payroll costs rose by ${payroll.differencePercentage.toFixed(1)}% (+${payroll.difference.toLocaleString()} HTG). This indicates budget creep.`,
        source: "Human Resources",
        suggestedAction: "Review overtime hours, recently authorized contract rate upgrades, or commission disbursements.",
        relatedKpi: "Payroll Cost",
        timestamp: nowStr,
      });
    }

    // 3. Attendance below threshold
    const attendance = snapshot.attendanceRate;
    if (attendance.currentValue < 85) {
      alerts.push({
        id: "alert_low_attendance",
        severity: "CRITICAL",
        title: "Operational Capacity Warning: Low Attendance",
        description: `Overall employee attendance rate is currently at ${attendance.currentValue.toFixed(1)}%, falling below the 85% operational standard.`,
        source: "Operations & HR",
        suggestedAction: "Conduct instant branch-level attendance reviews. Implement automatic notification alerts to tardy staff.",
        relatedKpi: "Attendance Rate",
        timestamp: nowStr,
      });
    }

    // 4. Cash Flow warning
    const cash = snapshot.cashOnHand;
    if (cash.currentValue < 50000) {
      alerts.push({
        id: "alert_cash_low",
        severity: "CRITICAL",
        title: "Working Capital Safety Level Breach",
        description: `Cash balance is at ${cash.currentValue.toLocaleString()} HTG, which is below the threshold required to handle immediate payroll runs safely.`,
        source: "Treasury Department",
        suggestedAction: "Postpone secondary non-essential ledger disbursements and accelerate active accounts receivable.",
        relatedKpi: "Cash Balance",
        timestamp: nowStr,
      });
    }

    // 5. Department over budget
    const depts = snapshot.departmentPerformance || [];
    depts.forEach(d => {
      // If expenses in a department exceed standard bounds or has poor attendance
      if (d.expenses > 150000) {
        alerts.push({
          id: `alert_dept_budget_${d.departmentId}`,
          severity: "WARNING",
          title: `Budget Spike: ${d.departmentName}`,
          description: `The ${d.departmentName} department generated ${d.expenses.toLocaleString()} HTG in operational expenses this period.`,
          source: `Department: ${d.departmentName}`,
          suggestedAction: "Inspect recent material acquisitions, payroll allocation lines, and vendor transactions.",
          relatedKpi: "Department Performance",
          timestamp: nowStr,
        });
      }
    });

    // 6. Employee absenteeism increase
    const absence = snapshot.absenceRate;
    if (absence.currentValue > 10) {
      alerts.push({
        id: "alert_absenteeism_rising",
        severity: "WARNING",
        title: "Employee Absenteeism Rate Warning",
        description: `Absenteeism rate reached ${absence.currentValue.toFixed(1)}% (+${absence.differencePercentage.toFixed(1)}% increase).`,
        source: "Staff Operations",
        suggestedAction: "Establish feedback loops with top-absentee employees, audit underperformance signals on scorecards.",
        relatedKpi: "Absenteeism Rate",
        timestamp: nowStr,
      });
    }

    // 7. General anomalies from snapshot
    const anomalies = snapshot.anomalies || [];
    anomalies.forEach((an, index) => {
      alerts.push({
        id: `alert_anomaly_${index}`,
        severity: an.severity === "HIGH" ? "CRITICAL" : "WARNING",
        title: "Financial or Clocking Anomaly Detected",
        description: an.description,
        source: an.employeeId ? `Employee ID: ${an.employeeId}` : "Finance Ledger Ledger",
        suggestedAction: "Audit transaction logs, double check accounting balances, or verify manual timesheets.",
        relatedKpi: "Integrity Score",
        timestamp: nowStr,
      });
    });

    // Default info alert if system is perfectly clean
    if (alerts.length === 0) {
      alerts.push({
        id: "alert_perfect_health",
        severity: "INFO",
        title: "All Financial Controls Healthy",
        description: "The enterprise ERP ledger, timesheets, and payroll balances are operating within optimal bounds.",
        source: "System Engine",
        suggestedAction: "Maintain current operational schedule.",
        relatedKpi: "Data Quality Score",
        timestamp: nowStr,
      });
    }

    return alerts;
  }
}
