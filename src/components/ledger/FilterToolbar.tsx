import React, { useState, useEffect } from 'react';
import { Branch, Department, Employee } from '../../types';
import { LedgerFilterParams, SavedLedgerView } from './types';
import { Search, RefreshCw, Bookmark, Plus, Trash2, Check } from 'lucide-react';
import { useTranslate } from '../../i18n';
import MultiSelect from '../ui/MultiSelect';
import { DateRangePicker } from '../ui/DateRangePicker';

// Simple debounce hook for search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

interface FilterToolbarProps {
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  filters: LedgerFilterParams;
  onFilterChange: (filters: LedgerFilterParams) => void;
}

const DEFAULT_SAVED_VIEWS: SavedLedgerView[] = [
  {
    id: 'default-all',
    name: 'Vue Globale',
    filters: {
      type: ['ALL'],
      category: 'ALL',
      branchId: ['ALL'],
      departmentId: ['ALL'],
      employeeId: ['ALL'],
      period: 'ALL',
      search: '',
      startDate: '',
      endDate: ''
    }
  },
  {
    id: 'default-income',
    name: 'Revenus Uniquement',
    filters: {
      type: ['INCOME'],
      category: 'ALL',
      branchId: ['ALL'],
      departmentId: ['ALL'],
      employeeId: ['ALL'],
      period: 'ALL',
      search: '',
      startDate: '',
      endDate: ''
    }
  },
  {
    id: 'default-expense',
    name: 'Dépenses Uniquement',
    filters: {
      type: ['EXPENSE'],
      category: 'ALL',
      branchId: ['ALL'],
      departmentId: ['ALL'],
      employeeId: ['ALL'],
      period: 'ALL',
      search: '',
      startDate: '',
      endDate: ''
    }
  },
  {
    id: 'default-payroll',
    name: 'Mouvements de Paie',
    filters: {
      type: ['PAYROLL'],
      category: 'ALL',
      branchId: ['ALL'],
      departmentId: ['ALL'],
      employeeId: ['ALL'],
      period: 'ALL',
      search: '',
      startDate: '',
      endDate: ''
    }
  }
];

