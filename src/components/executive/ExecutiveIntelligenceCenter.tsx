import React, { useMemo } from "react";
import { useAnalytics } from "../../domains/analytics/context/AnalyticsContext";
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

export const ExecutiveIntelligenceCenter: React.FC = () => {
  const { snapshot, employees, loading } = useAnalytics();
  const { businessSettings } = useBusinessContext();

  const activeSnapshot = snapshot;

  React.useEffect(() => {
    if (activeSnapshot) {
      console.debug("[ExecutiveIntelligenceCenter] Rendered snapshot metrics:", {
        generatedAt: activeSnapshot.generatedAt,
        period: activeSnapshot.period,
        customRange: activeSnapshot.customRange,
        revenue: activeSnapshot.revenue.currentValue,
        expenses: activeSnapshot.expenses.currentValue,
        profit: activeSnapshot.profit.currentValue,
        payrollCost: activeSnapshot.payrollCost.currentValue,
        attendanceRate: activeSnapshot.attendanceRate.currentValue,
        activeStaff: activeSnapshot.activeStaff.currentValue,
      });
    }
  }, [activeSnapshot]);

  const isSocialTaxEnabled = useMemo(() => {
    if (businessSettings?.payroll_policies?.enableTaxes !== undefined) return Boolean(businessSettings.payroll_policies.enableTaxes);
    if (businessSettings?.payrollPolicies?.enableTaxes !== undefined) return Boolean(businessSettings.payrollPolicies.enableTaxes);
    if (businessSettings?.tax_config?.enableTaxes !== undefined) return Boolean(businessSettings.tax_config.enableTaxes);
    if (businessSettings?.taxConfig?.enableTaxes !== undefined) return Boolean(businessSettings.taxConfig.enableTaxes);
    return false;
  }, [businessSettings]);

  if (loading && !activeSnapshot) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
        <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
        <span className="text-xs font-mono tracking-wider uppercase">Chargement des données exécutives SSOT...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="executive-intelligence-center">
      {/* HEADER KPI GRID */}
      {activeSnapshot && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <SmartKPICard
            title="Chiffre d'Affaires Brut"
            currentValue={activeSnapshot.revenue.currentValue}
            previousValue={activeSnapshot.revenue.previousValue}
            difference={activeSnapshot.revenue.difference}
            percentage={activeSnapshot.revenue.differencePercentage}
            trend={activeSnapshot.revenue.trend}
            direction={activeSnapshot.revenue.direction}
            unit="HTG"
            status={activeSnapshot.revenue.differencePercentage >= 0 ? "Healthy" : "Warning"}
          />
          <SmartKPICard
            title="Dépenses d'Exploitation"
            currentValue={activeSnapshot.expenses.currentValue}
            previousValue={activeSnapshot.expenses.previousValue}
            difference={activeSnapshot.expenses.difference}
            percentage={activeSnapshot.expenses.differencePercentage}
            trend={activeSnapshot.expenses.trend}
            direction={activeSnapshot.expenses.direction}
            unit="HTG"
            status={activeSnapshot.expenses.differencePercentage <= 0 ? "Healthy" : "Warning"}
          />
          <SmartKPICard
            title="Bénéfice Net"
            currentValue={activeSnapshot.profit.currentValue}
            previousValue={activeSnapshot.profit.previousValue}
            difference={activeSnapshot.profit.difference}
            percentage={activeSnapshot.profit.differencePercentage}
            trend={activeSnapshot.profit.trend}
            direction={activeSnapshot.profit.direction}
            unit="HTG"
            status={activeSnapshot.profit.currentValue >= 0 ? "Healthy" : "Critical"}
          />
          <SmartKPICard
            title="Taux d'Assiduité"
            currentValue={activeSnapshot.attendanceRate.currentValue}
            previousValue={activeSnapshot.attendanceRate.previousValue}
            difference={activeSnapshot.attendanceRate.difference}
            percentage={activeSnapshot.attendanceRate.differencePercentage}
            trend={activeSnapshot.attendanceRate.trend}
            direction={activeSnapshot.attendanceRate.direction}
            unit="%"
            status={activeSnapshot.attendanceRate.currentValue >= 75 ? "Healthy" : "Warning"}
          />
        </div>
      )}

      {/* ACTIONS & ALERTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExecutiveActionsChecklist snapshot={activeSnapshot} />
        <ExecutiveAlertCenter snapshot={activeSnapshot} />
      </div>

      {/* AI CFO & HEALTH GAUGE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="executive-summary-bento-grid">
        <div className="lg:col-span-8">
          <ExecutiveAIAdvisor snapshot={activeSnapshot} />
        </div>
        <div className="lg:col-span-4">
          <ExecutiveHealthGauge snapshot={activeSnapshot} />
        </div>
      </div>

      {/* TREASURY, ATTENDANCE, PAYROLL */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ExecutiveTreasury snapshot={activeSnapshot} />
        <ExecutiveAttendance snapshot={activeSnapshot} />
        <ExecutivePayroll snapshot={activeSnapshot} isSocialTaxEnabled={isSocialTaxEnabled} />
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
                Chiffre d'Affaires vs Profit Net
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              Évolution chronologique des revenus bruts réels et des marges nettes déduites des coûts d'exploitation.
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
                      `${Number(value).toLocaleString()} HTG`,
                      name === "gross" || name === "Gross Revenue" ? "Chiffre d'Affaires" : "Bénéfice Net",
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                    formatter={(value) =>
                      value === "gross" || value === "Gross Revenue"
                        ? "Chiffre d'Affaires Brut"
                        : "Bénéfice Net"
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
          <ExecutiveStaffLeaderboard snapshot={activeSnapshot} employees={employees} />
        </div>
      </div>

      {/* BRANCH REVENUE & DEPARTMENT EXPENSES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ExecutiveBranchRevenue snapshot={activeSnapshot} />
        <ExecutiveDepartmentExpenses snapshot={activeSnapshot} />
      </div>
    </div>
  );
};
