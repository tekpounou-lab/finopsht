import React from "react";
import { Link2, Globe, MessageSquare, CreditCard, Landmark, Zap } from "lucide-react";

export default function IntegrationSection() {
  const INTEGRATIONS = [
    { id: "stripe", name: "Stripe", category: "Paiements", status: "DISCONNECTED", icon: CreditCard },
    { id: "moncash", name: "MonCash", category: "Paiements (Haïti)", status: "CONNECTED", icon: Landmark },
    { id: "natcash", name: "NatCash", category: "Paiements (Haïti)", status: "DISCONNECTED", icon: Landmark },
    { id: "twilio", name: "Twilio", category: "Communication", status: "CONNECTED", icon: MessageSquare },
    { id: "google", name: "Google Workspace", category: "Productivité", status: "CONNECTED", icon: Globe },
  ];

  return (
    <div className="space-y-8" id="integrations-section-root">
       <div>
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">API & Intégrations Externes</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">Connectez vos services tiers et automatisez les flux de données entre FINOPS et vos partenaires.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {INTEGRATIONS.map(integ => (
            <div key={integ.id} className="glass rounded-2xl p-5 border border-slate-900 hover:border-cyan-500/30 transition-all group">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 group-hover:text-cyan-400 transition-colors">
                  <integ.icon className="w-5 h-5" />
                </div>
                <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold border ${
                  integ.status === "CONNECTED" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-slate-900 border-slate-800 text-slate-600"
                }`}>
                  {integ.status}
                </div>
              </div>
              
              <div>
                <p className="text-xs font-bold text-slate-200">{integ.name}</p>
                <p className="text-[10px] text-slate-500 mt-1">{integ.category}</p>
              </div>

              <button className="w-full mt-6 py-2 rounded-lg bg-slate-950 border border-slate-900 text-[10px] font-bold text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all">
                {integ.status === "CONNECTED" ? "CONFIGURER" : "CONNECTER"}
              </button>
            </div>
          ))}
        </div>
    </div>
  );
}
