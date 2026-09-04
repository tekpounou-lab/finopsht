import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Employee, ForensicLog, ERPEvent, Role, LeaveRecord } from "../types";
import { LeaveRepository } from "../repositories/LeaveRepository";
import { LeaveManagementService, LEAVE_TYPES_CONFIG } from "../services/workforce/LeaveManagementService";
import { OvertimeService, OvertimeRequest } from "../services/workforce/OvertimeService";
import { AttendanceIntegrationService, AbsenceEvent } from "../services/workforce/AttendanceIntegrationService";
import { useI18n } from "../i18n";
import { 
  Calendar, 
  Check, 
  X, 
  ShieldAlert, 
  FileText, 
  User, 
  RefreshCw, 
  Sparkles, 
  Clock, 
  AlertTriangle,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { doc, setDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { getDbCollection, auth } from "../lib/firebase";
import { realtimeManager, tenantQuery } from "../services/firestore/realtimeManager";

interface LeaveManagementProps {
  currentRole: Role;
  currentUser?: { name: string; id: string };
  current_business_id: string;
  employees: Employee[];
  leaves: LeaveRecord[];
  onAddEvent: (ev: ERPEvent) => void;
  onAddForensicLog: (log: ForensicLog) => void;
}

const leaveSchema = z.object({
  employeeId: z.string().min(1, { message: "Veuillez sélectionner un employé." }),
  type: z.enum(["ANNUAL_LEAVE", "SICK_LEAVE", "SPECIAL_LEAVE", "MATERNITY_LEAVE", "UNPAID_LEAVE"], { message: "Type de congé invalide." }),
  startDate: z.string().min(1, { message: "Date de début requise." }),
  endDate: z.string().min(1, { message: "Date de fin requise." }),
  reason: z.string().min(3, { message: "Le motif doit faire au moins 3 caractères." }).max(200),
  attachmentUrl: z.string().optional(),
}).refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
  message: "La date de fin doit être supérieure ou égale à la date de début.",
  path: ["endDate"],
});

type LeaveFormValues = z.infer<typeof leaveSchema>;

