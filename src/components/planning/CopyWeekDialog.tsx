import React, { useState } from 'react';
import { X, Copy, ArrowRight, AlertTriangle, RefreshCw } from 'lucide-react';
import { format, addWeeks, startOfWeek, endOfWeek } from 'date-fns';

interface CopyWeekDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCopy: (sourceWeekDate: Date, targetWeekDate: Date, options: any) => Promise<void>;
}

export default function CopyWeekDialog({ isOpen, onClose, onCopy }: CopyWeekDialogProps) {
  const [sourceDate, setSourceDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [targetDate, setTargetDate] = useState<string>(format(addWeeks(new Date(), 1), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  
  const [options, setOptions] = useState({
    copyShifts: true,
    copyAssignments: true,
    copyNotes: false,
    preserveMapping: true
  });

  if (!isOpen) return null;

  const handleCopy = async () => {
    setLoading(true);
    try {
      await onCopy(new Date(sourceDate), new Date(targetDate), options);
      onClose();
    } catch (err) {
      alert("Erreur lors de la copie.");
    } finally {
      setLoading(false);
    }
  };

  const formattedSourceStr = `${format(startOfWeek(new Date(sourceDate), { weekStartsOn: 1 }), 'dd/MM')} au ${format(endOfWeek(new Date(sourceDate), { weekStartsOn: 1 }), 'dd/MM')}`;
  const formattedTargetStr = `${format(startOfWeek(new Date(targetDate), { weekStartsOn: 1 }), 'dd/MM')} au ${format(endOfWeek(new Date(targetDate), { weekStartsOn: 1 }), 'dd/MM')}`;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl w-full max-w-lg flex flex-col font-sans">
        
        <div className="flex justify-between items-center p-4 border-b border-slate-800/80 bg-slate-900/50">
          <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm uppercase tracking-wider">
            <Copy className="w-4 h-4 text-cyan-400" />
            Copier Semaine
          </h3>
          <button onClick={onClose} className="p-1 hover:text-slate-300 text-slate-500 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-6 flex-1 overflow-y-auto">
          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4 text-[11px] text-slate-400 leading-relaxed font-sans font-medium uppercase tracking-wider">
            <p>Dupliquez le planning d'une semaine passée ou courante vers une semaine future. Les employés en congé approuvé ne seront pas planifiés.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-center border-b border-slate-800 pb-8">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Semaine Source</label>
               <input 
                 type="date"
                 value={sourceDate}
                 onChange={(e) => setSourceDate(e.target.value)}
                 className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 outline-none focus:border-cyan-500 font-sans font-black text-xs w-full shadow-inner"
               />
               <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest text-center mt-2">{formattedSourceStr}</span>
            </div>
            
            <div className="flex justify-center sm:col-span-1">
               <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center rotate-90 sm:rotate-0 shadow-lg border border-slate-700 transition-transform hover:scale-110">
                  <ArrowRight className="w-5 h-5 text-cyan-400" />
               </div>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none text-right sm:text-left">Semaine Cible</label>
               <input 
                 type="date"
                 value={targetDate}
                 onChange={(e) => setTargetDate(e.target.value)}
                 className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 outline-none focus:border-cyan-500 font-sans font-black text-xs w-full shadow-inner"
               />
               <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest text-center mt-2 text-right sm:text-left">{formattedTargetStr}</span>
            </div>
          </div>

          <div className="space-y-4">
             <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Options de Duplication</h4>
             
             <div className="grid grid-cols-1 gap-3">
               <label className="flex items-center gap-4 p-4 rounded-2xl border border-slate-800 bg-slate-950/50 cursor-pointer hover:border-slate-600 hover:bg-slate-900 transition-all group">
                 <div className="relative flex items-center">
                   <input type="checkbox" checked={options.copyShifts} onChange={(e) => setOptions({...options, copyShifts: e.target.checked})} className="w-5 h-5 accent-cyan-500 rounded-lg cursor-pointer" />
                 </div>
                 <div>
                    <div className="text-[11px] font-black text-slate-100 uppercase tracking-widest leading-none group-hover:text-cyan-400 transition-colors">Copier les Shifts</div>
                    <div className="text-[10px] text-slate-500 mt-1.5 font-medium leading-none">Transfère les horaires et structures.</div>
                 </div>
               </label>

               <label className="flex items-center gap-4 p-4 rounded-2xl border border-slate-800 bg-slate-950/50 cursor-pointer hover:border-slate-600 hover:bg-slate-900 transition-all group">
                 <div className="relative flex items-center">
                   <input type="checkbox" checked={options.copyAssignments} onChange={(e) => setOptions({...options, copyAssignments: e.target.checked})} className="w-5 h-5 accent-cyan-500 rounded-lg cursor-pointer" />
                 </div>
                 <div>
                    <div className="text-[11px] font-black text-slate-100 uppercase tracking-widest leading-none group-hover:text-cyan-400 transition-colors">Copier les Assignations</div>
                    <div className="text-[10px] text-slate-500 mt-1.5 font-medium leading-none">Maintient les employés sur les tours.</div>
                 </div>
               </label>

               <label className="flex items-center gap-4 p-4 rounded-2xl border border-slate-800 bg-slate-950/50 cursor-pointer hover:border-slate-600 hover:bg-slate-900 transition-all group">
                 <div className="relative flex items-center">
                   <input type="checkbox" checked={options.copyNotes} onChange={(e) => setOptions({...options, copyNotes: e.target.checked})} className="w-5 h-5 accent-cyan-500 rounded-lg cursor-pointer" />
                 </div>
                 <div>
                    <div className="text-[11px] font-black text-slate-100 uppercase tracking-widest leading-none group-hover:text-cyan-400 transition-colors">Copier les Notes</div>
                    <div className="text-[10px] text-slate-500 mt-1.5 font-medium leading-none">Inclus les instructions spécifiques.</div>
                 </div>
               </label>
             </div>
          </div>
          
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-[10px] text-amber-500/80 flex gap-4 items-start shadow-sm">
             <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
             <p className="font-medium leading-relaxed uppercase tracking-widest">Les conflits de jours fériés et de congés seront automatiquement résolus en laissant le tour "Non Assigné".</p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800/80 bg-slate-900/50 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold rounded text-slate-400 hover:text-slate-200 transition">
             Annuler
          </button>
          <button type="button" onClick={handleCopy} disabled={loading} className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold px-5 py-2 rounded text-xs transition flex items-center gap-1.5 disabled:opacity-50">
             {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
             {loading ? 'Copie en cours...' : 'Exécuter Copie'}
          </button>
        </div>

      </div>
    </div>
  );
}
