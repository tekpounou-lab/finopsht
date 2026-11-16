import React, { useMemo } from "react";
import { useAnalytics } from "../../domains/analytics/context/AnalyticsContext";
import { useExecutiveFilters } from "../../domains/analytics/context/ExecutiveFilterContext";
import { useBusinessContext } from "../../contexts/BusinessContext";
import { SmartKPICard } from "../../domains/analytics/components/SmartKPICard";
import { ExecutiveActionsChecklist } from "./ExecutiveActionsChecklist";
import { ExecutiveAlertCenter } from "./ExecutiveAlertCenter";
import { ExecutiveAIAdvisor } from "./ExecutiveAIAdvisor";
import { ExecutiveHealthGauge } from "./ExecutiveHealthGauge";
import { ExecutiveTreasury } from "./ExecutiveTreasury";
import { ExecutiveAttendance } from "./ExecutiveAttendance";
import { ExecutivePayroll } from "./ExecutivePayroll";
import { ExecutiveStaffLeaderboard } from "./ExecutiveStaffLeaderboard";
import { ExecutiveBranchRevenue } from "./ExecutiveBranchRevenue";
import { ExecutiveDepartmentExpenses } from "./ExecutiveDepartmentExpenses";
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { SafeChartContainer } from "../ui/SafeChartContainer";
import { RefreshCw } from "lucide-react";
import { TaxPolicyEngine } from "../../services/payroll/TaxPolicyEngine";
import { NormalizedAmountResolver } from "../../domains/analytics/utils/NormalizedAmountResolver";

export interface ExecutiveIntelligenceCenterProps {
  usdToHtgRate?: number;
}

