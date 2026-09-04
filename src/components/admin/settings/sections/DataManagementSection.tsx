import React from "react";
import { Database, Download, Upload, ShieldAlert, RefreshCw, Trash2, FileJson, Archive } from "lucide-react";

export default function DataManagementSection() {
  return (
    <div className="space-y-8" id="data-management-root">
       <div>
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">Gestion des Données & Souveraineté</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">Importez, exportez et gérez la rétention des données de votre entreprise.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass rounded-2xl p-6 space-y-6">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Download className="w-4 h-4 text-cyan-400" />
              Exports Stratégiques
            </h4>

            <div className="space-y-3">
              {[
                { label: "Grand Livre Complet", format: "CSV / JSON", icon: FileJson },
                { label: "Base Employés (RGPD)", format: "PDF / CSV", icon: Database },
                { label: "Audit Logs (Immutable)", format: "JSON", icon: ShieldAlert },
              ].map(exp => (
                <div key={exp.label} className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-900 rounded-xl hover:bg-slate-900/50 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <exp.icon className="w-4 h-4 text-slate-600 group-hover:text-cyan-400" />
                    <div>
                      <p className="text-xs font-bold text-slate-300">{exp.label}</p>
                      <p className="text-[9px] text-slate-600 font-mono mt-0.5">{exp.format}</p>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-slate-700 group-hover:text-cyan-400" />
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-6 space-y-6">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Archive className="w-4 h-4 text-amber-500" />
              Rétention & Archivage
            </h4>

            <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Durée de rétention (Ans)</span>
                <span className="text-xs font-bold text-slate-200">10 Ans</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Conformément à la législation en vigueur, les registres financiers sont conservés de manière immutable pour une période de 10 ans avant archivage à froid.
              </p>
              <button className="w-full py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold uppercase tracking-wider hover:bg-amber-500/20 transition-all">
                DÉMARRER UN ARCHIVAGE MANUEL
              </button>
            </div>
          </div>
        </div>
    </div>
  );
}
