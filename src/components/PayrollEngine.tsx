import React, { useState, useEffect } from "react";
import { formatPayrollCycleName } from "../utils/dateUtils";
import { 
  Employee, 
  PayrollCycle, 
  PayrollRecord, 
  LedgerTransaction, 
  ForensicLog, 
  ERPEvent, 
  Role,
  AttendanceRecord,
  EmployeeContract,
  LeaveRecord,
  OvertimeRequest,
  AbsenceEvent,
  PayrollInputSnapshot,
  SalaryStructure,
  PayrollProfile,
  SalaryAdvance,
  PayrollBonus,
  PayrollDeduction,
  Payslip,
  Business
} from "../types";
import { 
  PayrollCycleSelector,
  PayrollRunTable,
  PayrollRunModal,
  PayrollSlipViewer,
  CreatePayrollCycleDialog,
  EditCycleModal,
  usePayrollRuns,
  usePayrollCalculation,
  usePayrollUIState
} from "./payroll";
import { useI18n } from "../i18n";
import { toast } from "sonner";
import { PayrollRepository } from "../repositories/PayrollRepository";
import { 
  Landmark, 
  DollarSign, 
  Layers, 
  FileText, 
  Calendar, 
  Plus, 
  ShieldCheck, 
  TrendingUp, 
  Clock, 
  Trash2,
  Users,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Lock
} from "lucide-react";

export interface PayrollProps {
  currentRole: Role;
  current_business_id: string;
  employees: Employee[];
  ledgerTransactions: LedgerTransaction[];
  payrollCycles: PayrollCycle[];
  payrollRecords: PayrollRecord[];
  attendanceRecords: AttendanceRecord[];
  onLockCycle: (cycleId: string, lockedBy: string) => void;
  onAddCycle: (cycle: PayrollCycle) => void;
  onUpdateCycle: (cycleId: string, updates: Partial<PayrollCycle>) => void;
  onDeleteCycle?: (cycleId: string) => Promise<void> | void;
  onAddRecords: (records: PayrollRecord[]) => void;
  onDeletePayrollRecord?: (recordId: string) => void;
  onAddForensicLog: (log: ForensicLog) => void;
  onAddEvent: (ev: ERPEvent) => void;
  onAddTransaction: (tx: LedgerTransaction) => void;
  currentUser?: { name: string; id: string };
  currentBusiness?: Business;
  employeeContracts?: EmployeeContract[];
  leaves?: LeaveRecord[];
  shifts?: any[];
  overtimeRequests?: OvertimeRequest[];
  absenceEvents?: AbsenceEvent[];
  payrollInputsSnapshots?: PayrollInputSnapshot[];
  salaryStructures?: SalaryStructure[];
  payrollProfiles?: PayrollProfile[];
  salaryAdvances?: SalaryAdvance[];
  payrollBonuses?: PayrollBonus[];
  payrollDeductions?: PayrollDeduction[];
  payslips?: Payslip[];
}

