import React from 'react';
import { Branch, Department } from '../../types';
import { ShiftFilters } from './types';
import { Search, Filter, RefreshCw, X, CheckCircle, Clock, AlertTriangle, FileText } from 'lucide-react';
import { useI18n } from '../../i18n';

interface FilterToolbarProps {
  branches: Branch[];
  departments: Department[];
  filters: ShiftFilters;
  onFilterChange: (filters: ShiftFilters) => void;
}

const filterDict = {
  fr: {
    searchPlaceholder: "Rechercher équipe ou employé...",
    startDate: "Date de début",
    endDate: "Date de fin",
    allBranches: "Toutes les succursales",
    allDepts: "Tous les départements",
    allStatuses: "Tous les statuts",
    statusScheduled: "Planifié",
    statusCompleted: "Complété",
    statusAbsent: "Absent",
    statusLate: "En retard",
    statusConflict: "Conflit",
    activeFilters: "Filtres actifs",
    clearAll: "Effacer tout",
    branchLabel: "Succursale",
    deptLabel: "Département",
    statusLabel: "Statut"
  },
  ht: {
    searchPlaceholder: "Chache ekip oswa anplwaye...",
    startDate: "Dat pou Kòmanse",
    endDate: "Dat pou Fini",
    allBranches: "Tout Sikisal yo",
    allDepts: "Tout Depatman yo",
    allStatuses: "Tout Estati yo",
    statusScheduled: "Planifye",
    statusCompleted: "Konplete",
    statusAbsent: "Absan",
    statusLate: "Anreta",
    statusConflict: "Konfli",
    activeFilters: "Filtè aktif yo",
    clearAll: "Efase tout",
    branchLabel: "Sikisal",
    deptLabel: "Depatman",
    statusLabel: "Estati"
  },
  en: {
    searchPlaceholder: "Search team or employee...",
    startDate: "Start Date",
    endDate: "End Date",
    allBranches: "All Branches",
    allDepts: "All Departments",
    allStatuses: "All Statuses",
    statusScheduled: "Scheduled",
    statusCompleted: "Completed",
    statusAbsent: "Absent",
    statusLate: "Late",
    statusConflict: "Conflict",
    activeFilters: "Active Filters",
    clearAll: "Clear All",
    branchLabel: "Branch",
    deptLabel: "Department",
    statusLabel: "Status"
  }
};

