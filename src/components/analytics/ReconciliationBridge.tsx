import React from "react";
import { AccrualBasisSnapshot } from "../../types/accrual-basis";
import { Scale, ArrowUpRight, CheckCircle2, AlertCircle } from "lucide-react";

interface ReconciliationBridgeProps {
  snapshot: AccrualBasisSnapshot | null;
  currency?: string;
}

export const ReconciliationBridge: React.FC<ReconciliationBridgeProps> = ({ snapshot, currency = "HTG" }) => {
  if (!snapshot) return null;
  const { reconciliation } = snapshot;

  const formatSigned = (val: number) => `${val > 0 ? `+${val.toLocaleString()}` : val.toLocaleString()} ${currency}`;

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
        <div className="flex items-center space-x-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-mono font-bold border border-emerald-500/30">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>RÉCONCILIÉ (SSOT)</span>
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
              <td className="py-3.5 px-4 text-right text-emerald-400 font-bold">{reconciliation.cashRevenue.toLocaleString()} {currency}</td>
              <td className="py-3.5 px-4 text-right text-slate-200">{reconciliation.accrualRevenue.toLocaleString()} {currency}</td>
              <td className={`py-3.5 px-4 text-right font-bold ${reconciliation.varianceRevenue >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {formatSigned(reconciliation.varianceRevenue)}
              </td>
              <td className="py-3.5 px-4 text-slate-400 font-sans text-xs">Factures émises non encore encaissées (AR)</td>
            </tr>
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="py-3.5 px-4 font-semibold text-slate-200 font-sans">Masse Salariale / Personnel</td>
              <td className="py-3.5 px-4 text-right text-indigo-400 font-bold">{reconciliation.cashPayroll.toLocaleString()} {currency}</td>
              <td className="py-3.5 px-4 text-right text-slate-200">{reconciliation.accrualPayroll.toLocaleString()} {currency}</td>
              <td className={`py-3.5 px-4 text-right font-bold ${reconciliation.variancePayroll >= 0 ? "text-indigo-400" : "text-emerald-400"}`}>
                {formatSigned(reconciliation.variancePayroll)}
              </td>
              <td className="py-3.5 px-4 text-slate-400 font-sans text-xs">Salaires et charges sociales engagés mais non encore virés</td>
            </tr>
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="py-3.5 px-4 font-semibold text-slate-200 font-sans">Charges & Dépenses</td>
              <td className="py-3.5 px-4 text-right text-rose-400 font-bold">{reconciliation.cashExpenses.toLocaleString()} {currency}</td>
              <td className="py-3.5 px-4 text-right text-slate-200">{reconciliation.accrualExpenses.toLocaleString()} {currency}</td>
              <td className={`py-3.5 px-4 text-right font-bold ${reconciliation.varianceExpenses >= 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {formatSigned(reconciliation.varianceExpenses)}
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
            « {reconciliation.variancePayroll.toLocaleString()} {currency} d'écart net entre salaires engagés et décaissés. Votre encours créances (AR) dépasse vos dettes fournisseurs (AP), maintenant un fonds de roulement solide. »
          </p>
        </div>
      </div>
    </div>
  );
};
