
import React, { useEffect, useState } from "react";
import { WorkflowDLQRepository } from "../../modules/workflow/WorkflowDLQRepository";
import { WorkflowDeadLetter } from "../../modules/workflow/types";
import { AlertCircle, RotateCcw, Trash2, CheckCircle } from "lucide-react";

export const DeadLetterCenter: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [deadLetters, setDeadLetters] = useState<WorkflowDeadLetter[]>([]);

  useEffect(() => {
    const load = async () => {
      const data = await WorkflowDLQRepository.findUnresolved(businessId);
      setDeadLetters(data);
    };
    load();
  }, [businessId]);

  return (
    <div className="p-4 sm:p-8 bg-slate-950 min-h-screen text-slate-200 font-sans">
      <div className="mb-8">
        <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tight">
          <AlertCircle className="text-rose-500 w-6 h-6 sm:w-8 sm:h-8" />
          Dead Letter Queue (DLQ)
        </h1>
        <p className="text-sm text-slate-500 font-black uppercase tracking-widest mt-1">Failed processes requiring manual intervention</p>
      </div>

      <div className="space-y-4">
        {deadLetters.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center shadow-2xl">
            <CheckCircle className="w-16 h-16 text-emerald-500/10 mx-auto mb-4" />
            <p className="text-slate-500 italic font-black uppercase tracking-widest text-xs">Dead Letter Queue is empty. All processes are healthy.</p>
          </div>
        ) : (
          deadLetters.map((dl) => (
            <div key={dl.id} className="bg-slate-900 border border-rose-500/20 rounded-2xl overflow-hidden shadow-xl transition-all hover:border-rose-500/40">
              <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-rose-500/5">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] text-rose-400 font-black uppercase tracking-widest">Process ID: {dl.id}</span>
                  <span className="text-xs text-slate-300">Workflow Instance: <b className="text-white font-black">{dl.workflowInstanceId}</b></span>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button className="flex-1 sm:flex-none bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 border border-emerald-500/20">
                    <RotateCcw className="w-3 h-3" /> Replay
                  </button>
                  <button className="flex-1 sm:flex-none bg-slate-800 hover:bg-rose-500/10 hover:text-rose-400 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 border border-slate-700">
                    <Trash2 className="w-3 h-3" /> Discard
                  </button>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                <div className="text-rose-400 font-mono text-xs sm:text-sm mb-4 bg-black/40 p-4 rounded-xl border border-rose-500/10 leading-relaxed break-all shadow-inner">
                  {dl.error}
                </div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-[10px] font-black uppercase tracking-widest">
                  <span className="text-slate-600 italic">Captured at: {new Date(dl.timestamp).toLocaleString()}</span>
                  <button className="text-cyan-400 hover:text-cyan-300 transition-colors bg-cyan-400/5 px-3 py-1.5 rounded-lg border border-cyan-400/10">View Last State JSON</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
