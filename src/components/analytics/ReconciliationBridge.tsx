import React from "react";
import { AccrualBasisSnapshot } from "../../types/accrual-basis";
import { Scale, ArrowUpRight, CheckCircle2, AlertCircle } from "lucide-react";
import { NormalizedAmountResolver } from "../../domains/analytics/utils/NormalizedAmountResolver";

interface ReconciliationBridgeProps {
  snapshot: AccrualBasisSnapshot | null;
  currency?: string;
  usdToHtgRate?: number;
}

export const ReconciliationBridge: React.FC<ReconciliationBridgeProps> = ({
  snapshot,
  currency = "HTG",
  usdToHtgRate,
}) => {
  if (!snapshot) return null;
  const { reconciliation, workingCapital } = snapshot;

  const requestedCurrency = currency || "HTG";
  const canConvertUsd =
    requestedCurrency === "USD" &&
    typeof usdToHtgRate === "number" &&
    Number.isFinite(usdToHtgRate) &&
    usdToHtgRate > 0;
  const displayCurrency = requestedCurrency === "USD" ? "USD" : "HTG";

  const toDisplay = (val: number): number => {
    return canConvertUsd ? NormalizedAmountResolver.convertFromHTG(val, "USD", usdToHtgRate!) : val;
  };

  const isReconciled =
    Math.abs((reconciliation.accrualRevenue - reconciliation.cashRevenue) - reconciliation.varianceRevenue) < 0.01 &&
    Math.abs((reconciliation.accrualPayroll - reconciliation.cashPayroll) - reconciliation.variancePayroll) < 0.01 &&
    Math.abs((reconciliation.accrualExpenses - reconciliation.cashExpenses) - reconciliation.varianceExpenses) < 0.01;

  const ar = workingCapital?.accountsReceivable ?? 0;
  const ap = workingCapital?.accountsPayable ?? 0;
  const workingCapitalNarrative =
    ar > ap
      ? "Votre encours créances (AR) dépasse vos dettes fournisseurs (AP), maintenant un fonds de roulement positif."
      : ap > ar
      ? "Vos dettes fournisseurs (AP) dépassent vos créances clients (AR), traduisant une pression à court terme sur le fonds de roulement."
      : "Vos créances clients (AR) et vos dettes fournisseurs (AP) sont équilibrées sur la période.";

  const formatSigned = (val: number) => `${val > 0 ? `+${val.toLocaleString()}` : val.toLocaleString()} ${displayCurrency}`;

  const dispCashRevenue = toDisplay(reconciliation.cashRevenue);
  const dispAccrualRevenue = toDisplay(reconciliation.accrualRevenue);
  const dispVarianceRevenue = toDisplay(reconciliation.varianceRevenue);

  const dispCashPayroll = toDisplay(reconciliation.cashPayroll);
  const dispAccrualPayroll = toDisplay(reconciliation.accrualPayroll);
  const dispVariancePayroll = toDisplay(reconciliation.variancePayroll);

  const dispCashExpenses = toDisplay(reconciliation.cashExpenses);
  const dispAccrualExpenses = toDisplay(reconciliation.accrualExpenses);
  const dispVarianceExpenses = toDisplay(reconciliation.varianceExpenses);

  return (
    <div className="bg-slate-900/80 border border-slate-800/80 backdrop-blur-md rounded-2xl shadow-xl p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">Pont de Réconciliation (Constaté vs Engagé)</h3>
            <p className="text-xs text-slate-400 mt-0.5">Analyse des écarts entre comptabilité de caisse et comptabilité d'engagement</p>
          </div>
        </div>
        <div
          className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
            isReconciled
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : "bg-amber-500/10 text-amber-400 border-amber-500/30"
          }`}
        >
          {isReconciled ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>RÉCONCILIÉ (SSOT)</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>ÉCART À VÉRIFIER</span>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800/80">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-950/80 font-mono">
              <th className="py-3 px-4">Indicateur Financier</th>
              <th className="py-3 px-4 text-right">Constaté (Cash)</th>
              <th className="py-3 px-4 text-right">Engagé (Accrual)</th>
              <th className="py-3 px-4 text-right">Écart</th>
              <th className="py-3 px-4">Analyse</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="py-3.5 px-4 font-semibold text-slate-200 font-sans">Revenus / Encaissements</td>
              <td className="py-3.5 px-4 text-right text-emerald-400 font-bold">{dispCashRevenue.toLocaleString()} {displayCurrency}</td>
              <td className="py-3.5 px-4 text-right text-slate-200">{dispAccrualRevenue.toLocaleString()} {displayCurrency}</td>
              <td className={`py-3.5 px-4 text-right font-bold ${dispVarianceRevenue >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {formatSigned(dispVarianceRevenue)}
              </td>
              <td className="py-3.5 px-4 text-slate-400 font-sans text-xs">Factures émises non encore encaissées (AR)</td>
            </tr>
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="py-3.5 px-4 font-semibold text-slate-200 font-sans">Masse Salariale / Personnel</td>
              <td className="py-3.5 px-4 text-right text-indigo-400 font-bold">{dispCashPayroll.toLocaleString()} {displayCurrency}</td>
              <td className="py-3.5 px-4 text-right text-slate-200">{dispAccrualPayroll.toLocaleString()} {displayCurrency}</td>
              <td className={`py-3.5 px-4 text-right font-bold ${dispVariancePayroll >= 0 ? "text-indigo-400" : "text-emerald-400"}`}>
                {formatSigned(dispVariancePayroll)}
              </td>
              <td className="py-3.5 px-4 text-slate-400 font-sans text-xs">Salaires et charges sociales engagés mais non encore virés</td>
            </tr>
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="py-3.5 px-4 font-semibold text-slate-200 font-sans">Charges & Dépenses</td>
              <td className="py-3.5 px-4 text-right text-rose-400 font-bold">{dispCashExpenses.toLocaleString()} {displayCurrency}</td>
              <td className="py-3.5 px-4 text-right text-slate-200">{dispAccrualExpenses.toLocaleString()} {displayCurrency}</td>
              <td className={`py-3.5 px-4 text-right font-bold ${dispVarianceExpenses >= 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {formatSigned(dispVarianceExpenses)}
              </td>
              <td className="py-3.5 px-4 text-slate-400 font-sans text-xs">Factures fournisseurs reçues en attente de décaissement (AP)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-slate-950/80 rounded-xl border border-slate-800/80 flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="text-xs uppercase font-extrabold text-cyan-300 tracking-wider">Note d'analyse de l'IA CFO</h4>
          <p className="text-xs text-slate-300 mt-1 font-sans leading-relaxed">
            « {dispVariancePayroll.toLocaleString()} {displayCurrency} d'écart net entre salaires engagés et décaissés. {workingCapitalNarrative} »
          </p>
        </div>
      </div>
    </div>
  );
};
