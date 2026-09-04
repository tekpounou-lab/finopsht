import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Calendar, 
  AlertCircle, 
  RefreshCw, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  FileText, 
  AlertTriangle, 
  UploadCloud, 
  ChevronRight, 
  Plus, 
  Trash2,
  XCircle,
  PlusCircle
} from "lucide-react";
import { Employee, LeaveRecord } from "../../../types";
import { LeaveManagementService, LEAVE_TYPES_CONFIG } from "../../../services/workforce/LeaveManagementService";
import { OvertimeService, OvertimeRequest } from "../../../services/workforce/OvertimeService";
import { AttendanceIntegrationService, AbsenceEvent } from "../../../services/workforce/AttendanceIntegrationService";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { realtimeManager } from "../../../services/firestore/realtimeManager";
import { LeaveRequestModal } from "./LeaveRequestModal";
import { AnimatePresence } from "motion/react";

interface LeaveWorkflowManagerProps {
  employee: Employee;
  leaves: LeaveRecord[];
  tw: any;
  onAddLeaveRequestSim: (leave: LeaveRecord) => void;
}

export const LeaveWorkflowManager: React.FC<LeaveWorkflowManagerProps> = ({
  employee,
  leaves,
  tw,
  onAddLeaveRequestSim,
}) => {
  const [activeTab, setActiveTab] = useState<"leaves" | "overtime" | "absences">("leaves");
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  
  // States for Overtime
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [otDate, setOtDate] = useState("");
  const [otStart, setOtStart] = useState("");
  const [otEnd, setOtEnd] = useState("");
  const [otReason, setOtReason] = useState("");
  const [otSubmitting, setOtSubmitting] = useState(false);
  const [otSuccessMsg, setOtSuccessMsg] = useState("");
  const [otErrorMsg, setOtErrorMsg] = useState("");

  // States for Absences / Latenesses
  const [absenceEvents, setAbsenceEvents] = useState<AbsenceEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [justificationText, setJustificationText] = useState("");
  const [justSubmitting, setJustSubmitting] = useState(false);
  const [justSuccessMsg, setJustSuccessMsg] = useState("");
  const [justErrorMsg, setJustErrorMsg] = useState("");

  // Fetch or subscribe to Overtime and Absences in real-time
  useEffect(() => {
    if (!employee?.id || !employee?.business_id) {
      setOvertimes([]);
      setAbsenceEvents([]);
      return;
    }

    // 1. Subscribe to Overtime Requests
    const otQuery = query(
      collection(db, "overtime_requests"),
      where("business_id", "==", employee.business_id),
      where("employeeId", "==", employee.id)
    );
    const unsubscribeOt = realtimeManager.subscribe(
      `overtime_emp:${employee.id}`,
      otQuery,
      (snapshot) => {
        const list = snapshot.docs.map(doc => doc.data() as OvertimeRequest);
        setOvertimes(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      },
      (error) => {
        console.error("Overtime subscription failed:", error);
      }
    );

    // 2. Subscribe to Absence/Delay Events
    const absQuery = query(
      collection(db, "absence_events"),
      where("businessId", "==", employee.business_id),
      where("employeeId", "==", employee.id)
    );
    const unsubscribeAbs = realtimeManager.subscribe(
      `absence_emp:${employee.id}`,
      absQuery,
      (snapshot) => {
        const list = snapshot.docs.map(doc => doc.data() as AbsenceEvent);
        setAbsenceEvents(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      },
      (error) => {
        console.error("Absences subscription failed:", error);
      }
    );

    return () => {
      unsubscribeOt();
      unsubscribeAbs();
    };
  }, [employee?.id, employee?.business_id]);

  // Calculate Used Leave days by type for current year
  const currentYear = new Date().getFullYear();
  const getUsedDays = (type: string) => {
    return leaves
      .filter((l) => {
        const isApproved = l.status === "APPROVED" || l.status === "PAYROLL_SYNCED";
        const isSameType = l.type === type;
        const isSameYear = new Date(l.startDate).getFullYear() === currentYear;
        return isApproved && isSameType && isSameYear;
      })
      .reduce((sum, l) => sum + (l.totalDays || 1), 0);
  };

  // 2. Submit Overtime Handler
  const handleAddOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otDate || !otStart || !otEnd || !otReason) {
      setOtErrorMsg("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    setOtSubmitting(true);
    setOtSuccessMsg("");
    setOtErrorMsg("");
    try {
      await OvertimeService.requestOvertime({
        businessId: employee.business_id,
        employeeId: employee.id,
        date: otDate,
        startTime: otStart,
        endTime: otEnd,
        reason: otReason,
        actor: { id: employee.id, name: employee.name, role: employee.role },
      });
      setOtSuccessMsg("Demande d'heures supplémentaires soumise avec succès.");
      setOtDate("");
      setOtStart("");
      setOtEnd("");
      setOtReason("");
    } catch (err: any) {
      console.error("Error submitting overtime:", err);
      setOtErrorMsg(err.message || "Une erreur est survenue.");
    } finally {
      setOtSubmitting(false);
    }
  };

  // 3. Submit Justification Handler
  const handleAddJustification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || !justificationText) {
      setJustErrorMsg("Veuillez saisir votre justification.");
      return;
    }
    setJustSubmitting(true);
    setJustSuccessMsg("");
    setJustErrorMsg("");
    try {
      await AttendanceIntegrationService.submitJustification({
        businessId: employee.business_id,
        eventId: selectedEventId,
        justification: justificationText,
        actor: { id: employee.id, name: employee.name, role: employee.role },
      });
      setJustSuccessMsg("Votre justification a été soumise pour validation.");
      setJustificationText("");
      setSelectedEventId(null);
    } catch (err: any) {
      console.error("Error submitting justification:", err);
      setJustErrorMsg(err.message || "Une erreur est survenue.");
    } finally {
      setJustSubmitting(false);
    }
  };

  // 4. Cancel Leave Request
  const handleCancelLeave = async (leaveId: string) => {
    if (!window.confirm("Voulez-vous vraiment annuler cette demande de congé ?")) return;
    try {
      await LeaveManagementService.cancelLeave({
        businessId: employee.business_id,
        leaveId,
        actor: { id: employee.id, name: employee.name, role: employee.role },
      });
      // Just let Firestore snapshot or parents update
    } catch (err: any) {
      alert(err.message || "Erreur lors de l'annulation.");
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "APPROVED":
      case "JUSTIFIED":
      case "PAYROLL_SYNCED":
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
      case "REJECTED":
      case "REJECTED_JUSTIFICATION":
        return "bg-rose-500/10 border-rose-500/20 text-rose-400";
      case "CANCELLED":
        return "bg-slate-500/10 border-slate-500/20 text-slate-400";
      default:
        return "bg-amber-500/10 border-amber-500/20 text-amber-400";
    }
  };

  const getAbsenceBadge = (type: string) => {
    switch (type) {
      case "UNEXCUSED_ABSENCE":
        return { label: "Absence injustifiée", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" };
      case "CRITICAL_LATE":
        return { label: "Retard critique", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
      case "EARLY_LEAVE":
        return { label: "Départ anticipé", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" };
      default:
        return { label: "Incident", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" };
    }
  };

  const employeeLeaves = leaves.filter((l) => l.employeeId === employee.id);

  return (
    <div className="flex flex-col gap-5 w-full" id="workspace-leave-section">
      {/* Tab Selectors */}
      <div className="flex bg-slate-950/60 p-1 border border-slate-800/80 rounded-xl max-w-lg self-start">
        <button
          onClick={() => setActiveTab("leaves")}
          className={`px-4 py-2 text-xs font-bold font-mono tracking-wider rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "leaves" 
              ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/10" 
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          CONGÉS
        </button>
        <button
          onClick={() => setActiveTab("overtime")}
          className={`px-4 py-2 text-xs font-bold font-mono tracking-wider rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "overtime" 
              ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/10" 
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          HEURES SUP.
        </button>
        <button
          onClick={() => setActiveTab("absences")}
          className={`px-4 py-2 text-xs font-bold font-mono tracking-wider rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "absences" 
              ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/10" 
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          ABSENCES & RETARDS
        </button>
      </div>

      {/* 1. LEAVES TAB */}
      {activeTab === "leaves" && (
        <div className="space-y-6">
          <AnimatePresence>
            {isLeaveModalOpen && (
              <LeaveRequestModal 
                isOpen={isLeaveModalOpen} 
                onClose={() => setIsLeaveModalOpen(false)}
                employee={employee}
                onAddLeaveRequestSim={onAddLeaveRequestSim}
                language={tw.language || "fr"}
              />
            )}
          </AnimatePresence>

          {/* Leave Balances Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(LEAVE_TYPES_CONFIG).map(([key, config]) => {
              const used = getUsedDays(key);
              const remaining = Math.max(0, config.maxDaysPerYear - used);
              return (
                <div key={key} className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl flex flex-col justify-between">
                  <span className="text-[9px] font-mono font-black uppercase text-slate-400 tracking-wide">
                    {config.name}
                  </span>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-xl font-bold font-mono text-cyan-400">{remaining}</span>
                    <span className="text-[10px] text-slate-500 font-mono">/ {config.maxDaysPerYear} j</span>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 mt-1 italic">
                    {used} j consommés
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-6">
            {/* Header with Request Button */}
            <div className="flex items-center justify-between bg-slate-900/40 p-4 rounded-2xl border border-slate-800/60">
              <div className="space-y-0.5">
                <h3 className="text-xs font-black font-mono text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  GESTION DES CONGÉS
                </h3>
                <p className="text-[10px] text-slate-500 font-mono">Consultez vos soldes et demandez une absence.</p>
              </div>
              <button
                onClick={() => setIsLeaveModalOpen(true)}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[10px] font-black font-mono tracking-widest uppercase rounded-xl flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-lg shadow-cyan-500/10"
              >
                <PlusCircle className="w-4 h-4" />
                {tw.requestLeave || "NOUVELLE DEMANDE"}
              </button>
            </div>

            {/* List */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col">
              <h3 className="text-xs font-black font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-4 pb-2 border-b border-slate-800/50">
                <FileText className="w-4.5 h-4.5 text-cyan-400" />
                HISTORIQUE DES DEMANDES
              </h3>

              {employeeLeaves.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-950/40 border border-dashed border-slate-800/60 rounded-2xl">
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                    {tw.emptyLeaves || "Aucune absence enregistrée"}
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto max-h-[350px] space-y-3 pr-1">
                  {employeeLeaves.map((l) => (
                    <div
                      key={l.id}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/60 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors hover:border-slate-800"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono font-black tracking-widest bg-slate-900 text-cyan-400 px-2 py-0.5 rounded border border-slate-800/80">
                            {LEAVE_TYPES_CONFIG[l.type]?.name || l.type}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {new Date(l.startDate).toLocaleDateString()} - {new Date(l.endDate).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 italic font-sans leading-relaxed">
                          "{l.reason}"
                        </p>
                        {l.rejectionReason && (
                          <p className="text-[11px] text-rose-400 font-mono">
                            Raison du refus: {l.rejectionReason}
                          </p>
                        )}
                        {l.attachmentUrl && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                            <FileText className="w-3 h-3 text-cyan-400" />
                            <span>Doc joint: {l.attachmentUrl}</span>
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <span
                          className={`px-3 py-1 border rounded-full text-[9px] font-bold tracking-widest uppercase ${getStatusStyle(
                            l.status
                          )}`}
                        >
                          {l.status}
                        </span>
                        
                        {(l.status === "SUBMITTED" || l.status === "PENDING" || l.status === "DRAFT") && (
                          <button
                            onClick={() => handleCancelLeave(l.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                            title="Annuler la demande"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. OVERTIME TAB */}
      {activeTab === "overtime" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Submit Overtime Form */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <h3 className="text-xs font-black font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-4 pb-2 border-b border-slate-800/50">
              <Clock className="w-4.5 h-4.5 text-cyan-400" />
              DEMANDE D'HEURES SUPPLÉMENTAIRES
            </h3>

            {otSuccessMsg && (
              <div className="p-3 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{otSuccessMsg}</span>
              </div>
            )}

            {otErrorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{otErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleAddOvertime} className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase font-bold mb-1.5">
                  Date de l'heure supplémentaire
                </label>
                <input
                  type="date"
                  value={otDate}
                  onChange={(e) => setOtDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 text-slate-200 border border-slate-800 rounded-lg text-xs font-mono outline-none focus:border-cyan-500/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase font-bold mb-1.5">
                    Heure de début
                  </label>
                  <input
                    type="time"
                    value={otStart}
                    onChange={(e) => setOtStart(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 text-slate-200 border border-slate-800 rounded-lg text-xs font-mono outline-none focus:border-cyan-500/40"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase font-bold mb-1.5">
                    Heure de fin
                  </label>
                  <input
                    type="time"
                    value={otEnd}
                    onChange={(e) => setOtEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 text-slate-200 border border-slate-800 rounded-lg text-xs font-mono outline-none focus:border-cyan-500/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase font-bold mb-1.5">
                  Motif / Justification
                </label>
                <textarea
                  value={otReason}
                  onChange={(e) => setOtReason(e.target.value)}
                  rows={3}
                  placeholder="Expliquer la tâche effectuée ou le besoin opérationnel..."
                  className="w-full px-3 py-2 bg-slate-950 text-slate-200 border border-slate-800 rounded-lg text-xs outline-none focus:border-cyan-500/40"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={otSubmitting}
                className="w-full py-2.5 bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50 text-xs font-black font-mono tracking-wider uppercase rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-cyan-500/5"
              >
                {otSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                ) : (
                  <Sparkles className="w-4 h-4 text-slate-950" />
                )}
                {otSubmitting ? "TRAITEMENT..." : "SOUMETTRE"}
              </button>
            </form>
          </div>

          {/* Overtime History */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col">
            <h3 className="text-xs font-black font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-4 pb-2 border-b border-slate-800/50">
              <Clock className="w-4.5 h-4.5 text-cyan-400" />
              HISTORIQUE DES HEURES SUPPLÉMENTAIRES
            </h3>

            {overtimes.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-950/40 border border-dashed border-slate-800/60 rounded-2xl">
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                  Aucune heure supplémentaire enregistrée
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[350px] space-y-3 pr-1">
                {overtimes.map((o) => (
                  <div
                    key={o.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/60 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors hover:border-slate-800"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono font-black tracking-widest bg-slate-900 text-cyan-400 px-2 py-0.5 rounded border border-slate-800/80">
                          {o.totalHours} HEURES
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(o.date).toLocaleDateString()} ({o.startTime} - {o.endTime})
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 italic font-sans leading-relaxed">
                        "{o.reason}"
                      </p>
                      {o.approvedBy && (
                        <p className="text-[10px] text-slate-500 font-mono">
                          Approuvé par: {o.approvedBy}
                        </p>
                      )}
                      {o.rejectionReason && (
                        <p className="text-[11px] text-rose-400 font-mono">
                          Raison du refus: {o.rejectionReason}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center">
                      <span
                        className={`px-3 py-1 border rounded-full text-[9px] font-bold tracking-widest uppercase ${getStatusStyle(
                          o.status
                        )}`}
                      >
                        {o.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. ABSENCES & LATENESS TAB */}
      {activeTab === "absences" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Incidents List */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col">
            <h3 className="text-xs font-black font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-4 pb-2 border-b border-slate-800/50">
              <AlertTriangle className="w-4.5 h-4.5 text-cyan-400" />
              REGISTRE DES RETARDS & ABSENCES
            </h3>

            {absenceEvents.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-950/40 border border-dashed border-slate-800/60 rounded-2xl">
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                  Félicitations, aucun retard ou absence à signaler !
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[350px] space-y-3 pr-1">
                {absenceEvents.map((e) => {
                  const badge = getAbsenceBadge(e.type);
                  return (
                    <div
                      key={e.id}
                      onClick={() => e.status === "PENDING_JUSTIFICATION" && setSelectedEventId(e.id)}
                      className={`p-3.5 rounded-xl bg-slate-950 border transition-all ${
                        selectedEventId === e.id ? "border-cyan-500 bg-slate-950" : "border-slate-800/60 hover:border-slate-800"
                      } ${e.status === "PENDING_JUSTIFICATION" ? "cursor-pointer" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-mono font-black tracking-widest px-2 py-0.5 rounded border ${badge.color}`}>
                            {badge.label}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {new Date(e.date).toLocaleDateString()}
                          </span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 border rounded-full text-[8px] font-bold tracking-widest uppercase ${getStatusStyle(
                            e.status
                          )}`}
                        >
                          {e.status === "PENDING_JUSTIFICATION" ? "À JUSTIFIER" : e.status}
                        </span>
                      </div>

                      <div className="mt-2 text-xs text-slate-300">
                        {e.minutes ? (
                          <p className="font-mono text-[10px] text-slate-400">Durée du décalage: {e.minutes} minutes</p>
                        ) : null}
                        
                        {e.justification ? (
                          <div className="mt-1.5 p-2 rounded bg-slate-900 border border-slate-800/50">
                            <span className="text-[9px] font-mono text-slate-500 block uppercase font-bold">Votre Justification :</span>
                            <p className="text-slate-300 italic">"{e.justification}"</p>
                          </div>
                        ) : (
                          e.status === "PENDING_JUSTIFICATION" && (
                            <p className="text-[10px] text-cyan-400 font-mono mt-1 animate-pulse flex items-center gap-1">
                              <Plus className="w-3 h-3" /> Cliquer pour justifier cette absence
                            </p>
                          )
                        )}

                        {e.justifiedBy && (
                          <p className="text-[9px] text-slate-500 font-mono mt-1 text-right">
                            Validé par: {e.justifiedBy}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Justification Form */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-black font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-4 pb-2 border-b border-slate-800/50">
                <FileText className="w-4.5 h-4.5 text-cyan-400" />
                SOUMETTRE UNE JUSTIFICATION
              </h3>

              {!selectedEventId ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-950/40 border border-dashed border-slate-800/60 rounded-2xl min-h-[200px]">
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                    Sélectionnez un événement en attente de justification à gauche pour rédiger vos explications.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="p-3 mb-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs">
                    <p className="font-mono font-bold">Incident Sélectionné :</p>
                    <p className="mt-1 text-slate-300">
                      {getAbsenceBadge(absenceEvents.find(e => e.id === selectedEventId)?.type || "").label} du{" "}
                      {new Date(absenceEvents.find(e => e.id === selectedEventId)?.date || "").toLocaleDateString()}
                    </p>
                  </div>

                  {justSuccessMsg && (
                    <div className="p-3 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 font-medium">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>{justSuccessMsg}</span>
                    </div>
                  )}

                  {justErrorMsg && (
                    <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 font-medium">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{justErrorMsg}</span>
                    </div>
                  )}

                  <form onSubmit={handleAddJustification} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 uppercase font-bold mb-1.5">
                        Raison / Explication (Fournir des détails clairs)
                      </label>
                      <textarea
                        value={justificationText}
                        onChange={(e) => setJustificationText(e.target.value)}
                        rows={5}
                        placeholder="Veuillez expliquer de manière professionnelle les raisons de ce retard ou de cette absence..."
                        className="w-full px-3 py-2 bg-slate-950 text-slate-200 border border-slate-800 rounded-lg text-xs outline-none focus:border-cyan-500/40"
                      ></textarea>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setSelectedEventId(null); setJustificationText(""); }}
                        className="px-4 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 text-xs font-mono rounded-xl transition-colors cursor-pointer"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={justSubmitting}
                        className="flex-1 py-2.5 bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50 text-xs font-black font-mono tracking-wider uppercase rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {justSubmitting ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-slate-950" />
                        )}
                        {justSubmitting ? "ENVOI..." : "SOUMETTRE LA JUSTIFICATION"}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
