import React from "react";
import { AlertCircle, CheckCircle2, ChevronRight, TriangleAlert } from "lucide-react";
import { ValidationResult } from "../../lib/bulkTransactionValidator";

interface ImportPreviewDialogProps {
  results: ValidationResult[];
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing: boolean;
}

export default function ImportPreviewDialog({ results, onConfirm, onCancel, isProcessing }: ImportPreviewDialogProps) {
  const validCount = results.filter(r => r.isValid).length;
  const errorCount = results.length - validCount;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn" id="import-preview-dialog">
      <div className="bg-slate-900 border-x sm:border border-slate-800 sm:rounded-2xl w-full max-w-5xl shadow-2xl shadow-cyan-900/10 flex flex-col h-full sm:h-auto sm:max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-950/50 gap-4 sm:gap-0">
          <div>
            <h2 className="text-xl font-black text-slate-100 font-sans uppercase tracking-tighter">
              Aperçu de l'Importation SSOT
            </h2>
            <p className="text-[10px] text-slate-500 mt-1 font-black uppercase tracking-widest">
              Validation des registres avant scellage immutable
            </p>
          </div>
          <div className="flex gap-6 w-full sm:w-auto">
            <div className="flex flex-col items-start sm:items-end flex-1 sm:flex-none">
              <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest leading-none">Validés</span>
              <span className="text-emerald-500 font-black font-sans text-2xl tracking-tighter mt-1">{validCount}</span>
            </div>
            <div className="flex flex-col items-start sm:items-end flex-1 sm:flex-none">
              <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest leading-none">Rejetés</span>
              <span className="text-rose-500 font-black font-sans text-2xl tracking-tighter mt-1">{errorCount}</span>
            </div>
          </div>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-auto p-0 bg-slate-950">
          <table className="hidden md:table w-full text-left border-collapse text-xs">
            <thead className="bg-slate-900 sticky top-0 z-10 shadow-xl font-sans text-[9px] text-slate-500 uppercase tracking-[0.2em] border-b border-slate-800">
              <tr>
                <th className="p-4 pl-8 border-r border-slate-800/50 w-20 text-center">ID</th>
                <th className="p-4 border-r border-slate-800/50">Statut</th>
                <th className="p-4 border-r border-slate-800/50">Configuration</th>
                <th className="p-4 border-r border-slate-800/50">Identité</th>
                <th className="p-4 border-r border-slate-800/50 text-right w-36">Impact</th>
                <th className="p-4 pr-8">Analyse</th>
              </tr>
            </thead>
            <tbody className="font-sans text-[11px] divide-y divide-slate-800/50">
              {results.map((res, i) => (
                <tr key={i} className={`hover:bg-slate-900 transition-colors ${!res.isValid ? "bg-rose-950/20" : ""}`}>
                  <td className="p-4 pl-8 border-r border-slate-800/50 text-center font-black text-slate-700">
                    {res.rowIdx}
                  </td>
                  <td className="p-4 border-r border-slate-800/50">
                    {res.isValid ? (
                      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-black text-[9px] uppercase tracking-widest">
                        <CheckCircle2 className="w-3 h-3" /> Validé
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 font-black text-[9px] uppercase tracking-widest">
                        <TriangleAlert className="w-3 h-3" /> Rejeté
                      </span>
                    )}
                  </td>
                  <td className="p-4 border-r border-slate-800/50">
                    <span className="font-black text-slate-200 uppercase tracking-widest block">{res.data?.type || "N/A"}</span>
                    <span className="text-[10px] text-slate-500 font-medium mt-1 block">{res.data?.date}</span>
                  </td>
                  <td className="p-4 border-r border-slate-800/50 text-slate-400 font-medium">
                    <div className="truncate max-w-[150px]" title={res.data?.employee_email}>
                      {res.data?.employee_email || "-"}
                    </div>
                  </td>
                  <td className="p-4 border-r border-slate-800/50 text-right font-black text-slate-100 font-sans text-xs">
                    {res.data?.amount_htg ? Number(res.data.amount_htg).toLocaleString() : "0"} <span className="text-[9px] text-slate-500 ml-1">HTG</span>
                  </td>
                  <td className="p-4 pr-8 text-[10px] leading-relaxed">
                    {res.errors.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {res.errors.map((e, ei) => (
                          <div key={ei} className="text-rose-500 font-bold uppercase tracking-wider flex items-center gap-2">
                             <AlertCircle className="w-3 h-3 shrink-0" />
                             {e}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-600 font-medium italic">Analyse conforme</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="md:hidden flex flex-col divide-y divide-slate-800 font-sans">
             {results.map((res, i) => (
                <div key={i} className={`p-6 flex flex-col gap-5 ${!res.isValid ? "bg-rose-950/20" : ""}`}>
                   <div className="flex justify-between items-start">
                      <div className="flex items-center gap-4">
                         <span className="w-10 h-10 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xs text-slate-500 font-black shadow-lg">{res.rowIdx}</span>
                         <div>
                            <span className="font-black text-slate-200 uppercase tracking-widest block">{res.data?.type || "N/A"}</span>
                            <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest mt-1 block">{res.data?.date}</span>
                         </div>
                      </div>
                      {res.isValid ? (
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-black text-[8px] uppercase tracking-widest">
                          <CheckCircle2 className="w-3 h-3" /> OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 font-black text-[8px] uppercase tracking-widest">
                          <TriangleAlert className="w-3 h-3" /> NO
                        </span>
                      )}
                   </div>

                   <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800/50 space-y-3">
                      <div className="flex justify-between items-center text-[10px]">
                          <span className="text-slate-600 font-black uppercase tracking-widest">Identité</span>
                          <span className="text-slate-400 font-bold truncate max-w-[180px]">{res.data?.employee_email || "-"}</span>
                      </div>
                      <div className="flex justify-between items-center">
                          <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Impact</span>
                          <span className="text-right font-black text-slate-100 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 shadow-inner text-xs tracking-tighter">
                            {res.data?.amount_htg ? Number(res.data.amount_htg).toLocaleString() : "0"} <span className="text-[9px] text-slate-600 ml-1">HTG</span>
                          </span>
                      </div>
                   </div>

                   {!res.isValid && res.errors.length > 0 && (
                       <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 shadow-sm">
                          <div className="flex flex-col gap-2">
                            {res.errors.map((e, ei) => (
                              <div key={ei} className="text-rose-500 font-black uppercase tracking-widest text-[9px] flex items-start gap-2 leading-relaxed">
                                 <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                                 {e}
                              </div>
                            ))}
                          </div>
                       </div>
                   )}
                </div>
             ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center bg-slate-950 gap-4">
          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest text-center sm:text-left leading-relaxed">
            {errorCount > 0 ? "⚠️ Attention : Des anomalies vectorielles bloquent le scellage." : "✅ Intégrité des données vérifiée. Prêt pour archivage immutable."}
          </p>
          <div className="flex gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onCancel}
              disabled={isProcessing}
              className="flex-1 sm:flex-none px-6 py-4 border border-slate-800 bg-slate-900 hover:bg-slate-800 rounded-2xl font-black text-[10px] text-slate-400 uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isProcessing || validCount === 0 || errorCount > 0}
              className="flex-1 sm:flex-none px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-2xl shadow-xl shadow-indigo-900/40 font-black text-[10px] text-white uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95"
            >
              {isProcessing ? "Injection..." : `Sceller ${validCount} Registres`}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
