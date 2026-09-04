import React, { useState } from 'react';
import { Employee, Branch, Department } from '../../types';
import { Shift, ShiftStatus } from './types';
import { X, Calendar, Clock, Plus, RefreshCw, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { z } from 'zod';
import SearchableSelect from '../ui/SearchableSelect';

interface CreateShiftDialogProps {
  onClose: () => void;
  onSave: (shift: Omit<Shift, 'id'>, id?: string) => Promise<void>;
  employees: Employee[];
  branches: Branch[];
  departments: Department[];
  current_business_id: string;
  initialShift?: Shift;
}

const shiftSchema = z.object({
  employeeId: z.string().min(1, "Employé requis"),
  branchId: z.string().min(1, "Succursale requise"),
  departmentId: z.string().min(1, "Département requis"),
  date: z.string().min(1, "Date requise"),
  startTime: z.string().min(1, "Heure de début requise"),
  endTime: z.string().min(1, "Heure de fin requise"),
  plannedHours: z.number().min(1, "Heure estimée requise").max(24),
  recurringRule: z.string().optional(),
  notes: z.string().optional()
});

export default function CreateShiftDialog({
  onClose,
  onSave,
  employees,
  branches,
  departments,
  current_business_id,
  initialShift
}: CreateShiftDialogProps) {
  const [formData, setFormData] = useState({
    employeeId: initialShift?.employeeId || '',
    branchId: initialShift?.branchId || '',
    departmentId: initialShift?.departmentId || '',
    date: initialShift?.date || format(new Date(), 'yyyy-MM-dd'),
    startTime: initialShift?.startTime || '08:00',
    endTime: initialShift?.endTime || '16:00',
    plannedHours: initialShift?.plannedHours || 8,
    recurringRule: initialShift?.recurringRule || 'NONE',
    notes: initialShift?.notes || ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    try {
      const parsed = shiftSchema.parse({
         ...formData,
         plannedHours: Number(formData.plannedHours)
      });
      setLoading(true);
      await onSave({
        business_id: current_business_id,
        employeeId: parsed.employeeId,
        branchId: parsed.branchId,
        departmentId: parsed.departmentId,
        date: parsed.date,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        status: initialShift?.status || 'SCHEDULED',
        plannedHours: parsed.plannedHours,
        notes: parsed.notes
      }, initialShift?.id);
      onClose();
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        (err as any).errors.forEach((e: any) => {
          if (e.path[0]) fieldErrors[e.path[0].toString()] = e.message;
        });
        setErrors(fieldErrors);
      } else {
        alert("Erreur lors de la sauvegarde.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center p-4 border-b border-slate-800/80 bg-slate-900/50">
          <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm uppercase tracking-wider">
            {initialShift ? <Calendar className="w-4 h-4 text-cyan-400" /> : <Plus className="w-4 h-4 text-cyan-400" />}
            {initialShift ? 'Modifier Tour (Shift)' : 'Nouveau Tour (Shift)'}
          </h3>
          <button onClick={onClose} className="p-1 hover:text-slate-300 text-slate-500 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto font-sans flex-1 space-y-5 text-sm">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest leading-none">Employé *</label>
              <SearchableSelect 
                options={employees.map(e => ({ id: e.id, name: e.name }))}
                value={formData.employeeId}
                onChange={value => setFormData({...formData, employeeId: value})}
                placeholder="-- Sélectionner un employé --"
                error={!!errors.employeeId}
              />
              {errors.employeeId && <span className="text-[10px] text-rose-400 font-black uppercase tracking-widest mt-1">{errors.employeeId}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest leading-none">Succursale *</label>
              <SearchableSelect 
                options={branches.map(b => ({ id: b.id, name: b.name }))}
                value={formData.branchId}
                onChange={value => setFormData({...formData, branchId: value})}
                placeholder="-- Sélectionner --"
                error={!!errors.branchId}
              />
              {errors.branchId && <span className="text-[10px] text-rose-400 font-black uppercase tracking-widest mt-1">{errors.branchId}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest leading-none">Département *</label>
              <SearchableSelect 
                options={departments.map(d => ({ id: d.id, name: d.name }))}
                value={formData.departmentId}
                onChange={value => setFormData({...formData, departmentId: value})}
                placeholder="-- Sélectionner --"
                error={!!errors.departmentId}
              />
              {errors.departmentId && <span className="text-[10px] text-rose-400 font-black uppercase tracking-widest mt-1">{errors.departmentId}</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-800/80 pt-5">
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest leading-none flex items-center gap-2">
                <Calendar className="w-3 h-3 text-cyan-400"/> Date de Tour *
              </label>
              <input 
                type="date" 
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
                className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 uppercase font-sans font-black text-xs outline-none focus:border-cyan-500 transition-all shadow-inner"
              />
              {errors.date && <span className="text-[10px] text-rose-400 font-black uppercase tracking-widest mt-1">{errors.date}</span>}
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest leading-none flex items-center gap-2">
                <Clock className="w-3 h-3 text-cyan-400"/> Début *
              </label>
              <input 
                type="time" 
                value={formData.startTime}
                onChange={e => setFormData({...formData, startTime: e.target.value})}
                className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 font-sans font-black text-xs outline-none focus:border-cyan-500 transition-all shadow-inner"
              />
              {errors.startTime && <span className="text-[10px] text-rose-400 font-black uppercase tracking-widest mt-1">{errors.startTime}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest leading-none flex items-center gap-2">
                <Clock className="w-3 h-3 text-cyan-400"/> Fin *
              </label>
              <input 
                type="time" 
                value={formData.endTime}
                onChange={e => setFormData({...formData, endTime: e.target.value})}
                className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 font-sans font-black text-xs outline-none focus:border-cyan-500 transition-all shadow-inner"
              />
              {errors.endTime && <span className="text-[10px] text-rose-400 font-black uppercase tracking-widest mt-1">{errors.endTime}</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-800/80 pt-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest leading-none">Heures Estimées *</label>
              <input 
                type="number" 
                value={formData.plannedHours}
                onChange={e => setFormData({...formData, plannedHours: Number(e.target.value)})}
                min={1} max={24}
                className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 font-sans font-black text-xs outline-none focus:border-cyan-500 transition-all shadow-inner"
              />
              {errors.plannedHours && <span className="text-[10px] text-rose-400 font-black uppercase tracking-widest mt-1">{errors.plannedHours}</span>}
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest leading-none flex items-center gap-2">Répétition Automatisée</label>
              <select 
                value={formData.recurringRule}
                onChange={e => setFormData({...formData, recurringRule: e.target.value})}
                className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 font-sans font-black text-xs outline-none focus:border-cyan-500 transition-all shadow-inner"
              >
                <option value="NONE">Aucune</option>
                <option value="DAILY">Quotidien</option>
                <option value="WEEKLY">Hebdomadaire</option>
                <option value="MONTHLY">Mensuel</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest leading-none">Notes & Instructions (Optionnel)</label>
            <textarea 
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
              rows={2}
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 resize-none text-slate-100 font-medium text-xs outline-none focus:border-cyan-500 transition-all shadow-inner"
            />
            {errors.notes && <span className="text-[10px] text-rose-400 font-black uppercase tracking-widest mt-1">{errors.notes}</span>}
          </div>
        </form>

        <div className="p-4 border-t border-slate-800/80 bg-slate-900/50 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold rounded text-slate-400 hover:text-slate-200 transition">
             Annuler
          </button>
          <button type="button" onClick={handleSubmit} disabled={loading} className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold px-5 py-2 rounded text-xs transition flex items-center gap-1.5 disabled:opacity-50">
             {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
             {loading ? 'Enregistrement...' : 'Confirmer le Tour'}
          </button>
        </div>

      </div>
    </div>
  );
}
