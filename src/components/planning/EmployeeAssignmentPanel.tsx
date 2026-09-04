import React, { useState, useEffect } from 'react';
import { Employee, Branch, Department } from '../../types';
import { ShiftTemplate, EmployeeAssignment, Shift } from './types';
import { ScheduleRepository } from '../../repositories/ScheduleRepository';
import { useShiftTemplates, useEmployeeAssignments } from '../../hooks/useRepositories';
import { toast } from 'sonner';
import { Plus, Trash2, Calendar, RefreshCw, Layers, Sliders, Play, CheckCircle, X } from 'lucide-react';
import { format, addDays, parseISO, isWithinInterval, differenceInDays } from 'date-fns';

interface EmployeeAssignmentPanelProps {
  businessId: string;
  employees: Employee[];
  branches: Branch[];
  departments: Department[];
  onAddForensicLog?: (log: any) => void;
}

export default function EmployeeAssignmentPanel({
  businessId,
  employees,
  branches,
  departments,
  onAddForensicLog
}: EmployeeAssignmentPanelProps) {
  const assignments = useEmployeeAssignments(businessId) as EmployeeAssignment[];
  const templates = useShiftTemplates(businessId) as ShiftTemplate[];
  const [loading, setLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    if (templates.length > 0 && !templateId) {
      setTemplateId(templates[0].id);
      setWeek1Template(templates[0].id);
      setWeek2Template(templates[0].id);
      setWeek3Template(templates[0].id);
    }
  }, [templates]);

  // New Assignment Form State
  const [employeeId, setEmployeeId] = useState('');
  const [branchId, setBranchId] = useState('ALL');
  const [templateId, setTemplateId] = useState('');
  const [assignmentType, setAssignmentType] = useState<'permanent' | 'temporary' | 'rotation'>('temporary');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 14), 'yyyy-MM-dd'));
  const [workingDays, setWorkingDays] = useState<string[]>(['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']);

  // Rotation parameters
  const [rotationWeeks, setRotationWeeks] = useState(2);
  const [week1Template, setWeek1Template] = useState('');
  const [week2Template, setWeek2Template] = useState('');
  const [week3Template, setWeek3Template] = useState('');

  const daysOfWeek = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  // Map French days to JS Date numbers (1: Lundi, ..., 7: Dimanche)
  const dayMapping: Record<string, number> = {
    'Lundi': 1,
    'Mardi': 2,
    'Mercredi': 3,
    'Jeudi': 4,
    'Vendredi': 5,
    'Samedi': 6,
    'Dimanche': 0
  };

  const handleToggleDay = (day: string) => {
    if (workingDays.includes(day)) {
      setWorkingDays(workingDays.filter(d => d !== day));
    } else {
      setWorkingDays([...workingDays, day]);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) {
      toast.error("Veuillez sélectionner un employé.");
      return;
    }
    if (assignmentType !== 'rotation' && !templateId) {
      toast.error("Veuillez choisir un modèle de shift de référence.");
      return;
    }

    const assignmentId = `asgn_${Math.random().toString(36).substring(2, 9)}`;
    const selectedEmp = employees.find(emp => emp.id === employeeId);
    if (!selectedEmp) return;

    // Build assignment doc
    const newAssignment: EmployeeAssignment = {
      id: assignmentId,
      businessId,
      branchId: branchId === 'ALL' ? selectedEmp.branchId : branchId,
      employeeId,
      templateId: assignmentType === 'rotation' ? week1Template : templateId,
      type: assignmentType,
      startDate,
      endDate: assignmentType === 'permanent' ? format(addDays(parseISO(startDate), 90), 'yyyy-MM-dd') : endDate, // permanent generates 90 days
      workingDays,
      status: 'ACTIVE'
    };

    if (assignmentType === 'rotation') {
      newAssignment.rotationCycleWeeks = rotationWeeks;
      newAssignment.rotationTemplates = [week1Template, week2Template];
      if (rotationWeeks > 2) newAssignment.rotationTemplates.push(week3Template);
    }

    try {
      // 1. Save Assignment Config to Firestore
      await ScheduleRepository.saveEmployeeAssignment(newAssignment);

      // 2. Generate and publish shifts matching this assignment parameters! (Module 4 Auto Generator)
      const start = parseISO(newAssignment.startDate);
      const end = parseISO(newAssignment.endDate);
      const diffDays = differenceInDays(end, start);

      const generatedShifts: Shift[] = [];
      let generatedShiftsCount = 0;

      for (let i = 0; i <= diffDays; i++) {
        const currentDate = addDays(start, i);
        const dayOfWeekJS = currentDate.getDay(); // 0 is Sunday, 1 is Monday...
        const dayOfWeekFr = Object.keys(dayMapping).find(k => dayMapping[k] === dayOfWeekJS);

        if (dayOfWeekFr && workingDays.includes(dayOfWeekFr)) {
          // Determine which template applies for this date
          let currentTmplId = templateId;
          
          if (assignmentType === 'rotation' && newAssignment.rotationTemplates) {
            // Calculate week offset
            const weekIndex = Math.floor(i / 7) % rotationWeeks;
            currentTmplId = newAssignment.rotationTemplates[weekIndex] || week1Template;
          }

          const activeTemplate = templates.find(t => t.id === currentTmplId);

          if (activeTemplate) {
            const shiftId = `shf_asgn_${assignmentId}_${format(currentDate, 'yyyy-MM-dd')}`;
            const plannedHours = activeTemplate.overtimeThreshold || 8;

            const shiftPayload: Shift = {
              id: shiftId,
              business_id: businessId,
              employeeId,
              branchId: newAssignment.branchId,
              departmentId: selectedEmp.departmentId,
              date: format(currentDate, 'yyyy-MM-dd'),
              startTime: activeTemplate.startTime,
              endTime: activeTemplate.endTime,
              status: 'SCHEDULED',
              plannedHours,
              templateId: activeTemplate.id,
              notes: `[Génération Auto] Affectation ${assignmentType.toUpperCase()}`
            };

            generatedShifts.push(shiftPayload);
            generatedShiftsCount++;
          }
        }
      }

      if (generatedShifts.length > 0) {
        await ScheduleRepository.bulkSaveShifts(generatedShifts, { id: "system", name: "Auto Generator", role: "SYSTEM" });
      }

      if (onAddForensicLog) {
        onAddForensicLog({
          id: `fLog_${Math.random().toString(36).substring(2, 9)}`,
          timestamp: new Date().toISOString(),
          userId: 'system',
          userName: 'Planning Engine',
          userRole: 'OWNER',
          business_id: businessId,
          action: "WORKFORCE_EVENT",
          beforeState: "{}",
          afterState: JSON.stringify({
            action: "SHIFT_ASSIGNED",
            employeeId,
            assignmentType,
            shiftsGenerated: generatedShiftsCount
          }),
          ipAddress: "127.0.0.1",
          userAgent: "Server-side Engine",
          signature: "verified"
        });
      }

      toast.success(`Affectation configurée ! ${generatedShiftsCount} shifts créés et publiés.`);
      setIsFormOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Échec de la génération automatique.");
    }
  };

  const handleDeleteAssignment = async (asgn: EmployeeAssignment) => {
    if (window.confirm("Voulez-vous supprimer cette affectation ? (Note : les shifts déjà générés resteront inchangés, vous pourrez les supprimer individuellement depuis le planning)")) {
      try {
        await ScheduleRepository.deleteEmployeeAssignment(asgn.id);
        toast.success("Affectation archivée.");
      } catch (err) {
        console.error(err);
        toast.error("Échec de la suppression.");
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-200" id="employee-assignments-portal">
      <div className="flex justify-between items-center bg-slate-900/40 p-4 border border-slate-800/60 rounded-xl">
        <div>
          <h3 className="font-bold text-slate-100 uppercase tracking-wider text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            Affectations Récurrentes & Rotations d'Équipes
          </h3>
          <p className="text-xs text-slate-400 font-light mt-1">
            Gérez les affectations permanentes, temporaires et les roulements complexes de vos équipes sur des périodes définies.
          </p>
        </div>
        <button
          onClick={() => {
            if (templates.length === 0) {
              toast.error("Veuillez d'abord créer un Modèle d'horaire dans l'onglet précédent.");
              return;
            }
            setEmployeeId('');
            setIsFormOpen(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider px-4 py-2 rounded flex items-center gap-1.5 transition"
        >
          <Plus className="w-4 h-4" /> Nouvelle Affectation
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="bg-slate-900/20 border border-slate-800/60 rounded-xl p-8 text-center text-slate-500 text-sm">
          Aucune affectation active configurée.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {assignments.map(a => {
            const emp = employees.find(e => e.id === a.employeeId);
            const template = templates.find(t => t.id === a.templateId);
            const branch = branches.find(b => b.id === a.branchId);

            return (
              <div key={a.id} className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-mono font-black uppercase tracking-wider">
                      {a.type}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Ref: {a.id}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-200 text-sm">{emp ? emp.name : "Employé inconnu"}</h4>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Branche : {branch ? branch.name : "Toutes"} | Base : {template ? template.name : "Sans modèle"}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs border border-slate-800/40 p-2.5 rounded-lg bg-slate-900/30">
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase font-mono font-bold">Du (Début)</span>
                      <span className="text-slate-300 font-bold font-mono">{a.startDate}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase font-mono font-bold">Au (Fin)</span>
                      <span className="text-slate-300 font-bold font-mono">{a.endDate}</span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <span className="text-slate-500 text-[9px] uppercase font-mono font-bold block mb-1">Jours de travail</span>
                    <div className="flex flex-wrap gap-1">
                      {a.workingDays?.map(d => (
                        <span key={d} className="text-[9px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800/60 font-mono">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-900 pt-3 mt-4">
                  <button
                    onClick={() => handleDeleteAssignment(a)}
                    className="text-[10px] text-rose-400 hover:text-rose-300 font-bold uppercase hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Archiver
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE FORM DIALOG */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateAssignment} className="bg-slate-900 border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-800/80 bg-slate-900/50">
              <h3 className="font-bold text-slate-100 flex items-center gap-2 text-xs uppercase tracking-wider">
                <Sliders className="w-4 h-4 text-indigo-400" />
                Moteur d'Affectation & Générateur de Shifts
              </h3>
              <button type="button" onClick={() => setIsFormOpen(false)} className="p-1 hover:text-slate-300 text-slate-500 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto font-sans flex-1 space-y-4 text-xs">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Employé de référence *</label>
                  <select
                    value={employeeId}
                    onChange={e => setEmployeeId(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 outline-none focus:border-indigo-500"
                    required
                  >
                    <option value="">-- Choisir un employé --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Type de Planning *</label>
                  <select
                    value={assignmentType}
                    onChange={e => setAssignmentType(e.target.value as any)}
                    className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 outline-none focus:border-indigo-500 font-mono"
                  >
                    <option value="temporary">Temporaire (Remplacement / CDD)</option>
                    <option value="permanent">Permanent (CDI - Reconduction auto)</option>
                    <option value="rotation">Roulement cyclique (Rotations d'équipes)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Succursale Affectée</label>
                  <select
                    value={branchId}
                    onChange={e => setBranchId(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 font-mono outline-none focus:border-indigo-500"
                  >
                    <option value="ALL">Automatique (Selon profil employé)</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {assignmentType !== 'rotation' ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Modèle de Shift de base *</label>
                  <select
                    value={templateId}
                    onChange={e => setTemplateId(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 outline-none focus:border-indigo-500"
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.startTime} - {t.endTime})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="bg-indigo-950/20 border border-indigo-500/25 p-3.5 rounded-lg space-y-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                    <Layers className="w-3.5 h-3.5" /> Paramétrage du cycle de rotation
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-slate-400 font-bold uppercase">Durée du cycle</label>
                      <select
                        value={rotationWeeks}
                        onChange={e => setRotationWeeks(Number(e.target.value))}
                        className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono text-[11px]"
                      >
                        <option value={2}>2 Semaines (Alternance)</option>
                        <option value={3}>3 Semaines (Trois équipes)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-slate-400 font-bold uppercase">Modèle Semaine 1</label>
                      <select
                        value={week1Template}
                        onChange={e => setWeek1Template(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-[11px]"
                      >
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-slate-400 font-bold uppercase">Modèle Semaine 2</label>
                      <select
                        value={week2Template}
                        onChange={e => setWeek2Template(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-[11px]"
                      >
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>

                    {rotationWeeks > 2 && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase">Modèle Semaine 3</label>
                        <select
                          value={week3Template}
                          onChange={e => setWeek3Template(e.target.value)}
                          className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-[11px]"
                        >
                          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Date de Début *</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 outline-none focus:border-indigo-500 font-mono"
                    required
                  />
                </div>

                {assignmentType !== 'permanent' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Date de Fin *</label>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 outline-none focus:border-indigo-500 font-mono"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Jours travaillés hebdomadaires</label>
                <div className="grid grid-cols-4 gap-2 bg-slate-950 p-3 rounded border border-slate-800/80">
                  {daysOfWeek.map(d => {
                    const isChecked = workingDays.includes(d);
                    return (
                      <label key={d} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleDay(d)}
                          className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
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
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2 rounded text-xs transition flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5" /> Générer & Publier Planning
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