const FilterToolbar: React.FC<FilterToolbarProps> = ({ branches, departments, filters, onFilterChange }) => {
  const { language } = useI18n();
  const d = filterDict[(language === "ht" || language === "en") ? language : "fr"];

  const handleClearSingle = (key: keyof ShiftFilters) => {
    if (key === 'dateRange') {
      onFilterChange({ ...filters, dateRange: null });
    } else if (key === 'search') {
      onFilterChange({ ...filters, search: '' });
    } else {
      onFilterChange({ ...filters, [key]: 'ALL' });
    }
  };

  const hasActiveFilters = 
    filters.branchId !== 'ALL' || 
    filters.departmentId !== 'ALL' || 
    filters.status !== 'ALL' || 
    filters.search !== '' || 
    filters.dateRange !== null;

  const activeBranch = branches.find(b => b.id === filters.branchId);
  const activeDept = departments.find(dept => dept.id === filters.departmentId);

  return (
    <div className="flex flex-col gap-3 p-4 mt-4 bg-slate-900/60 border border-slate-800 rounded-xl shadow-lg backdrop-blur-md">
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Search input with premium inner gradient */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder={d.searchPlaceholder}
            value={filters.search}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-9 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 focus:border-cyan-500/50 transition-all font-medium placeholder-slate-500"
          />
          {filters.search && (
            <button 
              onClick={() => handleClearSingle('search')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter select fields and date picker */}
        <div className="flex flex-wrap lg:flex-nowrap gap-2 items-center">
          {/* Date range picker container */}
          <div className="flex items-center gap-1.5 border border-slate-800 bg-slate-950 rounded-lg px-3 py-1 text-xs shrink-0 shadow-inner">
             <input 
               type="date"
               value={filters.dateRange?.start || ''}
               onChange={(e) => {
                 const newStart = e.target.value;
                 onFilterChange({ ...filters, dateRange: { start: newStart, end: filters.dateRange?.end || newStart } })
               }}
               title={d.startDate}
               className="bg-transparent text-xs text-slate-300 font-mono focus:outline-none py-1 w-24 cursor-pointer"
             />
             <span className="text-slate-600 font-bold">-</span>
             <input 
               type="date"
               value={filters.dateRange?.end || ''}
               min={filters.dateRange?.start || ''}
               onChange={(e) => {
                 const newEnd = e.target.value;
                 onFilterChange({ ...filters, dateRange: { start: filters.dateRange?.start || newEnd, end: newEnd } })
               }}
               title={d.endDate}
               className="bg-transparent text-xs text-slate-300 font-mono focus:outline-none py-1 w-24 cursor-pointer"
             />
             {filters.dateRange && (
               <button onClick={() => handleClearSingle('dateRange')} className="text-slate-500 hover:text-slate-300 ml-1">
                 <X className="w-3 h-3" />
               </button>
             )}
          </div>

          {/* Branch Filter dropdown */}
          <select 
            value={filters.branchId}
            onChange={(e) => onFilterChange({ ...filters, branchId: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 font-medium focus:border-cyan-500/50 outline-none transition-all cursor-pointer"
          >
            <option value="ALL">{d.allBranches}</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          {/* Department Filter dropdown */}
          <select 
            value={filters.departmentId}
            onChange={(e) => onFilterChange({ ...filters, departmentId: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 font-medium focus:border-cyan-500/50 outline-none transition-all cursor-pointer"
          >
            <option value="ALL">{d.allDepts}</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {/* Status Filter dropdown */}
          <select 
            value={filters.status}
            onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 font-medium focus:border-cyan-500/50 outline-none transition-all cursor-pointer"
          >
            <option value="ALL">{d.allStatuses}</option>
            <option value="SCHEDULED">{d.statusScheduled}</option>
            <option value="COMPLETED">{d.statusCompleted}</option>
            <option value="ABSENT">{d.statusAbsent}</option>
            <option value="LATE">{d.statusLate}</option>
            <option value="CONFLICT">{d.statusConflict}</option>
          </select>

          {/* Reset Filters action button */}
          <button 
            onClick={() => onFilterChange({ branchId: 'ALL', departmentId: 'ALL', status: 'ALL', search: '', dateRange: null })}
            disabled={!hasActiveFilters}
            className={`p-2.5 rounded-lg border transition-all flex items-center justify-center shrink-0 w-9 h-9 ${
              hasActiveFilters 
                ? 'bg-slate-950 border-slate-800 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/30' 
                : 'bg-slate-950/20 border-slate-900/40 text-slate-600 cursor-not-allowed'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${hasActiveFilters ? 'animate-none' : ''}`} />
          </button>
        </div>
      </div>

      {/* Render active filter badges below */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/40 text-[10px] text-slate-400">
          <span className="font-semibold uppercase tracking-wider text-slate-500 mr-1">{d.activeFilters} :</span>
          
          {filters.search && (
            <span className="inline-flex items-center gap-1 bg-slate-950 border border-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-medium">
              <span>"{filters.search}"</span>
              <button onClick={() => handleClearSingle('search')} className="text-slate-500 hover:text-slate-300"><X className="w-3 h-3" /></button>
            </span>
          )}

          {filters.branchId !== 'ALL' && activeBranch && (
            <span className="inline-flex items-center gap-1 bg-slate-950 border border-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-medium">
              <span className="text-slate-500">{d.branchLabel}:</span>
              <span>{activeBranch.name}</span>
              <button onClick={() => handleClearSingle('branchId')} className="text-slate-500 hover:text-slate-300"><X className="w-3 h-3" /></button>
            </span>
          )}

          {filters.departmentId !== 'ALL' && activeDept && (
            <span className="inline-flex items-center gap-1 bg-slate-950 border border-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-medium">
              <span className="text-slate-500">{d.deptLabel}:</span>
              <span>{activeDept.name}</span>
              <button onClick={() => handleClearSingle('departmentId')} className="text-slate-500 hover:text-slate-300"><X className="w-3 h-3" /></button>
            </span>
          )}

          {filters.status !== 'ALL' && (
            <span className="inline-flex items-center gap-1 bg-slate-950 border border-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-medium">
              <span className="text-slate-500">{d.statusLabel}:</span>
              <span className="font-semibold uppercase">{filters.status}</span>
              <button onClick={() => handleClearSingle('status')} className="text-slate-500 hover:text-slate-300"><X className="w-3 h-3" /></button>
            </span>
          )}

          {filters.dateRange && (
            <span className="inline-flex items-center gap-1 bg-slate-950 border border-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-medium font-mono">
              <span>{filters.dateRange.start} ➔ {filters.dateRange.end}</span>
              <button onClick={() => handleClearSingle('dateRange')} className="text-slate-500 hover:text-slate-300"><X className="w-3 h-3" /></button>
            </span>
          )}

          <button 
            onClick={() => onFilterChange({ branchId: 'ALL', departmentId: 'ALL', status: 'ALL', search: '', dateRange: null })}
            className="text-[10px] text-rose-400 hover:text-rose-300 font-bold uppercase tracking-wider ml-auto hover:underline cursor-pointer"
          >
            {d.clearAll}
          </button>
        </div>
      )}
    </div>
  );
};

export default FilterToolbar;

