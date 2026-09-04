import React from "react";
import { 
  AppNotification, 
  NotificationSeverity, 
  NotificationType 
} from "../../types/notifications";
import { 
  Bell, 
  Flame, 
  Wallet, 
  Fingerprint, 
  Mail, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  Trash2, 
  Check, 
  Clock, 
  Activity,
  ShieldAlert,
  ExternalLink
} from "lucide-react";

interface NotificationCardProps {
  notification: AppNotification;
  onMarkAsRead: (id: string, read?: boolean) => void;
  onDelete?: (id: string) => void;
  currentLang?: "fr" | "en" | "ht";
}

export const NotificationCard: React.FC<NotificationCardProps> = ({
  notification,
  onMarkAsRead,
  onDelete,
  currentLang = "fr"
}) => {
  const getSeverityBadge = (severity: NotificationSeverity) => {
    switch (severity) {
      case "CRITICAL":
      case "ERROR":
        return (
          <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-semibold uppercase flex items-center gap-1">
            <Flame className="w-3 h-3 text-rose-400" />
            Critique
          </span>
        );
      case "HIGH":
      case "WARNING":
        return (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold uppercase flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            Important
          </span>
        );
      case "MEDIUM":
        return (
          <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-semibold uppercase flex items-center gap-1">
            <Activity className="w-3 h-3 text-cyan-400" />
            Moyen
          </span>
        );
      case "LOW":
      case "INFO":
      default:
        return (
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-semibold uppercase flex items-center gap-1">
            <Info className="w-3 h-3 text-slate-400" />
            Info
          </span>
        );
    }
  };

  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case "CRITICAL":
        return <Flame className="w-4 h-4 text-rose-400" />;
      case "FINANCE":
      case "PAYROLL":
        return <Wallet className="w-4 h-4 text-emerald-400" />;
      case "ATTENDANCE":
      case "SECURITY":
        return <Fingerprint className="w-4 h-4 text-cyan-400" />;
      case "HR":
        return <Mail className="w-4 h-4 text-indigo-400" />;
      case "ALERT":
        return <ShieldAlert className="w-4 h-4 text-amber-400" />;
      default:
        return <Bell className="w-4 h-4 text-slate-400" />;
    }
  };

  const formatDate = (val?: any): string => {
    if (!val) return "";
    try {
      let date: Date;
      if (val instanceof Date) {
        date = val;
      } else if (typeof val === "object" && val !== null) {
        if (typeof val.toDate === "function") {
          date = val.toDate();
        } else if (typeof val.seconds === "number") {
          date = new Date(val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1000000));
        } else if (typeof val._seconds === "number") {
          date = new Date(val._seconds * 1000 + Math.floor((val._nanoseconds || 0) / 1000000));
        } else {
          return "";
        }
      } else if (typeof val === "number") {
        date = new Date(val);
      } else {
        date = new Date(String(val));
      }

      if (isNaN(date.getTime())) {
        return typeof val === "string" ? val : "";
      }
      return new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
    } catch {
      return typeof val === "string" ? val : "";
    }
  };

  return (
    <div
      id={`notification-card-${notification.id}`}
      className={`relative p-4 rounded-xl border transition-all flex flex-col gap-3 group ${
        notification.read
          ? "bg-slate-950/40 border-slate-900/80 text-slate-400 hover:border-slate-800"
          : "bg-slate-900/60 border-cyan-500/30 text-slate-200 shadow-sm shadow-cyan-950/20 hover:border-cyan-500/50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-2 rounded-lg border ${
            notification.read ? "bg-slate-900 border-slate-800" : "bg-slate-800/80 border-slate-700 text-cyan-400"
          }`}>
            {getTypeIcon(notification.type)}
          </div>
          <div className="min-w-0">
            <h4 className={`text-sm font-semibold truncate ${
              notification.read ? "text-slate-300" : "text-slate-100"
            }`}>
              {notification.title}
            </h4>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(notification.createdAt)}
              </span>
              {notification.sourceId && (
                <span className="font-mono text-slate-600 bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800">
                  {notification.sourceId}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {getSeverityBadge(notification.severity)}
          {!notification.read && (
            <span className="w-2 h-2 rounded-full bg-cyan-400 ring-4 ring-cyan-500/20" title="Non lue" />
          )}
        </div>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed break-words whitespace-pre-line">
        {notification.message}
      </p>

      <div className="flex items-center justify-between pt-2 border-t border-slate-900/60 mt-1">
        <div className="flex items-center gap-2">
          {notification.targetRoles && notification.targetRoles.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {notification.targetRoles.map((role) => (
                <span key={role} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                  {role}
                </span>
              ))}
            </div>
          )}
          {notification.actionUrl && (
            <a
              href={notification.actionUrl}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
            >
              Voir détails
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition">
          <button
            id={`btn-toggle-read-${notification.id}`}
            onClick={() => onMarkAsRead(notification.id, !notification.read)}
            className={`p-1.5 rounded-lg border text-xs transition cursor-pointer flex items-center gap-1 ${
              notification.read
                ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-cyan-400 hover:border-slate-700"
                : "bg-cyan-950/40 border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/60"
            }`}
            title={notification.read ? "Marquer comme non lu" : "Marquer comme lu"}
          >
            {notification.read ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline text-[10px] font-medium">
              {notification.read ? "Lu" : "Marquer lu"}
            </span>
          </button>

          {onDelete && (
            <button
              id={`btn-delete-notif-${notification.id}`}
              onClick={() => onDelete(notification.id)}
              className="p-1.5 rounded-lg border border-transparent hover:border-rose-500/30 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition cursor-pointer"
              title="Supprimer la notification"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
