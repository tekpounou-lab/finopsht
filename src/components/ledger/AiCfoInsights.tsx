import React from 'react';
import { Sparkles, TrendingUp, AlertOctagon, TrendingDown } from 'lucide-react';
import { motion } from 'motion/react';

export default function AiCfoInsights() {
  const MotionDiv = motion.div as any;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
      <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass p-4 rounded-xl border border-slate-800/60 bg-gradient-to-br from-indigo-900/20 to-slate-900/40">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">AI Insight CFO</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed font-sans mb-2">
          La masse salariale a augmenté de 4.2% ce mois-ci, justifiée par les primes de performance. Ratio Masse/Revenu optimal.
        </p>
        <div className="text-[10px] text-indigo-500 font-bold">Sécurisé & Analysé</div>
      </MotionDiv>

      <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass p-4 rounded-xl border border-slate-800/60">
         <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Marge Opérationnelle</span>
        </div>
        <div className="mt-2 text-2xl font-black font-mono text-emerald-400">22.4%</div>
      </MotionDiv>

      <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass p-4 rounded-xl border border-rose-500/30 bg-rose-500/5">
        <div className="flex items-center gap-2 mb-1">
          <AlertOctagon className="w-4 h-4 text-rose-400" />
          <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Alerte Découvert (BR2)</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed font-sans mt-2">
          Le flux de trésorerie de la Succursale Nord pourrait être négatif d'ici 5 jours.
        </p>
      </MotionDiv>

      <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass p-4 rounded-xl border border-slate-800/60">
        <div className="flex items-center gap-2 mb-1">
          <TrendingDown className="w-4 h-4 text-cyan-400" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ratio Endettement</span>
        </div>
        <div className="mt-2 text-2xl font-black font-mono text-cyan-400">14.1%</div>
      </MotionDiv>
    </div>
  );
}
