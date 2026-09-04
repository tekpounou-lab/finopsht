import React from "react";
import { Plus, Check } from "lucide-react";
import { AdaptiveModal } from "../../ui/AdaptiveModal";
import { PayrollType } from "../../../lib/payrollPostingDate";

export interface CreateCycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  cycleType: PayrollType;
  setCycleType: (type: PayrollType) => void;
  cycleLabel: "Q1" | "Q2";
  setCycleLabel: (label: "Q1" | "Q2") => void;
  cycleMonth: number;
  setCycleMonth: (month: number) => void;
  cycleYear: number;
  setCycleYear: (year: number) => void;
  customStart: string;
  setCustomStart: (start: string) => void;
  customEnd: string;
  setCustomEnd: (end: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  l: any;
  calculatePayrollPostingDate: (params: any) => string;
  getMonthLabel: (month: number) => string;
}

export const CreateCycleModal: React.FC<CreateCycleModalProps> = ({
  isOpen,
  onClose,
  cycleType,
  setCycleType,
  cycleLabel,
  setCycleLabel,
  cycleMonth,
  setCycleMonth,
  cycleYear,
  setCycleYear,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  onSubmit,
  l,
  calculatePayrollPostingDate,
  getMonthLabel
}) => {
  return (
    <AdaptiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={l.createCycle}
      icon={<Plus className="w-5 h-5" />}
      iconVariant="blue"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" id="create-cycle-form">
        <div>
          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Type de Paie (Payroll Type)</label>
          <select
            id="cycle-form-type"
            value={cycleType}
            onChange={(e) => {
              const newType = e.target.value as PayrollType;
              setCycleType(newType);
              if (newType === "REGULAR_FIRST_HALF") setCycleLabel("Q1");
              if (newType === "REGULAR_SECOND_HALF") setCycleLabel("Q2");
            }}
            className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-emerald-400 font-semibold"
          >
            <option value="REGULAR_FIRST_HALF">REGULAR_FIRST_HALF (1ère Quinzaine : 1 - 15)</option>
            <option value="REGULAR_SECOND_HALF">REGULAR_SECOND_HALF (2ème Quinzaine : 16 - Fin de Mois)</option>
            <option value="BONUS">BONUS (Paie Spéciale de Gratification / Prime)</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Période Rattachée (Half Period)</label>
          <select
            id="cycle-form-label"
            value={cycleLabel}
            onChange={(e) => setCycleLabel(e.target.value as "Q1" | "Q2")}
            className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-200"
          >
            <option value="Q1">Première Quinzaine (Q1 : Jour 1 à 15 → Posting au 15)</option>
            <option value="Q2">Seconde Quinzaine (Q2 : Jour 16 à Fin de Mois → Posting au Dernier Jour)</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3" id="month-year-grid">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Mois</label>
            <select
              id="cycle-form-month"
              value={cycleMonth}
              onChange={(e) => setCycleMonth(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-100"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
                <option key={m} value={m}>{getMonthLabel(m)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Année</label>
            <input
              id="cycle-form-year"
              type="number"
              value={cycleYear}
              onChange={(e) => setCycleYear(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-100 font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3" id="dates-grid">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{l.start_date}</label>
            <input
              id="cycle-form-start-date"
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              placeholder="Auto calculation"
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-100 font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{l.end_date}</label>
            <input
              id="cycle-form-end-date"
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              placeholder="Auto calculation"
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-100 font-mono"
            />
          </div>
        </div>

        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-xs flex flex-col gap-1" id="accounting-posting-preview-box">
          <div className="flex items-center justify-between text-emerald-400 font-medium">
            <span>Date comptable de comptabilisation :</span>
            <span className="font-mono font-bold text-emerald-300 bg-emerald-900/60 px-2 py-0.5 rounded">
              {calculatePayrollPostingDate({
                label: cycleLabel,
                cycleType,
                month: cycleMonth,
                year: cycleYear,
                startDate: customStart,
                endDate: customEnd
              })}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {cycleLabel === "Q1" 
              ? "Règle Q1 : Comptabilisation au 15 du mois de paie." 
              : "Règle Q2 : Comptabilisation au dernier jour du mois de paie."}
          </p>
        </div>

        <button
          id="submit-create-cycle"
          type="submit"
          className="w-full mt-2 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs select-none cursor-pointer rounded-xl transition flex items-center justify-center gap-1.5"
        >
          <Check className="w-4 h-4" />
          {l.generateBtn}
        </button>
      </form>
    </AdaptiveModal>
  );
};
