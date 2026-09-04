import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Clock, AlertTriangle, CheckCircle2, ShieldCheck, FileText, Send, Calendar, AlertCircle, X, ChevronRight } from "lucide-react";
import { query, onSnapshot, orderBy, limit, collection, where } from "firebase/firestore";
import { db, auth } from "../../../lib/firebase";
import { tenantQuery, realtimeManager } from "../../../services/firestore/realtimeManager";
import { Employee, AttendanceRecord } from "../../../types";
import { AttendanceRepository } from "../../../repositories/AttendanceRepository";
import { motion, AnimatePresence } from "motion/react";
import { 
  calculateAttendanceVariance, 
  formatAttendanceVariance, 
  getAttendanceVarianceColorClass 
} from "../../../lib/attendanceSSOT";

interface MyAttendanceSectionProps {
  employee: Employee;
  attendanceRecords: AttendanceRecord[];
  deptName: string;
  branchName: string;
  tw: any;
}

export const MyAttendanceSection: React.FC<MyAttendanceSectionProps> = ({
  employee,
  attendanceRecords = [],
  deptName,
  branchName,
  tw,
}) => {
  const [showJustificationModal, setShowJustificationModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [justificationNote, setJustificationNote] = useState("");
  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showInlineHistory, setShowInlineHistory] = useState(true);
  const [localRecords, setLocalRecords] = useState<AttendanceRecord[]>([]);

  // Live SSOT Firestore subscription fallback for employee records
  useEffect(() => {
    if (!employee || !auth.currentUser) return;
    const bizId = employee.business_id || (employee as any).businessId;
    if (!bizId || bizId === "undefined" || bizId === "null") return;

    const empId = employee.id;
    const empCode = (employee as any)?.employee_id;
    const empUid = (employee as any)?.firebase_uid;
    const empEmail = employee?.email?.toLowerCase().trim();

    // Query attendance_logs with tenant filter to comply with security rules
    const q = tenantQuery(
      collection(db, "attendance_logs"),
      bizId,
      limit(500)
    );

    const unsub = realtimeManager.subscribe(
      `employee_attendance_logs:${bizId}:${empId || "all"}`,
      q,
      (snap) => {
        const fetched: AttendanceRecord[] = [];
        snap.forEach((docSnap: any) => {
          const d = docSnap.data() as AttendanceRecord;
          const rEmpId = d.employeeId || (d as any).employee_id;
          const rEmail = (d as any).employee_email?.toLowerCase().trim();

          if (
            (empId && rEmpId === empId) ||
            (empCode && rEmpId === empCode) ||
            (empUid && rEmpId === empUid) ||
            (empEmail && rEmail === empEmail)
          ) {
            fetched.push({ id: docSnap.id, ...d });
          }
        });
        setLocalRecords(fetched);
      },
      (err) => {
        console.warn("[MyAttendanceSection] Firestore listener notice:", err);
      }
    );

    return () => unsub();
  }, [employee]);

  // Combined SSOT records with flexible matching
  const myRecords = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();

    (attendanceRecords || []).forEach((r) => {
      if (r && r.id) map.set(r.id, r);
    });

    localRecords.forEach((r) => {
      if (r && r.id) map.set(r.id, r);
    });

    const all = Array.from(map.values());

    const empId = employee?.id;
    const empCode = (employee as any)?.employee_id;
    const empUid = (employee as any)?.firebase_uid;
    const empEmail = employee?.email?.toLowerCase().trim();
    const empName = employee?.name?.toLowerCase().trim();

    return all.filter((r) => {
      if (!r) return false;
      const rEmpId = r.employeeId || (r as any).employee_id;
      const rEmail = (r as any).employee_email?.toLowerCase().trim();
      const rName = (r as any).employeeName?.toLowerCase().trim() || (r as any).employee_name?.toLowerCase().trim();

      return (
        rEmpId === empId ||
        (empCode && rEmpId === empCode) ||
        (empUid && rEmpId === empUid) ||
        (empEmail && rEmail === empEmail) ||
        (attendanceRecords && attendanceRecords.some(a => a.id === r.id))
      );
    }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [attendanceRecords, localRecords, employee]);

  // Summary Metrics
  const totalDays = myRecords.length;
  const lateCount = myRecords.filter(r => r.status === "LATE" || (r.variance && r.variance < 0)).length;
  const overtimeCount = myRecords.filter(r => r.status === "OVERTIME" || (r.variance && r.variance > 0)).length;
  const normalCount = myRecords.filter(r => r.status === "NORMAL").length;

  const handleSubmitJustification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;

    setSending(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      await AttendanceRepository.submitJustification({
        businessId: employee.business_id,
        employeeId: employee.id,
        employeeName: employee.name,
        attendanceId: selectedRecord.id,
        date: selectedRecord.date,
        note: justificationNote,
      });

      setSuccessMsg("Justificatif transmis au service RH et à votre responsable direct.");
      setShowJustificationModal(false);
      setJustificationNote("");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      console.error("Justification submission error:", err);
      setErrorMsg("Erreur lors de la soumission : " + (err.message || "Accès refusé"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6" id="view-attendance-section">
      {/* SUMMARY KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass p-5 rounded-2xl border border-slate-800 space-y-2">
          <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Jours Pointés</span>
          <div className="text-xl font-black text-slate-100 font-mono">{totalDays} Jours</div>
          <p className="text-[10px] text-cyan-400 font-mono">Total enregistrements SSOT</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-slate-800 space-y-2">
          <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Présences Normales</span>
          <div className="text-xl font-black text-emerald-400 font-mono">{normalCount} Jours</div>
          <p className="text-[10px] text-emerald-400 font-mono">Conformité horaire 100%</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-slate-800 space-y-2">
          <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Anomalies / Retards</span>
          <div className="text-xl font-black text-amber-400 font-mono">{lateCount} Incidents</div>
          <p className="text-[10px] text-amber-400 font-mono">Sous vérification ou à justifier</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-slate-800 space-y-2">
          <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Heures Supplémentaires</span>
          <div className="text-xl font-black text-indigo-400 font-mono">{overtimeCount} Sessions</div>
          <p className="text-[10px] text-indigo-400 font-mono">Éligibles aux majorations</p>
        </div>
      </div>

      {/* MESSAGES */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2 font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* ACCESS TRIGGER & INLINE TOGGLE */}
      <div className="glass p-6 rounded-2xl border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
            <Clock className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h4 className="text-slate-200 font-bold text-sm uppercase">Registre de Pointage & Horodatage</h4>
            <p className="text-[10px] font-mono text-slate-500">
              {myRecords.length} pointage{myRecords.length > 1 ? "s" : ""} certifié{myRecords.length > 1 ? "s" : ""} en base SSOT
            </p>
          </div>
        </div>
        <button
          type="button"
          id="btn-view-attendance-history"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowInlineHistory(prev => !prev);
            setShowHistoryModal(true);
          }}
          className="px-6 py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:border-cyan-400/50 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/5 group"
        >
          {showInlineHistory ? "Masquer l'historique" : "Voir l'historique complet"}
          <ChevronRight className={`w-4 h-4 transition-transform ${showInlineHistory ? "rotate-90" : "group-hover:translate-x-0.5"}`} />
        </button>
      </div>

      {/* INLINE HISTORY TABLE */}
      {showInlineHistory && (
        <div className="glass p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider">
                Historique Personnel de Pointage ({myRecords.length})
              </h4>
            </div>
            <button
              onClick={() => setShowHistoryModal(true)}
              className="text-[11px] font-mono text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              Agrandir le registre
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold font-mono text-[10px] uppercase">
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Check-In</th>
                  <th className="pb-3">Check-Out</th>
                  <th className="pb-3">Prévu</th>
                  <th className="pb-3">Réel</th>
                  <th className="pb-3">Variance</th>
                  <th className="pb-3">Statut</th>
                  <th className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {myRecords.length > 0 ? (
                  myRecords.map((record, i) => {
                    const planned = record.plannedHours || 8;
                    const real = record.realHours !== undefined && record.realHours !== null ? record.realHours : (record.checkOut ? 8 : 0);
                    const variance = (record.checkOut || real > 0)
                      ? calculateAttendanceVariance(real, planned)
                      : (record.variance !== undefined ? record.variance : -planned);
                    const isAnomaly = record.status === "LATE" || variance < 0;

                    return (
                      <tr key={i} className="text-slate-300 hover:bg-slate-950/20">
                        <td className="py-3 font-mono font-bold text-slate-200">{record.date}</td>
                        <td className="py-3 font-mono text-cyan-400">{record.checkIn || "--:--"}</td>
                        <td className="py-3 font-mono text-slate-400">{record.checkOut || "En cours"}</td>
                        <td className="py-3 font-mono">{planned}h</td>
                        <td className="py-3 font-mono font-bold text-slate-200">{record.checkOut || real > 0 ? real : 0}h</td>
                        <td className={`py-3 font-mono font-bold ${getAttendanceVarianceColorClass(variance)}`}>
                          {formatAttendanceVariance(variance)}
                        </td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border font-mono uppercase ${
                            record.status === "NORMAL"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : record.status === "LATE"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                          }`}>
                            {record.status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {isAnomaly && (
                            <button
                              onClick={() => {
                                setSelectedRecord(record);
                                setShowJustificationModal(true);
                              }}
                              className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 rounded text-[10px] font-mono transition cursor-pointer"
                            >
                              Justifier
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500 italic font-mono">
                      Aucun pointage enregistré pour le moment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      <AnimatePresence>
        {showHistoryModal && typeof document !== "undefined" && createPortal(
          <div 
            className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-hidden"
            onClick={() => setShowHistoryModal(false)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-[10000]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/10 rounded-lg">
                    <Clock className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 uppercase tracking-widest">Registre SSOT de Pointage</h3>
                    <p className="text-[10px] font-mono text-slate-500">Historique des entrées/sorties certifié</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content - Table */}
              <div className="p-6 overflow-y-auto flex-1">
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-bold font-mono text-[10px] uppercase">
                        <th className="pb-3">Date</th>
                        <th className="pb-3">Check-In</th>
                        <th className="pb-3">Check-Out</th>
                        <th className="pb-3">Prévu</th>
                        <th className="pb-3">Réel</th>
                        <th className="pb-3">Variance</th>
                        <th className="pb-3">Statut</th>
                        <th className="pb-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {myRecords.length > 0 ? (
                        myRecords.map((record, i) => {
                          const planned = record.plannedHours || 8;
                          const real = record.realHours !== undefined && record.realHours !== null ? record.realHours : (record.checkOut ? 8 : 0);
                          const variance = (record.checkOut || real > 0)
                            ? calculateAttendanceVariance(real, planned)
                            : (record.variance !== undefined ? record.variance : -planned);
                          const isAnomaly = record.status === "LATE" || variance < 0;

                          return (
                            <tr key={i} className="text-slate-300 hover:bg-slate-950/20">
                              <td className="py-3 font-mono font-bold text-slate-200">{record.date}</td>
                              <td className="py-3 font-mono text-cyan-400">{record.checkIn || "--:--"}</td>
                              <td className="py-3 font-mono text-slate-400">{record.checkOut || "En cours"}</td>
                              <td className="py-3 font-mono">{planned}h</td>
                              <td className="py-3 font-mono font-bold text-slate-200">{record.checkOut || real > 0 ? real : 0}h</td>
                              <td className={`py-3 font-mono font-bold ${getAttendanceVarianceColorClass(variance)}`}>
                                {formatAttendanceVariance(variance)}
                              </td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border font-mono uppercase ${
                                  record.status === "NORMAL"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : record.status === "LATE"
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                    : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                                }`}>
                                  {record.status}
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                {isAnomaly && (
                                  <button
                                    onClick={() => {
                                      setSelectedRecord(record);
                                      setShowJustificationModal(true);
                                    }}
                                    className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 rounded text-[10px] font-mono transition cursor-pointer"
                                  >
                                    Justifier
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500 italic font-mono">
                            Aucun pointage enregistré.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>

      {/* JUSTIFICATION MODAL */}
      <AnimatePresence>
        {showJustificationModal && selectedRecord && typeof document !== "undefined" && createPortal(
          <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-hidden">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-md w-full space-y-4 text-slate-200 shadow-2xl z-[10000]"
            >
              <h4 className="font-bold text-sm uppercase tracking-tight text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                Soumettre un Justificatif
              </h4>

              <form onSubmit={handleSubmitJustification} className="space-y-4 font-sans text-xs">
                <div>
                  <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1.5">Pointage Concerné</label>
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[11px]">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-amber-400 font-black">{selectedRecord.date}</span>
                      <span className="text-slate-500">Entrée: {selectedRecord.checkIn}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1.5">Explication / Motif</label>
                  <textarea
                    value={justificationNote}
                    onChange={(e) => setJustificationNote(e.target.value)}
                    rows={4}
                    required
                    placeholder="Expliquez la raison du retard ou de l'anomalie..."
                    className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-slate-200 outline-none focus:border-amber-500 transition-colors text-xs"
                  />
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all shadow-lg active:scale-[0.98]"
                  >
                    <Send className="w-4 h-4" />
                    {sending ? "Envoi..." : "Soumettre le justificatif"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowJustificationModal(false)}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>
    </div>
  );
};
