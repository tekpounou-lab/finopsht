import React, { useState, useEffect } from "react";
import { Edit3, Trash2, Check, Users, ShieldAlert, Calendar, RefreshCw } from "lucide-react";
import { AdaptiveModal } from "../../ui/AdaptiveModal";
import { PayrollCycle, Employee } from "../../../types";
import { formatPayrollCycleName } from "../../../utils/dateUtils";

export interface EditCycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  cycle: PayrollCycle;
  employees: Employee[];
  onUpdateCycle: (cycleId: string, updates: Partial<PayrollCycle>) => Promise<void> | void;
  onDeleteCycle?: (cycleId: string) => Promise<void> | void;
  onReCalculate?: (updatedCycle: PayrollCycle) => void;
}

export const EditCycleModal: React.FC<EditCycleModalProps> = ({
  isOpen,
  onClose,
  cycle,
  employees,
  onUpdateCycle,
  onDeleteCycle,
  onReCalculate,
}) => {
  const [cycleName, setCycleName] = useState(cycle.cycleName || cycle.label || "");
  const [startDate, setStartDate] = useState(cycle.startDate || "");
  const [endDate, setEndDate] = useState(cycle.endDate || "");
  const [enableTaxes, setEnableTaxes] = useState<boolean>((cycle as any).enableTaxes !== false);
  const [excludedIds, setExcludedIds] = useState<string[]>(cycle.excludedEmployeeIds || []);
  const [isAutoName, setIsAutoName] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCycleName(cycle.cycleName || cycle.label || "");
    setStartDate(cycle.startDate || "");
    setEndDate(cycle.endDate || "");
    setEnableTaxes((cycle as any).enableTaxes !== false);

    let initialExcluded: string[] = cycle.excludedEmployeeIds ? [...cycle.excludedEmployeeIds] : [];
    if (cycle.employeeIds && cycle.employeeIds.length > 0) {
      const notInList = employees.filter((e) => !cycle.employeeIds!.includes(e.id)).map((e) => e.id);
      initialExcluded = Array.from(new Set([...initialExcluded, ...notInList]));
    }
    setExcludedIds(initialExcluded);
    setConfirmDelete(false);
  }, [cycle, employees]);

  // Auto-generate cycle name when dates change if auto-name is enabled or name was empty
  useEffect(() => {
    if (isAutoName && startDate && endDate) {
      setCycleName(formatPayrollCycleName(startDate, endDate));
    }
  }, [startDate, endDate, isAutoName]);

  const activeEmployees = employees.filter((e) => e.status === "ACTIVE" || !e.status);

  const toggleEmployeeInclusion = (empId: string) => {
    console.debug(`[EditCycleModal] Toggling employee inclusion: ${empId}`);
    if (excludedIds.includes(empId)) {
      setExcludedIds(excludedIds.filter((id) => id !== empId));
    } else {
      setExcludedIds([...excludedIds, empId]);
    }
  };

  const handleSelectAll = () => {
    setExcludedIds([]);
  };

  const handleDeselectAll = () => {
    setExcludedIds(activeEmployees.map((e) => e.id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) return;

    setIsSaving(true);
    try {
      const activeEmps = employees.filter((e) => e.status === "ACTIVE" || !e.status);
      const includedEmps = activeEmps.filter((e) => !excludedIds.includes(e.id)).map((e) => e.id);
      const computedName = cycleName.trim() || formatPayrollCycleName(startDate, endDate);

      const updates: Partial<PayrollCycle> = {
        cycleName: computedName,
        label: computedName,
        startDate,
        endDate,
        start_date: startDate,
        end_date: endDate,
        excludedEmployeeIds: excludedIds,
        employeeIds: includedEmps,
        enableTaxes,
        recordsCount: includedEmps.length,
      } as any;

      console.debug(`[EditCycleModal] Submitting cycle update:`, updates);

      const updatedCycle: PayrollCycle = {
        ...cycle,
        ...updates,
      };

      await onUpdateCycle(cycle.id, updates);

      if (onReCalculate) {
        onReCalculate(updatedCycle);
      }

      onClose();
    } catch (err) {
      console.error("[Payroll] Error updating cycle draft:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDeleteCycle) return;

    setIsDeleting(true);
    try {
      console.debug(`[Payroll] Delete draft requested for cycle: ${cycle.id}`);
      await onDeleteCycle(cycle.id);
      onClose();
    } catch (err) {
      console.error("[Payroll] Error deleting cycle draft:", err);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  const filteredEmployees = activeEmployees.filter(
    (e) =>
      e.name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      e.department_name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      e.branch_name?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const includedCount = activeEmployees.length - excludedIds.length;

  return (
    <AdaptiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Modifier le Cycle de Paie (DRAFT)"
      icon={<Edit3 className="w-5 h-5 text-indigo-400" />}
      iconVariant="blue"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Dates & Period */}
        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-indigo-400" />
              Période de Paie
            </span>
            <button
              type="button"
              onClick={() => {
                setIsAutoName(true);
                if (startDate && endDate) {
                  setCycleName(formatPayrollCycleName(startDate, endDate));
                }
              }}
              className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 underline"
            >
              <RefreshCw className="w-3 h-3" />
              Générer nom auto
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-medium">Date Début *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-medium">Date Fin *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-1 font-medium">Nom / Libellé du Cycle *</label>
            <input
              type="text"
              required
              value={cycleName}
              onChange={(e) => {
                setCycleName(e.target.value);
                setIsAutoName(false);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-semibold"
            />
          </div>
        </div>

        {/* Calculation Parameters / Taxes Toggle */}
        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-2">
          <span className="font-bold text-slate-300 block mb-1">Paramètres de Calcul</span>
          <label className="flex items-center gap-2 cursor-pointer bg-slate-950 p-2.5 rounded-lg border border-slate-800 hover:border-slate-700">
            <input
              type="checkbox"
              checked={enableTaxes}
              onChange={(e) => setEnableTaxes(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 focus:ring-indigo-500"
            />
            <div>
              <span className="font-medium text-white block">Activer les cotisations fiscales légalement obligatoires (ONA 6% & OFATMA 2%)</span>
              <span className="text-[10px] text-slate-400 block">
                {enableTaxes
                  ? "Les taux normaux ONA (6% salarié / 6% employeur) et OFATMA (2% salarié / 3% employeur) seront appliqués."
                  : "Désactivé : Aucune retenue fiscale ne sera déduite (taux ramenés à 0%)."}
              </span>
            </div>
          </label>
        </div>

        {/* Included Employees Selection */}
        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-emerald-400" />
              Employés Inclus dans le Cycle ({includedCount} / {activeEmployees.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[10px] text-emerald-400 hover:text-emerald-300"
              >
                Tout inclure
              </button>
              <span className="text-slate-600">|</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-[10px] text-amber-400 hover:text-amber-300"
              >
                Tout exclure
              </button>
            </div>
          </div>

          <input
            type="text"
            placeholder="Filtrer par nom, département, succursale..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-[11px]"
          />

          <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
            {filteredEmployees.length === 0 ? (
              <p className="text-[11px] text-slate-500 py-2 text-center">Aucun employé correspondant</p>
            ) : (
              filteredEmployees.map((emp) => {
                const isExcluded = excludedIds.includes(emp.id);
                return (
                  <label
                    key={emp.id}
                    className={`flex items-center justify-between p-2 rounded-lg border transition cursor-pointer ${
                      !isExcluded
                        ? "bg-slate-950 border-slate-800 hover:border-slate-700"
                        : "bg-red-950/20 border-red-900/40 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!isExcluded}
                        onChange={() => toggleEmployeeInclusion(emp.id)}
                        className="w-3.5 h-3.5 rounded text-indigo-600 bg-slate-900 border-slate-700"
                      />
                      <div>
                        <span className="font-medium text-white block">{emp.name}</span>
                        <span className="text-[10px] text-slate-400">
                          {emp.department_name || "Général"} • {emp.paymentModel || (emp as any).pay_regime || "FIXED"} •{" "}
                          {(emp.salaryBaseHtg || emp.baseSalary || 0).toLocaleString("fr-FR")} HTG
                        </span>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        !isExcluded
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}
                    >
                      {!isExcluded ? "INCLUS" : "EXCLU"}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          {onDeleteCycle && (
            <div>
              {!confirmDelete ? (
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-medium text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Supprimer le Draft</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-red-950/60 p-1 rounded-lg border border-red-800/60">
                  <span className="text-[10px] text-red-300 font-medium px-1">Confirmer ?</span>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleDelete}
                    className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-semibold text-[11px] transition disabled:opacity-50"
                  >
                    {isDeleting ? "..." : "Oui, supprimer"}
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => setConfirmDelete(false)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition"
                  >
                    Non
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 transition shadow-lg shadow-indigo-900/20 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSaving ? "Enregistrement..." : "Enregistrer & Recalculer"}</span>
            </button>
          </div>
        </div>
      </form>
    </AdaptiveModal>
  );
};
