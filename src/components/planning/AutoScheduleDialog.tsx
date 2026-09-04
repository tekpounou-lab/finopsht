import React, { useState } from 'react';
import { X, Sparkles, AlertTriangle, ArrowRight, Zap, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AutoScheduleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (draft: any[]) => void;
}

export default function AutoScheduleDialog({ isOpen, onClose, onApply }: AutoScheduleDialogProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const startAnalysis = () => {
    setAnalyzing(true);
    setResult(null);
    
    // Simulate AI delay
    setTimeout(() => {
      setAnalyzing(false);
      setResult({
        confidenceScore: 92,
        projectedCost: 15400, // example
        overtimeAlerts: 0,
        understaffingWarnings: 0,
        draft: [], // would contain generated shifts
        recommendations: [
          "15 tours générés couvrant 100% des besoins des succursales.",
          "Coûts de paie optimisés : -5% par rapport à la moyenne",
          "Aucun conflit d'heures supplémentaires détecté",
        ]
      });
    }, 3000);
  };

  const handleApply = () => {
    if (result) {
      onApply(result.draft);
      onClose();
    }
  };

  const MotionDiv = motion.div as any;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <MotionDiv 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <MotionDiv 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-50 w-full md:w-[500px] border-l border-slate-700/80 bg-slate-900 shadow-2xl flex flex-col"
          >
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-slate-800 bg-slate-900/50">
              <h3 className="font-black text-indigo-400 uppercase tracking-widest text-[10px] flex items-center gap-3">
                <Sparkles className="w-5 h-5" /> Enterprise AI Scheduler
              </h3>
              <button onClick={onClose} className="text-slate-500 hover:text-slate-100 transition-colors p-2 hover:bg-slate-800 rounded-xl">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 sm:p-8 font-sans">
              {!analyzing && !result && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                  <div className="w-24 h-24 rounded-3xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-2xl">
                    <Sparkles className="w-12 h-12 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="text-white text-xl font-black uppercase tracking-tight mb-3">IA Générative SSOT</h4>
                    <p className="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto font-medium">
                      Optimisation prédictive du planning hebdomadaire basée sur les modèles de disponibilité et les contraintes budgétaires.
                    </p>
                  </div>
                  <button 
                    onClick={startAnalysis}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-[0.2em] px-8 py-4 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-indigo-900/40 active:scale-95"
                  >
                    Lancer la Génération <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
              
              {analyzing && (
                <div className="flex flex-col items-center justify-center h-full space-y-8">
                  <div className="relative flex items-center justify-center scale-150">
                    <div className="absolute w-24 h-24 border-[3px] border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
                    <div className="absolute w-16 h-16 border-[3px] border-cyan-500/10 border-b-cyan-500 rounded-full animate-spin direction-reverse"></div>
                    <Sparkles className="w-6 h-6 text-indigo-400 animate-pulse" />
                  </div>
                  <div className="text-center">
                    <h4 className="text-white font-black text-sm uppercase tracking-widest">Calcul Vectoriel...</h4>
                    <p className="text-[10px] text-slate-500 mt-2 font-black uppercase tracking-widest">Modélisation Enterprise Business Core</p>
                  </div>
                </div>
              )}

              {result && (
                <MotionDiv initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                  
                  <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 flex gap-5 items-center shadow-inner">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shrink-0">
                      <Zap className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                      <h4 className="text-indigo-400 font-black text-[10px] uppercase tracking-widest mb-1">Analyse Complétée</h4>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">Planning optimisé prêt pour injection dans le registre.</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col items-center shadow-lg">
                      <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 leading-none">Confiance</div>
                      <div className="text-2xl font-black font-sans text-emerald-400 tracking-tighter">{result.confidenceScore}%</div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col items-center shadow-lg">
                      <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 leading-none">Coût Estimatif</div>
                      <div className="text-2xl font-black font-sans text-cyan-400 tracking-tighter">${result.projectedCost}</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                       <Target className="w-4 h-4 text-indigo-400" /> Recommandations IA
                    </h4>
                    {result.recommendations.map((rec: string, i: number) => (
                      <div key={i} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-[11px] text-slate-400 font-medium leading-relaxed shadow-sm flex gap-3 items-start">
                        <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                        {rec}
                      </div>
                    ))}
                  </div>
                  
                </MotionDiv>
              )}
            </div>

            {result && (
              <div className="p-6 border-t border-slate-800 bg-slate-950 flex flex-col gap-3">
                 <button onClick={handleApply} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-900/20 active:scale-[0.98]">
                   Appliquer le Planning SSOT
                 </button>
                 <div className="flex gap-2">
                   <button className="flex-1 text-[9px] font-black text-slate-500 hover:text-slate-300 uppercase tracking-widest bg-slate-900 py-3 rounded-xl border border-slate-800 transition-colors" onClick={startAnalysis}>Regénérer</button>
                   <button className="flex-1 text-[9px] font-black text-slate-500 hover:text-slate-300 uppercase tracking-widest bg-slate-900 py-3 rounded-xl border border-slate-800 transition-colors">Visualisation</button>
                 </div>
              </div>
            )}
          </MotionDiv>
        </>
      )}
    </AnimatePresence>
  );
}
