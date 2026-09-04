import React, { useState } from 'react';
import { Calendar, ChevronDown, Check, RotateCcw } from 'lucide-react';
import { useTranslate } from '../../i18n';
import { useFilters } from '../../hooks/useFilters';

export interface DateRangePickerProps {
  namespace?: string;
  startDate?: string;
  endDate?: string;
  period?: string;
  onChange?: (startDate: string, endDate: string, period: string) => void;
  isGlobal?: boolean;
  className?: string;
  showPresets?: boolean;
  compact?: boolean;
}

export const PRESET_PERIODS = [
  { id: 'ALL', labelKey: 'Toutes les dates', compute: () => ({ start: '', end: '', period: 'ALL' }) },
  {
    id: 'TODAY',
    labelKey: "Aujourd'hui",
    compute: () => {
      const today = new Date().toISOString().split('T')[0];
      return { start: today, end: today, period: 'TODAY' };
    }
  },
  {
    id: 'THIS_WEEK',
    labelKey: 'Cette semaine',
    compute: () => {
      const now = new Date();
      const firstDay = new Date(now.setDate(now.getDate() - now.getDay() + 1)).toISOString().split('T')[0];
      const lastDay = new Date(now.setDate(now.getDate() - now.getDay() + 7)).toISOString().split('T')[0];
      return { start: firstDay, end: lastDay, period: 'THIS_WEEK' };
    }
  },
  {
    id: 'THIS_MONTH',
    labelKey: 'Ce mois-ci',
    compute: () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      return {
        start: `${year}-${month}-01`,
        end: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
        period: `${year}-${month}`
      };
    }
  },
  {
    id: 'THIS_QUARTER',
    labelKey: 'Ce trimestre',
    compute: () => {
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3);
      const startMonth = String(quarter * 3 + 1).padStart(2, '0');
      const endMonthNum = quarter * 3 + 3;
      const endMonth = String(endMonthNum).padStart(2, '0');
      const lastDay = new Date(now.getFullYear(), endMonthNum, 0).getDate();
      return {
        start: `${now.getFullYear()}-${startMonth}-01`,
        end: `${now.getFullYear()}-${endMonth}-${String(lastDay).padStart(2, '0')}`,
        period: 'THIS_QUARTER'
      };
    }
  },
  {
    id: 'THIS_YEAR',
    labelKey: 'Cette année',
    compute: () => {
      const year = new Date().getFullYear();
      return { start: `${year}-01-01`, end: `${year}-12-31`, period: `${year}` };
    }
  }
];

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  namespace = 'global',
  startDate: propStartDate,
  endDate: propEndDate,
  period: propPeriod,
  onChange,
  isGlobal = false,
  className = '',
  showPresets = true,
  compact = false
}) => {
  const tText = useTranslate();
  const targetNamespace = isGlobal ? 'global' : namespace;
  const { filters, setFilterGroup, resetFilters } = useFilters(targetNamespace);

  const [isOpen, setIsOpen] = useState(false);
  const [customStart, setCustomStart] = useState(propStartDate || filters.startDate || '');
  const [customEnd, setCustomEnd] = useState(propEndDate || filters.endDate || '');

  const effectivePeriod = propPeriod !== undefined ? propPeriod : filters.period || 'ALL';
  const effectiveStart = propStartDate !== undefined ? propStartDate : filters.startDate || '';
  const effectiveEnd = propEndDate !== undefined ? propEndDate : filters.endDate || '';

  const handleSelectPreset = (presetId: string) => {
    const preset = PRESET_PERIODS.find((p) => p.id === presetId);
    if (!preset) return;

    const { start, end, period } = preset.compute();
    setCustomStart(start);
    setCustomEnd(end);

    if (onChange) {
      onChange(start, end, period);
    } else {
      setFilterGroup({
        startDate: start,
        endDate: end,
        period: period
      });
    }
    setIsOpen(false);
  };

  const handleApplyCustom = () => {
    if (onChange) {
      onChange(customStart, customEnd, 'CUSTOM');
    } else {
      setFilterGroup({
        startDate: customStart,
        endDate: customEnd,
        period: 'CUSTOM'
      });
    }
    setIsOpen(false);
  };

  const handleReset = () => {
    setCustomStart('');
    setCustomEnd('');
    if (onChange) {
      onChange('', '', 'ALL');
    } else {
      resetFilters();
    }
    setIsOpen(false);
  };

  const getDisplayLabel = () => {
    if (effectivePeriod === 'ALL' || !effectivePeriod) return tText('Toutes les dates');
    if (effectivePeriod === 'TODAY') return tText("Aujourd'hui");
    if (effectivePeriod === 'THIS_WEEK') return tText('Cette semaine');
    if (effectivePeriod === 'THIS_QUARTER') return tText('Ce trimestre');
    if (effectivePeriod === 'CUSTOM') {
      if (effectiveStart && effectiveEnd) return `${effectiveStart} → ${effectiveEnd}`;
      if (effectiveStart) return `Depuis ${effectiveStart}`;
      if (effectiveEnd) return `Jusqu'au ${effectiveEnd}`;
      return tText('Personnalisé');
    }
    if (/^\d{4}-\d{2}$/.test(effectivePeriod)) {
      const [year, month] = effectivePeriod.split('-');
      const monthNames = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
      ];
      return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
    }
    return effectivePeriod;
  };

  return (
    <div className={`relative inline-block text-left ${className}`} id={`date_range_picker_${targetNamespace}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center justify-between gap-2.5 px-3 py-2 bg-slate-900/80 hover:bg-slate-800/80 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-medium transition-all shadow-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer ${
          effectivePeriod !== 'ALL' && effectivePeriod ? 'border-cyan-500/50 bg-cyan-950/20 text-cyan-200' : ''
        }`}
        id={`btn_date_picker_toggle_${targetNamespace}`}
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="truncate max-w-[180px]">{getDisplayLabel()}</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            className="absolute left-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl shadow-black/80 z-50 p-3 space-y-3 font-sans animate-in fade-in zoom-in-95 duration-100"
            id={`dropdown_date_picker_${targetNamespace}`}
          >
            {showPresets && (
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">
                  {tText('Périodes prédéfinies')}
                </div>
                <div className="grid grid-cols-2 gap-1 pt-1">
                  {PRESET_PERIODS.map((preset) => {
                    const isSelected = effectivePeriod === preset.id || (preset.id === 'ALL' && !effectivePeriod);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset.id)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer text-left ${
                          isSelected
                            ? 'bg-cyan-950/80 text-cyan-300 font-semibold border border-cyan-800/60'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{tText(preset.labelKey)}</span>
                        {isSelected && <Check className="w-3 h-3 text-cyan-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="border-t border-slate-800 pt-2.5 space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">
                {tText('Intervalle personnalisé')}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">{tText('Du')}</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">{tText('Au')}</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-2.5 py-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg text-xs inline-flex items-center gap-1 transition cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{tText('Réinitialiser')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleApplyCustom}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
                >
                  {tText('Appliquer')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DateRangePicker;
