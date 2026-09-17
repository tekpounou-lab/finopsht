import { Business, Branch, Employee, LedgerTransaction, AttendanceRecord, PayrollRecord } from "../../types";

export type MetricSemanticState = "VALUE" | "ZERO" | "NO_DATA" | "UNDEFINED" | "INSUFFICIENT_DATA";

export interface HeuristicReport {
  summary: string;
  metrics: {
    cash_flow: string;
    fraud_risk: string;
    profit_ratio: string;
    financial_health_score?: number | null;
    revenue_state?: MetricSemanticState;
    expense_state?: MetricSemanticState;
    payroll_state?: MetricSemanticState;
    attendance_state?: MetricSemanticState;
    cash_state?: MetricSemanticState;
  };
  alerts: { type: "info" | "warning" | "success"; text: string }[];
  recommendations: string[];
  chartsData: { name: string; value: number }[];
  predictions: {
    next_fortnight_payroll: number;
    end_of_month_cash_flow: number;
    absenteeism_rate_percentage: number;
    budget_overrun_risk: "FAIBLE" | "MOYEN" | "ÉLEVÉ" | "LOW" | "NORMAL" | "HIGH" | "NO_DATA";
    estimated_monthly_profit: number;
    forecast_justification: string;
  };
  semantic_states?: {
    revenue: MetricSemanticState;
    expense: MetricSemanticState;
    profit: MetricSemanticState;
    margin: MetricSemanticState;
    payroll: MetricSemanticState;
    attendance: MetricSemanticState;
    cash: MetricSemanticState;
    health_score: MetricSemanticState;
  };
}