export const ExecutiveIntelligenceCenter: React.FC<ExecutiveIntelligenceCenterProps> = ({ usdToHtgRate }) => {
  const { snapshot, employees, loading } = useAnalytics();
  const { filters } = useExecutiveFilters();
  const { businessSettings, branches, business: currentBusiness } = useBusinessContext();

  const requestedCurrency = filters.currency || "HTG";
  const canConvertUsd =
    requestedCurrency === "USD" &&
    typeof usdToHtgRate === "number" &&
    Number.isFinite(usdToHtgRate) &&
    usdToHtgRate > 0;
  const activeCurrency = canConvertUsd ? "USD" : "HTG";
  const accountingBasis: "CASH" | "ACCRUAL" = filters.accountingBasis || filters.accountingMode || "CASH";
  const isCashBasis = accountingBasis === "CASH";

  const toDisplay = (val: number | null | undefined): number | null | undefined => {
    if (val === null || val === undefined) return val;
    return canConvertUsd ? NormalizedAmountResolver.convertFromHTG(val, "USD", usdToHtgRate!) : val;
  };

  const convertKpi = (kpi?: any) => {
    if (!kpi) return kpi;
    const curr = toDisplay(kpi.currentValue);
    const prev = toDisplay(kpi.previousValue);
    const diff = curr !== null && prev !== null && curr !== undefined && prev !== undefined
      ? Number((curr - prev).toFixed(2))
      : toDisplay(kpi.difference);
    return {
      ...kpi,
      currentValue: curr,
      previousValue: prev,
      difference: diff,
    };
  };

  const displaySnapshot = useMemo(() => {
    if (!snapshot || !canConvertUsd) return snapshot;

    return {
      ...snapshot,
      revenue: convertKpi(snapshot.revenue),
      quickbooksSalesRevenue: convertKpi(snapshot.quickbooksSalesRevenue),
      expenses: convertKpi(snapshot.expenses),
      operationalExpenses: convertKpi(snapshot.operationalExpenses),
      totalExpenses: convertKpi(snapshot.totalExpenses),
      profit: convertKpi(snapshot.profit),
      netCashFlow: convertKpi(snapshot.netCashFlow),
      cashOnHand: convertKpi(snapshot.cashOnHand),
      burnRate: convertKpi(snapshot.burnRate),
      payrollCost: convertKpi(snapshot.payrollCost),
      advanceExposure: convertKpi(snapshot.advanceExposure),
      commissionsPaid: convertKpi(snapshot.commissionsPaid),
      branchPerformance: (snapshot.branchPerformance || []).map((b) => ({
        ...b,
        revenue: toDisplay(b.revenue) ?? 0,
        expenses: toDisplay(b.expenses) ?? 0,
        payrollCost: toDisplay(b.payrollCost) ?? 0,
        nonPayrollExpenses: toDisplay(b.nonPayrollExpenses) ?? 0,
      })),
      departmentPerformance: (snapshot.departmentPerformance || []).map((d) => ({
        ...d,
        revenue: toDisplay(d.revenue) ?? 0,
        expenses: toDisplay(d.expenses) ?? 0,
        payrollCost: toDisplay(d.payrollCost) ?? 0,
        nonPayrollExpenses: toDisplay(d.nonPayrollExpenses) ?? 0,
      })),
      employeeScorecards: (snapshot.employeeScorecards || []).map((s: any) => ({
        ...s,
        baseSalary: toDisplay(s.baseSalary) ?? 0,
        commissions: toDisplay(s.commissions) ?? 0,
      })),
      historicalTrends: (snapshot.historicalTrends || []).map((t) => ({
        ...t,
        gross: toDisplay(t.gross) ?? 0,
        net: toDisplay(t.net) ?? 0,
      })),
      expenseBreakdown: (snapshot.expenseBreakdown || []).map((e) => ({
        ...e,
        value: toDisplay(e.value) ?? 0,
      })),
      payrollAggregates: snapshot.payrollAggregates
        ? {
            payrollPaid: toDisplay(snapshot.payrollAggregates.payrollPaid) ?? 0,
            commissionsPaid: toDisplay(snapshot.payrollAggregates.commissionsPaid) ?? 0,
            cnssContributions: toDisplay(snapshot.payrollAggregates.cnssContributions) ?? 0,
            cnsContributions: toDisplay(snapshot.payrollAggregates.cnsContributions) ?? 0,
            employerChargesSocials: toDisplay(snapshot.payrollAggregates.employerChargesSocials) ?? 0,
            totalEmploymentCost: toDisplay(snapshot.payrollAggregates.totalEmploymentCost) ?? 0,
          }
        : undefined,
    };
  }, [snapshot, canConvertUsd, usdToHtgRate]);

  const activeSnapshot = displaySnapshot;

  const effectiveRevenue = useMemo(() => {
    if (activeSnapshot?.revenue?.currentValue !== undefined) {
      return activeSnapshot.revenue.currentValue;
    }
    return null;
  }, [activeSnapshot?.revenue?.currentValue]);

  const effectiveExpenses = useMemo(() => {
    const snapVal = (activeSnapshot?.totalExpenses || activeSnapshot?.expenses || activeSnapshot?.operationalExpenses)?.currentValue;
    if (snapVal !== undefined) {
      return snapVal;
    }
    return null;
  }, [activeSnapshot?.totalExpenses, activeSnapshot?.expenses, activeSnapshot?.operationalExpenses]);

  const effectiveProfit = useMemo(() => {
    if (activeSnapshot?.profit?.currentValue !== undefined) {
      return activeSnapshot.profit.currentValue;
    }
    return null;
  }, [activeSnapshot?.profit?.currentValue]);

  const effectiveAttendanceRate = useMemo(() => {
    if (activeSnapshot?.attendanceRate?.currentValue !== undefined) {
      return activeSnapshot.attendanceRate.currentValue;
    }
    return null;
  }, [activeSnapshot?.attendanceRate?.currentValue]);

  React.useEffect(() => {
    if (activeSnapshot) {
      console.debug("[ExecutiveIntelligenceCenter] Rendered snapshot metrics:", {
        generatedAt: activeSnapshot.generatedAt,
        period: activeSnapshot.period,
        accountingBasis,
        customRange: activeSnapshot.customRange,
        revenue: activeSnapshot.revenue.currentValue,
        expenses: activeSnapshot.expenses.currentValue,
        profit: activeSnapshot.profit.currentValue,
        payrollCost: activeSnapshot.payrollCost.currentValue,
        attendanceRate: activeSnapshot.attendanceRate.currentValue,
        activeStaff: activeSnapshot.activeStaff.currentValue,
      });
    }
  }, [activeSnapshot, accountingBasis]);

  const isSocialTaxEnabled = useMemo(() => {
    return TaxPolicyEngine.isSocialTaxEnabled({ ...businessSettings, ...currentBusiness?.settings });
  }, [businessSettings, currentBusiness?.settings]);

  if (loading && !activeSnapshot) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
        <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
        <span className="text-xs font-mono tracking-wider uppercase">Chargement des données exécutives SSOT...</span>
      </div>
    );
  }

  const expensesMetric = activeSnapshot?.totalExpenses || activeSnapshot?.expenses || activeSnapshot?.operationalExpenses;

  return (
    <div className="space-y-6 bg-slate-950/40 p-6 rounded-2xl border border-slate-800/80 shadow-2xl backdrop-blur-sm" id="executive-intelligence-center">
      {/* HEADER KPI GRID */}
      {activeSnapshot && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <SmartKPICard
            title={isCashBasis ? "Encaissements (Cash)" : "Chiffre d'Affaires Brut"}
            currentValue={effectiveRevenue}
            previousValue={activeSnapshot.revenue.previousValue}
            difference={activeSnapshot.revenue.difference}
            percentage={activeSnapshot.revenue.differencePercentage}
            trend={activeSnapshot.revenue.trend}
            direction={activeSnapshot.revenue.direction}
            unit={activeCurrency}
            status={effectiveRevenue !== null && effectiveRevenue > 0 ? "Healthy" : "Warning"}
          />
          <SmartKPICard
            title={isCashBasis ? "Décaissements Totaux" : "Dépenses Totales"}
            currentValue={effectiveExpenses}
            previousValue={expensesMetric?.previousValue ?? null}
            difference={expensesMetric?.difference ?? null}
            percentage={expensesMetric?.differencePercentage ?? null}
            trend={expensesMetric?.trend || "STABLE"}
            direction={expensesMetric?.direction || "NEUTRAL"}
            unit={activeCurrency}
            status={effectiveExpenses !== null && effectiveExpenses > 0 ? "Healthy" : "Warning"}
          />
          <SmartKPICard
            title={isCashBasis ? "Résultat de Trésorerie" : "Bénéfice Net"}
            currentValue={effectiveProfit}
            previousValue={activeSnapshot.profit.previousValue}
            difference={activeSnapshot.profit.difference}
            percentage={activeSnapshot.profit.differencePercentage}
            trend={activeSnapshot.profit.trend}
            direction={activeSnapshot.profit.direction}
            unit={activeCurrency}
            status={effectiveProfit !== null && effectiveProfit >= 0 ? "Healthy" : "Critical"}
          />
          <SmartKPICard
            title="Taux d'Assiduité"
            currentValue={effectiveAttendanceRate}
            previousValue={activeSnapshot.attendanceRate.previousValue}
            difference={activeSnapshot.attendanceRate.difference}
            percentage={activeSnapshot.attendanceRate.differencePercentage}
            trend={activeSnapshot.attendanceRate.trend}
            direction={activeSnapshot.attendanceRate.direction}
            unit="%"
            status={effectiveAttendanceRate !== null && effectiveAttendanceRate >= 75 ? "Healthy" : "Warning"}
          />
        </div>
      )}

      {/* ACTIONS & ALERTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExecutiveActionsChecklist snapshot={activeSnapshot} currency={activeCurrency} />
        <ExecutiveAlertCenter snapshot={activeSnapshot} currency={activeCurrency} />
      </div>

      {/* AI CFO & HEALTH GAUGE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="executive-summary-bento-grid">
        <div className="lg:col-span-8">
          <ExecutiveAIAdvisor snapshot={activeSnapshot} currency={activeCurrency} accountingBasis={accountingBasis} />
        </div>
        <div className="lg:col-span-4">
          <ExecutiveHealthGauge snapshot={activeSnapshot} currency={activeCurrency} />
        </div>
      </div>

      {/* TREASURY, ATTENDANCE, PAYROLL */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ExecutiveTreasury snapshot={activeSnapshot} currency={activeCurrency} accountingBasis={accountingBasis} />
        <ExecutiveAttendance snapshot={activeSnapshot} />
        <ExecutivePayroll
          snapshot={activeSnapshot}
          isSocialTaxEnabled={isSocialTaxEnabled}
          currency={activeCurrency}
          accountingBasis={accountingBasis}
        />
      </div>

      {/* CHARTS & LEADERBOARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Financial Trajectory Chart */}
        <div className="lg:col-span-7 bg-slate-900/70 border border-slate-800/80 p-6 rounded-2xl flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold uppercase text-slate-200 tracking-wider block font-mono">
                Trajectoire Financière & Rentabilité (SSOT)
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {isCashBasis ? "Encaissements vs Résultat Net" : "Chiffre d'Affaires vs Profit Net"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              Évolution chronologique des revenus réels et des marges nettes déduites des coûts d'exploitation ({accountingBasis}).
            </p>

            <div className="h-64 w-full">
              <SafeChartContainer height="100%" minHeight={256}>
                <AreaChart
                  data={activeSnapshot?.historicalTrends || []}
                  margin={{ top: 10, right: 15, left: -5, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" stroke="#64748b" style={{ fontSize: "10px" }} />
                  <YAxis
                    stroke="#64748b"
                    style={{ fontSize: "10px" }}
                    tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                    formatter={(value: any, name: any) => [
                      `${Number(value).toLocaleString()} ${activeCurrency}`,
                      name === "gross" || name === "Gross Revenue"
                        ? (isCashBasis ? "Encaissements" : "Chiffre d'Affaires")
                        : (isCashBasis ? "Résultat de Trésorerie" : "Bénéfice Net"),
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                    formatter={(value) =>
                      value === "gross" || value === "Gross Revenue"
                        ? (isCashBasis ? "Encaissements (Cash)" : "Chiffre d'Affaires Brut")
                        : (isCashBasis ? "Résultat Net (Cash)" : "Bénéfice Net")
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="gross"
                    name="Gross Revenue"
                    stroke="#10b981"
                    fillOpacity={1}
                    fill="url(#colorGross)"
                    strokeWidth={2.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="net"
                    name="Net Profit"
                    stroke="#06b6d4"
                    fillOpacity={1}
                    fill="url(#colorNet)"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </SafeChartContainer>
            </div>
          </div>
        </div>

        {/* Staff Leaderboard */}
        <div className="lg:col-span-5">
          <ExecutiveStaffLeaderboard
            snapshot={activeSnapshot}
            employees={employees}
            branches={branches}
            currency={activeCurrency}
          />
        </div>
      </div>

      {/* BRANCH REVENUE & DEPARTMENT EXPENSES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ExecutiveBranchRevenue snapshot={activeSnapshot} currency={activeCurrency} />
        <ExecutiveDepartmentExpenses
          snapshot={activeSnapshot}
          currency={activeCurrency}
          accountingBasis={accountingBasis}
        />
      </div>
    </div>
  );
};
