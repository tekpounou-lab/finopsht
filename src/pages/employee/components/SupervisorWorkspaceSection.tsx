import React, { useState } from "react";
import { Users, CheckCircle2, XCircle, Clock, Calendar, ShieldCheck, ShieldAlert, AlertCircle, Search, Filter, Eye, X } from "lucide-react";
import { Employee, LeaveRecord, AttendanceRecord, Shift } from "../../../types";
import { LeaveRepository } from "../../../repositories/LeaveRepository";
import { motion, AnimatePresence } from "motion/react";

interface SupervisorWorkspaceSectionProps {
  currentSupervisor: Employee;
  employees: Employee[];
  leaves: LeaveRecord[];
  attendanceRecords: AttendanceRecord[];
  shifts: Shift[];
  departments: any[];
  branches: any[];
  tw: any;
}

export const SupervisorWorkspaceSection: React.FC<SupervisorWorkspaceSectionProps> = ({
  currentSupervisor,
  employees,
  leaves,
  attendanceRecords,
  shifts,
  departments,
  branches,
  tw,
}) => {
  const [activeTab, setActiveTab] = useState<"LEAVES" | "ATTENDANCE" | "TEAM" | "SCHEDULE">("LEAVES");
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const isFr = true; // Defaulting to FR as in the banner
  
  // Filter team members: employees assigned to supervisor or in the supervisor's department
  const myTeam = employees.filter(e => {
    // If managerId matches supervisor id
    if (e.managerId && e.managerId === currentSupervisor.id) return true;
    // If in the same department and not the supervisor
    if (e.departmentId && e.departmentId === currentSupervisor.departmentId && e.id !== currentSupervisor.id) return true;
    // If supervisor role is MANAGER or OWNER or ADMIN, show all or branch
    if (currentSupervisor.role === "OWNER" || currentSupervisor.role === "SUPER_ADMIN") return true;
    if (currentSupervisor.role === "MANAGER" && e.branchId === currentSupervisor.branchId) return true;
    return false;
  });

  const teamIds = new Set(myTeam.map(e => e.id));

  // Team Leave Requests
  const teamLeaves = leaves.filter(l => teamIds.has(l.employeeId) || l.business_id === currentSupervisor.business_id);
  const pendingLeaves = teamLeaves.filter(l => l.status === "PENDING" || l.status === "SUBMITTED" || l.status === "MANAGER_REVIEW");

  // Today's Date YYYY-MM-DD
  const todayStr = new Date().toISOString().split("T")[0];
  const teamAttendanceToday = attendanceRecords.filter(a => a.date === todayStr && teamIds.has(a.employeeId));
  const presentCount = teamAttendanceToday.filter(a => a.checkIn).length;

  const teamShifts = shifts.filter(s => teamIds.has(s.employeeId));

  // Approve Leave Request
  const handleApproveLeave = async (leave: LeaveRecord) => {
    if (leave.employeeId === currentSupervisor.id || (leave as any).employee_id === currentSupervisor.id) {
      setErrorMsg("Règle de séparation des pouvoirs : Vous ne pouvez pas valider votre propre demande de congé. L'aval de votre supérieur hiérarchique est requis.");
      return;
    }

    setProcessingId(leave.id);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      await LeaveRepository.evaluateLeave({
        businessId: currentSupervisor.business_id,
        leaveId: leave.id,
        action: "APPROVE",
        actor: {
          id: currentSupervisor.id,
          name: currentSupervisor.name,
          role: currentSupervisor.role
        }
      });

      setSuccessMsg(`Demande de congé de ${leave.employeeName} approuvée avec succès.`);
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      console.error("Error approving leave:", err);
      setErrorMsg("Erreur lors de l'approbation : " + (err.message || "Accès refusé"));
    } finally {
      setProcessingId(null);
    }
  };

  // Reject Leave Request
  const handleRejectLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeave) return;

    if (selectedLeave.employeeId === currentSupervisor.id || (selectedLeave as any).employee_id === currentSupervisor.id) {
      setErrorMsg("Règle de séparation des pouvoirs : Vous ne pouvez pas refuser votre propre demande de congé. L'aval de votre supérieur hiérarchique est requis.");
      return;
    }

    setProcessingId(selectedLeave.id);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      await LeaveRepository.evaluateLeave({
        businessId: currentSupervisor.business_id,
        leaveId: selectedLeave.id,
        action: "REJECT",
        rejectionReason,
        actor: {
          id: currentSupervisor.id,
          name: currentSupervisor.name,
          role: currentSupervisor.role
        }
      });

      setSuccessMsg(`Demande de congé de ${selectedLeave.employeeName} refusée.`);
      setRejectModalOpen(false);
      setSelectedLeave(null);
      setRejectionReason("");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      console.error("Error rejecting leave:", err);
      setErrorMsg("Erreur lors du refus : " + (err.message || "Accès refusé"));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6" id="view-supervisor-section">
      {/* HEADER BANNER */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/30 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-100 uppercase tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              Espace Superviseur & Management d'Équipe
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono uppercase">
              {currentSupervisor.role}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Supervision directe des collaborateurs, validation des congés et suivi de présence.
          </p>
        </div>

        {/* SUB-TABS NAVIGATION */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-1 flex items-center text-xs font-mono">
          <button
            onClick={() => setActiveTab("LEAVES")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "LEAVES" ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Congés à Valider ({pendingLeaves.length})
          </button>
          <button
            onClick={() => setActiveTab("ATTENDANCE")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "ATTENDANCE" ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Présences Aujourd'hui ({presentCount}/{myTeam.length})
          </button>
          <button
            onClick={() => setActiveTab("TEAM")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "TEAM" ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Membres de l'Équipe ({myTeam.length})
          </button>
          <button
            onClick={() => setActiveTab("SCHEDULE")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "SCHEDULE" ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Planning Équipe
          </button>
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

      {/* KPI STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass p-5 rounded-2xl border border-slate-800 space-y-2">
          <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Collaborateurs Supervisés</span>
          <div className="text-xl font-black text-slate-100 font-mono">{myTeam.length} Employés</div>
          <p className="text-[10px] text-cyan-400 font-mono">Périmètre restreint à votre département/succursale</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-slate-800 space-y-2">
          <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Demandes de Congé en Attente</span>
          <div className="text-xl font-black text-amber-400 font-mono">{pendingLeaves.length} Demandes</div>
          <p className="text-[10px] text-amber-400 font-mono">Nécessitent votre validation</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-slate-800 space-y-2">
          <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Taux de Présence Aujourd'hui</span>
          <div className="text-xl font-black text-emerald-400 font-mono">
            {myTeam.length > 0 ? Math.round((presentCount / myTeam.length) * 100) : 100}%
          </div>
          <p className="text-[10px] text-emerald-400 font-mono">{presentCount} présent(s) sur {myTeam.length}</p>
        </div>
      </div>

      {/* TAB 1: PENDING LEAVES APPROVAL */}
      {activeTab === "LEAVES" && (
        <div className="glass p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-tight flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              Validations de Demandes de Congés Équipe
            </h3>
            <span className="text-xs text-slate-400 font-mono">RBAC Supervisor Active</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold font-mono text-[10px] uppercase">
                  <th className="pb-3">Employé</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Période</th>
                  <th className="pb-3">Motif & Justification</th>
                  <th className="pb-3">Statut</th>
                  <th className="pb-3 text-right">Actions Superviseur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {teamLeaves.length > 0 ? (
                  teamLeaves.map((leave, i) => (
                    <tr key={i} className="text-slate-300 hover:bg-slate-950/20">
                      <td className="py-3 font-mono font-bold text-slate-100">{leave.employeeName}</td>
                      <td className="py-3 font-mono text-cyan-400 font-bold uppercase">{leave.type}</td>
                      <td className="py-3 font-mono text-slate-300">
                        {leave.startDate} au {leave.endDate}
                      </td>
                      <td className="py-3 text-slate-300 max-w-xs truncate">{leave.reason}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border font-mono uppercase ${
                          leave.status === "APPROVED"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : leave.status === "REJECTED"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}>
                          {leave.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {(leave.status === "PENDING" || leave.status === "SUBMITTED" || leave.status === "MANAGER_REVIEW") ? (
                          (leave.employeeId === currentSupervisor.id || (leave as any).employee_id === currentSupervisor.id) ? (
                            <span className="text-[10px] text-amber-400 font-mono italic flex items-center justify-end gap-1" title="Vous ne pouvez pas approuver votre propre demande de congé. L'aval de votre supérieur est requis.">
                              <ShieldAlert className="w-3.5 h-3.5" /> Aval supérieur requis
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                disabled={processingId === leave.id}
                                onClick={() => handleApproveLeave(leave)}
                                className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 rounded text-[10px] font-mono font-bold transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Approuver
                              </button>
                              <button
                                disabled={processingId === leave.id}
                                onClick={() => {
                                  setSelectedLeave(leave);
                                  setRejectModalOpen(true);
                                }}
                                className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-400 rounded text-[10px] font-mono font-bold transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5" /> Refuser
                              </button>
                            </div>
                          )
                        ) : (
                          <span className="text-[10px] font-mono text-slate-500">
                            Traité par {leave.processedBy || "Superviseur"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 italic font-mono">
                      Aucune demande de congé enregistrée pour votre équipe.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: TODAY'S ATTENDANCE */}
      {activeTab === "ATTENDANCE" && (
        <div className="glass p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-tight flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              Suivi des Présences de l'Équipe Aujourd'hui ({todayStr})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold font-mono text-[10px] uppercase">
                  <th className="pb-3">Employé</th>
                  <th className="pb-3">Pointage Entrée</th>
                  <th className="pb-3">Pointage Sortie</th>
                  <th className="pb-3">Heures Réelles</th>
                  <th className="pb-3">Statut Présence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {myTeam.map((emp, i) => {
                  const att = teamAttendanceToday.find(a => a.employeeId === emp.id);

                  return (
                    <tr key={i} className="text-slate-300 hover:bg-slate-950/20">
                      <td className="py-3 font-mono font-bold text-slate-100">{emp.name}</td>
                      <td className="py-3 font-mono text-cyan-400">{att?.checkIn || "--:--"}</td>
                      <td className="py-3 font-mono text-slate-400">{att?.checkOut || "--:--"}</td>
                      <td className="py-3 font-mono">{att?.realHours || 0}h</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border font-mono uppercase ${
                          att?.checkIn
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}>
                          {att?.checkIn ? "PRÉSENT" : "NON POINTÉ"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TEAM DIRECTORY */}
      {activeTab === "TEAM" && (
        <div className="glass p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-tight flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Répertoire des Collaborateurs Directs
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myTeam.map((emp, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-950/60 border border-slate-850 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center font-bold text-slate-950 font-mono">
                    {(emp.name || "EM").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">{emp.name}</h4>
                    <p className="text-[10px] font-mono text-slate-400">{emp.position || "Employé"}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-900 text-[10px] font-mono text-slate-400 space-y-1">
                  <div className="flex justify-between">
                    <span>ID Employé:</span>
                    <span className="text-slate-200 font-bold">{emp.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Email:</span>
                    <span className="text-slate-300">{emp.email}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: TEAM SCHEDULE */}
      {activeTab === "SCHEDULE" && (
        <div className="glass p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-tight flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              Planning de Travail de l'Équipe
            </h3>
            <span className="text-[10px] font-mono text-slate-500">Vue en Lecture Seule</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold font-mono text-[10px] uppercase">
                  <th className="pb-3">Collaborateur</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Horaires</th>
                  <th className="pb-3 text-center">Durée</th>
                  <th className="pb-3">Lieu / Succursale</th>
                  <th className="pb-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {teamShifts.length > 0 ? (
                  teamShifts.sort((a, b) => b.date.localeCompare(a.date)).map((shf, idx) => {
                    const branch = branches.find(b => b.id === shf.branchId);
                    const emp = myTeam.find(e => e.id === shf.employeeId);
                    return (
                      <tr key={idx} className="text-slate-300 hover:bg-slate-950/20">
                        <td className="py-3 font-mono font-bold text-slate-100">{emp?.name || shf.employeeId}</td>
                        <td className="py-3 font-mono">{shf.date}</td>
                        <td className="py-3 font-mono text-cyan-400 font-bold">{shf.startTime} - {shf.endTime}</td>
                        <td className="py-3 font-mono text-center">{shf.plannedHours}h</td>
                        <td className="py-3 text-slate-400">{branch?.name || "Siège"}</td>
                        <td className="py-3">
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                            {shf.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 italic font-mono">
                      Aucun shift planifié pour votre équipe.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      <AnimatePresence>
        {rejectModalOpen && selectedLeave && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRejectModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4 text-slate-200"
            >
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-sm uppercase tracking-tight text-slate-100 flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-400" />
                  Refuser la Demande - {selectedLeave.employeeName}
                </h4>
                <button 
                  onClick={() => setRejectModalOpen(false)}
                  className="p-1 hover:bg-slate-800 rounded-lg transition"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              <form onSubmit={handleRejectLeave} className="space-y-4 font-sans text-xs">
                <div>
                  <p className="text-[10px] text-slate-400 mb-2 italic">
                    Type: <span className="text-cyan-400 font-bold">{selectedLeave.type}</span> | 
                    Période: <span className="text-slate-200">{selectedLeave.startDate} au {selectedLeave.endDate}</span>
                  </p>
                  <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1.5">Motif de Refus Obligatoire</label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={4}
                    required
                    placeholder="Expliquez la raison du refus (ex: charge d'activité élevée, effectif insuffisant)..."
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 outline-none focus:border-rose-500/50 transition-colors"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setRejectModalOpen(false)}
                    className="px-5 py-2.5 bg-slate-950 border border-slate-800 text-slate-400 rounded-xl text-xs font-mono font-bold hover:text-slate-200 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={!!processingId}
                    className="px-5 py-2.5 bg-rose-500/20 border border-rose-500/40 text-rose-400 hover:bg-rose-500/30 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 disabled:opacity-50 transition-all shadow-lg shadow-rose-950/20"
                  >
                    {processingId === selectedLeave.id ? (
                      <Clock className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    Confirmer le Refus
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
