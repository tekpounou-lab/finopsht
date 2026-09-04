import React, { useState, useEffect } from 'react';
import { ShiftTemplate } from './types';
import { ScheduleRepository } from '../../repositories/ScheduleRepository';
import { useShiftTemplates } from '../../hooks/useRepositories';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Calendar, Clock, RefreshCw, X } from 'lucide-react';
import { Branch } from '../../types';

interface ShiftTemplateManagerProps {
  businessId: string;
  branches: Branch[];
}

export default function ShiftTemplateManager({ businessId, branches }: ShiftTemplateManagerProps) {
  const templates = useShiftTemplates(businessId) as ShiftTemplate[];
  const [loading, setLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState('ALL');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');
  const [breakDuration, setBreakDuration] = useState(60);
  const [workingDays, setWorkingDays] = useState<string[]>(['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']);
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(15);
  const [overtimeThreshold, setOvertimeThreshold] = useState(8);
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  const daysOfWeek = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  const openCreateForm = () => {
    setEditingTemplate(null);
    setName('');
    setBranchId(branches[0]?.id || 'ALL');
    setStartTime('08:00');
    setEndTime('16:00');
    setBreakDuration(60);
    setWorkingDays(['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']);
    setGracePeriodMinutes(15);
    setOvertimeThreshold(8);
    setStatus('ACTIVE');
    setIsFormOpen(true);
  };

  const openEditForm = (t: ShiftTemplate) => {
    setEditingTemplate(t);
    setName(t.name);
    setBranchId(t.branchId);
    setStartTime(t.startTime);
    setEndTime(t.endTime);
    setBreakDuration(t.breakDuration);
    setWorkingDays(t.workingDays);
    setGracePeriodMinutes(t.gracePeriodMinutes);
    setOvertimeThreshold(t.overtimeThreshold);
    setStatus(t.status);
    setIsFormOpen(true);
  };

  const handleToggleDay = (day: string) => {
    if (workingDays.includes(day)) {
      setWorkingDays(workingDays.filter(d => d !== day));
    } else {
      setWorkingDays([...workingDays, day]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Veuillez donner un nom au modèle d'horaire.");
      return;
    }

    const templateId = editingTemplate?.id || `tmpl_${Math.random().toString(36).substring(2, 9)}`;
    const payload: ShiftTemplate = {
      id: templateId,
      businessId,
      branchId,
      name,
      startTime,
      endTime,
      breakDuration: Number(breakDuration),
      workingDays,
      gracePeriodMinutes: Number(gracePeriodMinutes),
      overtimeThreshold: Number(overtimeThreshold),
      status
    };

    try {
      await ScheduleRepository.saveShiftTemplate(templateId, payload);
      toast.success(editingTemplate ? "Modèle d'horaire mis à jour avec succès !" : "Modèle d'horaire créé avec succès !");
      setIsFormOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Échec de l'enregistrement du modèle.");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce modèle d'horaire ?")) {
      try {
        await ScheduleRepository.deleteShiftTemplate(id);
        toast.success("Modèle d'horaire supprimé !");
      } catch (err) {
        console.error(err);
        toast.error("Impossible de supprimer le modèle.");
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-200" id="shift-template-manager">
      <div className="flex justify-between items-center bg-slate-900/40 p-4 border border-slate-800/60 rounded-xl">
        <div>
          <h3 className="font-bold text-slate-100 uppercase tracking-wider text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            Moteur de Modèles Horaires (Shift Templates)
          </h3>
          <p className="text-xs text-slate-400 font-light mt-1">
            Définissez des modèles d'horaires réutilisables avec gestion de pause, heures supplémentaires et tolérances.
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs uppercase tracking-wider px-4 py-2 rounded flex items-center gap-1.5 transition"
        >
          <Plus className="w-4 h-4" /> Nouveau Modèle
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-slate-900/20 border border-slate-800/60 rounded-xl p-8 text-center text-slate-500 text-sm">
          Aucun modèle d'horaire défini. Créez-en un pour commencer à automatiser les plannings !
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => {
            const branch = branches.find(b => b.id === t.branchId);
            return (
              <div key={t.id} className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-slate-200 text-sm">{t.name}</h4>
                    <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-black uppercase ${
                      t.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {t.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono mb-3">
                    Succursale : {branch ? branch.name : "Toutes"}
                  </p>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/40 mb-3">
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase font-bold">Début</span>
                      <span className="text-slate-300 text-sm font-bold">{t.startTime}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase font-bold">Fin</span>
                      <span className="text-slate-300 text-sm font-bold">{t.endTime}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase font-bold">Pause</span>
                      <span className="text-slate-300">{t.breakDuration} mins</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase font-bold">Heures Max</span>
                      <span className="text-slate-300">{t.overtimeThreshold}h / shift</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <span className="text-slate-500 text-[9px] uppercase font-bold block mb-1 font-mono">Jours applicables</span>
                    <div className="flex flex-wrap gap-1">
                      {t.workingDays?.map(d => (
                        <span key={d} className="text-[9px] bg-slate-800/80 text-slate-300 px-1.5 py-0.5 rounded">
                          {d.substring(0, 3)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-900 pt-3">
                  <button
                    onClick={() => openEditForm(t)}
                    className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-900 rounded transition"
                    title="Modifier"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded transition"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="bg-slate-900 border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-800/80 bg-slate-900/50">
              <h3 className="font-bold text-slate-100 flex items-center gap-2 text-xs uppercase tracking-wider">
                <Clock className="w-4 h-4 text-cyan-400" />
                {editingTemplate ? "Modifier le modèle" : "Créer un modèle d'horaire"}
              </h3>
              <button type="button" onClick={() => setIsFormOpen(false)} className="p-1 hover:text-slate-300 text-slate-500 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto font-sans flex-1 space-y-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nom du modèle *</label>
                <input
                  type="text"
                  placeholder="Ex : Équipe Matin Caisse"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Succursale</label>
                  <select
                    value={branchId}
                    onChange={e => setBranchId(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 font-mono outline-none focus:border-cyan-500"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Statut</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 font-mono outline-none focus:border-cyan-500"
                  >
                    <option value="ACTIVE">Actif</option>
                    <option value="INACTIVE">Inactif</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-cyan-500" /> Heure de Début *
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 font-mono outline-none focus:border-cyan-500"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-cyan-500" /> Heure de Fin *
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 font-mono outline-none focus:border-cyan-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pause (Minutes)</label>
                  <input
                    type="number"
                    value={breakDuration}
                    onChange={e => setBreakDuration(Number(e.target.value))}
                    min={0}
                    className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 font-mono outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tolérance (Minutes)</label>
                  <input
                    type="number"
                    value={gracePeriodMinutes}
                    onChange={e => setGracePeriodMinutes(Number(e.target.value))}
                    min={0}
                    className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 font-mono outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Seuil Heures Sup (h)</label>
                  <input
                    type="number"
                    value={overtimeThreshold}
                    onChange={e => setOvertimeThreshold(Number(e.target.value))}
                    min={1}
                    className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 font-mono outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-cyan-500" /> Jours applicables
                </label>
                <div className="grid grid-cols-4 gap-2 bg-slate-950 p-3 rounded border border-slate-800/80">
                  {daysOfWeek.map(d => {
                    const isChecked = workingDays.includes(d);
                    return (
                      <label key={d} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleDay(d)}
                          className="rounded border-slate-800 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-slate-950 bg-slate-950"
                        />
                        <span className="text-xs text-slate-300">{d}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800/80 bg-slate-900/50 flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-xs font-bold rounded text-slate-400 hover:text-slate-200 transition">
                Annuler
              </button>
              <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold px-5 py-2 rounded text-xs transition">
                {editingTemplate ? "Mettre à jour" : "Créer le modèle"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