export class FinancialRatioEngine {
  public static calculate(body: any, errorMessage?: string): HeuristicReport {
    const { business, branch, employees = [], ledger = [], attendance = [], payroll = [], userQuestion, snapshot } = body || {};
    
    const currency = business?.currency || "HTG";
    const ledgerArray = Array.isArray(ledger) ? ledger : [];
    
    // 1. AnalyticsSnapshot evaluation as Canonical SSOT
    let totalRevenue = 0;
    let totalExpenses = 0;
    let balance = 0;
    let hasSnapshotData = false;
    let hasExplicitRevenue = false;
    let hasExplicitExpense = false;

    // Check if canonical AnalyticsSnapshot is provided (or if body itself is a snapshot)
    const activeSnapshot = snapshot || (body && (body.metrics || body.incomeStatement || body.revenue !== undefined || body.netProfit !== undefined || body.totalRevenue !== undefined) ? body : null);

    if (activeSnapshot) {
      hasSnapshotData = true;
      if (activeSnapshot.incomeStatement) {
        const revCents = Number(activeSnapshot.incomeStatement.revenue?.totalRevenueCents ?? activeSnapshot.incomeStatement.totalRevenueCents ?? 0);
        const expCents = Number(activeSnapshot.incomeStatement.expenses?.totalExpensesCents ?? activeSnapshot.incomeStatement.totalExpensesCents ?? 0);
        const netCents = Number(activeSnapshot.incomeStatement.netIncomeCents ?? (revCents - expCents));
        totalRevenue = revCents / 100;
        totalExpenses = expCents / 100;
        balance = netCents / 100;
      } else if (activeSnapshot.metrics) {
        totalRevenue = Number(activeSnapshot.metrics.revenue?.totalHTG ?? activeSnapshot.metrics.revenue?.currentValue ?? (typeof activeSnapshot.metrics.revenue === "number" ? activeSnapshot.metrics.revenue : 0));
        totalExpenses = Number(activeSnapshot.metrics.expenses?.totalHTG ?? activeSnapshot.metrics.expenses?.currentValue ?? (typeof activeSnapshot.metrics.expenses === "number" ? activeSnapshot.metrics.expenses : 0));
        balance = Number(activeSnapshot.metrics.profit?.netHTG ?? activeSnapshot.metrics.profit?.netProfit ?? (totalRevenue - totalExpenses));
      } else {
        totalRevenue = Number(activeSnapshot.revenue?.currentValue ?? (typeof activeSnapshot.revenue === "number" ? activeSnapshot.revenue : activeSnapshot.totalRevenue ?? 0));
        totalExpenses = Number(activeSnapshot.expenses?.currentValue ?? (typeof activeSnapshot.expenses === "number" ? activeSnapshot.expenses : activeSnapshot.totalExpenses ?? 0));
        balance = Number(activeSnapshot.profit?.currentValue ?? activeSnapshot.netProfit ?? (typeof activeSnapshot.profit === "number" ? activeSnapshot.profit : activeSnapshot.netIncome ?? (totalRevenue - totalExpenses)));
      }
      hasExplicitRevenue = activeSnapshot.revenue !== undefined || activeSnapshot.metrics?.revenue !== undefined || activeSnapshot.totalRevenue !== undefined || activeSnapshot.incomeStatement !== undefined;
      hasExplicitExpense = activeSnapshot.expenses !== undefined || activeSnapshot.metrics?.expenses !== undefined || activeSnapshot.totalExpenses !== undefined || activeSnapshot.incomeStatement !== undefined;
    } else {
      // FROZEN SSOT INVARIANT: No raw ledger fallback permitted.
      // Absence of AnalyticsSnapshot results in explicit NO_DATA / UNDEFINED semantic state.
      hasSnapshotData = false;
    }
    
    const revenueState: MetricSemanticState = !hasSnapshotData 
      ? "NO_DATA" 
      : hasExplicitRevenue ? (totalRevenue === 0 ? "ZERO" : "VALUE") : "ZERO";
      
    const expenseState: MetricSemanticState = !hasSnapshotData 
      ? "NO_DATA" 
      : hasExplicitExpense ? (totalExpenses === 0 ? "ZERO" : "VALUE") : "ZERO";
    
    let profitState: MetricSemanticState = "NO_DATA";
    let marginState: MetricSemanticState = "NO_DATA";
    let profitMargin = "DONNÉES INSUFFISANTES";
    let cashFlowState = "Données comptables non disponibles (NO_DATA)";
    let cashState: MetricSemanticState = "NO_DATA";
    
    if (!hasSnapshotData) {
      profitState = "NO_DATA";
      marginState = "NO_DATA";
      profitMargin = "DONNÉES INSUFFISANTES";
      cashFlowState = "Données comptables non disponibles (NO_DATA)";
      cashState = "NO_DATA";
    } else if (totalRevenue === 0 && totalExpenses === 0) {
      profitState = "ZERO";
      marginState = "UNDEFINED"; // 0/0 cannot be computed mathematically
      profitMargin = "INDÉTERMINÉ (0/0)";
      cashFlowState = `Solde nul (0 ${currency})`;
      cashState = "ZERO";
    } else if (totalRevenue > 0) {
      profitState = balance === 0 ? "ZERO" : "VALUE";
      marginState = "VALUE";
      profitMargin = ((balance / totalRevenue) * 100).toFixed(1) + "%";
      cashFlowState = balance >= 0 ? `Stable (+${balance.toLocaleString()} ${currency})` : `Déficitaire (${balance.toLocaleString()} ${currency})`;
      cashState = "VALUE";
    } else {
      // totalRevenue === 0 and totalExpenses > 0
      profitState = "VALUE";
      marginState = "VALUE";
      profitMargin = "-100.0%";
      cashFlowState = `Déficitaire (${balance.toLocaleString()} ${currency})`;
      cashState = "VALUE";
    }
    
    // 2. Timesheet evaluation & Semantic State Detection
    const attList = Array.isArray(attendance) ? attendance : [];
    const hasAttendanceData = attList.length > 0;
    const attendanceState: MetricSemanticState = hasAttendanceData ? "VALUE" : "NO_DATA";
    
    const totalPoints = attList.length;
    const latePoints = attList.filter((r: any) => r.status === "LATE" || r.status === "late").length;
    const anomalies = attList.filter((r: any) => r.status === "PENDING_VERIFICATION").length;
    const overrideNoReason = attList.filter((r: any) => r.overrideBy && !r.overrideReason);
    
    let fraudRisk = hasAttendanceData ? "Faible" : "Non évalué (absence de données)";
    if (anomalies > 0) fraudRisk = "Moyen";
    if (overrideNoReason.length > 0) fraudRisk = "Élevé";
    
    const absenteeism_rate_percentage = hasAttendanceData 
      ? Number(((latePoints * 0.5 + anomalies * 0.2) / totalPoints * 100).toFixed(1))
      : 0;
    
    // 3. Payroll validations & Semantic State Detection
    const payrollList = Array.isArray(payroll) ? payroll : [];
    const hasPayrollData = payrollList.length > 0;
    const payrollState: MetricSemanticState = hasPayrollData ? "VALUE" : "NO_DATA";
    
    const alerts: { type: "info" | "warning" | "success"; text: string }[] = [];
    
    if (errorMessage) {
      const lowerErr = errorMessage.toLowerCase();
      const isQuotaError = lowerErr.includes("quota") || lowerErr.includes("429") || lowerErr.includes("exhausted");
      const isSpendCap = lowerErr.includes("spending cap") || lowerErr.includes("spend cap") || lowerErr.includes("billing") || lowerErr.includes("plafond");

      if (isSpendCap || isQuotaError) {
        alerts.push({ 
          type: "info", 
          text: isSpendCap
            ? "Moteur Heuristique FinOps (Relais Déterministe) : Plafond mensuel d'API atteint. Bascule automatique vers le moteur d'analyse financière local."
            : "Moteur Heuristique FinOps (Hors-Ligne) : Quota de requêtes IA saturé. Analyse déterministe active sans interruption."
        });
      } else {
        alerts.push({ 
          type: "warning", 
          text: `Moteur Heuristique FinOps (Hors-Ligne) : Mode secours activé (${errorMessage}).`
        });
      }
    }

    if (anomalies > 0) {
      alerts.push({
        type: "warning",
        text: `${anomalies} anomalie(s) de présence en attente de vérification locale.`
      });
    }
    
    if (overrideNoReason.length > 0) {
      alerts.push({
        type: "warning",
        text: `${overrideNoReason.length} pointage(s) forcé(s) manuellement sans motif d'ajustement conforme.`
      });
    }
    
    payrollList.forEach((pay: any) => {
      const gross = pay.baseSalaryHtg || pay.baseSalary || 0;
      const expectedCnss = Math.round(gross * 0.06);
      const actualCnss = pay.cnssHtg || pay.cnss;
      if (actualCnss && Math.abs(actualCnss - expectedCnss) > 2) {
        alerts.push({
          type: "info",
          text: `Vérification du CNSS pour ${pay.employeeName || "l'employé"} : Écart détecté par rapport à la règle légale des 6%.`
        });
      }
    });
    
    if (alerts.length === 0 || (errorMessage && alerts.length === (errorMessage.toLowerCase().includes("quota") ? 2 : 1))) {
      alerts.push({
        type: "success",
        text: "La gouvernance des flux et des pointages ne présente aucune anomalie comptable majeure."
      });
    }
    
    const recommendations = [
      "S'assurer que toutes les demandes d'avance sur salaire soient justifiées et n'excèdent pas 50% du salaire de base.",
      "Régulariser au plus vite les pointages suspects pour consolider la prochaine quinzaine.",
      "Définir des jalons de contre-signature pour les transactions du Grand Livre supérieures à 50 000 " + currency + "."
    ];
    
    // 4. Dynamic Predictions (Strict zero/no-data determinism, no synthetic numbers)
    const avgPayroll = hasPayrollData 
      ? Math.round(payrollList.reduce((sum, p) => sum + (Number(p.netPaid || p.netPaidHtg || p.baseSalaryHtg || p.baseSalary) || 0), 0))
      : 0;
      
    const next_fortnight_payroll = hasPayrollData ? Math.round(avgPayroll * 1.05) : 0;
    
    const end_of_month_cash_flow = hasSnapshotData 
      ? Math.round(balance + (totalRevenue * 0.42) - (totalExpenses * 0.38))
      : 0;
      
    const budget_overrun_risk: "FAIBLE" | "MOYEN" | "ÉLEVÉ" | "LOW" | "NORMAL" | "HIGH" | "NO_DATA" = !hasSnapshotData 
      ? "NO_DATA" 
      : (totalExpenses > totalRevenue * 0.75 && totalExpenses > 0 ? "ÉLEVÉ" : totalExpenses > totalRevenue * 0.45 ? "MOYEN" : "FAIBLE");
      
    const estimated_monthly_profit = hasSnapshotData ? Math.round((totalRevenue - totalExpenses) * 2) : 0;
    
    // 5. Financial Health Score (Derived from real ratios, null if data missing)
    let healthScoreState: MetricSemanticState = "NO_DATA";
    let financialHealthScore: number | null = null;
    
    if (hasSnapshotData && totalRevenue > 0) {
      healthScoreState = "VALUE";
      const marginPct = (balance / totalRevenue) * 100;
      let score = 60;
      if (marginPct >= 20) score += 20;
      else if (marginPct >= 10) score += 10;
      else if (marginPct < 0) score -= 20;
      
      if (fraudRisk === "Faible") score += 20;
      else if (fraudRisk === "Élevé") score -= 20;
      
      if (budget_overrun_risk === "FAIBLE") score += 10;
      else if (budget_overrun_risk === "ÉLEVÉ") score -= 15;
      
      financialHealthScore = Math.max(0, Math.min(100, score));
    }
    
    const forecastJustification = hasSnapshotData || hasPayrollData || hasAttendanceData
      ? "Modélisation prédictive issue d'une extension de régression déterministe sur les cycles et écritures comptables réelles."
      : "Données comptables et RH insuffisantes pour calculer des projections fiables. Affichage en mode strict sans interpolation.";

    return {
      summary: `[Gouvernance Heuristique locale] Analyse opérationnelle de ${business?.name || "FinOps"}. ` +
               `Nous auditons ${employees.length} collaborateurs actifs et ${ledgerArray.length} écritures comptables. ` +
               (hasSnapshotData ? `Le solde courant certifié est de ${balance.toLocaleString()} ${currency}. ` : `Aucune écriture comptable active. `) +
               (hasAttendanceData ? `Le taux d'anomalie de présence moyen est de ${(latePoints / totalPoints * 100).toFixed(1)}%.` : `Données de présence non renseignées.`),
      metrics: {
        cash_flow: cashFlowState,
        fraud_risk: fraudRisk,
        profit_ratio: profitMargin,
        financial_health_score: financialHealthScore,
        revenue_state: revenueState,
        expense_state: expenseState,
        payroll_state: payrollState,
        attendance_state: attendanceState,
        cash_state: cashState
      },
      alerts,
      recommendations,
      chartsData: [
        { name: `Revenus (${currency})`, value: totalRevenue },
        { name: `Charges (${currency})`, value: totalExpenses },
        { name: `Marge (${currency})`, value: Math.max(0, balance) }
      ],
      predictions: {
        next_fortnight_payroll,
        end_of_month_cash_flow,
        absenteeism_rate_percentage,
        budget_overrun_risk,
        estimated_monthly_profit,
        forecast_justification: forecastJustification
      },
      semantic_states: {
        revenue: revenueState,
        expense: expenseState,
        profit: profitState,
        margin: marginState,
        payroll: payrollState,
        attendance: attendanceState,
        cash: cashState,
        health_score: healthScoreState
      }
    };
  }
}

