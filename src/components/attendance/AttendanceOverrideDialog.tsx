import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Employee, AttendanceRecord, Role } from '../../types';
import { generateSignature, getLocalIP } from '../../data';
import { calculateAttendanceVariance } from '../../lib/attendanceSSOT';

interface AttendanceOverrideDialogProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  currentRole: Role;
  currentUser?: { name: string; id: string };
  current_business_id: string;
  onSave: (record: AttendanceRecord, reason: string) => Promise<void>;
  onAddForensicLog: (log: any) => void;
}

export default function AttendanceOverrideDialog({
  isOpen,
  onClose,
  employees,
  attendanceRecords,
  currentRole,
  currentUser,
  current_business_id,
  onSave,
  onAddForensicLog
}: AttendanceOverrideDialogProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [overrideStatus, setOverrideStatus] = useState("NORMAL");
  const [overrideRealHours, setOverrideRealHours] = useState(8);
  const [overrideReason, setOverrideReason] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId || !overrideReason.trim()) return;

    if (currentRole !== 'OWNER' && currentRole !== 'MANAGER') {
      alert("Seuls les gérants ou propriétaires peuvent effectuer une dérogation.");
      return;
    }

    setLoading(true);
    try {
      const emp = employees.find(e => e.id === selectedEmployeeId);
      if (!emp) throw new Error("Employé non trouvé");

      let existingRecord = attendanceRecords.find(r => r.employeeId === selectedEmployeeId && r.date === selectedDate);
      
      const newRecord: AttendanceRecord = existingRecord ? { ...existingRecord } : {
        id: "att_ovr_" + Math.random().toString(36).substring(2, 9),
        employeeId: emp.id,
        employeeName: emp.name,
        business_id: emp.business_id,
        branchId: emp.branchId,
        date: selectedDate,
        checkIn: existingRecord?.checkIn || "08:00:00",
        checkOut: existingRecord?.checkOut || "16:00:00",
        plannedHours: existingRecord?.plannedHours || 8,
        realHours: overrideRealHours,
        variance: calculateAttendanceVariance(overrideRealHours, existingRecord?.plannedHours || 8),
        status: overrideStatus as any,
        overrideBy: currentRole,
        overrideReason: overrideReason
      };

      if (existingRecord) {
        newRecord.realHours = overrideRealHours;
        newRecord.variance = calculateAttendanceVariance(overrideRealHours, newRecord.plannedHours);
        newRecord.status = overrideStatus as any;
        newRecord.overrideBy = currentRole;
        newRecord.overrideReason = overrideReason;
      }

      await onSave(newRecord, overrideReason);
      
      onAddForensicLog({
        id: "f_" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        userId: currentRole === "OWNER" ? "e1" : "e2",
        userName: currentUser?.name || "Manager",
        userRole: currentRole,
        business_id: current_business_id,
        action: "ATTENDANCE_OVERRIDE_CREATED",
        beforeState: JSON.stringify(existingRecord || {}),
        afterState: JSON.stringify(newRecord),
        ipAddress: getLocalIP(),
        userAgent: window.navigator.userAgent,
        signature: generateSignature({ oldState: JSON.stringify(existingRecord || {}), newState: JSON.stringify(newRecord) }),
      });

      onClose();
    } catch (error) {
      console.error(error);
      alert("Erreur lors de la dérogation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-8 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] w-full max-w-lg animate-in zoom-in-95 duration-300">
        <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-5">
          <div className="flex flex-col">
            <h5 className="text-[11px] font-black text-amber-500 flex items-center gap-3 uppercase tracking-[0.2em]">
              <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              Dérogation de Pointage
            </h5>
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-2 ml-12">Action Forensic & Audit Requis</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-all active:scale-95 border border-slate-700"
          >
             <X className="w-6 h-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase">Employé</label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 outline-none focus:border-amber-500 text-sm"
              required
            >
              <option value="">-- Sélectionner --</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase">Date de référence</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 outline-none focus:border-amber-500 font-mono text-sm uppercase"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase">État</label>
              <select
                value={overrideStatus}
                onChange={(e) => setOverrideStatus(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 outline-none focus:border-amber-500 text-sm"
              >
                <option value="NORMAL">NORMAL (Présent)</option>
                <option value="LATE">LATE (En retard)</option>
                <option value="ABSENT">ABSENT</option>
                <option value="EXCUSED">EXCUSED (Absence excusée)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase">Heures Travaillées</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="24"
                value={overrideRealHours}
                onChange={(e) => setOverrideRealHours(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 font-mono outline-none focus:border-amber-500 text-sm"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase">Justification (Obligatoire)</label>
            <textarea
              placeholder="Raison du forçage manuel (sera audité)..."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 min-h-[60px] outline-none font-sans focus:border-amber-500 text-sm"
              required
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !overrideReason.trim() || !selectedEmployeeId}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-amber-950 text-xs font-bold rounded disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? "Requête en cours..." : "Sauvegarder et Auditer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
