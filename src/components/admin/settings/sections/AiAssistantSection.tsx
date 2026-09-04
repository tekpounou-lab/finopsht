import React, { useState } from "react";
import { Bot, Sparkles, Activity, ShieldCheck, TrendingUp, Lightbulb, MessageSquare, Send, BrainCircuit, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const INSIGHTS = [
  { id: "1", type: "SECURITY", label: "Sécurité", text: "L'IA a détecté que 3 administrateurs n'ont pas activé le MFA. Voulez-vous forcer l'activation ?", impact: "HIGH", icon: ShieldCheck },
  { id: "2", type: "FINANCE", label: "Optimisation Paie", text: "Les heures supplémentaires ont augmenté de 24% ce mois-ci dans le département IT. Recommandation : Revoir le planning.", impact: "MEDIUM", icon: TrendingUp },
  { id: "3", type: "CONFIG", label: "Configuration", text: "Votre NIF n'est pas encore validé par le service de conformité. Cliquez pour synchroniser avec les registres officiels.", impact: "LOW", icon: Lightbulb },
];

export default function AiAssistantSection() {
  const [messages, setMessages] = useState([
    { role: "bot", text: "Bonjour ! Je suis votre Assistant Stratégique FINOPS. Je peux analyser votre configuration ERP et vous proposer des optimisations basées sur les meilleures pratiques du secteur." }
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    const newMessages = [...messages, { role: "user", text: input }];
    setMessages(newMessages);
    setInput("");
    
    // Simulate AI response
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: "bot", 
        text: "J'analyse votre demande concernant '" + input + "'... Dans le cadre de votre abonnement Enterprise, je suggère d'ajuster vos politiques de validation pour réduire les frictions opérationnelles." 
      }]);
    }, 1500);
  };

  return (
    <div className="space-y-8" id="ai-assistant-root">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight flex items-center gap-2">
            <Bot className="w-6 h-6 text-cyan-400" />
            Assistant AI Strategic
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-1">Intelligence artificielle prédictive pour l'optimisation de votre structure business.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">IA : Connectée</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Analytics Insights */}
        <div className="lg:col-span-5 space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Analyses & Recommandations
          </h4>

          <div className="space-y-4">
            {INSIGHTS.map((insight, idx) => (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                key={insight.id}
                className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-cyan-500/30 transition-all group relative overflow-hidden"
              >
                <div className={`absolute top-0 left-0 bottom-0 w-1 ${
                  insight.impact === "HIGH" ? "bg-rose-500" : insight.impact === "MEDIUM" ? "bg-amber-500" : "bg-cyan-500"
                }`}></div>
                
                <div className="flex items-start gap-4">
                  <div className={`p-2.5 rounded-xl ${
                    insight.impact === "HIGH" ? "bg-rose-500/10 text-rose-400" : insight.impact === "MEDIUM" ? "bg-amber-500/10 text-amber-400" : "bg-cyan-500/10 text-cyan-400"
                  }`}>
                    <insight.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{insight.label}</span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
                        insight.impact === "HIGH" ? "border-rose-500/30 text-rose-400" : "border-slate-800 text-slate-600"
                      }`}>IMPACT {insight.impact}</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-medium">{insight.text}</p>
                    <button className="mt-3 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 group-hover:translate-x-1 duration-200">
                      APPLIQUER LA SUGGESTION <Sparkles className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Chat Interface */}
        <div className="lg:col-span-7 flex flex-col glass rounded-2xl overflow-hidden border border-slate-800 h-[600px]">
          <div className="p-4 border-b border-slate-800 bg-slate-900/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                <BrainCircuit className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-100 uppercase tracking-tight">FinOps Logic Engine</p>
                <p className="text-[9px] text-emerald-500 font-bold uppercase">Ready for queries</p>
              </div>
            </div>
            <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "bot" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[80%] p-4 rounded-2xl text-xs leading-relaxed ${
                  m.role === "bot" 
                  ? "bg-slate-900 text-slate-300 border border-slate-800" 
                  : "bg-cyan-600 text-slate-950 font-bold shadow-lg shadow-cyan-500/10"
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-slate-800 bg-slate-950/50">
            <div className="relative">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                placeholder="Posez une question sur votre business..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-4 pr-12 text-sm text-slate-200 outline-none focus:border-cyan-500/50 transition-all shadow-inner"
              />
              <button 
                onClick={handleSend}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-cyan-500 text-slate-950 rounded-lg hover:bg-cyan-400 transition-all active:scale-90"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[10px] text-slate-500 hover:text-slate-300 hover:border-slate-700 transition-all">Analyse de paie</button>
              <button className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[10px] text-slate-500 hover:text-slate-300 hover:border-slate-700 transition-all">Audit sécurité</button>
              <button className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[10px] text-slate-500 hover:text-slate-300 hover:border-slate-700 transition-all">Score de santé</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
