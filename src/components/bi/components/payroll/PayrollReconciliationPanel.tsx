import React, { useMemo } from "react";
import { PayrollRecord, LedgerTransaction, Employee } from "../../../../types";
import { ShieldCheck, AlertCircle, CheckCircle, Database, FileText, Activity } from "lucide-react";

interface PayrollReconciliationPanelProps {
  filteredPayrolls: PayrollRecord[];
  filteredEmployees: Employee[];
  ledgerTransactions: LedgerTransaction[];
  totalPayrollCost: number;
  formatCurrencyValue: (val: number) => string;
}

export const PayrollReconciliationPanel: React.FC<PayrollReconciliationPanelProps> = ({
  filteredPayrolls,
  filteredEmployees,
  ledgerTransactions,
  totalPayrollCost,
  formatCurrencyValue,
}) => {
  // Sum of GL Payroll Transactions
  const glPayrollTotal = useMemo(() => {
    return (ledgerTransactions || [])
      .filter((t) => {
        if (t.status === "REVERSED" || (t.status as any) === "VOID" || (t.status as any) === "CANCELLED") return false;
        return t.type === "PAYROLL";
      })
      .reduce((sum, t: any) => {
        const amt = t.amount || (t.amount_cents ? t.amount_cents / 100 : 0) || t.total || t.debit || 0;
        return sum + amt;
      }, 0);
  }, [ledgerTransactions]);

  // SSOT Payroll Records Total
  const payrollRecordsTotal = totalPayrollCost;

  // Reconciliation Variance
  const variance = Math.abs(payrollRecordsTotal - glPayrollTotal);
  const hasGlEntries = glPayrollTotal > 0;
  const isMatch = hasGlEntries && variance < 1.0; // Tolerance < 1 HTG
  const status: "MATCH" | "MISMATCH" | "NO_DATA" = !hasGlEntries && payrollRecordsTotal === 0 ? "NO_DATA" : isMatch ? "MATCH" : "MISMATCH";

  // Data Quality Metrics
  const includedCount = filteredPayrolls.length;
  const excludedCount = (filteredPayrolls || []).filter((p) => p.isExcluded).length;

  const unresolvedBranchCount = useMemo(() => {
    return filteredPayrolls.filter((p) => {
      const bId = p.branch_id || (p as any).branchId;
      return !bId || bId === "UNRESOLVED";
    }).length;
  }, [filteredPayrolls]);

  const unresolvedDeptCount = useMemo(() => {
    return filteredPayrolls.filter((p) => {
      const dId = p.department_id || (p as any).departmentId;
      return !dId || dId === "UNRESOLVED";
    }).length;
  }, [filteredPayrolls]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6" id="payroll-reconciliation-panel">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm uppercase font-extrabold text-slate-300 tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Audit & Rapprochement SSOT (Grand Livre vs Fiches Scellées)
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Contrôle d&apos;intégrité entre les fiches de paie scellées (SSOT) et les écritures comptables du Grand Livre.
          </p>
        </div>

        {/* Status Badge */}
        <div>
          {status === "MATCH" && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              <CheckCircle className="w-3.5 h-3.5" />
              RAPPROCHEMENT CONFORME (MATCH)
            </span>
          )}
          {status === "MISMATCH" && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
              <AlertCircle className="w-3.5 h-3.5" />
              ÉCART DÉTECTÉ (Écart: {formatCurrencyValue(variance)})
            </span>
          )}
          {status === "NO_DATA" && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
              AUCUNE DONNÉE COMPTABLE
            </span>
          )}
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Source 1: Sealed Payroll Records */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              1. Fiches de Paie Scellées (SSOT)
            </span>
          </div>
          <div className="text-xl font-mono font-bold text-indigo-300">
            {formatCurrencyValue(payrollRecordsTotal)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {includedCount} fiche{includedCount > 1 ? "s" : ""} active{includedCount > 1 ? "s" : ""}
          </div>
        </div>

        {/* Source 2: General Ledger Transactions */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              2. Grand Livre (Type PAYROLL)
            </span>
          </div>
          <div className="text-xl font-mono font-bold text-cyan-300">
            {formatCurrencyValue(glPayrollTotal)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Écritures journalisées au Grand Livre
          </div>
        </div>

        {/* Source 3: Variance */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              3. Écart de Réconciliation
            </span>
          </div>
          <div className={`text-xl font-mono font-bold ${variance < 1 ? "text-emerald-400" : "text-rose-400"}`}>
            {formatCurrencyValue(variance)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {variance < 1 ? "Tolérance < 1 HTG respectée" : "Écart d'engagement ou proration de cycle"}
          </div>
        </div>
      </div>

      {/* Data Quality Indicators */}
      <div className="border-t border-slate-800/80 pt-4">
        <h4 className="text-xs uppercase font-bold text-slate-400 tracking-wider mb-3">
          Indicateurs de Qualité des Données & Dimensions RH
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950 p-3 rounded border border-slate-800/80">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Fiches Incluses</span>
            <span className="text-slate-200 font-mono font-bold text-base">{includedCount}</span>
          </div>
          <div className="bg-slate-950 p-3 rounded border border-slate-800/80">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Fiches Exclues</span>
            <span className="text-slate-200 font-mono font-bold text-base">{excludedCount}</span>
          </div>
          <div className="bg-slate-950 p-3 rounded border border-slate-800/80">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Branches Non Résolues</span>
            <span className={`font-mono font-bold text-base ${unresolvedBranchCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {unresolvedBranchCount}
            </span>
          </div>
          <div className="bg-slate-950 p-3 rounded border border-slate-800/80">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Départements Non Résolus</span>
            <span className={`font-mono font-bold text-base ${unresolvedDeptCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {unresolvedDeptCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
