import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Calendar, 
  AlertCircle, 
  RefreshCw, 
  Sparkles, 
  CheckCircle2, 
  UploadCloud,
  X
} from "lucide-react";
import { Employee, LeaveRecord } from "../../../types";
import { LeaveManagementService, LEAVE_TYPES_CONFIG } from "../../../services/workforce/LeaveManagementService";
import { motion, AnimatePresence } from "motion/react";

const leaveSchema = z.object({
  type: z.enum(["ANNUAL_LEAVE", "SICK_LEAVE", "SPECIAL_LEAVE", "MATERNITY_LEAVE", "UNPAID_LEAVE"]),
  startDate: z.string().min(1, { message: "Date de début requise." }),
  endDate: z.string().min(1, { message: "Date de fin requise." }),
  reason: z.string().min(3, { message: "Le motif doit faire au moins 3 caractères." }).max(200),
  attachmentUrl: z.string().optional(),
}).refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
  message: "La date de fin doit être supérieure ou égale à la date de début.",
  path: ["endDate"],
});

type LeaveFormValues = z.infer<typeof leaveSchema>;

interface LeaveRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee;
  onAddLeaveRequestSim: (leave: LeaveRecord) => void;
  language: "fr" | "ht" | "en";
}

export const LeaveRequestModal: React.FC<LeaveRequestModalProps> = ({
  isOpen,
  onClose,
  employee,
  onAddLeaveRequestSim,
  language
}) => {
  const [submitting, setSubmitting] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState("");
  const [errorMsg, setErrorMsg] = React.useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LeaveFormValues>({
    resolver: zodResolver(leaveSchema),
    defaultValues: {
      type: "ANNUAL_LEAVE",
      startDate: "",
      endDate: "",
      reason: "",
      attachmentUrl: "",
    },
  });

  const onSubmitForm = async (data: LeaveFormValues) => {
    setSubmitting(true);
    setSuccessMsg("");
    setErrorMsg("");
    try {
      const result = await LeaveManagementService.requestLeave({
        businessId: employee.business_id,
        employeeId: employee.id,
        leaveType: data.type,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
        attachmentUrl: data.attachmentUrl,
        actor: { id: employee.id, name: employee.name, role: employee.role },
      });

      onAddLeaveRequestSim({
        id: result.id,
        business_id: result.business_id,
        employeeId: result.employeeId,
        employeeName: result.employeeName,
        type: result.type,
        startDate: result.startDate,
        endDate: result.endDate,
        reason: result.reason,
        status: result.status,
      } as LeaveRecord);

      setSuccessMsg(language === "fr" ? "Demande soumise avec succès." : language === "ht" ? "Demann voye ak siksè." : "Request submitted successfully.");
      reset();
      setTimeout(() => {
        setSuccessMsg("");
        onClose();
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[1000] flex items-center justify-center p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 md:p-8"
      >
        <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
          <h3 className="text-sm font-black font-mono text-cyan-400 uppercase tracking-widest flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {language === "fr" ? "FORMULER UNE DEMANDE DE CONGÉ" : language === "ht" ? "FÈ YON DEMANN KONJÉ" : "REQUEST A LEAVE"}
          </h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {successMsg && (
          <div className="p-4 mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-3 font-bold animate-in fade-in slide-in-from-top-1">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 mb-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-3 font-bold animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-slate-500 uppercase font-black tracking-wider ml-1">
                Type de congé
              </label>
              <select
                {...register("type")}
                className="w-full h-11 bg-slate-950 border border-slate-800 rounded-xl px-4 text-xs font-mono text-slate-200 focus:border-cyan-500/50 outline-none appearance-none"
              >
                {Object.entries(LEAVE_TYPES_CONFIG).map(([key, value]) => (
                  <option key={key} value={key}>{value.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-slate-500 uppercase font-black tracking-wider ml-1">
                Pièce Jointe (Optionnel)
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Lien justificatif..."
                  {...register("attachmentUrl")}
                  className="w-full h-11 bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 text-xs font-mono text-slate-200 focus:border-cyan-500/50 outline-none"
                />
                <UploadCloud className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-600" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-slate-500 uppercase font-black tracking-wider ml-1">
                Date de début
              </label>
              <input
                type="date"
                {...register("startDate")}
                className="w-full h-11 bg-slate-950 border border-slate-800 rounded-xl px-4 text-xs font-mono text-slate-200 focus:border-cyan-500/50 outline-none uppercase"
              />
              {errors.startDate && (
                <p className="text-[10px] text-rose-400 font-mono flex items-center gap-1 mt-1 ml-1">
                  <AlertCircle className="w-3 h-3" /> {errors.startDate.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-slate-500 uppercase font-black tracking-wider ml-1">
                Date de fin
              </label>
              <input
                type="date"
                {...register("endDate")}
                className="w-full h-11 bg-slate-950 border border-slate-800 rounded-xl px-4 text-xs font-mono text-slate-200 focus:border-cyan-500/50 outline-none uppercase"
              />
              {errors.endDate && (
                <p className="text-[10px] text-rose-400 font-mono flex items-center gap-1 mt-1 ml-1">
                  <AlertCircle className="w-3 h-3" /> {errors.endDate.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-slate-500 uppercase font-black tracking-wider ml-1">
              Motif de l'absence
            </label>
            <textarea
              {...register("reason")}
              rows={4}
              placeholder="Veuillez préciser la raison de votre demande..."
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-slate-200 focus:border-cyan-500/50 outline-none resize-none"
            />
            {errors.reason && (
              <p className="text-[10px] text-rose-400 font-mono flex items-center gap-1 mt-1 ml-1">
                <AlertCircle className="w-3 h-3" /> {errors.reason.message}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-black font-mono tracking-widest uppercase rounded-2xl transition-all active:scale-95"
            >
              {language === "fr" ? "Annuler" : language === "ht" ? "Anile" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-[2] h-12 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black font-mono tracking-widest uppercase rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              {submitting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {submitting ? "ENVOI..." : language === "fr" ? "Soumettre" : language === "ht" ? "Voye" : "Submit"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