export default function PayrollEngine({
  currentRole,
  current_business_id,
  employees,
  ledgerTransactions,
  payrollCycles,
  payrollRecords,
  attendanceRecords,
  onLockCycle,
  onAddCycle,
  onUpdateCycle,
  onDeleteCycle,
  onAddRecords,
  onDeletePayrollRecord,
  onAddForensicLog,
  onAddEvent,
  onAddTransaction,
  currentUser,
  currentBusiness,
  employeeContracts,
  leaves = [],
  shifts = [],
  overtimeRequests = [],
  absenceEvents = [],
  payrollInputsSnapshots = [],
  salaryStructures = [],
  payrollProfiles = [],
  salaryAdvances = [],
  payrollBonuses = [],
  payrollDeductions = [],
  payslips = [],
}: PayrollProps) {
  const { language } = useI18n();

  // 1. UI Navigation & Tabs
  const [activeTab, setActiveTab] = useState<"runs" | "structures" | "advances" | "history">("runs");

  // 2. Business Runs Hook
  const {
    tenantCycles,
    activeCycle,
    selectedCycleId,
    setSelectedCycleId,
    activeCycleRecords,
    isCycleLocked,
    deleteCycleLocal,
    updateCycleLocal,
    addCycleLocal,
    deleteRecordLocal,
    addRecordsLocal,
    deleteRecordsForExcludedEmployees,
  } = usePayrollRuns({
    payrollCycles,
    payrollRecords,
    current_business_id,
    onLockCycle,
    onAddCycle,
    onUpdateCycle,
  });

  // 3. Calculation & Dry-Run Engine Hook
  const {
    isCalculating,
    dryRunRecords,
    calculationSummary,
    runPayrollDryRun,
    commitPayrollCycle,
    sealPayrollCycle,
    reversePayrollCycle,
  } = usePayrollCalculation({
    current_business_id,
    employees,
    attendanceRecords,
    salaryAdvances,
    payrollBonuses,
    payrollDeductions,
    ledgerTransactions,
    currentUser,
    onAddCycle: (cycle) => {
      addCycleLocal(cycle);
      if (onAddCycle) onAddCycle(cycle);
    },
    onAddRecords: (records) => {
      addRecordsLocal(records);
      if (onAddRecords) onAddRecords(records);
    },
    onUpdateCycle: (cycleId, updates) => {
      updateCycleLocal(cycleId, updates);
      if (onUpdateCycle) onUpdateCycle(cycleId, updates);
    },
    onAddTransaction,
    onAddEvent,
    onAddForensicLog,
  });

  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [viewedRecord, setViewedRecord] = useState<PayrollRecord | null>(null);
  const [isCreateCycleOpen, setIsCreateCycleOpen] = useState(false);
  const [isEditCycleOpen, setIsEditCycleOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeletingCycle, setIsDeletingCycle] = useState(false);

  // Seal & Reversal states
  const [isSealConfirmOpen, setIsSealConfirmOpen] = useState(false);
  const [isSealing, setIsSealing] = useState(false);
  const [isReverseConfirmOpen, setIsReverseConfirmOpen] = useState(false);
  const [reversalReason, setReversalReason] = useState("");
  const [isReversing, setIsReversing] = useState(false);

  const handleDeleteActiveCycle = () => {
    if (!activeCycle || !onDeleteCycle) return;
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteActiveCycle = async () => {
    if (!activeCycle || !onDeleteCycle) return;
    setIsDeletingCycle(true);
    const cycleId = activeCycle.id;
    const cycleName = activeCycle.cycleName || activeCycle.label || activeCycle.id;
    try {
      console.debug(`[PayrollEngine] Deleting cycle: ${cycleId}`);
      deleteCycleLocal(cycleId);
      const remaining = tenantCycles.filter((c) => c.id !== cycleId);
      if (remaining.length > 0) {
        setSelectedCycleId(remaining[0].id);
      } else {
        setSelectedCycleId("");
      }
      await onDeleteCycle(cycleId);
      setIsDeleteConfirmOpen(false);
      toast.success(`Le cycle "${cycleName}" a été supprimé avec succès.`);
      console.debug(`[Payroll] UI refreshed. Remaining cycles: ${remaining.length}`);
    } catch (err: any) {
      console.error("[Payroll] Error deleting cycle:", err);
      toast.error("Erreur lors de la suppression du cycle: " + (err.message || "Échec"));
    } finally {
      setIsDeletingCycle(false);
    }
  };

  const handleConfirmSeal = async () => {
    if (!activeCycle) return;
    setIsSealing(true);
    try {
      console.debug(`[Payroll] Sealing cycle ${activeCycle.id} with ${activeCycleRecords.length} records...`);
      await sealPayrollCycle(activeCycle, activeCycleRecords);
      updateCycleLocal(activeCycle.id, {
        status: "SEALED",
        validatedAt: new Date().toISOString(),
        validatedBy: currentUser?.name || "UTILISATEUR",
      });
      setIsSealConfirmOpen(false);
      toast.success(`Le cycle "${activeCycle.cycleName || activeCycle.label}" a été scellé (SEALED) avec succès.`);
    } catch (err: any) {
      console.error("[Payroll] Sealing error:", err);
      toast.error("Erreur lors du scellement : " + (err.message || "Échec"));
    } finally {
      setIsSealing(false);
    }
  };

  const handleConfirmReverse = async () => {
    if (!activeCycle) return;
    setIsReversing(true);
    const reason = reversalReason.trim() || "Contre-passation et correction des écritures de paie";
    try {
      console.debug(`[Payroll] Reversing sealed cycle ${activeCycle.id}...`);
      const { reversalCycle, reversalRecords } = await reversePayrollCycle(
        activeCycle,
        activeCycleRecords,
        reason
      );
      updateCycleLocal(activeCycle.id, {
        isReversed: true,
        reversalCycleId: reversalCycle.id,
        reversedAt: new Date().toISOString(),
        reversedBy: currentUser?.name || "UTILISATEUR",
        reversalReason: reason,
      });
      addCycleLocal(reversalCycle);
      addRecordsLocal(reversalRecords);
      setSelectedCycleId(reversalCycle.id);
      setIsReverseConfirmOpen(false);
      setReversalReason("");
      toast.success(`Contre-passation effectuée avec succès ! Le cycle DRAFT "${reversalCycle.cycleName}" a été créé.`);
    } catch (err: any) {
      console.error("[Payroll] Reversal error:", err);
      toast.error("Erreur lors de la contre-passation : " + (err.message || "Échec"));
    } finally {
      setIsReversing(false);
    }
  };

  const canExecutePayroll = currentRole === "OWNER" || currentRole === "MANAGER" || currentRole === "SUPER_ADMIN";

  const handleCreateCycle = async (newCycle: PayrollCycle) => {
    console.debug(`[Payroll] Parent handleCreateCycle called for cycle ${newCycle.id} (${newCycle.cycleName})`);
    try {
      // 1. Instantly register in local state to guarantee immediate UI visibility
      addCycleLocal(newCycle);
      setSelectedCycleId(newCycle.id);

      // 2. Persist to Firestore via prop callback or repository
      if (onAddCycle) {
        await onAddCycle(newCycle);
      } else {
        await PayrollRepository.createCycle(newCycle);
      }
      console.debug("[Payroll] Cycle created with ID:", newCycle.id, "and name:", newCycle.cycleName || newCycle.label);

      // 3. Auto-trigger calculation upon cycle creation
      try {
        const calculatedRecords = await runPayrollDryRun(newCycle);
        if (calculatedRecords && calculatedRecords.length > 0) {
          addRecordsLocal(calculatedRecords);
          await commitPayrollCycle(newCycle, calculatedRecords, { updateStatus: "CALCULATED" });
        }
      } catch (calcErr: any) {
        console.warn("[Payroll] Calculation step post-creation warning:", calcErr);
      }
    } catch (err: any) {
      console.error("[Payroll] Failed to create or calculate payroll cycle in parent:", err);
      throw err;
    }
  };

  const totalGrossCycle = activeCycleRecords.reduce(
    (acc, r) => acc + (r.grossSalary || (r.gross_salary_cents ? r.gross_salary_cents / 100 : 0)),
    0
  );

  const totalNetCycle = activeCycleRecords.reduce(
    (acc, r) => acc + (r.netPaid || (r.net_salary_cents ? r.net_salary_cents / 100 : 0)),
    0
  );

  const closedCyclesCount = tenantCycles.filter(
    (c) => c.status === "SEALED" || c.status === "LOCKED" || c.status === "PAID"
  ).length;

  const sealedCyclesCount = tenantCycles.filter((c) => c.status === "SEALED").length;

  return (
    <div className="space-y-6 text-slate-100">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Moteur de Paie & Rémunérations</span>
              <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                V3 Quinzaine
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Calcul des salaires, retenues fiscales ONA (6%) / OFATMA (2%) et conformité légale.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canExecutePayroll && (
            <button
              type="button"
              onClick={() => setIsCreateCycleOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-900/20"
            >
              <Plus className="w-4 h-4" /> Nouveau Cycle
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">Masse Brute Active</span>
            <DollarSign className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-lg font-bold text-white font-mono">
            {totalGrossCycle.toLocaleString("fr-FR")} HTG
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">Total Net Déboursé</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-emerald-400 font-mono">
            {totalNetCycle.toLocaleString("fr-FR")} HTG
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">Effectif Rattaché</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-lg font-bold text-white">{employees.length} Collaborateurs</div>
        </div>

        <div 
          id="kpi-closed-cycles-card"
          className={`p-3.5 rounded-xl border transition-all duration-200 ${
            closedCyclesCount > 0 && closedCyclesCount === tenantCycles.length
              ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300 shadow-sm"
              : "bg-slate-900/40 border-slate-800/80 text-white"
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">Cycles Clôturés & Scellés</span>
            {sealedCyclesCount > 0 ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            ) : closedCyclesCount > 0 ? (
              <CheckCircle2 className="w-4 h-4 text-amber-400" />
            ) : (
              <Clock className="w-4 h-4 text-slate-400" />
            )}
          </div>
          <div className="flex items-baseline justify-between gap-1.5">
            <div className={`text-lg font-bold font-mono ${
              closedCyclesCount > 0 && closedCyclesCount === tenantCycles.length
                ? "text-emerald-400"
                : "text-white"
            }`}>
              {closedCyclesCount} / {tenantCycles.length}
            </div>
            {sealedCyclesCount > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                {sealedCyclesCount} scellé{sealedCyclesCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Tab: Runs & Calculations */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <PayrollCycleSelector
            cycles={tenantCycles}
            selectedCycleId={selectedCycleId || activeCycle?.id || ""}
            onSelectCycle={(id) => setSelectedCycleId(id)}
            onOpenCreateModal={() => setIsCreateCycleOpen(true)}
            onOpenEditModal={() => setIsEditCycleOpen(true)}
            onDeleteActiveCycle={handleDeleteActiveCycle}
            canCreate={canExecutePayroll}
          />

          {activeCycle && activeCycle.status === "SEALED" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-2 rounded-xl bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 font-mono text-xs font-semibold flex items-center gap-2 shadow-inner">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Cycle Scellé (SEALED) & Écriture GL Générée</span>
              </span>

              {activeCycle.isReversed ? (
                <span className="px-3 py-2 rounded-xl bg-red-950/80 border border-red-800/80 text-red-400 font-mono text-xs font-semibold flex items-center gap-2 shadow-inner">
                  <RotateCcw className="w-4 h-4 text-red-400" />
                  <span>Cycle Contre-passé</span>
                </span>
              ) : canExecutePayroll ? (
                <button
                  type="button"
                  id="reverse-sealed-cycle-btn"
                  onClick={() => {
                    setReversalReason("");
                    setIsReverseConfirmOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-900/20 transition cursor-pointer"
                  title="Effectuer une contre-passation comptable et générer un nouveau cycle DRAFT"
                >
                  <RotateCcw className="w-4 h-4 text-amber-200" />
                  <span>Renverser (Contre-passation)</span>
                </button>
              ) : null}
            </div>
          )}

          {activeCycle && activeCycle.status !== "SEALED" && canExecutePayroll && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="execute-payroll-calc-btn"
                onClick={() => {
                  runPayrollDryRun(activeCycle);
                  setIsRunModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-900/20 transition cursor-pointer"
              >
                <span>Exécuter le calcul</span>
              </button>

              {activeCycleRecords.length > 0 && (
                <button
                  type="button"
                  id="seal-payroll-cycle-btn"
                  onClick={() => setIsSealConfirmOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-900/20 transition cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-200" />
                  <span>Sceller (SEALED)</span>
                </button>
              )}
            </div>
          )}
        </div>

        <PayrollRunTable
          records={activeCycleRecords}
          isLocked={isCycleLocked}
          currentRole={currentRole}
          activeCycle={activeCycle}
          onViewRecordDetails={(rec) => setViewedRecord(rec)}
          onDeleteRecord={async (recId) => {
            deleteRecordLocal(recId);
            if (onDeletePayrollRecord) {
              await onDeletePayrollRecord(recId);
            }
          }}
          onToggleExcludeRecord={(recId) => {
            const updated = activeCycleRecords.map((r) =>
              r.id === recId ? { ...r, isExcluded: !r.isExcluded } : r
            );
            addRecordsLocal(updated);
            if (onAddRecords) {
              onAddRecords(updated);
            }
          }}
        />
      </div>

      {/* Edit Cycle Modal */}
      {isEditCycleOpen && activeCycle && (
        <EditCycleModal
          isOpen={isEditCycleOpen}
          onClose={() => setIsEditCycleOpen(false)}
          cycle={activeCycle}
          employees={employees}
          onUpdateCycle={async (cycleId, updates) => {
            updateCycleLocal(cycleId, updates);
            if (updates.excludedEmployeeIds && updates.excludedEmployeeIds.length > 0) {
              deleteRecordsForExcludedEmployees(cycleId, updates.excludedEmployeeIds);
            }
            if (onUpdateCycle) {
              await onUpdateCycle(cycleId, updates);
            }
          }}
          onDeleteCycle={async (id) => {
            deleteCycleLocal(id);
            const remaining = tenantCycles.filter((c) => c.id !== id);
            if (remaining.length > 0) {
              setSelectedCycleId(remaining[0].id);
            } else {
              setSelectedCycleId("");
            }
            if (onDeleteCycle) {
              await onDeleteCycle(id);
            }
            toast.success("Cycle DRAFT supprimé avec succès.");
          }}
          onReCalculate={async (updatedCycle) => {
            updateCycleLocal(updatedCycle.id, updatedCycle);
            if (updatedCycle.excludedEmployeeIds && updatedCycle.excludedEmployeeIds.length > 0) {
              deleteRecordsForExcludedEmployees(updatedCycle.id, updatedCycle.excludedEmployeeIds);
            }
            const calculatedRecords = await runPayrollDryRun(updatedCycle);
            if (calculatedRecords && calculatedRecords.length > 0) {
              await commitPayrollCycle(updatedCycle, calculatedRecords, { updateStatus: "CALCULATED" });
              addRecordsLocal(calculatedRecords);
            }
          }}
        />
      )}

      {/* Seal Confirmation Modal */}
      {isSealConfirmOpen && activeCycle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 text-emerald-400 mb-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Sceller le Cycle de Paie (SEALED)</h3>
                <p className="text-xs text-slate-400">Action irréversible et clôture comptable légale</p>
              </div>
            </div>

            <div className="text-xs text-slate-300 mb-6 space-y-2 bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/50">
              <p>
                Voulez-vous sceller définitivement le cycle{" "}
                <strong className="text-white font-semibold">{activeCycle.cycleName || activeCycle.label || activeCycle.id}</strong> avec{" "}
                <strong className="text-emerald-300 font-semibold">{activeCycleRecords.length} bulletins de paie</strong> ?
              </p>
              <ul className="list-disc list-inside text-slate-400 space-y-1 pt-1 text-[11px]">
                <li>Génération d'une empreinte cryptographique SHA-256 dans le journal médico-légal.</li>
                <li>Génération et verrouillage des écritures comptables dans le Grand Livre (GL).</li>
                <li>Ce cycle deviendra immuable et ne pourra plus être modifié directement.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsSealConfirmOpen(false)}
                disabled={isSealing}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Annuler
              </button>
              <button
                id="confirm-seal-cycle-btn"
                type="button"
                onClick={handleConfirmSeal}
                disabled={isSealing}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-lg shadow-emerald-900/30 disabled:opacity-50 cursor-pointer"
              >
                {isSealing ? (
                  <span>Scellement en cours...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Confirmer le Scellement (SEALED)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reversal Confirmation Modal */}
      {isReverseConfirmOpen && activeCycle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 text-amber-400 mb-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Contre-passation du Cycle Scellé</h3>
                <p className="text-xs text-slate-400">Annulation comptable et création d'un nouveau cycle de correction</p>
              </div>
            </div>

            <div className="text-xs text-slate-300 mb-4 space-y-2 bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/50">
              <p>
                Vous allez effectuer une contre-passation du cycle{" "}
                <strong className="text-white font-semibold">{activeCycle.cycleName || activeCycle.label || activeCycle.id}</strong>.
              </p>
              <ul className="list-disc list-inside text-slate-400 space-y-1 pt-1 text-[11px]">
                <li>Le cycle original reste scellé et archivé pour l'audit.</li>
                <li>Une écriture comptable d'extourne (contre-passation inverse) sera passée dans le Grand Livre.</li>
                <li>Un nouveau cycle en statut <strong>DRAFT</strong> sera généré avec des bulletins inversés.</li>
                <li>Un enregistrement médico-légal infalsifiable sera horodaté.</li>
              </ul>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Motif de la contre-passation *
              </label>
              <textarea
                rows={2}
                required
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="Ex : Erreur sur le calcul des commissions ou des avances..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsReverseConfirmOpen(false)}
                disabled={isReversing}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Annuler
              </button>
              <button
                id="confirm-reverse-cycle-btn"
                type="button"
                onClick={handleConfirmReverse}
                disabled={isReversing}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-lg shadow-amber-900/30 disabled:opacity-50 cursor-pointer"
              >
                {isReversing ? (
                  <span>Contre-passation...</span>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Confirmer la Contre-passation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Cycle Confirmation Modal */}
      {isDeleteConfirmOpen && activeCycle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Supprimer le Cycle DRAFT</h3>
                <p className="text-xs text-slate-400">Action irréversible (soft-delete avec journal médico-légal)</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-6 leading-relaxed bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
              Êtes-vous sûr de vouloir supprimer définitivement le cycle de paie{" "}
              <strong className="text-white font-semibold">{activeCycle.cycleName || activeCycle.label || activeCycle.id}</strong> ?
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(false)}
                disabled={isDeletingCycle}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Annuler
              </button>
              <button
                id="confirm-delete-cycle-btn"
                type="button"
                onClick={confirmDeleteActiveCycle}
                disabled={isDeletingCycle}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-lg shadow-red-900/30 disabled:opacity-50"
              >
                {isDeletingCycle ? (
                  <span>Suppression...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmer la suppression</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Cycle Modal */}
      {isCreateCycleOpen && (
        <CreatePayrollCycleDialog
          isOpen={isCreateCycleOpen}
          onClose={() => setIsCreateCycleOpen(false)}
          onCreateCycle={handleCreateCycle}
          current_business_id={current_business_id}
          existingCycles={tenantCycles}
        />
      )}

      {/* Execution Run Modal */}
      {isRunModalOpen && (
        <PayrollRunModal
          isOpen={isRunModalOpen}
          onClose={() => setIsRunModalOpen(false)}
          activeCycle={activeCycle}
          dryRunRecords={dryRunRecords}
          isCalculating={isCalculating}
          onRunDryRun={() => activeCycle && runPayrollDryRun(activeCycle)}
          onCommit={() => activeCycle && commitPayrollCycle(activeCycle, dryRunRecords)}
        />
      )}

      {/* Individual Slip Modal */}
      {viewedRecord && (
        <PayrollSlipViewer
          record={viewedRecord}
          onClose={() => setViewedRecord(null)}
        />
      )}
    </div>
  );
}
