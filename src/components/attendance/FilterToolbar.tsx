import React from 'react';
import { Branch, Department, Employee } from '../../types';
import { AttendanceFilterParams } from './types';
import { Search, RefreshCw, Calendar } from 'lucide-react';
import { getDeviceLocalDate } from '../../lib/attendanceSSOT';

interface FilterToolbarProps {
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  filters: AttendanceFilterParams;
  onFilterChange: (filters: AttendanceFilterParams) => void;
}

export default function FilterToolbar({ branches, departments, employees, filters, onFilterChange }: FilterToolbarProps) {
  const todayStr = getDeviceLocalDate(new Date());

  const handleReset = () => {
    onFilterChange({
      branchId: 'ALL',
      departmentId: 'ALL',
      employeeId: 'ALL',
      status: 'ALL',
      search: '',
      date: '',
      endDate: ''
    });
  };

  const handleShowAllDates = () => {
    onFilterChange({
      ...filters,
      date: '',
      endDate: ''
    });
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 p-4 mt-4 backdrop-blur-md bg-slate-900/40 border border-slate-800/60 rounded-xl">
      <div className="relative flex-1">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input 
          type="text" 
          placeholder="Rechercher par nom, badge..." 
          value={filters.search}
          onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
          className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-cyan-500/50"
        />
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <select 
          value={filters.branchId}
          onChange={(e) => onFilterChange({ ...filters, branchId: e.target.value })}
          className="bg-slate-950 border border-slate-800 rounded px-2 py-2 text-xs text-slate-300 font-sans focus:border-cyan-500 outline-none w-32"
        >
          <option value="ALL">Toutes succursales</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select 
          value={filters.departmentId}
          onChange={(e) => onFilterChange({ ...filters, departmentId: e.target.value })}
          className="bg-slate-950 border border-slate-800 rounded px-2 py-2 text-xs text-slate-300 font-sans focus:border-cyan-500 outline-none w-32"
        >
          <option value="ALL">Tous départements</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select 
          value={filters.status}
          onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
          className="bg-slate-950 border border-slate-800 rounded px-2 py-2 text-xs text-slate-300 font-sans focus:border-cyan-500 outline-none w-32"
        >
          <option value="ALL">Tous statuts</option>
          <option value="NORMAL">Normal / Présent</option>
          <option value="LATE">En Retard</option>
          <option value="ABSENT">Absent</option>
        </select>
        <div className="flex items-center gap-2">
          <input 
            type="date"
            value={filters.date}
            onChange={(e) => onFilterChange({ ...filters, date: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded px-2 py-2 text-xs text-slate-300 font-mono focus:border-cyan-500 outline-none"
            title="Date de début"
          />
          <span className="text-slate-500 text-xs">à</span>
          <input 
            type="date"
            value={filters.endDate || ''}
            onChange={(e) => onFilterChange({ ...filters, endDate: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded px-2 py-2 text-xs text-slate-300 font-mono focus:border-cyan-500 outline-none"
            title="Date de fin"
          />
          {(!filters.date && !filters.endDate) ? (
            <button
              type="button"
              onClick={() => onFilterChange({ ...filters, date: todayStr, endDate: todayStr })}
              className="px-2 py-1 bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold rounded hover:bg-cyan-900 transition"
              title="Filtrer sur aujourd'hui"
            >
              Aujourd'hui
            </button>
          ) : (
            <button
              type="button"
              onClick={handleShowAllDates}
              className="px-2 py-1 bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold rounded hover:bg-slate-700 transition"
              title="Afficher toutes les dates"
            >
              Toutes dates
            </button>
          )}
        </div>
        <button 
          onClick={handleReset}
          className="p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 hover:border-slate-700 transition"
          title="Réinitialiser les filtres"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
