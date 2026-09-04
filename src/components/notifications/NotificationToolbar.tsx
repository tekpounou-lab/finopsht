import React from "react";
import { 
  NotificationType, 
  NotificationSeverity 
} from "../../types/notifications";
import { Role } from "../../types";
import { 
  Inbox, 
  Flame, 
  Wallet, 
  Fingerprint, 
  Mail, 
  CheckCheck, 
  Search, 
  Calendar, 
  Filter,
  ShieldAlert,
  Bell
} from "lucide-react";

interface NotificationToolbarProps {
  filterType: NotificationType | "ALL";
  setFilterType: (type: NotificationType | "ALL") => void;
  filterRead: boolean | "ALL" | "UNREAD" | "READ";
  setFilterRead: (read: boolean | "ALL" | "UNREAD" | "READ") => void;
  datePreset: "ALL" | "TODAY" | "7_DAYS" | "30_DAYS";
  setDatePreset: (preset: "ALL" | "TODAY" | "7_DAYS" | "30_DAYS") => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  unreadCount: number;
  totalCount: number;
  onMarkAllAsRead: () => void;
  currentRole?: Role;
  currentLang?: "fr" | "en" | "ht";
}

export const NotificationToolbar: React.FC<NotificationToolbarProps> = ({
  filterType,
  setFilterType,
  filterRead,
  setFilterRead,
  datePreset,
  setDatePreset,
  searchQuery,
  setSearchQuery,
  unreadCount,
  totalCount,
  onMarkAllAsRead,
  currentRole = "OWNER",
  currentLang = "fr"
}) => {
  const dict = {
    searchPlaceholder: {
      fr: "Rechercher par mot-clé, titre, employé ou référence...",
      en: "Search by keyword, title, employee or reference...",
      ht: "Chache pa mo kle, tit, anplwaye oswa referans..."
    },
    markAllRead: {
      fr: "Tout marquer comme lu",
      en: "Mark all as read",
      ht: "Make tout kòm li"
    },
    filterCategories: {
      all: { fr: "Toutes les alertes", en: "All Alerts", ht: "Tout alèt yo" },
      critical: { fr: "Urgences & DLQ", en: "Emergencies & DLQ", ht: "Ijans ak DLQ" },
      finance: { fr: "Finances & Paies", en: "Finance & Payroll", ht: "Finans ak Peman" },
      security: { fr: "Sécurité & QR", en: "Security & QR", ht: "Sekirite ak QR" },
      hr: { fr: "RH & Recrutement", en: "HR & Recruitment", ht: "RH ak Envitasyon" }
    },
    status: {
      all: { fr: "Tous", en: "All", ht: "Tout" },
      unread: { fr: "Non lues", en: "Unread", ht: "Pa li" },
      read: { fr: "Lues", en: "Read", ht: "Li" }
    },
    dates: {
      all: { fr: "Toutes dates", en: "All dates", ht: "Tout dat" },
      today: { fr: "Aujourd'hui", en: "Today", ht: "Jodi a" },
      sevenDays: { fr: "7 derniers jours", en: "Last 7 days", ht: "7 dènye jou" },
      thirtyDays: { fr: "30 derniers jours", en: "Last 30 days", ht: "30 dènye jou" }
    }
  };

  const categories = [
    { id: "ALL", label: dict.filterCategories.all[currentLang], icon: Inbox },
    { id: "CRITICAL", label: dict.filterCategories.critical[currentLang], icon: Flame },
    { id: "FINANCE", label: dict.filterCategories.finance[currentLang], icon: Wallet },
    { id: "ATTENDANCE", label: dict.filterCategories.security[currentLang], icon: Fingerprint },
    { id: "HR", label: dict.filterCategories.hr[currentLang], icon: Mail }
  ];

  return (
    <div className="flex flex-col gap-4 bg-slate-900/40 p-4 rounded-xl border border-slate-900" id="notification-toolbar">
      {/* Top Search & Actions Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80" id="notification-search-wrap">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            id="notif-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={dict.searchPlaceholder[currentLang]}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-xs text-slate-500 hover:text-slate-300"
            >
              ×
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {/* Date Filter Select */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <select
              id="notif-date-preset-select"
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as any)}
              className="bg-transparent text-xs text-slate-300 outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">{dict.dates.all[currentLang]}</option>
              <option value="TODAY" className="bg-slate-900">{dict.dates.today[currentLang]}</option>
              <option value="7_DAYS" className="bg-slate-900">{dict.dates.sevenDays[currentLang]}</option>
              <option value="30_DAYS" className="bg-slate-900">{dict.dates.thirtyDays[currentLang]}</option>
            </select>
          </div>

          {/* Mark All Read Button */}
          {unreadCount > 0 && (
            <button
              id="btn-notif-mark-all-read"
              onClick={onMarkAllAsRead}
              className="py-1.5 px-3 bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-1.5 shrink-0 shadow-sm shadow-cyan-950/20"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>{dict.markAllRead[currentLang]} ({unreadCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Categories & Read Status Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-900/80">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none" id="notif-category-pills">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isSelected = filterType === cat.id;
            return (
              <button
                key={cat.id}
                id={`btn-cat-${cat.id}`}
                onClick={() => setFilterType(cat.id as any)}
                className={`py-1.5 px-3 rounded-lg text-xs font-medium transition flex items-center gap-2 cursor-pointer shrink-0 border ${
                  isSelected
                    ? "bg-slate-800 text-cyan-400 border-cyan-500/40 shadow-sm shadow-cyan-950/20"
                    : "bg-slate-950/60 text-slate-400 border-slate-800/80 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-cyan-400" : "text-slate-500"}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Read / Unread / All Toggle */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 shrink-0" id="notif-read-toggle">
          <button
            id="btn-filter-read-all"
            onClick={() => setFilterRead("ALL")}
            className={`py-1 px-2.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
              filterRead === "ALL"
                ? "bg-slate-800 text-slate-200 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {dict.status.all[currentLang]}
          </button>
          <button
            id="btn-filter-read-unread"
            onClick={() => setFilterRead("UNREAD")}
            className={`py-1 px-2.5 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
              filterRead === "UNREAD" || filterRead === false
                ? "bg-cyan-950 text-cyan-400 border border-cyan-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {dict.status.unread[currentLang]}
            {unreadCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-rose-500 text-slate-950 font-bold text-[9px] flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            id="btn-filter-read-read"
            onClick={() => setFilterRead("READ")}
            className={`py-1 px-2.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
              filterRead === "READ" || filterRead === true
                ? "bg-slate-800 text-slate-200 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {dict.status.read[currentLang]}
          </button>
        </div>
      </div>
    </div>
  );
};
