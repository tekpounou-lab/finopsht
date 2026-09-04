import React from "react";
import {
  Calendar,
  Building,
  Layers,
  Filter,
  Search,
  RotateCcw,
  RefreshCw,
  SlidersHorizontal,
  LayoutGrid,
  BarChart3,
  DollarSign,
  Users,
  Clock,
  TrendingUp,
} from "lucide-react";
import { PICFilters, PICPeriod, PICMetricType } from "../../domains/performance/types";

interface FilterToolbarProps {
  filters: PICFilters;
  onPeriodChange: (period: PICPeriod) => void;
  onDateRangeChange: (start: string, end: string) => void;
  onBranchChange: (branchId: string) => void;
  onDepartmentChange: (departmentId: string) => void;
  onMetricTypeChange: (metric: PICMetricType) => void;
  onSearchChange: (query: string) => void;
  onReset: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  branches: Array<{ id: string; name?: string; location?: string }>;
  departments: Array<{ id: string; name?: string; label?: string }>;
  isExpertMode: boolean;
  onToggleMode: (expert: boolean) => void;
  language?: "fr" | "en" | "ht";
}

export const FilterToolbar: React.FC<FilterToolbarProps> = ({
  filters,
  onPeriodChange,
  onDateRangeChange,
  onBranchChange,
  onDepartmentChange,
  onMetricTypeChange,
  onSearchChange,
  onReset,
  onRefresh,
  isLoading,
  branches,
  departments,
  isExpertMode,
  onToggleMode,
  language = "fr",
}) => {
  const periods: Array<{ id: PICPeriod; label: string }> = [
    { id: "7d", label: language === "ht" ? "7 Jou" : language === "en" ? "7 Days" : "7 Jours" },
    { id: "30d", label: language === "ht" ? "30 Jou" : language === "en" ? "30 Days" : "30 Jours" },
    { id: "this_month", label: language === "ht" ? "Mwa Sa a" : language === "en" ? "This Month" : "Ce mois" },
    { id: "last_month", label: language === "ht" ? "Mwa Pase" : language === "en" ? "Last Month" : "Mois dernier" },
    { id: "quarter", label: language === "ht" ? "Trimès" : language === "en" ? "Quarter" : "Trimestre" },
    { id: "custom", label: language === "ht" ? "Pèsonalize" : language === "en" ? "Custom" : "Personnalisé" },
  ];

  const metricTypes: Array<{ id: PICMetricType; label: string; icon: React.ReactNode }> = [
    { id: "all", label: "Toutes métriques", icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
    { id: "payroll", label: "Masse salariale", icon: <DollarSign className="w-3.5 h-3.5" /> },
    { id: "workforce", label: "Effectifs", icon: <Users className="w-3.5 h-3.5" /> },
    { id: "revenue", label: "Ventes / CA", icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { id: "attendance", label: "Présence", icon: <Clock className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4" id="pic-filter-toolbar">
      {/* Top Row: Mode switch, Period Presets, Refresh & Reset */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 pb-3">
        {/* Mode Switcher Toggle */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800" id="pic-mode-switcher">
          <button
            type="button"
            onClick={() => onToggleMode(false)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              !isExpertMode
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
            id="pic-btn-mode-simplified"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Mode Simplifié</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleMode(true)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              isExpertMode
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
            id="pic-btn-mode-expert"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Mode Expert</span>
          </button>
        </div>

        {/* Period Preset Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1" id="pic-period-pills">
          {periods.map((p) => {
            const isSelected = filters.period === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPeriodChange(p.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  isSelected
                    ? "bg-slate-700 text-white font-semibold shadow-inner border border-slate-600"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
                id={`pic-period-${p.id}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Action buttons: Reset & Refresh */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={onReset}
            title="Réinitialiser les filtres"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-950/30 border border-slate-800 transition-colors"
            id="pic-btn-reset-filters"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Réinitialiser</span>
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            title="Actualiser les données"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors disabled:opacity-50"
            id="pic-btn-refresh-data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
        </div>
      </div>

      {/* Main Filter Controls: Dates, Branch, Department, Metric, Search */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3" id="pic-filter-inputs-grid">
        {/* Date Range Inputs */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2">
          <Calendar className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="flex items-center gap-1.5 w-full text-xs">
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => onDateRangeChange(e.target.value, filters.endDate)}
              className="bg-transparent text-slate-200 focus:outline-none w-full text-[11px]"
              title="Date de début"
              id="pic-input-start-date"
            />
            <span className="text-slate-500">→</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => onDateRangeChange(filters.startDate, e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none w-full text-[11px]"
              title="Date de fin"
              id="pic-input-end-date"
            />
          </div>
        </div>

        {/* Branch Selector */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2">
          <Building className="w-4 h-4 text-indigo-400 shrink-0" />
          <select
            value={filters.branchId}
            onChange={(e) => onBranchChange(e.target.value)}
            className="bg-transparent text-slate-200 text-xs focus:outline-none w-full cursor-pointer"
            id="pic-select-branch"
          >
            <option value="ALL" className="bg-slate-900 text-slate-200">
              Toutes les succursales
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id} className="bg-slate-900 text-slate-200">
                {b.name || b.location || b.id}
              </option>
            ))}
          </select>
        </div>

        {/* Department Selector */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2">
          <Layers className="w-4 h-4 text-purple-400 shrink-0" />
          <select
            value={filters.departmentId}
            onChange={(e) => onDepartmentChange(e.target.value)}
            className="bg-transparent text-slate-200 text-xs focus:outline-none w-full cursor-pointer"
            id="pic-select-department"
          >
            <option value="ALL" className="bg-slate-900 text-slate-200">
              Tous les départements
            </option>
            {departments.map((d) => (
              <option key={d.id} value={d.id} className="bg-slate-900 text-slate-200">
                {d.name || d.label || d.id}
              </option>
            ))}
          </select>
        </div>

        {/* Metric Type Selector */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2">
          <Filter className="w-4 h-4 text-emerald-400 shrink-0" />
          <select
            value={filters.metricType}
            onChange={(e) => onMetricTypeChange(e.target.value as PICMetricType)}
            className="bg-transparent text-slate-200 text-xs focus:outline-none w-full cursor-pointer"
            id="pic-select-metric-type"
          >
            {metricTypes.map((m) => (
              <option key={m.id} value={m.id} className="bg-slate-900 text-slate-200">
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Search Query */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Filtrer employé / mot-clé..."
            value={filters.searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="bg-transparent text-slate-200 text-xs focus:outline-none w-full placeholder-slate-500"
            id="pic-input-search-query"
          />
        </div>
      </div>
    </div>
  );
};
