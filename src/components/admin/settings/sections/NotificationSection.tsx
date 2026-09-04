import React from "react";
import { Bell, Mail, Smartphone, MessageSquare, ShieldCheck, Settings } from "lucide-react";

export default function NotificationSection() {
  return (
    <div className="space-y-8" id="notifications-section-root">
       <div>
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">Centre de Notifications</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">Configurez les canaux et les déclencheurs de notifications pour vos équipes.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass rounded-2xl p-6 space-y-6">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Mail className="w-4 h-4 text-cyan-400" />
              Canaux de Diffusion
            </h4>
            
            <div className="space-y-4">
              {[
                { label: "Email Professionnel", icon: Mail, enabled: true },
                { label: "SMS (Alertes Critiques)", icon: Smartphone, enabled: false },
                { label: "Notifications In-App", icon: Bell, enabled: true },
                { label: "WhatsApp (Beta)", icon: MessageSquare, enabled: false },
              ].map(canal => (
                <div key={canal.label} className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-900 rounded-xl">
                  <div className="flex items-center gap-3">
                    <canal.icon className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold text-slate-300">{canal.label}</span>
                  </div>
                  <div className={`w-8 h-4 rounded-full relative transition-colors ${canal.enabled ? "bg-cyan-600" : "bg-slate-800"}`}>
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${canal.enabled ? "right-1" : "left-1"}`}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
    </div>
  );
}
