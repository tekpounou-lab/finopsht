import React, { useState } from "react";
import { Lock, ShieldCheck, Activity, Search, Filter, ShieldAlert, Eye, Terminal, Clock, User, Globe } from "lucide-react";
import { useBusinessContext } from "../../../../contexts/BusinessContext";

export default function SecurityAuditSection() {
  const { currentBusiness } = useBusinessContext();
  const [activeTab, setActiveTab] = useState<"POLICIES" | "AUDIT">("POLICIES");

  // Mock audit logs - In a real app, these come from a dedicated repository
  const AUDIT_LOGS = [
    { id: "1", action: "SETTINGS_UPDATE", user: "John Owner", module: "ADMIN", date: "2026-07-21 10:45", ip: "190.115.34.12", result: "SUCCESS" },
    { id: "2", action: "PAYROLL_LOCK", user: "Sarah HR", module: "PAYROLL", date: "2026-07-21 09:12", ip: "190.115.34.14", result: "SUCCESS" },
    { id: "3", action: "PERMISSION_DENIED", user: "Mark Emp", module: "FINANCE", date: "2026-07-21 08:30", ip: "190.115.34.12", result: "FAILURE" },
    { id: "4", action: "BRANCH_CREATED", user: "John Owner", module: "ORG", date: "2026-07-20 16:20", ip: "190.115.34.12", result: "SUCCESS" },
  ];

  return (
    <div className="space-y-6" id="security-section-root">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">Centre de Sécurité & Audit</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">Surveillez l'intégrité de votre ERP et configurez les barrières de protection.</p>
        </div>
        <div className="flex gap-2 p-1 bg-slate-900 rounded-xl border border-slate-800">
          <button 
            onClick={() => setActiveTab("POLICIES")}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${activeTab === "POLICIES" ? "bg-slate-800 text-cyan-400 shadow-sm" : "text-slate-500 hover:text-slate-300"}`}
          >
            POLITIQUES
          </button>
          <button 
            onClick={() => setActiveTab("AUDIT")}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${activeTab === "AUDIT" ? "bg-slate-800 text-cyan-400 shadow-sm" : "text-slate-500 hover:text-slate-300"}`}
          >
            JOURNAL D'AUDIT
          </button>
        </div>
      </div>

      {activeTab === "POLICIES" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass rounded-2xl p-6 space-y-6">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" />
              Authentification & Accès
            </h4>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-900 rounded-xl">
                <div>
                  <p className="text-xs font-bold text-slate-200">MFA Obligatoire (Admin)</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Exiger la double authentification pour les rôles Owner/Admin.</p>
                </div>
                <div className="w-8 h-4 rounded-full bg-cyan-600 relative">
                  <div className="absolute top-0.5 right-1 w-3 h-3 rounded-full bg-white"></div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-900 rounded-xl">
                <div>
                  <p className="text-xs font-bold text-slate-200">Rotation des Mots de Passe</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Forcer le changement de mot de passe tous les 90 jours.</p>
                </div>
                <div className="w-8 h-4 rounded-full bg-slate-800 relative">
                  <div className="absolute top-0.5 left-1 w-3 h-3 rounded-full bg-white"></div>
                </div>
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl p-6 space-y-6">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              Protection Réseau
            </h4>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Restrictions IP (Whitelist)</label>
                <textarea 
                  placeholder="190.115.34.12, 201.23.45.1"
                  className="w-full h-24 bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono outline-none focus:border-cyan-500/50 resize-none"
                />
                <p className="text-[9px] text-slate-600 mt-2 italic">Laissez vide pour autoriser toutes les adresses IP.</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden border border-slate-900">
          <div className="p-4 border-b border-slate-900 bg-slate-900/30 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input 
                  placeholder="Rechercher une action..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 pl-9 pr-3 text-[11px] text-slate-300 outline-none focus:border-cyan-500/30 transition-all"
                />
              </div>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 text-slate-400 text-[10px] font-bold rounded-lg hover:text-slate-200 transition-all">
                <Filter className="w-3.5 h-3.5" />
                FILTRER
              </button>
            </div>
            <p className="text-[10px] font-bold text-cyan-500/80 uppercase tracking-widest">Temps Réel : Actif</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/50">
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900">Horodatage</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900">Acteur</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900">Action</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900">Module</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900">IP Origin</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900">Résultat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 font-mono">
                {AUDIT_LOGS.map(log => (
                  <tr key={log.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-slate-600" />
                        <span className="text-[10px] text-slate-400">{log.date}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3 text-slate-600" />
                        <span className="text-[10px] text-slate-300 font-bold">{log.user}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-bold text-cyan-500/80">{log.action}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-800">{log.module}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Globe className="w-3 h-3 text-slate-600" />
                        <span className="text-[10px] text-slate-500">{log.ip}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${log.result === "SUCCESS" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                        {log.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-900 bg-slate-950/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Terminal className="w-4 h-4 text-slate-600" />
              <p className="text-[10px] text-slate-500">Affichage de 4 logs d'audit sur 1,248 enregistrés dans la source de vérité.</p>
            </div>
            <button className="text-[10px] font-bold text-cyan-400 hover:underline">TÉLÉCHARGER LE RAPPORT COMPLET (CSV)</button>
          </div>
        </div>
      )}
    </div>
  );
}
