import React, { useState, useEffect } from "react";
import { Calendar, Plus, AlertCircle, Sparkles, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { PayrollCycle } from "../../../types";
import { formatPayrollCycleName } from "../../../utils/dateUtils";
import { PayrollRepository } from "../../../repositories/PayrollRepository";

export interface CreatePayrollCycleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCycle?: (cycle: PayrollCycle) => Promise<void> | void;
  onAddCycle?: (cycle: PayrollCycle) => Promise<void> | void;
  onSubmit?: (cycle: PayrollCycle) => Promise<void> | void;
  current_business_id: string;
  existingCycles?: PayrollCycle[];
}

export const CreatePayrollCycleDialog: React.FC<CreatePayrollCycleDialogProps> = ({
  isOpen,
  onClose,
  onCreateCycle,
  onAddCycle,
  onSubmit,
  current_business_id,
  existingCycles = [],
}) => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [cycleName, setCycleName] = useState("");
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize dates when modal opens if empty
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsSubmitting(false);
      
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = now.getDate();

      // Suggest current quinzaine
      if (day <= 15) {
        const start = `${year}-${month}-01`;
        const end = `${year}-${month}-15`;
        setStartDate(start);
        setEndDate(end);
        setCycleName(formatPayrollCycleName(start, end));
      } else {
        const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
        const start = `${year}-${month}-16`;
        const end = `${year}-${month}-${lastDay}`;
        setStartDate(start);
        setEndDate(end);
        setCycleName(formatPayrollCycleName(start, end));
      }
      setIsNameManuallyEdited(false);
    }
  }, [isOpen]);

  // Update auto-name when dates change, if not manually edited
  useEffect(() => {
    if (startDate && endDate && !isNameManuallyEdited) {
      setCycleName(formatPayrollCycleName(startDate, endDate));
    }
  }, [startDate, endDate, isNameManuallyEdited]);

  if (!isOpen) return null;

  const handleCreate = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    console.debug("[Payroll] Create button clicked.");
    console.debug("[Payroll] Form data:", {
      startDate,
      endDate,
      name: cycleName,
      business_id: current_business_id,
    });

    // 1. Validation: Dates presence
    if (!startDate || !endDate) {
      const msg = "Veuillez sélectionner une date de début et une date de fin valides.";
      setError(msg);
      toast.error(msg);
      return;
    }

    // 2. Validation: Chronological order
    if (new Date(endDate) < new Date(startDate)) {
      const msg = "La date de fin ne peut pas être antérieure à la date de début.";
      setError(msg);
      toast.error(msg);
      return;
    }

    // 3. Validation: Name presence
    const generatedName = formatPayrollCycleName(startDate, endDate);
    const finalName = (cycleName || "").trim() || generatedName;

    if (!finalName) {
      const msg = "Le libellé du cycle de paie est obligatoire.";
      setError(msg);
      toast.error(msg);
      return;
    }

    // 4. Validation: Deduplication against existing cycles
    if (existingCycles && existingCycles.length > 0) {
      const duplicate = existingCycles.some(
        (c) => (c.cycleName || c.label || "").trim().toLowerCase() === finalName.toLowerCase()
      );
      if (duplicate) {
        const msg = `Un cycle de paie nommé "${finalName}" existe déjà.`;
        setError(msg);
        toast.error(msg);
        return;
      }
    }

    const payload: PayrollCycle = {
      id: "cyc_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      business_id: current_business_id,
      cycleName: finalName,
      label: finalName,
      startDate,
      endDate,
      status: "DRAFT",
      created_at: new Date().toISOString(),
    };

    console.debug("[Payroll] Calling createCycle with payload:", payload);

    try {
      setIsSubmitting(true);
      setError(null);

      // Invoke callback provided by parent, or fallback to PayrollRepository
      if (onCreateCycle) {
        await onCreateCycle(payload);
      } else if (onAddCycle) {
        await onAddCycle(payload);
      } else if (onSubmit) {
        await onSubmit(payload);
      } else {
        await PayrollRepository.createCycle(payload);
      }

      console.debug("[Payroll] Cycle created with ID:", payload.id, "and name:", finalName);
      toast.success(`Cycle "${finalName}" créé avec succès.`);
      onClose();
    } catch (err: any) {
      console.error("[Payroll] Error creating cycle:", err);
      const msg = err?.message || "Erreur lors de la création du cycle de paie.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-create-payroll-cycle-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 id="dialog-create-payroll-cycle-title" className="text-sm font-bold text-white tracking-tight">
                Nouveau Cycle de Paie
              </h2>
              <p className="text-[11px] text-slate-400">
                Définition de la période et initialisation en mode DRAFT
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Date range grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cycle-start-date" className="block text-xs font-semibold text-slate-300 mb-1.5">
                Date de début <span className="text-rose-400">*</span>
              </label>
              <input
                id="cycle-start-date"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition"
              />
            </div>
            <div>
              <label htmlFor="cycle-end-date" className="block text-xs font-semibold text-slate-300 mb-1.5">
                Date de fin <span className="text-rose-400">*</span>
              </label>
              <input
                id="cycle-end-date"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition"
              />
            </div>
          </div>

          {/* Cycle Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="cycle-name-input" className="block text-xs font-semibold text-slate-300">
                Nom du cycle de paie <span className="text-rose-400">*</span>
              </label>
              {isNameManuallyEdited && (
                <button
                  type="button"
                  onClick={() => {
                    setIsNameManuallyEdited(false);
                    setCycleName(formatPayrollCycleName(startDate, endDate));
                  }}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition underline decoration-indigo-400/40"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Réinitialiser le nom auto</span>
                </button>
              )}
            </div>
            <input
              id="cycle-name-input"
              type="text"
              required
              placeholder="Ex: Quinzaine du 01/08/2026 au 15/08/2026"
              value={cycleName}
              onChange={(e) => {
                setCycleName(e.target.value);
                setIsNameManuallyEdited(true);
              }}
              className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition"
            />
            <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
              <span>💡</span>
              <span>Nom standardisé généré d'après la période réglementaire (modifiable).</span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
            <button
              id="btn-cancel-create-cycle"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-medium transition border border-slate-700/60"
            >
              Annuler
            </button>
            <button
              id="btn-create-cycle"
              type="submit"
              onClick={handleCreate}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs transition shadow-lg shadow-indigo-600/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Création en cours...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Créer</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
