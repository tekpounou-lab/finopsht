import React, { useState, useMemo } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Receipt, 
  PlusCircle, 
  CheckCircle2, 
  Clock, 
  Wallet, 
  FileText, 
  X, 
  ShoppingBag, 
  Calculator, 
  AlertCircle, 
  ArrowUpRight, 
  Filter,
  Search,
  Sparkles,
  Lock,
  ShieldCheck,
  CalendarDays
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Employee, LedgerTransaction, AttendanceRecord, EmployeeContract, PayrollRecord, PayrollInputSnapshot } from "../../../types";
import { LedgerRepository } from "../../../repositories/LedgerRepository";
import { CommissionEngine } from "../../../services/CommissionEngine";

interface MySalesAndExpensesSectionProps {
  employee: Employee;
  contract?: EmployeeContract;
  transactions: LedgerTransaction[];
  attendanceRecords: AttendanceRecord[];
  payrollRecords?: PayrollRecord[];
  payrollInputsSnapshots?: PayrollInputSnapshot[];
  deptName: string;
  branchName: string;
  onAddTransactionSim?: (tx: LedgerTransaction) => void;
  tw?: any;
}

export const MySalesAndExpensesSection: React.FC<MySalesAndExpensesSectionProps> = ({
  employee,
  contract,
  transactions,
  attendanceRecords,
  payrollRecords = [],
  payrollInputsSnapshots = [],
  deptName,
  branchName,
  onAddTransactionSim,
  tw,
}) => {
  const [periodScope, setPeriodScope] = useState<"ACTIVE_RUNNING" | "CLOSED_PAYROLL" | "ALL">("ACTIVE_RUNNING");
  const [filterType, setFilterType] = useState<"ALL" | "INCOME" | "EXPENSE" | "ADVANCE">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLogSaleModalOpen, setIsLogSaleModalOpen] = useState(false);
  const [isLogExpenseModalOpen, setIsLogExpenseModalOpen] = useState(false);

  // New Sale Form State
  const [saleDescription, setSaleDescription] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [saleCategory, setSaleCategory] = useState("Vente Produits");
  const [salePaymentMethod, setSalePaymentMethod] = useState<"CASH" | "MONCASH" | "NATCASH" | "BANK" | "CARD">("MONCASH");
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);

  // New Expense Form State
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("Frais Déplacement");
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  // Resolution of transactions linked to this employee
  const myTransactions = useMemo(() => {
    return transactions.filter(
      (t) =>
        t.employeeId === employee.id ||
        (t as any).employee_id === employee.id ||
        (t as any).createdBy === employee.id ||
        (t as any).created_by === employee.id ||
        (employee.email && (t as any).createdBy && (t as any).createdBy.toLowerCase().trim() === employee.email.toLowerCase().trim()) ||
        (employee.email && (t as any).created_by && (t as any).created_by.toLowerCase().trim() === employee.email.toLowerCase().trim()) ||
        (employee.email && (t as any).employee_email && (t as any).employee_email.toLowerCase().trim() === employee.email.toLowerCase().trim())
    );
  }, [transactions, employee]);

  // Filter closed payroll records for this employee
  const closedPayrollRecords = useMemo(() => {
    if (!payrollRecords) return [];
    return payrollRecords.filter((p) =>
      ["VALIDATED", "APPROVED", "PAID", "LOCKED"].includes((p.status || "").toUpperCase())
    );
  }, [payrollRecords]);

  // Helper function to check if a transaction belongs to an already closed payroll period
  const getClosedPayrollInfo = useMemo(() => {
    return (t: LedgerTransaction): { isClosed: boolean; periodLabel?: string } => {
      // 1. Explicit status or flags on transaction
      if (
        (t.status as string) === "LOCKED" ||
        (t.status as string) === "PAID" ||
        (t.status as string) === "CLOSED" ||
        (t as any).isLocked === true ||
        (t as any).payroll_synced === true ||
        (t as any).is_closed === true
      ) {
        return {
          isClosed: true,
          periodLabel: (t as any).payroll_cycle_id || (t as any).period || "Paie Clôturée",
        };
      }

      if (!t.date) return { isClosed: false };

      const tDateStr = t.date.substring(0, 10);
      const tYearMonth = tDateStr.substring(0, 7);
      const dayOfMonth = parseInt(tDateStr.substring(8, 10), 10);

      // 2. Check against closed payroll records
      for (const p of closedPayrollRecords) {
        if ((p as any).period_start && (p as any).period_end) {
          const start = String((p as any).period_start).substring(0, 10);
          const end = String((p as any).period_end).substring(0, 10);
          if (tDateStr >= start && tDateStr <= end) {
            return { isClosed: true, periodLabel: p.cycleId || "Quinzaine Clôturée" };
          }
        }

        const cycle = (p.cycleId || p.payroll_cycle_id || "").toUpperCase();
        const pYearMonth = p.generated_at ? String(p.generated_at).substring(0, 7) : "";

        const isSameMonth =
          pYearMonth === tYearMonth ||
          cycle.includes(tYearMonth) ||
          cycle.includes(tYearMonth.replace("-", ""));

        if (isSameMonth) {
          if ((cycle.includes("Q1") || cycle.includes("QUINZAINE_1") || cycle.includes("FIRST")) && dayOfMonth <= 15) {
            return { isClosed: true, periodLabel: p.cycleId || "Quinzaine 1 Clôturée" };
          }
          if ((cycle.includes("Q2") || cycle.includes("QUINZAINE_2") || cycle.includes("SECOND")) && dayOfMonth >= 16) {
            return { isClosed: true, periodLabel: p.cycleId || "Quinzaine 2 Clôturée" };
          }
        }

        // Generic fallback if a closed payroll record exists for current month and date <= 15
        if (isSameMonth && dayOfMonth <= 15) {
          return { isClosed: true, periodLabel: p.cycleId || "Quinzaine Clôturée" };
        }
      }

      return { isClosed: false };
    };
  }, [closedPayrollRecords]);

  // Partition employee transactions by closed status
  const closedTransactions = useMemo(() => {
    return myTransactions.filter((t) => getClosedPayrollInfo(t).isClosed);
  }, [myTransactions, getClosedPayrollInfo]);

  const activeRunningTransactions = useMemo(() => {
    return myTransactions.filter((t) => !getClosedPayrollInfo(t).isClosed);
  }, [myTransactions, getClosedPayrollInfo]);

  // Active transaction set according to chosen period scope
  const activeSet = useMemo(() => {
    if (periodScope === "CLOSED_PAYROLL") return closedTransactions;
    if (periodScope === "ALL") return myTransactions;
    return activeRunningTransactions; // Default: ACTIVE_RUNNING (unclosed period)
  }, [periodScope, closedTransactions, myTransactions, activeRunningTransactions]);

  // Current Month calculations
  const currentDate = new Date();
  const currentMonthPrefix = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;

  // Sales & Commissions for active set
  const totalSales = activeSet
    .filter((t) => t.type === "INCOME")
    .reduce((acc, t) => acc + (t.amount || (t.amount_cents ? t.amount_cents / 100 : 0)), 0);

  const commRate = useMemo(() => {
    return CommissionEngine.resolveCommissionRate(employee, contract);
  }, [employee, contract]);

  const totalCommissions = activeSet
    .filter((t) => t.type === "INCOME")
    .reduce((acc, t) => {
      const comm = (t as any).commission !== undefined ? Number((t as any).commission) : (commRate > 0 && t.amount ? t.amount * commRate : 0);
      return acc + comm;
    }, 0);

  // Reimbursable Expenses & Advances for active set
  const totalExpenses = activeSet
    .filter((t) => t.type === "EXPENSE")
    .reduce((acc, t) => acc + (t.amount || (t.amount_cents ? t.amount_cents / 100 : 0)), 0);

  const totalAdvances = activeSet
    .filter((t) => t.type === "ADVANCE")
    .reduce((acc, t) => acc + (t.amount || (t.amount_cents ? t.amount_cents / 100 : 0)), 0);

  // Live Payroll Projection (Prorated for Active Quinzaine Period)
  const baseRate = employee.baseSalary || contract?.salaryBaseHtg || 0;
  // Quinzaine base salary = Half monthly base salary
  const projectedQuinzaineBase = Math.round(baseRate / 2);
  
  const projectedGross = projectedQuinzaineBase + totalCommissions;
  const estOna = projectedGross > 0 ? Math.round(projectedGross * 0.06) : 0;
  const estOfatma = projectedGross > 0 ? Math.round(projectedGross * 0.02) : 0;
  const totalDeductions = estOna + estOfatma + totalAdvances;
  const projectedNetPay = Math.max(0, projectedGross - totalDeductions);

  // Filtered List for Table
  const filteredTransactions = activeSet.filter((t) => {
    if (filterType !== "ALL" && t.type !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDesc = t.description?.toLowerCase().includes(q);
      const matchCat = t.category?.toLowerCase().includes(q);
      const matchId = t.id?.toLowerCase().includes(q);
      if (!matchDesc && !matchCat && !matchId) return false;
    }
    return true;
  });

  // Handle Log Sale
  const handleSaveSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(saleAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Veuillez saisir un montant de vente valide.");
      return;
    }

    setIsSubmittingSale(true);
    try {
      const calculatedCommission = Math.round(parsedAmount * commRate);
      const newTx: LedgerTransaction = {
        id: `TX-SALE-${Date.now()}`,
        business_id: employee.business_id || "BIZ_DEFAULT",
        branchId: employee.branchId || "BRANCH_DEFAULT",
        departmentId: employee.departmentId || "DEPT_DEFAULT",
        employeeId: employee.id,
        employee_email: employee.email,
        employee_name: employee.name,
        type: "INCOME",
        amount: parsedAmount,
        amount_cents: Math.round(parsedAmount * 100),
        description: saleDescription.trim() || `Vente directe - ${employee.name}`,
        date: new Date().toISOString().split("T")[0],
        category: saleCategory,
        currency: "HTG",
        status: "POSTED",
        payment_method: salePaymentMethod,
        source: "MANUAL",
        isImmutable: false,
        signerId: employee.id,
        commission_claimed: false,
        debit_account: "1010",
        credit_account: "4000",
        ...( { commission: calculatedCommission } as any)
      };

      await LedgerRepository.save(newTx);
      if (onAddTransactionSim) onAddTransactionSim(newTx);

      toast.success(`Vente de ${parsedAmount.toLocaleString("fr-FR")} HTG enregistrée avec succès! Commission: +${calculatedCommission.toLocaleString("fr-FR")} HTG.`);
      setSaleDescription("");
      setSaleAmount("");
      setIsLogSaleModalOpen(false);
    } catch (err: any) {
      console.error("Error saving sale:", err);
      toast.error("Erreur lors de l'enregistrement de la vente: " + (err.message || "Accès refusé"));
    } finally {
      setIsSubmittingSale(false);
    }
  };

  // Handle Log Expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(expenseAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Veuillez saisir un montant de frais valide.");
      return;
    }

    setIsSubmittingExpense(true);
    try {
      const newTx: LedgerTransaction = {
        id: `TX-EXP-${Date.now()}`,
        business_id: employee.business_id || "BIZ_DEFAULT",
        branchId: employee.branchId || "BRANCH_DEFAULT",
        departmentId: employee.departmentId || "DEPT_DEFAULT",
        employeeId: employee.id,
        employee_email: employee.email,
        employee_name: employee.name,
        type: "EXPENSE",
        amount: parsedAmount,
        amount_cents: Math.round(parsedAmount * 100),
        description: expenseDescription.trim() || `Note de frais - ${employee.name}`,
        date: new Date().toISOString().split("T")[0],
        category: expenseCategory,
        currency: "HTG",
        status: "PENDING",
        payment_method: "CASH",
        source: "MANUAL",
        isImmutable: false,
        signerId: employee.id,
        debit_account: "6000",
        credit_account: "1010",
      };

      await LedgerRepository.save(newTx);
      if (onAddTransactionSim) onAddTransactionSim(newTx);

      toast.success(`Demande de remboursement de ${parsedAmount.toLocaleString("fr-FR")} HTG soumise pour validation RH.`);
      setExpenseDescription("");
      setExpenseAmount("");
      setIsLogExpenseModalOpen(false);
    } catch (err: any) {
      console.error("Error saving expense:", err);
      toast.error("Erreur lors de la soumission de la note de frais.");
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* SECTION HEADER & ACTION BUTTONS */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800/60 pb-6">
        <div>
          <h3 className="text-lg font-black text-slate-100 uppercase tracking-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Mes Ventes, Commissions & Notes de Frais
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Suivi en temps réel de votre chiffre d'affaires, commissions acquises et simulation de paie en cours.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => setIsLogSaleModalOpen(true)}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Saisir une Vente
          </button>
          <button
            onClick={() => setIsLogExpenseModalOpen(true)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center gap-2 cursor-pointer"
          >
            <Receipt className="w-4 h-4 text-cyan-400" />
            Déclarer une Note de Frais
          </button>
        </div>
      </div>

      {/* PERIOD SCOPE SELECTOR */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-950 border border-slate-800">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">Filtrer par Période de Paie :</span>
        </div>

        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button
            onClick={() => setPeriodScope("ACTIVE_RUNNING")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 border ${
              periodScope === "ACTIVE_RUNNING"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-md shadow-emerald-500/10"
                : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Période En Cours (Non Clôturée)
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-950 text-emerald-400 font-black">
              {activeRunningTransactions.length}
            </span>
          </button>

          <button
            onClick={() => setPeriodScope("CLOSED_PAYROLL")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 border ${
              periodScope === "CLOSED_PAYROLL"
                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-md shadow-cyan-500/10"
                : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-cyan-400" />
            Périodes Clôturées
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-black">
              {closedTransactions.length}
            </span>
          </button>

          <button
            onClick={() => setPeriodScope("ALL")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 border ${
              periodScope === "ALL"
                ? "bg-slate-800 text-slate-100 border-slate-700"
                : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
            }`}
          >
            Toutes les Périodes
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950 text-slate-400 font-black">
              {myTransactions.length}
            </span>
          </button>
        </div>
      </div>

      {/* CLOSED PAYROLL NOTICE BANNER */}
      {closedPayrollRecords.length > 0 && periodScope === "ACTIVE_RUNNING" && (
        <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 text-xs font-mono text-cyan-200 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-cyan-300 block uppercase">
              Règle SSOT — Isolation de la Paie Clôturée
            </span>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              La paie d'une quinzaine précédente a été clôturée. Les ventes, commissions et avances correspondantes sont enregistrées dans le bulletin scellé.
              Le tableau ci-dessous filtre automatiquement les données pour afficher <strong>uniquement la quinzaine active en cours</strong> afin qu'aucun montant déjà payé ne soit recomptabilisé.
            </p>
          </div>
        </div>
      )}

      {/* KPI METRICS OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: TOTAL SALES */}
        <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Ventes Réalisées</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-100 tracking-tight">
              {totalSales.toLocaleString("fr-FR")} HTG
            </div>
            <span className="text-[10px] font-mono text-slate-500 mt-1 block">
              {periodScope === "ACTIVE_RUNNING" ? "Volume quinzaine en cours" : "Volume sélectionné"}
            </span>
          </div>
        </div>

        {/* CARD 2: COMMISSIONS EARNED */}
        <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Commissions Acquises</span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-cyan-400 tracking-tight">
              +{totalCommissions.toLocaleString("fr-FR")} HTG
            </div>
            <span className="text-[10px] font-mono text-slate-500 mt-1 block">
              Taux commission: {CommissionEngine.formatCommissionRateDisplay(commRate)}
            </span>
          </div>
        </div>

        {/* CARD 3: EXPENSES & ADVANCES */}
        <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Frais & Avances</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-amber-400 tracking-tight">
              {(totalExpenses + totalAdvances).toLocaleString("fr-FR")} HTG
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-1 flex justify-between">
              <span>Frais: {totalExpenses} HTG</span>
              <span>Avances: {totalAdvances} HTG</span>
            </div>
          </div>
        </div>

        {/* CARD 4: LIVE PROJECTED NET PAY */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-cyan-950/40 to-slate-950 border border-cyan-500/30 flex flex-col justify-between space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-cyan-400" /> Paie Net Provisoire
            </span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
              <Calculator className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-cyan-300 tracking-tight">
              {projectedNetPay.toLocaleString("fr-FR")} HTG
            </div>
            <span className="text-[10px] font-mono text-slate-400 mt-1 block">
              Provisoire quinzaine active (post-déductions)
            </span>
          </div>
        </div>
      </div>

      {/* LIVE PAYROLL PROJECTION BREAKDOWN BANNER */}
      <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <h4 className="text-xs font-black text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Calculator className="w-4 h-4 text-cyan-400" />
            Simulation Bulletin de Paie — Quinzaine En Cours ({currentDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).toUpperCase()})
          </h4>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded uppercase font-bold">
            PROJECTION TEMPS RÉEL
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs font-mono">
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[9px] text-slate-400 uppercase block">Base Quinzaine</span>
            <span className="text-slate-200 font-bold">{projectedQuinzaineBase.toLocaleString("fr-FR")} HTG</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[9px] text-slate-400 uppercase block">+ Commissions</span>
            <span className="text-emerald-400 font-bold">+{totalCommissions.toLocaleString("fr-FR")} HTG</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[9px] text-slate-400 uppercase block">= Salaire Brut</span>
            <span className="text-cyan-300 font-bold">{projectedGross.toLocaleString("fr-FR")} HTG</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[9px] text-slate-400 uppercase block">- Retenue ONA (6%)</span>
            <span className="text-rose-400 font-bold">-{estOna.toLocaleString("fr-FR")} HTG</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[9px] text-slate-400 uppercase block">- Retenue OFATMA (2%)</span>
            <span className="text-rose-400 font-bold">-{estOfatma.toLocaleString("fr-FR")} HTG</span>
          </div>

          <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-500/30">
            <span className="text-[9px] text-cyan-300 uppercase block font-bold">ESTIMATION NET</span>
            <span className="text-cyan-300 font-black text-sm">{projectedNetPay.toLocaleString("fr-FR")} HTG</span>
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {(["ALL", "INCOME", "EXPENSE", "ADVANCE"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition cursor-pointer border ${
                filterType === t
                  ? "bg-cyan-500 text-slate-950 border-cyan-400 font-black"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              {t === "ALL" && "Toutes les opérations"}
              {t === "INCOME" && "Ventes (Revenus)"}
              {t === "EXPENSE" && "Notes de Frais"}
              {t === "ADVANCE" && "Avances Reçues"}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher une opération..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 px-3 py-1.5 pr-8 rounded-xl text-xs text-slate-200 outline-none font-sans"
          />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* TRANSACTIONS TABLE */}
      <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/80 border-b border-slate-800 text-[10px] font-mono uppercase text-slate-400 tracking-wider">
                <th className="py-3 px-4">Date & Réf</th>
                <th className="py-3 px-4">Description / Client</th>
                <th className="py-3 px-4">Catégorie</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Montant (HTG)</th>
                <th className="py-3 px-4 text-right">Commission (HTG)</th>
                <th className="py-3 px-4 text-center">Statut Paie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs font-sans">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 text-xs font-mono">
                    Aucune transaction trouvée pour les critères sélectionnés.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isIncome = tx.type === "INCOME";
                  const isExpense = tx.type === "EXPENSE";
                  const isAdvance = tx.type === "ADVANCE";
                  const comm = (tx as any).commission || (isIncome ? tx.amount * commRate : 0);
                  const closedInfo = getClosedPayrollInfo(tx);

                  return (
                    <tr key={tx.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                        <div>{tx.date || "2026-08-24"}</div>
                        <div className="text-[9px] text-slate-500 font-mono uppercase">{tx.id}</div>
                      </td>

                      <td className="py-3 px-4 font-bold text-slate-200">
                        {tx.description}
                        {tx.payment_method && (
                          <span className="ml-2 text-[9px] font-mono px-1.5 py-0.2 bg-slate-900 border border-slate-800 text-slate-400 rounded">
                            {tx.payment_method}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {tx.category || "Général"}
                      </td>

                      <td className="py-3 px-4 font-mono text-[10px] uppercase font-bold">
                        {isIncome && <span className="text-emerald-400">VENTE (REVENU)</span>}
                        {isExpense && <span className="text-amber-400">NOTE DE FRAIS</span>}
                        {isAdvance && <span className="text-rose-400">AVANCE SALAIRE</span>}
                      </td>

                      <td className={`py-3 px-4 text-right font-mono font-bold ${isIncome ? "text-emerald-400" : "text-slate-200"}`}>
                        {isIncome ? "+" : "-"}{tx.amount.toLocaleString("fr-FR")} HTG
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-cyan-400">
                        {isIncome ? `+${comm.toLocaleString("fr-FR")} HTG` : "-"}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {closedInfo.isClosed ? (
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-bold border bg-slate-900 text-slate-300 border-slate-700 inline-flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5 text-cyan-400" />
                            {closedInfo.periodLabel || "Clôturé en Paie"}
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            En Cours (À venir)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* LOG SALE MODAL */}
      <AnimatePresence>
        {isLogSaleModalOpen && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setIsLogSaleModalOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl z-10 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="font-black text-slate-100 uppercase tracking-tight flex items-center gap-2 text-sm">
                  <PlusCircle className="w-4 h-4 text-emerald-400" />
                  Saisir une Vente / Transaction
                </h4>
                <button onClick={() => setIsLogSaleModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveSale} className="space-y-4">
                <div>
                  <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-1">
                    Description / Nom du Client *
                  </label>
                  <input
                    type="text"
                    required
                    value={saleDescription}
                    onChange={(e) => setSaleDescription(e.target.value)}
                    placeholder="ex: Vente Client Cabinet Audit #102"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 px-3 py-2 rounded-lg text-xs text-slate-200 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-1">
                      Montant Vente (HTG) *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="any"
                      value={saleAmount}
                      onChange={(e) => setSaleAmount(e.target.value)}
                      placeholder="5000"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 px-3 py-2 rounded-lg text-xs text-slate-200 outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-1">
                      Mode de Paiement
                    </label>
                    <select
                      value={salePaymentMethod}
                      onChange={(e) => setSalePaymentMethod(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 px-3 py-2 rounded-lg text-xs text-slate-200 outline-none font-mono"
                    >
                      <option value="MONCASH">MonCash</option>
                      <option value="NATCASH">NatCash</option>
                      <option value="CASH">Comptant (Cash)</option>
                      <option value="BANK">Virement Bancaire</option>
                      <option value="CARD">Carte de Crédit</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-1">
                    Catégorie de Produit / Service
                  </label>
                  <select
                    value={saleCategory}
                    onChange={(e) => setSaleCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 px-3 py-2 rounded-lg text-xs text-slate-200 outline-none font-mono"
                  >
                    <option value="Vente Produits">Vente Produits & Marchandises</option>
                    <option value="Prestation Service">Prestation de Service / Conseil</option>
                    <option value="Abonnement SaaS">Abonnement SaaS ERP</option>
                    <option value="Frais Audit">Audit & Accompagnement Financial</option>
                  </select>
                </div>

                {saleAmount && !isNaN(parseFloat(saleAmount)) && parseFloat(saleAmount) > 0 && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 flex justify-between items-center">
                    <span>Commission estimée ({CommissionEngine.formatCommissionRateDisplay(commRate)}):</span>
                    <span className="font-bold text-sm text-emerald-400">
                      {commRate > 0 ? `+${Math.round(parseFloat(saleAmount) * commRate).toLocaleString("fr-FR")} HTG` : "0 HTG (Non éligible)"}
                    </span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsLogSaleModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold uppercase"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingSale}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase rounded-lg disabled:opacity-50"
                  >
                    {isSubmittingSale ? "Enregistrement..." : "Valider la Vente"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LOG EXPENSE MODAL */}
      <AnimatePresence>
        {isLogExpenseModalOpen && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setIsLogExpenseModalOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl z-10 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="font-black text-slate-100 uppercase tracking-tight flex items-center gap-2 text-sm">
                  <Receipt className="w-4 h-4 text-cyan-400" />
                  Déclarer une Note de Frais
                </h4>
                <button onClick={() => setIsLogExpenseModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveExpense} className="space-y-4">
                <div>
                  <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-1">
                    Motif de la Dépense / Description *
                  </label>
                  <input
                    type="text"
                    required
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    placeholder="ex: Transport & Visite Client Jacmel"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 px-3 py-2 rounded-lg text-xs text-slate-200 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-1">
                      Montant Avancé (HTG) *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="any"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="1250"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 px-3 py-2 rounded-lg text-xs text-slate-200 outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-1">
                      Catégorie de Frais
                    </label>
                    <select
                      value={expenseCategory}
                      onChange={(e) => setExpenseCategory(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 px-3 py-2 rounded-lg text-xs text-slate-200 outline-none font-mono"
                    >
                      <option value="Frais Déplacement">Déplacement & Carburant</option>
                      <option value="Restauration Client">Restauration & Clientèle</option>
                      <option value="Fournitures Bureau">Fournitures & Petit Matériel</option>
                      <option value="Télécom & Internet">Télécom & Recharge MonCash</option>
                      <option value="Autre Frais">Autre Dépense Professionnelle</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsLogExpenseModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold uppercase"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingExpense}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black text-xs uppercase rounded-lg disabled:opacity-50"
                  >
                    {isSubmittingExpense ? "Soumission..." : "Soumettre la Note"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