const leaveDict = {
  fr: {
    description: "Moteur de décision central pour les congés, heures supplémentaires et incidents de présence.",
    submitForm: "Créer une demande de congé (Admin/Manager)",
    employeeRequesting: "Employé Concerné",
    choosePlaceholder: "-- Choisir --",
    startDate: "Date de début",
    endDate: "Date de fin",
    reasonLabel: "Description / Motif",
    vacationPay: "Vacances / Congé Payé",
    sickLeave: "Maladie / SICK",
    personalAffairs: "Affaires Personnelles",
    processing: "Traitement...",
    requestedLeaves: "Arbitrage des Demandes de Congés",
    employeeCol: "Employé",
    typeCol: "Type",
    datesCol: "Dates",
    actionsCol: "Actions",
    fromLabel: "Du ",
    toLabel: "Au ",
    byLabel: "Par ",
    restricted: "Bloqué",
    completed: "Terminé",
    emptyLeaves: "Aucun congé programmé pour cette entreprise.",
    balanceTitle: "Solde de référence contractuel HT après validation du cycle.",
    vacationLabel: "Vacances",
    sickLabel: "Maladie",
    daysCount: "{count} Jrs",
    reject: "Rejeter",
    approve: "Approuver",
    accessBlocked: "⚠️ Droit d'Accès Bloqué : Seul un OWNER, ADMIN ou MANAGER peut statuer sur ces demandes.",
    errors: {
      employeeId: "Veuillez sélectionner un employé.",
      type: "Type de congé invalide.",
      startDate: "Date de début requise.",
      endDate: "Date de fin requise.",
      reasonMin: "Le motif doit faire au moins 3 caractères.",
      endDateInvalid: "La date de fin doit être supérieure ou égale à la date de début."
    }
  },
  ht: {
    description: "Santral desizyon pou konje, lè siplemantè, ak reta anplwaye yo nan biznis la.",
    submitForm: "Kreye yon demann konje (Admin/Manadjè)",
    employeeRequesting: "Anplwaye ki konsène a",
    choosePlaceholder: "-- Chwazi --",
    startDate: "Dat li kòmanse",
    endDate: "Dat li fini",
    reasonLabel: "Rezon / Motif",
    vacationPay: "Vakans / Konje Peye",
    sickLeave: "Konje Maladi / SICK",
    personalAffairs: "Zafè pèsonèl",
    processing: "Ap trete...",
    requestedLeaves: "Desizyon sou Demann Konje yo",
    employeeCol: "Anplwaye",
    typeCol: "Kalite",
    datesCol: "Dat",
    actionsCol: "Aksyon yo",
    fromLabel: "Depi ",
    toLabel: "Rive ",
    byLabel: "Pa ",
    restricted: "Bloke",
    completed: "Fini",
    emptyLeaves: "Pa gen okenn konje planifye pou biznis sa a.",
    balanceTitle: "Rès jou konje ou ka pran pou ane a.",
    vacationLabel: "Vakans",
    sickLabel: "Maladi",
    daysCount: "{count} Jou",
    reject: "Refize",
    approve: "Apwouve",
    accessBlocked: "⚠️ Aksè Bloke : Se yon OWNER oswa MANAGER sèlman ki gen dwa deside sou demann sa yo.",
    errors: {
      employeeId: "Tanpri chwazi yon anplwaye.",
      type: "Kalite konje sa a pa valid.",
      startDate: "Dat pou konje a kòmanse obligatwa.",
      endDate: "Dat pou konje a fini obligatwa.",
      reasonMin: "Motif la dwe genyen omwen 3 karaktè.",
      endDateInvalid: "Dat pou konje a fini an pa ka anvan dat li kòmanse a."
    }
  },
  en: {
    description: "Central decision engine for leaves, overtime hours, and attendance incidents.",
    submitForm: "Create Leave Request (Admin/Manager)",
    employeeRequesting: "Target Employee",
    choosePlaceholder: "-- Choose --",
    startDate: "Start Date",
    endDate: "End Date",
    reasonLabel: "Description / Reason",
    vacationPay: "Vacation / Paid Leave",
    sickLeave: "Sick Leave / SICK",
    personalAffairs: "Personal Affairs",
    processing: "Processing...",
    requestedLeaves: "Leave Requests Arbitration",
    employeeCol: "Employee",
    typeCol: "Type",
    datesCol: "Dates",
    actionsCol: "Actions",
    fromLabel: "From ",
    toLabel: "To ",
    byLabel: "By ",
    restricted: "Restricted",
    completed: "Completed",
    emptyLeaves: "No scheduled leave for this company.",
    balanceTitle: "Standard contractual leave balance after cycle validation.",
    vacationLabel: "Vacation",
    sickLabel: "Sickness",
    daysCount: "{count} Days",
    reject: "Reject",
    approve: "Approve",
    accessBlocked: "⚠️ Access Denied: Only an OWNER, ADMIN, or MANAGER can decide on these requests.",
    errors: {
      employeeId: "Please select an employee.",
      type: "Invalid leave type.",
      startDate: "Start date is required.",
      endDate: "End date is required.",
      reasonMin: "Reason must be at least 3 characters long.",
      endDateInvalid: "End date must be greater than or equal to start date."
    }
  }
};

