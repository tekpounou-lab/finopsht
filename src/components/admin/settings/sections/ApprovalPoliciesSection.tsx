import React from "react";
import { ShieldCheck, GitPullRequest, Users, CheckCircle2, AlertCircle, Plus, Zap, ChevronRight } from "lucide-react";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { useBusinessAdmin } from "../../../../hooks/useBusinessAdmin";

export default function ApprovalPoliciesSection() {
  const { businessSettings } = useBusinessContext();
  const { updateSettings, loading } = useBusinessAdmin();

  const policies = businessSettings?.approval_policies || [
    { id: "leave", label: "Demandes de Congés", levels: ["MANAGER", "HR"] },
    { id: "payroll", label: "Validation de Paie", levels: ["FINANCE", "OWNER"] },
    { id: "expense", label: "Notes de Frais", levels: ["MANAGER", "FINANCE"] },
  ];

  return (
    <div className="space-y-8" id="approval-policies-root">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">Circuits d'Approbation (Workflows)</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">Définissez les niveaux de validation requis pour les opérations critiques.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-bold rounded-lg hover:bg-cyan-500/20 transition-all">
          <Plus className="w-4 h-4" />
          NOUVELLE POLITIQUE
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {policies.map((policy: any) => (
          <div key={policy.id} className="glass rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                <GitPullRequest className="w-6 h-6 text-slate-500" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100">{policy.label}</h4>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest mt-0.5">Workflow Multi-Niveaux</p>
              </div>
            </div>

            <div className="flex-1 flex items-center gap-3">
               <div className="h-[1px] flex-1 bg-slate-900"></div>
               <div className="flex items-center gap-2">
                 {policy.levels.map((level: string, i: number) => (
                   <React.Fragment key={level}>
                     <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col items-center">
                        <span className="text-[8px] text-slate-600 font-bold uppercase">Niveau {i+1}</span>
                        <span className="text-[10px] text-cyan-400 font-black">{level}</span>
                     </div>
                     {i < policy.levels.length - 1 && <ChevronRight className="w-4 h-4 text-slate-800" />}
                   </React.Fragment>
                 ))}
               </div>
               <div className="h-[1px] flex-1 bg-slate-900"></div>
            </div>

            <div className="flex items-center gap-3">
              <button className="text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-wider">Modifier</button>
              <div className="h-4 w-[1px] bg-slate-800"></div>
              <div className="flex items-center gap-1.5 text-emerald-500">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase">Actif</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-400 leading-relaxed italic">
          Les politiques d'approbation sont appliquées de manière immuable au niveau du <span className="text-slate-300">Workflow Platform</span>. Toute modification sera tracée dans le journal d'audit de sécurité.
        </p>
      </div>
    </div>
  );
}
