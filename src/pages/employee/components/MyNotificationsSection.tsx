import React, { useState } from "react";
import { Bell, Check, Filter, CheckCircle2, AlertCircle, Info, Calendar, DollarSign, Clock, ShieldAlert } from "lucide-react";
import { Employee, ERPEvent } from "../../../types";
import { MockServiceManager } from "../../../services/mock";

interface MyNotificationsSectionProps {
  employee: Employee;
  events: ERPEvent[];
  tw: any;
}

export const MyNotificationsSection: React.FC<MyNotificationsSectionProps> = ({
  employee,
  events,
  tw,
}) => {
  const [filterMode, setFilterMode] = useState<"ALL" | "UNREAD">("ALL");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // Filter events related to employee
  const myEvents = events.filter(e => e.employeeId === employee.id || (e.payload && e.payload.employeeId === employee.id) || e.desc?.includes(employee.id) || e.desc?.includes(employee.name));

  // Synthesize notifications only if mock mode is explicitly enabled
  const mockNotificationsList = MockServiceManager.isEnabled() ? [
    {
      id: "NOTIF-01",
      title: "Bienvenue sur FINOPS ERP Employee Workspace",
      desc: "Votre compte est actif et synchronisé avec le Single Source of Truth (SSOT).",
      date: new Date().toISOString(),
      type: "INFO",
      read: false,
    },
    {
      id: "NOTIF-02",
      title: "Validation de Pointage",
      desc: "Vos heures d'entrée et de sortie pour cette semaine ont été validées par le moteur de paie.",
      date: new Date(Date.now() - 3600000 * 5).toISOString(),
      type: "SUCCESS",
      read: false,
    },
    {
      id: "NOTIF-03",
      title: "Mise à Jour de Planning",
      desc: "Nouveau planning des shifts disponible pour votre département.",
      date: new Date(Date.now() - 3600000 * 24).toISOString(),
      type: "CALENDAR",
      read: true,
    },
  ] : [];

  const allNotifications = [
    ...myEvents.map(e => ({
      id: e.id,
      title: e.title || e.type || "Événement Système",
      desc: e.desc || e.errorMessage || "Notification système enregistrée.",
      date: e.timestamp,
      type: e.severity === "CRITICAL" ? "ALERT" : "INFO",
      read: readIds.has(e.id),
    })),
    ...mockNotificationsList.map(n => ({
      ...n,
      read: readIds.has(n.id) || n.read,
    })),
  ];

  const filteredNotifications = allNotifications.filter(n => {
    if (filterMode === "UNREAD" && n.read) return false;
    return true;
  });

  const handleMarkAllRead = () => {
    const newSet = new Set(readIds);
    allNotifications.forEach(n => newSet.add(n.id));
    setReadIds(newSet);
  };

  const handleMarkAsRead = (id: string) => {
    const newSet = new Set(readIds);
    newSet.add(id);
    setReadIds(newSet);
  };

  return (
    <div className="space-y-6" id="view-notifications-section">
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 uppercase tracking-tight flex items-center gap-2">
            <Bell className="w-5 h-5 text-cyan-400" />
            Centre de Notifications Personnelles
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Flux d'alertes en temps réel généré par l'EventBus de FINOPS.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-1 flex items-center text-xs font-mono">
            <button
              onClick={() => setFilterMode("ALL")}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterMode === "ALL" ? "bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/30" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Toutes ({allNotifications.length})
            </button>
            <button
              onClick={() => setFilterMode("UNREAD")}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterMode === "UNREAD" ? "bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/30" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Non Lues ({allNotifications.filter(n => !n.read).length})
            </button>
          </div>

          <button
            onClick={handleMarkAllRead}
            className="px-3 py-2 bg-slate-950 border border-slate-800 hover:border-cyan-500/40 text-cyan-400 text-xs font-mono font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" /> Tout marquer comme lu
          </button>
        </div>
      </div>

      {/* NOTIFICATIONS LIST */}
      <div className="space-y-3">
        {filteredNotifications.length > 0 ? (
          filteredNotifications.map((notif, idx) => (
            <div
              key={idx}
              onClick={() => handleMarkAsRead(notif.id)}
              className={`p-4 rounded-2xl border transition cursor-pointer flex items-start gap-4 ${
                notif.read
                  ? "bg-slate-900/40 border-slate-800/80 opacity-75"
                  : "bg-slate-900 border-cyan-500/30 shadow-lg shadow-cyan-500/5"
              }`}
            >
              <div className={`p-2.5 rounded-xl border shrink-0 ${
                notif.type === "ALERT"
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                  : notif.type === "SUCCESS"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
              }`}>
                <Bell className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                    {notif.title}
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                    )}
                  </h4>
                  <span className="text-[10px] font-mono text-slate-500">
                    {new Date(notif.date).toLocaleString("fr-FR")}
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-sans">{notif.desc}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="glass p-8 rounded-2xl border border-slate-800 text-center font-mono text-xs text-slate-400">
            Aucune notification à afficher.
          </div>
        )}
      </div>
    </div>
  );
};
