import React, { useState } from "react";
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
  usePayrollRuns,
  usePayrollCalculation,
  usePayrollUIState
} from "./payroll";
import { useI18n } from "../i18n";
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
  Users 
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
  } = usePayrollCalculation({
    current_business_id,
    employees,
    currentUser,
    onAddRecords,
    onAddTransaction,
    onAddEvent,
    onAddForensicLog,
  });

  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [viewedRecord, setViewedRecord] = useState<PayrollRecord | null>(null);
  const [isCreateCycleOpen, setIsCreateCycleOpen] = useState(false);
  const [newCycleName, setNewCycleName] = useState("");
  const [newCycleStart, setNewCycleStart] = useState("");
  const [newCycleEnd, setNewCycleEnd] = useState("");

  const canExecutePayroll = currentRole === "OWNER" || currentRole === "MANAGER";

  const handleCreateNewCycle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCycleName.trim() || !newCycleStart || !newCycleEnd) return;

    const newCycle: PayrollCycle = {
      id: "cyc_" + Math.random().toString(36).substring(2, 9),
      business_id: current_business_id,
      cycleName: newCycleName.trim(),
      startDate: newCycleStart,
      endDate: newCycleEnd,
      status: "DRAFT",
    };

    onAddCycle(newCycle);
    setSelectedCycleId(newCycle.id);
    setIsCreateCycleOpen(false);
    setNewCycleName("");
  };

  const totalGrossCycle = activeCycleRecords.reduce(
    (acc, r) => acc + (r.grossSalary || (r.gross_salary_cents ? r.gross_salary_cents / 100 : 0)),
    0
  );

  const totalNetCycle = activeCycleRecords.reduce(
    (acc, r) => acc + (r.netPaid || (r.net_salary_cents ? r.net_salary_cents / 100 : 0)),
    0
  );

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

        <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">Cycles Clôturés</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-white">
            {tenantCycles.filter((c) => c.status === "LOCKED" || c.status === "PAID").length} / {tenantCycles.length}
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
            canCreate={canExecutePayroll}
          />

          {activeCycle && !isCycleLocked && canExecutePayroll && (
            <button
              type="button"
              onClick={() => {
                runPayrollDryRun(activeCycle);
                setIsRunModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-900/20"
            >
              <span>Exécuter le calcul de ce cycle</span>
            </button>
          )}
        </div>

        <PayrollRunTable
          records={activeCycleRecords}
          isLocked={isCycleLocked}
          currentRole={currentRole}
          onViewRecordDetails={(rec) => setViewedRecord(rec)}
          onDeleteRecord={onDeletePayrollRecord}
        />
      </div>

      {/* Create Cycle Modal */}
      {isCreateCycleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="text-sm font-bold text-white">Nouveau Cycle de Paie (Quinzaine)</h2>
            <form onSubmit={handleCreateNewCycle} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Nom / Libellé du cycle *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Quinzaine 1 - Mai 2026"
                  value={newCycleName}
                  onChange={(e) => setNewCycleName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Date Début *</label>
                  <input
                    type="date"
                    required
                    value={newCycleStart}
                    onChange={(e) => setNewCycleStart(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Date Fin *</label>
                  <input
                    type="date"
                    required
                    value={newCycleEnd}
                    onChange={(e) => setNewCycleEnd(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateCycleOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
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
