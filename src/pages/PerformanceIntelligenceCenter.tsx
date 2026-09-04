import React, { useState, useEffect } from "react";
import {
  Sparkles,
  BarChart2,
  RefreshCw,
  AlertCircle,
  Database,
  FilterX,
} from "lucide-react";
import { usePerformanceData } from "../hooks/usePerformanceData";
import { FilterToolbar } from "../components/performance/FilterToolbar";
import { PICSimplifiedView } from "../components/performance/PICSimplifiedView";
import { PICExpertView } from "../components/performance/PICExpertView";
import { useBusinessContext } from "../contexts/BusinessContext";

export const PerformanceIntelligenceCenter: React.FC = () => {
  const { business } = useBusinessContext();
  const [isExpertMode, setIsExpertMode] = useState<boolean>(false);

  const {
    filters,
    setPeriod,
    setDateRange,
    setBranchId,
    setDepartmentId,
    setMetricType,
    setSearchQuery,
    resetFilters,
    refresh,
    isLoading,
    error,
    simplifiedMetrics,
    expertMetrics,
    branches,
    departments,
  } = usePerformanceData(business?.id);

  // Diagnostic log on filter/mode updates
  useEffect(() => {
    console.info(`[PIC] [PerformanceIntelligenceCenter] Rendered state:`, {
      mode: isExpertMode ? "Expert" : "Simplified",
      filters,
      dataAvailable: simplifiedMetrics.isDataAvailable,
      totalRecords: simplifiedMetrics.totalRecordsCount,
    });
  }, [isExpertMode, filters, simplifiedMetrics]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6" id="performance-intelligence-center-page">
      {/* Top Main Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-900/30">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
                Performance Intelligence Center (PIC)
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  {isExpertMode ? "Mode Expert" : "Mode Simplifié"}
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Pilotage unifié de la masse salariale, productivité, effectifs et équilibre financier.
              </p>
            </div>
          </div>
        </div>

        {/* Realtime Engine Status Badge */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-300">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <Database className="w-3.5 h-3.5 text-slate-400" />
          <span>Snapshot Engine Actif</span>
        </div>
      </div>

      {/* Unified Filter Toolbar */}
      <FilterToolbar
        filters={filters}
        onPeriodChange={setPeriod}
        onDateRangeChange={setDateRange}
        onBranchChange={setBranchId}
        onDepartmentChange={setDepartmentId}
        onMetricTypeChange={setMetricType}
        onSearchChange={setSearchQuery}
        onReset={resetFilters}
        onRefresh={refresh}
        isLoading={isLoading}
        branches={branches}
        departments={departments}
        isExpertMode={isExpertMode}
        onToggleMode={setIsExpertMode}
      />

      {/* Error Alert if any */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-4 flex items-center gap-3 text-rose-300 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="space-y-4" id="pic-loading-state">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-slate-900/60 border border-slate-800/60 rounded-2xl animate-pulse p-4 flex flex-col justify-between">
                <div className="h-3 w-1/2 bg-slate-800 rounded" />
                <div className="h-6 w-3/4 bg-slate-800 rounded" />
                <div className="h-2 w-1/3 bg-slate-800 rounded" />
              </div>
            ))}
          </div>
          <div className="h-64 bg-slate-900/60 border border-slate-800/60 rounded-2xl animate-pulse flex items-center justify-center text-slate-500 text-xs gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Calcul analytique et agrégation en cours...</span>
          </div>
        </div>
      ) : !simplifiedMetrics.isDataAvailable ? (
        /* Empty State: No Data for applied filters */
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-4 max-w-xl mx-auto my-6 shadow-xl" id="pic-empty-state">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400">
            <FilterX className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-200">Aucune donnée pour ces filtres</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Aucun enregistrement ne correspond à la période ({filters.startDate} à {filters.endDate}) ou aux critères de filtrage sélectionnés.
            </p>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors shadow-lg shadow-cyan-900/30"
            id="pic-empty-reset-btn"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Réinitialiser les filtres</span>
          </button>
        </div>
      ) : (
        /* Render Selected Mode View */
        <div id="pic-content-container">
          {!isExpertMode ? (
            <PICSimplifiedView
              metrics={simplifiedMetrics}
              onResetFilters={resetFilters}
            />
          ) : (
            <PICExpertView metrics={expertMetrics} />
          )}
        </div>
      )}
    </div>
  );
};

export default PerformanceIntelligenceCenter;