export default function LeaveManagement({
  currentRole,
  currentUser,
  current_business_id,
  employees,
  leaves,
  onAddEvent,
  onAddForensicLog,
}: LeaveManagementProps) {
  const { t, language } = useI18n();
  const activeLang = (language === 'fr' || language === 'ht' || language === 'en') ? language : 'fr';
  const d = leaveDict[activeLang];

  const [activeTab, setActiveTab] = useState<"leaves" | "overtime" | "absences">("leaves");
  const [loading, setLoading] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Overtime state
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  
  // Absence/Lateness incidents state
  const [absenceEvents, setAbsenceEvents] = useState<AbsenceEvent[]>([]);

  // Subscriptions to overtime and absence justifications
  useEffect(() => {
    if (!current_business_id || current_business_id === "undefined" || current_business_id === "null" || !auth.currentUser) {
      setOvertimes([]);
      setAbsenceEvents([]);
      return;
    }

    // 1. Subscribe to Overtime Requests for this tenant
    const otQuery = tenantQuery(
      getDbCollection("overtime_requests"),
      current_business_id
    );
    const unsubscribeOt = realtimeManager.subscribe(
      `overtime_requests:${current_business_id}`,
      otQuery,
      (snapshot) => {
        const list = snapshot.docs.map(doc => doc.data() as OvertimeRequest);
        setOvertimes(list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
      },
      (error) => {
        console.warn("Overtime manager subscription notice:", error);
      }
    );

    // 2. Subscribe to Absences/Lateness events for this tenant
    const absQuery = tenantQuery(
      getDbCollection("absence_events"),
      current_business_id
    );
    const unsubscribeAbs = realtimeManager.subscribe(
      `absence_events:${current_business_id}`,
      absQuery,
      (snapshot) => {
        const list = snapshot.docs.map(doc => doc.data() as AbsenceEvent);
        setAbsenceEvents(list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
      },
      (error) => {
        console.warn("Absences manager subscription notice:", error);
      }
    );

    return () => {
      unsubscribeOt();
      unsubscribeAbs();
    };
  }, [current_business_id]);

  // Filter employees for current business
  const businessEmployees = employees.filter((e) => e.business_id === current_business_id);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LeaveFormValues>({
    resolver: zodResolver(leaveSchema),
    defaultValues: {
      employeeId: "",
      type: "ANNUAL_LEAVE",
      startDate: "",
      endDate: "",
      reason: "",
      attachmentUrl: "",
    },
  });

  // 1. Submit leave request (Admin/Manager on behalf of employee)
  const onSubmit = async (data: LeaveFormValues) => {
    setLoading(true);
    setSuccessToast(null);
    setErrorToast(null);

    try {
      const selectedEmp = employees.find((e) => e.id === data.employeeId);
      if (!selectedEmp) throw new Error("Veuillez sélectionner un employé.");

      await LeaveManagementService.requestLeave({
        businessId: current_business_id,
        employeeId: data.employeeId,
        leaveType: data.type,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
        attachmentUrl: data.attachmentUrl,
        actor: { id: "admin_panel", name: "Administrateur", role: currentRole },
      });

      reset();
      setSuccessToast("La demande de congé a été enregistrée avec succès.");
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      console.error("Error creating leave request:", err);
      setErrorToast(err.message || "Erreur de validation ou solde insuffisant.");
      setTimeout(() => setErrorToast(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  // Check RBAC Permissions
  const canArbitrate = currentRole === "OWNER" || currentRole === "MANAGER" || (currentRole as string) === "ADMIN" || currentRole === "SUPER_ADMIN";

  // 2. Process / Evaluate Leave Request
  const handleProcessLeave = async (leaveId: string, action: "APPROVED" | "REJECTED") => {
    if (!canArbitrate) {
      alert(d.accessBlocked);
      return;
    }

    const targetLeave = leaves.find((l) => l.id === leaveId);
    if (
      targetLeave &&
      currentUser?.id &&
      (targetLeave.employeeId === currentUser.id || (targetLeave as any).employee_id === currentUser.id)
    ) {
      alert(
        "Règle de séparation des pouvoirs : L'employé ayant formulé la demande de congé ne peut pas l'approuver ou la refuser lui-même. L'aval d'un supérieur hiérarchique est obligatoire."
      );
      return;
    }

    try {
      const serviceAction = action === "APPROVED" ? "APPROVE" : "REJECT";
      await LeaveManagementService.evaluateLeave({
        businessId: current_business_id,
        leaveId,
        action: serviceAction,
        rejectionReason: action === "REJECTED" ? "Refusé par la direction RH" : undefined,
        actor: { id: currentUser?.id || "admin_eval", name: currentUser?.name || "Arbitrage RH", role: currentRole },
      });

      alert(action === "APPROVED" ? "Demande de congé approuvée et validée." : "Demande de congé rejetée.");
    } catch (err: any) {
      console.error("Error updating leave request:", err);
      alert(err.message || "Erreur lors du traitement de la demande de congé.");
    }
  };

  // 3. Process / Evaluate Overtime Request
  const handleProcessOvertime = async (requestId: string, action: "APPROVE" | "REJECT") => {
    if (!canArbitrate) {
      alert(d.accessBlocked);
      return;
    }

    try {
      await OvertimeService.evaluateOvertime({
        businessId: current_business_id,
        requestId,
        action,
        rejectionReason: action === "REJECT" ? "Refusé par le gestionnaire" : undefined,
        actor: { id: "admin_ot", name: "Gestionnaire Heures Sup", role: currentRole },
      });
      alert(action === "APPROVE" ? "Heures supplémentaires approuvées avec succès !" : "Heures supplémentaires refusées.");
    } catch (err: any) {
      console.error("Overtime evaluation failed:", err);
      alert(err.message || "Erreur lors du traitement.");
    }
  };

  // 4. Process / Evaluate Incident Justification
  const handleProcessJustification = async (eventId: string, action: "APPROVE" | "REJECT") => {
    if (!canArbitrate) {
      alert(d.accessBlocked);
      return;
    }

    try {
      await AttendanceIntegrationService.processJustification({
        businessId: current_business_id,
        eventId,
        action,
        actor: { id: "admin_just", name: "Arbitrage Incident", role: currentRole },
      });
      alert(action === "APPROVE" ? "Justification acceptée. Incident résolu." : "Justification rejetée.");
    } catch (err: any) {
      console.error("Justification evaluation failed:", err);
      alert(err.message || "Erreur lors du traitement.");
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

  return (
    <div className="flex flex-col gap-6" id="leave-tab-container">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-1.5">
            <Calendar className="w-5 h-5 text-cyan-400" />
            WORKFORCE PLANNING & DECISION ENGINE
          </h2>
          <p className="text-xs text-slate-400 font-light mt-0.5">
            {d.description}
          </p>
        </div>

        {/* Tab Selectors */}
        <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab("leaves")}
            className={`px-3 py-1.5 text-[10px] font-bold font-mono tracking-wider rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "leaves" 
                ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/10" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Calendar className="w-3 h-3" />
            CONGÉS ({leaves.filter(l => l.business_id === current_business_id).length})
          </button>
          <button
            onClick={() => setActiveTab("overtime")}
            className={`px-3 py-1.5 text-[10px] font-bold font-mono tracking-wider rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "overtime" 
                ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/10" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Clock className="w-3 h-3" />
            HEURES SUP ({overtimes.length})
          </button>
          <button
            onClick={() => setActiveTab("absences")}
            className={`px-3 py-1.5 text-[10px] font-bold font-mono tracking-wider rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "absences" 
                ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/10" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            INCIDENTS & RETARDS ({absenceEvents.length})
          </button>
        </div>
      </div>

      {successToast && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold animate-fadeIn flex items-center gap-2" id="leave-success-alert">
          <Check className="w-4 h-4 shrink-0" />
          {successToast}
        </div>
      )}

      {errorToast && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg text-xs font-semibold animate-fadeIn flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-450" />
          {errorToast}
        </div>
      )}

      {/* A. CONGÉS TAB */}
      {activeTab === "leaves" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="leave-grid">
          {/* Leave Request Form (Left column) */}
          <div className="lg:col-span-5" id="leave-form-pane">
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5" id="leave-form-card">
              <h4 className="text-xs uppercase font-extrabold text-slate-100 tracking-wider mb-4 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-cyan-400" />
                {d.submitForm}
              </h4>

              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5" id="leave-actual-form">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    {d.employeeRequesting}
                  </label>
                  <select
                    id="leave-form-employeeId"
                    {...register("employeeId")}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
                  >
                    <option value="">{d.choosePlaceholder}</option>
                    {businessEmployees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.role})
                      </option>
                    ))}
                  </select>
                  {errors.employeeId && (
                    <p className="text-rose-500 text-[10px] mt-1 font-semibold">{d.errors.employeeId}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3" id="leave-dates-row">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      {d.startDate}
                    </label>
                    <input
                      id="leave-form-startDate"
                      type="date"
                      {...register("startDate")}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-500"
                    />
                    {errors.startDate && (
                      <p className="text-rose-500 text-[10px] mt-1 font-semibold">{d.errors.startDate}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      {d.endDate}
                    </label>
                    <input
                      id="leave-form-endDate"
                      type="date"
                      {...register("endDate")}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-500"
                    />
                    {errors.endDate && (
                      <p className="text-rose-500 text-[10px] mt-1 font-semibold">
                        {errors.endDate.type === 'custom' ? d.errors.endDateInvalid : d.errors.endDate}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Type de congé
                  </label>
                  <select
                    id="leave-form-type"
                    {...register("type")}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
                  >
                    {Object.entries(LEAVE_TYPES_CONFIG).map(([key, value]) => (
                      <option key={key} value={key}>{value.name}</option>
                    ))}
                  </select>
                  {errors.type && (
                    <p className="text-rose-500 text-[10px] mt-1 font-semibold">{d.errors.type}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Lien justificatif (Optionnel)
                  </label>
                  <input
                    type="text"
                    {...register("attachmentUrl")}
                    placeholder="URL ou justificatif médical..."
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    {d.reasonLabel}
                  </label>
                  <textarea
                    id="leave-form-reason"
                    rows={3}
                    {...register("reason")}
                    placeholder={t.leave.reasonPlaceholder}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
                  />
                  {errors.reason && (
                    <p className="text-rose-500 text-[10px] mt-1 font-semibold">{d.errors.reasonMin}</p>
                  )}
                </div>

                <button
                  id="btn-leave-submit"
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 text-slate-950 text-xs font-bold rounded cursor-pointer transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      {d.processing}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Enregistrer la Demande
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Leaves Records Table (Right Column) */}
          <div className="lg:col-span-7 flex flex-col gap-4" id="leave-list-pane">
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl overflow-hidden" id="leave-table-box">
              <div className="p-3 bg-slate-950/60 border-b border-slate-800/80" id="leave-table-header">
                <span className="text-xs uppercase font-extrabold text-slate-200 tracking-wide">{d.requestedLeaves}</span>
              </div>

              <div className="overflow-x-auto" id="leave-table-scroll">
                <table className="w-full text-left font-sans text-xs" id="leave-record-table">
                  <thead>
                    <tr className="bg-slate-950/40 border-b border-slate-850 text-[10px] uppercase text-slate-400 tracking-wide font-bold">
                      <th className="py-2.5 px-3">{d.employeeCol}</th>
                      <th className="py-2.5 px-3">{d.typeCol}</th>
                      <th className="py-2.5 px-3">{d.datesCol}</th>
                      <th className="py-2.5 px-3">{t.leave.statusLabel}</th>
                      <th className="py-2.5 px-3 text-right">{d.actionsCol || "Actions"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {leaves.filter((l) => l.business_id === current_business_id).map((lv) => (
                      <tr key={lv.id} className="hover:bg-slate-900/20 text-slate-350" id={`leave-row-${lv.id}`}>
                        <td className="py-2.5 px-3">
                          <p className="font-semibold text-slate-200">{lv.employeeName}</p>
                          <p className="text-[10px] text-indigo-450 italic pr-2 max-w-[150px] truncate" title={lv.reason}>{lv.reason}</p>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-900 text-cyan-400 border border-slate-800">
                            {LEAVE_TYPES_CONFIG[lv.type]?.name || lv.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[10px]">
                          <div>{d.fromLabel}{lv.startDate}</div>
                          <div>{d.toLabel}{lv.endDate}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center gap-1 text-[9px] font-bold ${
                            lv.status === "APPROVED" || lv.status === "PAYROLL_SYNCED"
                              ? "text-emerald-400"
                              : lv.status === "REJECTED"
                              ? "text-rose-400"
                              : "text-amber-400 animate-pulse"
                          }`}>
                            {lv.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {(lv.status === "PENDING" || lv.status === "SUBMITTED" || lv.status === "MANAGER_REVIEW") ? (
                            currentUser?.id && (lv.employeeId === currentUser.id || (lv as any).employee_id === currentUser.id) ? (
                              <span className="text-[10px] text-amber-400 font-mono italic flex items-center gap-1 justify-end" title="L'employé ayant fait la demande ne peut pas l'approuver lui-même. Validé par un autre supérieur.">
                                <ShieldAlert className="w-3.5 h-3.5" /> Aval supérieur requis
                              </span>
                            ) : canArbitrate ? (
                              <div className="flex gap-1 justify-end" id={`actions-grp-${lv.id}`}>
                                <button
                                  id={`btn-approve-leave-${lv.id}`}
                                  onClick={() => handleProcessLeave(lv.id, "APPROVED")}
                                  className="w-6 h-6 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold flex items-center justify-center hover:bg-emerald-500 hover:text-slate-950 cursor-pointer transition-all"
                                  title={t.leave.approveBtn}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  id={`btn-reject-leave-${lv.id}`}
                                  onClick={() => handleProcessLeave(lv.id, "REJECTED")}
                                  className="w-6 h-6 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold flex items-center justify-center hover:bg-rose-500 hover:text-slate-950 cursor-pointer transition-all"
                                  title={t.leave.rejectBtn}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500 select-none flex items-center gap-1 justify-end">
                                <ShieldAlert className="w-3.5 h-3.5" /> {d.restricted}
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] text-slate-500 select-none">{d.completed}</span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {leaves.filter((l) => l.business_id === current_business_id).length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          {d.emptyLeaves}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* B. HEURES SUPPLÉMENTAIRES TAB */}
      {activeTab === "overtime" && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5">
          <h3 className="text-xs font-black font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-4 pb-2 border-b border-slate-800/50">
            <Clock className="w-4.5 h-4.5 text-cyan-400" />
            ARBITRAGE DES HEURES SUPPLÉMENTAIRES
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-xs">
              <thead>
                <tr className="bg-slate-950/40 border-b border-slate-850 text-[10px] uppercase text-slate-400 tracking-wide font-bold">
                  <th className="py-2.5 px-3">Employé</th>
                  <th className="py-2.5 px-3 font-mono">Date & Plage horaire</th>
                  <th className="py-2.5 px-3 text-center">Volume (Heures)</th>
                  <th className="py-2.5 px-3">Motif</th>
                  <th className="py-2.5 px-3">Statut</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {overtimes.map((ot) => (
                  <tr key={ot.id} className="hover:bg-slate-900/20 text-slate-350">
                    <td className="py-2.5 px-3 font-semibold text-slate-200">
                      {ot.employeeName}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {new Date(ot.date).toLocaleDateString()} ({ot.startTime} - {ot.endTime})
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-cyan-400">
                      {ot.totalHours} h
                    </td>
                    <td className="py-2.5 px-3 italic">
                      "{ot.reason}"
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black border uppercase tracking-widest ${getStatusStyle(ot.status)}`}>
                        {ot.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {ot.status === "PENDING" ? (
                        canArbitrate ? (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => handleProcessOvertime(ot.id, "APPROVE")}
                              className="w-6 h-6 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold flex items-center justify-center hover:bg-emerald-500 hover:text-slate-950 cursor-pointer transition-all"
                              title="Approuver les heures sup"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleProcessOvertime(ot.id, "REJECT")}
                              className="w-6 h-6 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold flex items-center justify-center hover:bg-rose-500 hover:text-slate-950 cursor-pointer transition-all"
                              title="Refuser"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500 select-none flex items-center gap-1 justify-end">
                            <ShieldAlert className="w-3.5 h-3.5" /> {d.restricted}
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] text-slate-500 select-none">{d.completed}</span>
                      )}
                    </td>
                  </tr>
                ))}

                {overtimes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Aucune demande d'heures supplémentaires pour le moment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* C. INCIDENTS & RETARDS TAB */}
      {activeTab === "absences" && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5">
          <h3 className="text-xs font-black font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-4 pb-2 border-b border-slate-800/50">
            <AlertTriangle className="w-4.5 h-4.5 text-cyan-400" />
            ARBITRAGE DES RETARDS ET ABSENCES
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-xs">
              <thead>
                <tr className="bg-slate-950/40 border-b border-slate-850 text-[10px] uppercase text-slate-400 tracking-wide font-bold">
                  <th className="py-2.5 px-3">Employé</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Type d'incident</th>
                  <th className="py-2.5 px-3">Détails</th>
                  <th className="py-2.5 px-3">Explication de l'employé</th>
                  <th className="py-2.5 px-3">Statut</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {absenceEvents.map((evt) => {
                  const badge = getAbsenceBadge(evt.type);
                  return (
                    <tr key={evt.id} className="hover:bg-slate-900/20 text-slate-350">
                      <td className="py-2.5 px-3 font-semibold text-slate-200">
                        {evt.employeeName}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {new Date(evt.date).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded border text-[9px] font-mono font-bold ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-400">
                        {evt.minutes ? `${evt.minutes} min` : "Journée entière"}
                      </td>
                      <td className="py-2.5 px-3">
                        {evt.justification ? (
                          <span className="italic text-slate-300">"{evt.justification}"</span>
                        ) : (
                          <span className="text-slate-500 italic">Pas encore justifié</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2.5 py-0.5 border rounded-full text-[8px] font-black uppercase tracking-widest ${getStatusStyle(evt.status)}`}>
                          {evt.status === "PENDING_JUSTIFICATION" ? "À JUSTIFIER" : evt.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {evt.justification && evt.status !== "JUSTIFIED" && evt.status !== "REJECTED_JUSTIFICATION" ? (
                          canArbitrate ? (
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => handleProcessJustification(evt.id, "APPROVE")}
                                className="w-6 h-6 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold flex items-center justify-center hover:bg-emerald-500 hover:text-slate-950 cursor-pointer transition-all"
                                title="Accepter la justification (Excuser)"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleProcessJustification(evt.id, "REJECT")}
                                className="w-6 h-6 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold flex items-center justify-center hover:bg-rose-500 hover:text-slate-950 cursor-pointer transition-all"
                                title="Rejeter et sanctionner"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500 select-none flex items-center gap-1 justify-end">
                              <ShieldAlert className="w-3.5 h-3.5" /> {d.restricted}
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-slate-500 select-none">{d.completed}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {absenceEvents.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Aucun incident enregistré ou tous les incidents ont été justifiés.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
