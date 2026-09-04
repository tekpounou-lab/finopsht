import React, { useState, useMemo } from "react";
import { TrendingUp, DollarSign, Target, Award, Calendar, User, Search, Filter } from "lucide-react";
import { Employee, LedgerTransaction, EmployeeContract, PayrollCycle } from "../../types";
import { CommissionEngine } from "../../services/CommissionEngine";
import { SalesAggregator } from "../../services/workforce/SalesAggregator";

interface Props {
  employees: Employee[];
  transactions: LedgerTransaction[];
  contracts: EmployeeContract[];
  activeCycle?: PayrollCycle | null;
  language?: "fr" | "en" | "ht";
}

export function WorkforcePerformanceDashboard({
  employees,
  transactions,
  contracts,
  activeCycle,
  language = "fr"
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");

  const t = {
    title: language === "en" ? "Performance & Commissions" : language === "ht" ? "Pèfòmans ak Komisyon" : "Performance & Commissions",
    subtitle: language === "en" ? "Real-time sales and commission tracking" : language === "ht" ? "Swivi lavant ak komisyon an tan reyèl" : "Suivi en temps réel des ventes et commissions",
    search: language === "en" ? "Search employee..." : "Rechercher un employé...",
    salesVolume: language === "en" ? "Sales Volume" : "Volume des Ventes",
    estCommission: language === "en" ? "Est. Commission" : "Commission Est.",
    activeRate: language === "en" ? "Active Rate" : "Taux Actif",
    transactions: language === "en" ? "Transactions" : "Transactions"
  };

  const performanceData = useMemo(() => {
    const startKey = activeCycle ? (activeCycle.startDate || activeCycle.start_date) : new Date().toISOString().split('T')[0].substring(0, 8) + '01';
    const endKey = activeCycle ? (activeCycle.endDate || activeCycle.end_date) : new Date().toISOString().split('T')[0];

    return employees.map(emp => {
      const contract = contracts.find(c => c.employeeId === emp.id && c.status === "active");
      if (contract?.payRegime === "fixe" || contract?.payRegime === "FIXED" as any) return null;

      const summaryId = `ess_${emp.business_id}_${activeCycle?.id || 'draft'}_${emp.id}`;
      const eligibleTxs = SalesAggregator.getEligibleTransactions(
        emp.id,
        transactions,
        startKey || "2000-01-01",
        endKey || "2099-12-31",
        emp.email,
        summaryId
      );

      let totalSales = 0;
      let totalCommission = 0;

      eligibleTxs.forEach(tx => {
        const amt = tx.amount || (tx.amount_cents ? tx.amount_cents / 100 : 0);
        totalSales += amt;
        
        const txDate = tx.date ? tx.date.split('T')[0] : (startKey || "2000-01-01");
        const temporalRate = CommissionEngine.resolveCommissionRate(emp, contract, txDate);
        
        const commResult = CommissionEngine.calculateTransactionCommission(
          amt,
          tx.category || "REVENUE",
          tx.departmentId || tx.department_id || "unassigned",
          [],
          (emp as any).commissionPlanId || (emp as any).commission_plan_id,
          temporalRate
        );
        totalCommission += commResult.commissionAmount;
      });

      const currentRate = CommissionEngine.resolveCommissionRate(emp, contract, endKey);

      return {
        employee: emp,
        totalSales,
        totalCommission,
        txCount: eligibleTxs.length,
        currentRate
      };
    }).filter(Boolean);
  }, [employees, transactions, contracts, activeCycle]);

  const filteredData = performanceData.filter(d => 
    d?.employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d?.employee.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Target className="h-6 w-6 text-indigo-600" />
            {t.title}
          </h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder={t.search}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-64"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {filteredData.map((data: any) => (
          <div key={data.employee.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center">
                  <span className="text-indigo-700 font-medium text-sm">
                    {data.employee.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-900">{data.employee.name}</h3>
                  <p className="text-xs text-slate-500">{data.employee.email}</p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                  <TrendingUp className="h-3 w-3" />
                  {(data.currentRate * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
              <div>
                <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> {t.salesVolume}
                </p>
                <p className="text-lg font-semibold text-slate-900">
                  {data.totalSales.toLocaleString()} HTG
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                  <Award className="h-3 w-3" /> {t.estCommission}
                </p>
                <p className="text-lg font-semibold text-emerald-600">
                  {data.totalCommission.toLocaleString()} HTG
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                MTD
              </span>
              <span>{data.txCount} {t.transactions}</span>
            </div>
          </div>
        ))}
        {filteredData.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200 border-dashed">
            No commissioned employees found matching your criteria.
          </div>
        )}
      </div>
    </div>
  );
}
