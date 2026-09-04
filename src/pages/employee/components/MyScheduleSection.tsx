import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, Clock, MapPin, RefreshCw, Send, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ScheduleRepository } from "../../../repositories/ScheduleRepository";
import { Employee, Shift } from "../../../types";

interface MyScheduleSectionProps {
  employee: Employee;
  shifts: Shift[];
  branchName: string;
  deptName: string;
  tw: any;
}

export const MyScheduleSection: React.FC<MyScheduleSectionProps> = ({
  employee,
  shifts,
  branchName,
  deptName,
  tw,
}) => {
  const [viewMode, setViewMode] = useState<"WEEK" | "MONTH">("WEEK");
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [swapReason, setSwapReason] = useState("");
  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Filter employee's shifts
  const myShifts = shifts.filter(s => s.employeeId === employee.id);

  const handleRequestSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShift) return;

    setSending(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      await ScheduleRepository.createShiftChangeRequest({
        business_id: employee.business_id,
        employeeId: employee.id,
        employeeName: employee.name,
        shiftId: selectedShift.id,
        shiftDate: selectedShift.startTime ? selectedShift.startTime.split("T")[0] : new Date().toISOString().split("T")[0],
        reason: swapReason,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      });

      setSuccessMsg("Demande de permutation/modification de shift transmise à votre responsable.");
      setShowSwapModal(false);
      setSwapReason("");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      console.error("Shift change request error:", err);
      setErrorMsg("Erreur lors de l'envoi de la demande : " + (err.message || "Accès refusé"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6" id="view-schedule-section">
      {/* HEADER WITH CONTROLS */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-indigo-950/30 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 uppercase tracking-tight flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            Mon Planning & Plages Horaires
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Affectations enregistrées dans le moteur de planning FINOPS ERP.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-1 flex items-center text-xs font-mono">
            <button
              onClick={() => setViewMode("WEEK")}
              className={`px-3 py-1.5 rounded-lg transition ${
                viewMode === "WEEK" ? "bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Vue Semaine
            </button>
            <button
              onClick={() => setViewMode("MONTH")}
              className={`px-3 py-1.5 rounded-lg transition ${
                viewMode === "MONTH" ? "bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Vue Mois
            </button>
          </div>
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

      {/* SCHEDULE LIST GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {myShifts.length > 0 ? (
          myShifts.map((shift, i) => {
            const startDate = shift.startTime ? new Date(shift.startTime) : new Date();
            const endDate = shift.endTime ? new Date(shift.endTime) : new Date();

            return (
              <div key={i} className="glass p-5 rounded-2xl border border-slate-800 space-y-4 relative group hover:border-indigo-500/40 transition-all duration-300">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-indigo-500/5 border border-indigo-500/10">
                      {startDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                    </span>
                    <h4 className="text-lg font-black text-slate-100 tracking-tight">
                      {startDate.getHours() < 12 ? "Service du Matin" : "Service de l'Après-midi"}
                    </h4>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase font-mono tracking-tighter">
                      CONFIRMÉ
                    </span>
                    <span className="text-[9px] font-mono text-slate-500 italic">#{shift.id.slice(0, 6)}</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-900/50 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold">
                      <Clock className="w-4 h-4" />
                      <span>{startDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="w-8 h-px bg-slate-800" />
                    <div className="flex items-center gap-2 text-indigo-400 font-bold">
                      <span>{endDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                      <Clock className="w-4 h-4" />
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t border-slate-900 flex justify-center">
                    <span className="text-[11px] font-black text-slate-300 uppercase tracking-wider">
                      {shift.plannedHours} Heures de Travail
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 px-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 truncate">
                      <MapPin className="w-3 h-3 text-slate-500" />
                      {branchName} • {deptName}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedShift(shift);
                    setShowSwapModal(true);
                  }}
                  className="w-full py-2.5 bg-slate-900/50 hover:bg-slate-900 text-indigo-400 text-[10px] font-mono font-bold rounded-xl border border-slate-800 hover:border-indigo-500/30 transition-all cursor-pointer flex items-center justify-center gap-2 group-hover:bg-slate-900"
                >
                  <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" /> 
                  Échanger ce shift
                </button>
              </div>
            );
          })
        ) : (
          <div className="col-span-full glass p-8 rounded-2xl border border-slate-800 text-center space-y-2">
            <Calendar className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400 font-mono">
              Aucun shift spécifique assigné sur cette période. Horaire standard : 08:00 - 17:00.
            </p>
          </div>
        )}
      </div>

      {/* SHIFT CHANGE MODAL */}
      <AnimatePresence>
        {showSwapModal && selectedShift && typeof document !== "undefined" && createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSwapModal(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-md w-full space-y-4 text-slate-200 shadow-2xl z-[10000]"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm uppercase tracking-tight text-slate-100 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-indigo-400" />
                  Demande d'Ajustement
                </h4>
                <button
                  onClick={() => setShowSwapModal(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRequestSwap} className="space-y-4 font-sans text-xs">
                <div>
                  <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1.5">Shift Concerné</label>
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[11px]">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-indigo-400 font-black">#{selectedShift.id?.slice(0, 8) || "N/A"}</span>
                      <span className="text-slate-500">{selectedShift.startTime ? selectedShift.startTime.split("T")[0] : ""}</span>
                    </div>
                    <div className="text-xs font-bold text-slate-400">
                      {selectedShift.startTime?.includes("T") ? selectedShift.startTime.split("T")[1]?.slice(0, 5) : selectedShift.startTime || ""} - {selectedShift.endTime?.includes("T") ? selectedShift.endTime.split("T")[1]?.slice(0, 5) : selectedShift.endTime || ""}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1.5">Motif / Justification</label>
                  <textarea
                    value={swapReason}
                    onChange={(e) => setSwapReason(e.target.value)}
                    rows={4}
                    required
                    placeholder="Expliquez pourquoi vous demandez ce changement..."
                    className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-slate-200 outline-none focus:border-indigo-500 transition-colors text-xs"
                  />
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all shadow-lg active:scale-[0.98]"
                  >
                    <Send className="w-4 h-4" />
                    {sending ? "Transmission..." : "Envoyer la demande"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSwapModal(false)}
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
