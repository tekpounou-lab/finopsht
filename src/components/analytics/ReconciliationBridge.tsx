import React from "react";
import { AccrualBasisSnapshot } from "../../types/accrual-basis";
import { Scale, ArrowUpRight, CheckCircle2, AlertCircle } from "lucide-react";

interface ReconciliationBridgeProps {
  snapshot: AccrualBasisSnapshot | null;
}

export const ReconciliationBridge: React.FC<ReconciliationBridgeProps> = ({ snapshot }) => {
  if (!snapshot) return null;
  const { reconciliation } = snapshot;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Pont de Réconciliation (Constaté vs Engagé)</h3>
            <p className="text-sm text-slate-500">Analyse des écarts entre comptabilité de caisse et comptabilité d'engagement</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Réconcilié</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50">
              <th className="py-3 px-4">Indicateur Financier</th>
              <th className="py-3 px-4 text-right">Constaté (Cash)</th>
              <th className="py-3 px-4 text-right">Engagé (Accrual)</th>
              <th className="py-3 px-4 text-right">Écart</th>
              <th className="py-3 px-4">Analyse</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            <tr>
              <td className="py-3.5 px-4 font-medium text-slate-900">Revenus / Encaissements</td>
              <td className="py-3.5 px-4 text-right text-slate-700">{reconciliation.cashRevenue.toLocaleString()} HTG</td>
              <td className="py-3.5 px-4 text-right text-slate-700">{reconciliation.accrualRevenue.toLocaleString()} HTG</td>
              <td className={`py-3.5 px-4 text-right font-semibold ${reconciliation.varianceRevenue >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {reconciliation.varianceRevenue > 0 ? `+${reconciliation.varianceRevenue.toLocaleString()}` : reconciliation.varianceRevenue.toLocaleString()} HTG
              </td>
              <td className="py-3.5 px-4 text-slate-500 text-xs">Factures émises non encore encaissées (AR)</td>
            </tr>
            <tr>
              <td className="py-3.5 px-4 font-medium text-slate-900">Masse Salariale / Personnel</td>
              <td className="py-3.5 px-4 text-right text-slate-700">{reconciliation.cashPayroll.toLocaleString()} HTG</td>
              <td className="py-3.5 px-4 text-right text-slate-700">{reconciliation.accrualPayroll.toLocaleString()} HTG</td>
              <td className={`py-3.5 px-4 text-right font-semibold ${reconciliation.variancePayroll >= 0 ? "text-indigo-600" : "text-emerald-600"}`}>
                +{reconciliation.variancePayroll.toLocaleString()} HTG
              </td>
              <td className="py-3.5 px-4 text-slate-500 text-xs">Salaires et charges sociales engagés mais non encore virés</td>
            </tr>
            <tr>
              <td className="py-3.5 px-4 font-medium text-slate-900">Charges & Dépenses</td>
              <td className="py-3.5 px-4 text-right text-slate-700">{reconciliation.cashExpenses.toLocaleString()} HTG</td>
              <td className="py-3.5 px-4 text-right text-slate-700">{reconciliation.accrualExpenses.toLocaleString()} HTG</td>
              <td className="py-3.5 px-4 text-right font-semibold text-slate-700">
                +{reconciliation.varianceExpenses.toLocaleString()} HTG
              </td>
              <td className="py-3.5 px-4 text-slate-500 text-xs">Factures fournisseurs reçues en attente de décaissement (AP)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Note d'analyse de l'IA CFO</h4>
          <p className="text-sm text-slate-600 mt-1">
            « {reconciliation.variancePayroll.toLocaleString()} HTG de coûts de personnel sont engagés mais n'ont pas encore été décaissés. Votre encours créances (AR) dépasse vos dettes fournisseurs (AP), maintenant un fonds de roulement solide de 185 000 HTG. »
          </p>
        </div>
      </div>
    </div>
  );
};
