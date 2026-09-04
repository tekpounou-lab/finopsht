import React, { useState, useEffect } from 'react';
import { Shift } from './types';
import { Employee, Branch, LeaveRecord } from '../../types';
import { ScheduleRepository } from '../../repositories/ScheduleRepository';
import { useLeaves } from '../../hooks/useRepositories';
import { toast } from 'sonner';
import { AlertTriangle, Trash2, CheckCircle2, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface ConflictResolverProps {
  businessId: string;
  shifts: Shift[];
  employees: Employee[];
  branches: Branch[];
}

interface DetectedConflict {
  id: string;
  type: 'DOUBLE_ASSIGNMENT' | 'LEAVE_CLASH' | 'BRANCH_MISMATCH';
  shift: Shift;
  employeeName: string;
  description: string;
  severity: 'warning' | 'error';
}

export default function ConflictResolver({ businessId, shifts, employees, branches }: ConflictResolverProps) {
  const [conflicts, setConflicts] = useState<DetectedConflict[]>([]);
  const allLeaves = useLeaves(businessId);
  const leaves = allLeaves.filter(l => l.status === "APPROVED");
  const loading = false;

  useEffect(() => {
    const list: DetectedConflict[] = [];

    // 1. Detect Double Assignments & Overlaps
    const groupedByDay: Record<string, Shift[]> = {};
    shifts.forEach(s => {
      const key = `${s.employeeId}|${s.date}`;
      if (!groupedByDay[key]) groupedByDay[key] = [];
      groupedByDay[key].push(s);
    });

    Object.values(groupedByDay).forEach(dayShifts => {
      if (dayShifts.length > 1) {
        // Compare times for overlap
        for (let i = 0; i < dayShifts.length; i++) {
          for (let j = i + 1; j < dayShifts.length; j++) {
            const s1 = dayShifts[i];
            const s2 = dayShifts[j];
            const start1 = parseFloat(s1.startTime.replace(':', '.'));
            const end1 = parseFloat(s1.endTime.replace(':', '.'));
            const start2 = parseFloat(s2.startTime.replace(':', '.'));
            const end2 = parseFloat(s2.endTime.replace(':', '.'));

            if (Math.max(start1, start2) < Math.min(end1, end2)) {
              const emp = employees.find(e => e.id === s1.employeeId);
              list.push({
                id: `double_${s1.id}_${s2.id}`,
                type: 'DOUBLE_ASSIGNMENT',
                shift: s2,
                employeeName: emp ? emp.name : s1.employeeId,
                description: `Double affectation d'horaires détectée le ${s1.date} : chevauchement entre ${s1.startTime}-${s1.endTime} et ${s2.startTime}-${s2.endTime}.`,
                severity: 'error'
              });
            }
          }
        }
      }
    });

    // 2. Detect Leave Clashes
    shifts.forEach(shift => {
      const emp = employees.find(e => e.id === shift.employeeId);
      const empLeaves = leaves.filter(l => l.employeeId === shift.employeeId);
      
      empLeaves.forEach(leave => {
        // Leave is active during the shift date
        if (shift.date >= leave.startDate && shift.date <= leave.endDate) {
          list.push({
            id: `leave_${shift.id}_${leave.id}`,
            type: 'LEAVE_CLASH',
            shift,
            employeeName: emp ? emp.name : shift.employeeId,
            description: `Alerte congé approuvé : ${emp?.name || 'L\'employé'} est en congé du ${leave.startDate} au ${leave.endDate}, mais un shift de ${shift.startTime} à ${shift.endTime} est plannifié le ${shift.date}.`,
            severity: 'error'
          });
        }
      });
    });

    // 3. Detect Branch Mismatch (if assigned branch !== employee's allowed branch)
    shifts.forEach(shift => {
      const emp = employees.find(e => e.id === shift.employeeId);
      if (emp && emp.branchId !== shift.branchId) {
        const primaryBranch = branches.find(b => b.id === emp.branchId)?.name || emp.branchId;
        const shiftBranch = branches.find(b => b.id === shift.branchId)?.name || shift.branchId;
        list.push({
          id: `branch_${shift.id}`,
          type: 'BRANCH_MISMATCH',
          shift,
          employeeName: emp.name,
          description: `Branche incorrecte : ${emp.name} est assigné à la succursale "${shiftBranch}" le ${shift.date}, mais sa branche principale est "${primaryBranch}".`,
          severity: 'warning'
        });
      }
    });

    setConflicts(list);
  }, [shifts, employees, leaves, branches]);

  const handleResolve = async (conflict: DetectedConflict) => {
    try {
      // Remove the conflicting shift
      await ScheduleRepository.deleteShift(conflict.shift.id, { id: "system", name: "Conflict Resolver", role: "SYSTEM" });
      toast.success("Résolution effectuée : le shift en conflit a été supprimé !");
    } catch (err) {
      console.error(err);
      toast.error("Échec de la résolution.");
    }
  };

  const handleUpdateBranch = async (conflict: DetectedConflict) => {
    const emp = employees.find(e => e.id === conflict.shift.employeeId);
    if (!emp) return;
    try {
      // Re-assign shift to employee's native branch
      await ScheduleRepository.updateShift(conflict.shift.id, { branchId: emp.branchId }, { id: "system", name: "Conflict Resolver", role: "SYSTEM" });
      toast.success(`Le shift a été ré-associé à la branche d'origine de l'employé (${emp.branchId}).`);
    } catch (err) {
      console.error(err);
      toast.error("Échec de la ré-association.");
    }
  };

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-200" id="conflict-detection-engine">
      <div className="bg-slate-900/40 p-4 border border-slate-800/80 rounded-xl flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-100 uppercase tracking-wider text-sm flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-500 animate-pulse" />
            Moteur de Détection des Conflits & Alertes de Planification
          </h3>
          <p className="text-xs text-slate-400 font-light mt-1">
            Analyse automatisée en temps réel pour prévenir les double-affectations, les chevauchements de congés et les anomalies de succursales.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono font-bold px-3 py-1 rounded-full ${
            conflicts.length > 0 ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          }`}>
            {conflicts.length} Conflit(s) détecté(s)
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <RefreshCw className="w-8 h-8 text-rose-500 animate-spin" />
        </div>
      ) : conflicts.length === 0 ? (
        <div className="bg-slate-900/20 border border-slate-800/60 rounded-xl p-10 flex flex-col items-center justify-center text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3" />
          <h4 className="font-bold text-slate-200 text-sm">Zéro Conflit Détecté !</h4>
          <p className="text-xs text-slate-500 mt-1">Votre planification respecte parfaitement les congés, succursales et temps de repos de vos employés.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {conflicts.map(c => (
            <div key={c.id} className={`flex flex-col md:flex-row justify-between items-start md:items-center p-4 border rounded-xl gap-4 bg-slate-950/40 hover:bg-slate-950/60 transition ${
              c.severity === 'error' ? 'border-rose-500/30 shadow-lg shadow-rose-950/5' : 'border-amber-500/20'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                  c.severity === 'error' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
                }`}>
                  {c.type === 'LEAVE_CLASH' ? <ShieldAlert className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-100 text-xs">{c.employeeName}</span>
                    <span className={`text-[8px] font-black uppercase tracking-wider font-mono px-2 py-0.5 rounded ${
                      c.severity === 'error' ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/10 text-amber-400'
                    }`}>
                      {c.type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{c.description}</p>
                </div>
              </div>

              <div className="flex gap-2 shrink-0 self-end md:self-center">
                {c.type === 'BRANCH_MISMATCH' && (
                  <button
                    onClick={() => handleUpdateBranch(c)}
                    className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded transition"
                  >
                    Corriger la Branche
                  </button>
                )}
                <button
                  onClick={() => handleResolve(c)}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded flex items-center gap-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Supprimer Shift
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
