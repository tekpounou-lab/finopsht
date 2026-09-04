import { AnalyticsSnapshot } from "../types";

export interface ScorecardMetric {
  name: string;
  score: number; // 0 to 100
  color: string; // Tailwind text color class
  bgColor: string; // Tailwind bg color class
  trend: "UP" | "DOWN" | "STABLE";
  explanation: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  recommendation: string;
}

export class ExecutiveScoreEngine {
  /**
   * Calculates the 8 corporate scorecards based strictly on the snapshot metrics.
   */
  static calculateScorecards(snapshot: AnalyticsSnapshot): ScorecardMetric[] {
    const scorecards: ScorecardMetric[] = [];

    const rev = snapshot.revenue.currentValue;
    const exp = snapshot.expenses.currentValue;
    const payrollCost = snapshot.payrollCost.currentValue;
    const activeScorecards = snapshot.employeeScorecards || [];
    const hasActivity = rev > 0 || exp > 0 || payrollCost > 0 || activeScorecards.some(e => e.totalHours > 0 || e.commissions > 0 || e.netPaid > 0);

    if (!hasActivity) {
      const metricNames = [
        "Financial Health",
        "Operational Health",
        "Payroll Health",
        "Attendance Health",
        "Compliance & Ledger Integrity",
        "Cash Flow Security",
        "Profitability Matrix",
        "Growth Velocity",
      ];
      return metricNames.map((name) => this.buildMetric(
        name,
        0,
        "STABLE",
        "Aucune transaction, pointage ou bulletin de paie sur la période sélectionnée.",
        "LOW",
        "Sélectionnez une période temporelle comprenant des enregistrements réels."
      ));
    }

    // 1. Financial Health Score
    // Calculated based on revenue, expenses, profit ratio
    const profitRatio = rev > 0 ? ((rev - exp) / rev) * 100 : 0;
    let finScore = 50 + (profitRatio > 0 ? Math.min(40, profitRatio) : Math.max(-40, profitRatio));
    if (snapshot.revenue.differencePercentage < 0) finScore -= 10;
    finScore = Math.max(0, Math.min(100, Math.round(finScore)));
    scorecards.push(this.buildMetric(
      "Financial Health",
      finScore,
      snapshot.revenue.trend as "UP" | "DOWN" | "STABLE",
      `Reflects operating margins, transaction throughput, and profit margin ratio (${profitRatio.toFixed(1)}%).`,
      finScore > 80 ? "LOW" : finScore > 50 ? "MEDIUM" : "HIGH",
      finScore > 80 ? "Maintain current expense restrictions and baseline sales targets." : "Review discretionary operational spending and speed up accounts collection."
    ));

    // 2. Operational Health Score
    // Determined by attendance rate and underperformance signals
    const attRate = snapshot.attendanceRate.currentValue;
    const underperformingStaff = activeScorecards.filter(e => e.underperformanceSignal).length;
    const staffRatio = activeScorecards.length > 0 ? (underperformingStaff / activeScorecards.length) : 0;
    let opScore = Math.round(attRate * 0.8 + (1 - staffRatio) * 20);
    opScore = Math.max(0, Math.min(100, opScore));
    scorecards.push(this.buildMetric(
      "Operational Health",
      opScore,
      snapshot.attendanceRate.trend as "UP" | "DOWN" | "STABLE",
      `Driven by average attendance consistency (${attRate.toFixed(1)}%) and low staff underperformance indicators.`,
      opScore > 80 ? "LOW" : opScore > 60 ? "MEDIUM" : "HIGH",
      opScore > 80 ? "Acknowledge high performing branches and preserve schedule pacing." : "Audit branch scheduling systems and conduct immediate employee reviews."
    ));

    // 3. Payroll Health Score
    // Driven by overtime exposure and commission distribution balance
    const commissionsPaid = snapshot.commissionsPaid.currentValue;
    const commissionRatio = payrollCost > 0 ? (commissionsPaid / payrollCost) * 100 : 0;
    const totalOvertime = activeScorecards.reduce((sum, e) => sum + (e.overtimeHours || 0), 0);
    let payScore = 90 - (commissionRatio > 20 ? 15 : 0) - (totalOvertime > 50 ? 15 : 0);
    if (snapshot.payrollCost.differencePercentage > 15) payScore -= 10;
    payScore = Math.max(0, Math.min(100, Math.round(payScore)));
    scorecards.push(this.buildMetric(
      "Payroll Health",
      payScore,
      snapshot.payrollCost.trend === "UP" ? "DOWN" : "UP", // UP payroll cost means LOWER payroll health
      `Assesses payroll budget consistency, overtime leaks (${totalOvertime.toFixed(1)} hrs), and commission stability.`,
      payScore > 75 ? "LOW" : payScore > 50 ? "MEDIUM" : "HIGH",
      payScore > 75 ? "Excellent core payroll pacing. Keep commissions tied strictly to performance." : "Enforce stricter supervisor clearance requirements for overtime logs."
    ));

    // 4. Attendance Health Score
    // Driven directly by overall attendance consistency and absenteeism
    const absenceRate = snapshot.absenceRate.currentValue;
    const attHealthScore = Math.max(0, Math.min(100, Math.round(100 - (absenceRate * 4))));
    scorecards.push(this.buildMetric(
      "Attendance Health",
      attHealthScore,
      snapshot.attendanceRate.trend as "UP" | "DOWN" | "STABLE",
      `Measures total worker check-in frequency and checks absenteeism rates (${absenceRate.toFixed(1)}%).`,
      attHealthScore > 85 ? "LOW" : attHealthScore > 65 ? "MEDIUM" : "HIGH",
      attHealthScore > 85 ? "Keep system active. Scan timesheets normally." : "Integrate automated messaging alerts on missed check-ins and late punch cards."
    ));

    // 5. Compliance Score
    // Based on anomalies and data quality logs
    const anomaliesCount = snapshot.anomalies?.length || 0;
    const complianceScore = Math.max(0, Math.min(100, 100 - (anomaliesCount * 15)));
    scorecards.push(this.buildMetric(
      "Compliance & Ledger Integrity",
      complianceScore,
      anomaliesCount === 0 ? "STABLE" : "DOWN",
      `Checks for duplicate accounting entries, timesheet breaches, and unmatched general ledger entries.`,
      complianceScore > 85 ? "LOW" : complianceScore > 65 ? "MEDIUM" : "HIGH",
      complianceScore > 85 ? "Ledger matches all validation protocols perfectly." : "Reconcile unallocated financial accounts and check timesheet logs for duplicate actions."
    ));

    // 6. Cash Flow Score
    // Driven by cash balance health vs burn rate
    const cash = snapshot.cashOnHand.currentValue;
    const burn = snapshot.burnRate.currentValue;
    let cashScore = Math.round(Math.min(100, (cash / 120000) * 100));
    if (burn > cash) cashScore -= 20;
    cashScore = Math.max(0, Math.min(100, cashScore));
    scorecards.push(this.buildMetric(
      "Cash Flow Security",
      cashScore,
      snapshot.cashOnHand.trend as "UP" | "DOWN" | "STABLE",
      `Evaluates liquid reserve viability (${cash.toLocaleString()} HTG) against current operational spending.`,
      cashScore > 75 ? "LOW" : cashScore > 50 ? "MEDIUM" : "HIGH",
      cashScore > 75 ? "Reserves are in perfect safety zones." : "Expedite accounts receivable, pause secondary capital expenses, and preserve liquidity."
    ));

    // 7. Profitability Score
    // Measures operating profit margin ratio
    const profitScore = Math.round(Math.max(0, Math.min(100, (profitRatio > 0 ? (profitRatio / 40) * 100 : 0))));
    scorecards.push(this.buildMetric(
      "Profitability Matrix",
      profitScore,
      snapshot.profit.trend as "UP" | "DOWN" | "STABLE",
      `Measures real-time profitability score relative to industry operating margins.`,
      profitScore > 75 ? "LOW" : profitScore > 50 ? "MEDIUM" : "HIGH",
      profitScore > 75 ? "Profitability targets exceeded. Assess reinvestment opportunities." : "Optimize operational logistics in lower performing branches to lift gross margins."
    ));

    // 8. Growth Score
    // Measured by revenue and staffing expansion rates
    const growthRate = snapshot.revenue.differencePercentage;
    const growthScore = Math.round(Math.max(0, Math.min(100, 50 + (growthRate * 2))));
    scorecards.push(this.buildMetric(
      "Strategic Growth Rate",
      growthScore,
      growthRate >= 0 ? "UP" : "DOWN",
      `Tracks Period-over-Period corporate growth, revenue expansion, and staff scaling.`,
      growthScore > 70 ? "LOW" : growthScore > 45 ? "MEDIUM" : "HIGH",
      growthScore > 70 ? "Aggressively scale marketing and explore potential new branches." : "Focus on consolidating existing operations to stabilize customer transactions."
    ));

    return scorecards;
  }

  private static buildMetric(
    name: string,
    score: number,
    trend: "UP" | "DOWN" | "STABLE",
    explanation: string,
    riskLevel: "LOW" | "MEDIUM" | "HIGH",
    recommendation: string
  ): ScorecardMetric {
    let color = "text-emerald-400";
    let bgColor = "bg-emerald-500/10 border-emerald-500/20";

    if (score < 50) {
      color = "text-rose-400";
      bgColor = "bg-rose-500/10 border-rose-500/20";
    } else if (score < 75) {
      color = "text-amber-400";
      bgColor = "bg-amber-500/10 border-amber-500/20";
    }

    return {
      name,
      score,
      color,
      bgColor,
      trend,
      explanation,
      riskLevel,
      recommendation
    };
  }
}
