import React, { useMemo } from "react";
import { useNotifications } from "../../hooks/useNotifications";
import { NotificationRepository } from "../../repositories/NotificationRepository";
import { NotificationCard } from "./NotificationCard";
import { NotificationToolbar } from "./NotificationToolbar";
import { useI18n } from "../../i18n";
import { Role, ERPEvent } from "../../types";
import { AppNotification, NotificationSeverity } from "../../types/notifications";
import { 
  Bell, 
  Sparkles, 
  Inbox, 
  Loader2, 
  RefreshCw, 
  ShieldCheck,
  AlertCircle
} from "lucide-react";

export interface NotificationCenterProps {
  currentRole?: Role;
  currentUser?: { name: string; id: string };
  current_business_id?: string;
  events?: ERPEvent[];
  onAddEvent?: (ev: ERPEvent) => void;
  readIds?: string[];
  setReadIds?: (updateFn: (prev: string[]) => string[]) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  currentRole = "OWNER",
  currentUser,
  current_business_id,
  events = [],
  readIds = [],
  setReadIds
}) => {
  const { language } = useI18n();
  const currentLang = (language === "fr" || language === "ht" || language === "en") ? language : "fr";

  const {
    notifications: dbNotifications,
    unreadCount: dbUnreadCount,
    loading,
    error,
    refresh,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    filterType,
    setFilterType,
    filterRead,
    setFilterRead,
    datePreset,
    setDatePreset,
    searchQuery,
    setSearchQuery
  } = useNotifications(current_business_id);

  const dict = {
    title: {
      fr: "Centre d'Intelligence & Notifications",
      ht: "Sant Alèt ak Notifikasyon Entèlijan",
      en: "Intelligence & Notification Hub"
    },
    subtitle: {
      fr: "Surveillance et répartition en temps réel des flux immuables du grand livre, HR et alertes de rentabilité.",
      ht: "Swiv ak kontwole nan menm lè a tout chanjman nan liv kòb ak alèt travay yo.",
      en: "Real-time auditing of general ledger changes, timesheet activities, and financial alerts."
    },
    emptyTitle: {
      fr: "Aucune notification correspondante",
      ht: "Pa gen okenn notifikasyon",
      en: "No matching notifications"
    },
    emptyDesc: {
      fr: "Toutes les alertes système et notifications opérationnelles sont à jour sous ce filtre.",
      ht: "Tout alèt sistèm ak notifikasyon yo ajou.",
      en: "All system alerts and notifications are up to date under this filter."
    },
    resetFilters: {
      fr: "Réinitialiser les filtres",
      ht: "Reyajiste filtè yo",
      en: "Reset filters"
    }
  };

  // Merge ERP events if present and not already in DB notifications
  const displayNotifications: AppNotification[] = useMemo(() => {
    if (dbNotifications && dbNotifications.length > 0) {
      return dbNotifications;
    }

    // Fallback: If DB notifications are empty, map memory events with current filters
    if (events && events.length > 0) {
      return events.map((ev): AppNotification => {
        const severity: NotificationSeverity = (ev.status === "FAILED" || ev.status === "DLQ") ? "CRITICAL" : "INFO";
        return {
          id: ev.id,
          businessId: ev.business_id,
          business_id: ev.business_id,
          type: (ev.type as any) || "INFO",
          severity,
          title: `Événement ${ev.type}`,
          message: typeof ev.payload === "string" ? ev.payload : JSON.stringify(ev.payload),
          createdAt: NotificationRepository.parseIsoDate(ev.timestamp),
          read: readIds.includes(ev.id),
          sourceId: ev.id
        };
      }).filter((notif) => {
        if (filterType !== "ALL" && notif.type !== filterType) return false;
        if (filterRead === "UNREAD" && notif.read) return false;
        if (filterRead === "READ" && !notif.read) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          if (!notif.title.toLowerCase().includes(q) && !notif.message.toLowerCase().includes(q)) {
            return false;
          }
        }
        return true;
      });
    }

    return [];
  }, [dbNotifications, events, readIds, filterType, filterRead, searchQuery]);

  const handleMarkAsRead = async (id: string, read = true) => {
    if (setReadIds) {
      setReadIds((prev) => (read ? [...prev, id] : prev.filter((i) => i !== id)));
    }
    await markAsRead(id, read).catch(() => {});
  };

  const handleMarkAllRead = async () => {
    if (setReadIds) {
      setReadIds((prev) => [...prev, ...displayNotifications.map((n) => n.id)]);
    }
    await markAllAsRead().catch(() => {});
  };

  const totalCount = displayNotifications.length;
  const activeUnreadCount = dbUnreadCount > 0 
    ? dbUnreadCount 
    : displayNotifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col gap-6" id="notifications-center-root">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                {dict.title[currentLang]}
                <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-500/20 text-xs font-mono">
                  RLS Securisé
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-light mt-0.5">
                {dict.subtitle[currentLang]}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            id="btn-refresh-notifications"
            onClick={() => refresh()}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition cursor-pointer"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Toolbar with Filters */}
      <NotificationToolbar
        filterType={filterType}
        setFilterType={setFilterType}
        filterRead={filterRead}
        setFilterRead={setFilterRead}
        datePreset={datePreset}
        setDatePreset={setDatePreset}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        unreadCount={activeUnreadCount}
        totalCount={totalCount}
        onMarkAllAsRead={handleMarkAllRead}
        currentRole={currentRole}
        currentLang={currentLang}
      />

      {/* Notification Stream / List */}
      <div className="flex flex-col gap-3" id="notifications-stream-container">
        {loading && displayNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 bg-slate-900/20 border border-slate-900 rounded-xl">
            <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
            <p className="text-xs text-slate-500">Chargement des notifications en temps réel...</p>
          </div>
        ) : displayNotifications.length > 0 ? (
          displayNotifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkAsRead={handleMarkAsRead}
              onDelete={deleteNotification}
              currentLang={currentLang}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 bg-slate-900/20 border border-slate-900 rounded-xl text-center">
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-600 mb-3">
              <Inbox className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">
              {dict.emptyTitle[currentLang]}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
              {dict.emptyDesc[currentLang]}
            </p>
            {(filterType !== "ALL" || filterRead !== "ALL" || datePreset !== "ALL" || searchQuery) && (
              <button
                id="btn-reset-notif-filters"
                onClick={() => {
                  setFilterType("ALL");
                  setFilterRead("ALL");
                  setDatePreset("ALL");
                  setSearchQuery("");
                }}
                className="py-1.5 px-3 rounded-lg border border-slate-800 bg-slate-900 text-cyan-400 text-xs font-semibold hover:border-slate-700 transition cursor-pointer"
              >
                {dict.resetFilters[currentLang]}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;
