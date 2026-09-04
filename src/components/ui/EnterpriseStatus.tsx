import React from "react";
import { CheckCircle2, Clock, XCircle, AlertCircle, RefreshCw, Wifi, Activity } from "lucide-react";

export interface StatusBadgeProps {
  status: string;
  variant?: "emerald" | "rose" | "amber" | "blue" | "slate" | "purple";
  label?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant,
  label,
  icon,
  className = ""
}) => {
  const statusMap: Record<string, { variant: "emerald" | "rose" | "amber" | "blue" | "slate" | "purple"; defaultLabel: string }> = {
    ACTIVE: { variant: "emerald", defaultLabel: "Actif" },
    PAID: { variant: "emerald", defaultLabel: "Payé / Décaissé" },
    APPROVED: { variant: "emerald", defaultLabel: "Approuvé" },
    SUCCESS: { variant: "emerald", defaultLabel: "Succès" },
    VALIDATED: { variant: "emerald", defaultLabel: "Validé" },
    INACTIVE: { variant: "slate", defaultLabel: "Inactif" },
    DRAFT: { variant: "slate", defaultLabel: "Brouillon" },
    LOCKED: { variant: "amber", defaultLabel: "Verrouillé" },
    PENDING: { variant: "amber", defaultLabel: "En Attente" },
    WARNING: { variant: "amber", defaultLabel: "Avertissement" },
    REOPEN_REQUESTED: { variant: "amber", defaultLabel: "Réouverture Demandée" },
    ERROR: { variant: "rose", defaultLabel: "Erreur" },
    REJECTED: { variant: "rose", defaultLabel: "Rejeté" },
    FAILED: { variant: "rose", defaultLabel: "Échoué" },
    CANCELLED: { variant: "rose", defaultLabel: "Annulé" },
    PROCESSING: { variant: "blue", defaultLabel: "En Traitement" },
    IN_PROGRESS: { variant: "blue", defaultLabel: "En Cours" }
  };

  const resolvedVariant = variant || statusMap[status]?.variant || "slate";
  const resolvedLabel = label || statusMap[status]?.defaultLabel || status;

  const variantStyles = {
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    rose: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    slate: "bg-slate-800 text-slate-300 border-slate-700"
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold tracking-tight whitespace-nowrap ${variantStyles[resolvedVariant]} ${className}`}
    >
      {icon}
      <span>{resolvedLabel}</span>
    </span>
  );
};

export const ConnectionStatus: React.FC<{ isOnline?: boolean }> = ({ isOnline = true }) => (
  <div className="flex items-center gap-1.5 text-xs font-semibold">
    <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
    <span className={isOnline ? "text-slate-300" : "text-rose-400"}>
      {isOnline ? "Connecté (En direct)" : "Hors ligne"}
    </span>
  </div>
);

export const SyncStatus: React.FC<{ isSyncing?: boolean; lastSync?: string }> = ({
  isSyncing,
  lastSync
}) => (
  <div className="flex items-center gap-1.5 text-xs text-slate-400">
    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-blue-400" : ""}`} />
    <span>{isSyncing ? "Synchronisation..." : `Synchronisé ${lastSync || "à l'instant"}`}</span>
  </div>
);

export const WorkflowStatus = StatusBadge;
export const ApprovalStatus = StatusBadge;
export const PayrollStatus = StatusBadge;
export const AttendanceStatus = StatusBadge;
export const InvoiceStatus = StatusBadge;

export const HealthIndicator: React.FC<{ score?: number; status?: "good" | "warning" | "critical" }> = ({
  score = 100,
  status = "good"
}) => {
  const statusColors = {
    good: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    warning: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    critical: "text-rose-400 bg-rose-500/10 border-rose-500/30"
  };

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${statusColors[status]}`}>
      <Activity className="w-4 h-4" />
      <span>Santé Système: {score}%</span>
    </div>
  );
};

export interface StepItem {
  id: string;
  title: string;
  description?: string;
  status: "completed" | "current" | "upcoming";
}

export const Stepper: React.FC<{ steps: StepItem[] }> = ({ steps }) => (
  <div className="flex items-center justify-between gap-2 w-full">
    {steps.map((step, idx) => (
      <React.Fragment key={step.id}>
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition ${
              step.status === "completed"
                ? "bg-emerald-500 border-emerald-500 text-slate-950"
                : step.status === "current"
                ? "bg-blue-600 border-blue-500 text-white"
                : "bg-slate-900 border-slate-800 text-slate-500"
            }`}
          >
            {step.status === "completed" ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
          </div>
          <div className="hidden md:block">
            <div className="text-xs font-bold text-slate-200">{step.title}</div>
            {step.description && <div className="text-[10px] text-slate-400">{step.description}</div>}
          </div>
        </div>
        {idx < steps.length - 1 && (
          <div
            className={`flex-1 h-0.5 transition ${
              step.status === "completed" ? "bg-emerald-500" : "bg-slate-800"
            }`}
          />
        )}
      </React.Fragment>
    ))}
  </div>
);

export const Wizard = Stepper;

export interface TimelineItem {
  id: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  timestamp: string;
  icon?: React.ReactNode;
}

export const Timeline: React.FC<{ items: TimelineItem[] }> = ({ items }) => (
  <div className="relative border-l border-slate-800 ml-3 space-y-6">
    {items.map((item) => (
      <div key={item.id} className="relative pl-6">
        <div className="absolute -left-3 top-0 p-1 bg-slate-900 border border-slate-700 rounded-full text-blue-400">
          {item.icon || <Clock className="w-3.5 h-3.5" />}
        </div>
        <div className="space-y-0.5">
          <div className="text-xs font-bold text-slate-200">{item.title}</div>
          {item.subtitle && <div className="text-xs text-slate-400">{item.subtitle}</div>}
          <div className="text-[10px] text-slate-500 font-mono mt-1">{item.timestamp}</div>
        </div>
      </div>
    ))}
  </div>
);

export const AuditTimeline = Timeline;
export const ActivityFeed = Timeline;
export const HistoryViewer = Timeline;
export const ApprovalFlow = Stepper;
export const VersionHistory = Timeline;