export default function FilterToolbar({ branches, departments, employees, filters, onFilterChange }: FilterToolbarProps) {
  const tText = useTranslate();
  const [localSearch, setLocalSearch] = useState(filters.search);
  const debouncedSearch = useDebounce(localSearch, 300);

  // Saved Views State
  const [savedViews, setSavedViews] = useState<SavedLedgerView[]>(() => {
    try {
      const stored = localStorage.getItem('finops_ledger_saved_views');
      if (stored) {
        const parsed = JSON.parse(stored);
        return [...DEFAULT_SAVED_VIEWS, ...parsed];
      }
    } catch (e) {
      console.error("Failed to parse saved views from localStorage", e);
    }
    return DEFAULT_SAVED_VIEWS;
  });

  const [selectedViewId, setSelectedViewId] = useState<string>('default-all');
  const [isSavingView, setIsSavingView] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [showSavedViewsDropdown, setShowSavedViewsDropdown] = useState(false);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onFilterChange({ ...filters, search: debouncedSearch });
    }
  }, [debouncedSearch, filters, onFilterChange]);

  useEffect(() => {
    if (filters.search !== localSearch) {
      setLocalSearch(filters.search);
    }
  }, [filters.search]);

  // Save new custom view
  const handleSaveView = () => {
    if (!newViewName.trim()) return;
    const customView: SavedLedgerView = {
      id: `custom-${Date.now()}`,
      name: newViewName.trim(),
      filters: { ...filters }
    };
    const updatedViews = [...savedViews, customView];
    setSavedViews(updatedViews);
    setSelectedViewId(customView.id);

    // Persist custom views to localStorage
    const customOnly = updatedViews.filter(v => v.id.startsWith('custom-'));
    localStorage.setItem('finops_ledger_saved_views', JSON.stringify(customOnly));

    setNewViewName('');
    setIsSavingView(false);
  };

  // Delete custom view
  const handleDeleteCustomView = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updatedViews = savedViews.filter(v => v.id !== id);
    setSavedViews(updatedViews);
    if (selectedViewId === id) {
      setSelectedViewId('default-all');
    }
    const customOnly = updatedViews.filter(v => v.id.startsWith('custom-'));
    localStorage.setItem('finops_ledger_saved_views', JSON.stringify(customOnly));
  };

  // Select view
  const handleSelectView = (view: SavedLedgerView) => {
    setSelectedViewId(view.id);
    onFilterChange(view.filters);
    setShowSavedViewsDropdown(false);
  };

  return (
    <div id="gl-filter-toolbar" className="flex flex-col gap-3 p-4 backdrop-blur-md bg-slate-900/40 border border-slate-800/60 rounded-xl relative z-10">
      {/* Top Bar: Search + Saved Views Selector */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder={tText("Rechercher transaction, ID, description...")}
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full h-10 bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-9 pr-4 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        {/* Saved Views Control */}
        <div className="relative flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowSavedViewsDropdown(!showSavedViewsDropdown)}
              className="h-10 px-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-xs text-slate-300 flex items-center gap-2 transition"
            >
              <Bookmark className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-medium truncate max-w-[150px]">
                {savedViews.find(v => v.id === selectedViewId)?.name || tText("Vues sauvegardées")}
              </span>
            </button>

            {showSavedViewsDropdown && (
              <div className="absolute right-0 z-30 mt-1 w-64 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl shadow-black/80 overflow-hidden py-1">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  {tText("Vues Prédéfinies & Sauvegardées")}
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {savedViews.map(view => (
                    <div
                      key={view.id}
                      onClick={() => handleSelectView(view)}
                      className={`px-3 py-2 text-xs flex items-center justify-between cursor-pointer hover:bg-slate-800/80 transition ${
                        selectedViewId === view.id ? 'bg-cyan-950/40 text-cyan-400 font-medium' : 'text-slate-300'
                      }`}
                    >
                      <span className="truncate">{view.name}</span>
                      <div className="flex items-center gap-1">
                        {selectedViewId === view.id && <Check className="w-3.5 h-3.5" />}
                        {view.id.startsWith('custom-') && (
                          <button
                            onClick={(e) => handleDeleteCustomView(e, view.id)}
                            className="p-1 hover:text-rose-400 text-slate-500 transition"
                            title={tText("Supprimer la vue")}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Save Current View Button */}
          {isSavingView ? (
            <div className="flex items-center gap-1 bg-slate-950 border border-cyan-500/50 rounded-lg px-2 h-10">
              <input
                type="text"
                placeholder={tText("Nom de la vue...")}
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                className="bg-transparent border-none text-xs text-slate-200 outline-none w-28"
                autoFocus
              />
              <button
                onClick={handleSaveView}
                className="text-xs bg-cyan-600 text-slate-950 px-2 py-1 rounded font-bold hover:bg-cyan-500"
              >
                {tText("OK")}
              </button>
              <button
                onClick={() => setIsSavingView(false)}
                className="text-xs text-slate-400 px-1 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsSavingView(true)}
              className="h-10 px-3 bg-cyan-950/30 border border-cyan-800/40 hover:bg-cyan-900/30 text-cyan-400 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
              title={tText("Sauvegarder les filtres actuels comme nouvelle vue")}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{tText("Sauvegarder vue")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Selectors Row */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="w-40">
          <MultiSelect 
            options={[
              { id: 'ALL', name: tText("Tous types") },
              { id: 'INCOME', name: tText("Revenu") },
              { id: 'EXPENSE', name: tText("Dépense") },
              { id: 'ADVANCE', name: tText("Avance") },
              { id: 'TRANSFER', name: tText("Transfert") },
              { id: 'PAYROLL', name: tText("Paie") },
              { id: 'CORRECTION', name: tText("Correction") }
            ]}
            value={filters.type}
            onChange={(val) => onFilterChange({ ...filters, type: val })}
            placeholder={tText("Tous types")}
          />
        </div>
        
        <div className="w-40">
          <MultiSelect 
            options={[
              { id: 'ALL', name: tText("Toutes succursales") },
              ...branches.map(b => ({ id: b.id, name: b.name }))
            ]}
            value={filters.branchId}
            onChange={(val) => onFilterChange({ ...filters, branchId: val })}
            placeholder={tText("Toutes succursales")}
          />
        </div>
        
        <div className="w-40">
          <MultiSelect 
            options={[
              { id: 'ALL', name: tText("Tous départements") },
              ...departments.map(d => ({ id: d.id, name: d.name }))
            ]}
            value={filters.departmentId}
            onChange={(val) => onFilterChange({ ...filters, departmentId: val })}
            placeholder={tText("Tous départements")}
          />
        </div>
        
        <div className="w-48">
          <MultiSelect 
            options={[
              { id: 'ALL', name: tText("Tous employés") },
              ...employees.map(e => ({ id: e.id, name: e.name }))
            ]}
            value={filters.employeeId}
            onChange={(val) => onFilterChange({ ...filters, employeeId: val })}
            placeholder={tText("Tous employés")}
          />
        </div>

        {/* Date Controls with SSOT Centralized DateRangePicker */}
        <div className="flex items-center gap-2">
          <DateRangePicker 
            startDate={filters.startDate}
            endDate={filters.endDate}
            period={filters.period}
            onChange={(start, end, period) => {
              onFilterChange({
                ...filters,
                startDate: start,
                endDate: end,
                period: period
              });
            }}
          />
        </div>

        {/* Reset Button */}
        <button 
          onClick={() => {
            setSelectedViewId('default-all');
            onFilterChange({ branchId: ['ALL'], departmentId: ['ALL'], employeeId: ['ALL'], type: ['ALL'], category: 'ALL', search: '', period: 'ALL', startDate: '', endDate: '' });
          }}
          className="h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 hover:border-slate-700 transition flex items-center justify-center ml-auto"
          title={tText("Réinitialiser les filtres")}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

