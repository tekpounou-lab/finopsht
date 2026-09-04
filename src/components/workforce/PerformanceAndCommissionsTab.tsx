import React, { useState, useEffect, useRef } from "react";
import { Employee, LedgerTransaction, EmployeeContract, PayrollCycle, EmployeeSalesSummary } from "../../types";
import { EmployeeSalesSummaryService } from "../../services/workforce/EmployeeSalesSummaryService";
import { useBusinessContext } from "../../contexts/BusinessContext";
import { Loader2, AlertCircle, X, ChevronDown, Calendar } from "lucide-react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";

interface Props {
  employees: Employee[];
  ledgerTransactions: LedgerTransaction[];
  employeeContracts: EmployeeContract[];
  activeCycle: PayrollCycle;
  language?: "fr" | "en" | "ht";
}

export default function PerformanceAndCommissionsTab({
  employees,
  ledgerTransactions,
  employeeContracts,
  activeCycle,
  language = "fr"
}: Props) {
  const { business } = useBusinessContext();
  const [summaries, setSummaries] = useState<EmployeeSalesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableCycles, setAvailableCycles] = useState<PayrollCycle[]>([activeCycle]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>(activeCycle.id);
  
  const [selectedSummary, setSelectedSummary] = useState<EmployeeSalesSummary | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap for modal
  useEffect(() => {
    if (selectedSummary && modalRef.current) {
      modalRef.current.focus();
    }
  }, [selectedSummary]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedSummary) setSelectedSummary(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedSummary]);

  // Fetch Historical Cycles
  useEffect(() => {
    async function fetchCycles() {
      if (!business?.id) return;
      try {
        const q = query(
          collection(db, "payroll_cycles"),
          where("business_id", "==", business.id),
          orderBy("start_date", "desc")
        );
        const snap = await getDocs(q);
        const cycles = snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollCycle));
        
        // Ensure activeCycle is in the list if it's a live un-persisted one
        if (!cycles.find(c => c.id === activeCycle.id)) {
          setAvailableCycles([activeCycle, ...cycles]);
        } else {
          setAvailableCycles(cycles);
        }
      } catch (err) {
        console.warn("Could not fetch historical cycles", err);
      }
    }
    fetchCycles();
  }, [business?.id, activeCycle]);

  const currentCycle = availableCycles.find(c => c.id === selectedCycleId) || activeCycle;

  // Load Summaries
  useEffect(() => {
    async function loadSummaries() {
      if (!business?.id) return;
      setLoading(true);
      try {
        const results = await Promise.all(
          employees.map(async (emp) => {
            const contract = employeeContracts.find(c => c.employeeId === emp.id && c.status === "active");
            return await EmployeeSalesSummaryService.generateOrFetchSummary({
              businessId: business.id,
              cycle: currentCycle,
              employee: emp,
              transactions: ledgerTransactions,
              contract,
              activePlans: []
            });
          })
        );
        // Only show employees that have some activity or commission
        setSummaries(results.filter(r => r.calculated_commission > 0 || r.gross_sales > 0));
      } catch (err) {
        console.error("Failed to load commissions:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSummaries();
  }, [business?.id, employees, ledgerTransactions, employeeContracts, currentCycle]);

  // Warning for late imports: un-commissioned transactions before current cycle start date
  const hasLateImports = ledgerTransactions.some(tx => 
    (tx.category === "REVENUE" || tx.category === "SALES") && 
    tx.date && tx.date < (currentCycle.startDate || currentCycle.start_date || "") &&
    !tx.commission_claimed
  );

  const totalCommissions = summaries.reduce((sum, s) => sum + s.calculated_commission, 0);

  const isFr = language === "fr";
  const isHt = language === "ht";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full transition-colors duration-200">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {isFr ? "Performance & Commissions" : isHt ? "Pèfòmans & Komisyon" : "Performance & Commissions"}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {isFr 
              ? "Aperçu des ventes et commissions par employé calculées en temps réel" 
              : isHt 
              ? "Apèsi lavant ak komisyon pou chak anplwaye an tan reyèl"
              : "Overview of sales and employee commissions computed in real-time"}
          </p>
        </div>
        
        {/* Period / Cycle Selector */}
        <div className="relative min-w-[240px]">
          <label htmlFor="cycle-select" className="sr-only">
            {isFr ? "Sélectionner la période" : isHt ? "Chwazi peryòd la" : "Select period"}
          </label>
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
            <Calendar className="h-4 w-4" />
          </div>
          <select
            id="cycle-select"
            value={selectedCycleId}
            onChange={(e) => setSelectedCycleId(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm font-medium border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 appearance-none bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
          >
            {availableCycles.map(c => (
              <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                {c.startDate || c.start_date} au {c.endDate || c.end_date} 
                {c.id === activeCycle.id ? (isFr ? " (En cours)" : isHt ? " (An kou)" : " (Active)") : ` (${c.status})`}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Late Import Alert */}
      {hasLateImports && currentCycle.status !== "LOCKED" && currentCycle.status !== "PAID" && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-500 dark:border-amber-400 p-4 rounded-r-xl border-y border-r border-amber-200/60 dark:border-amber-500/20 shadow-sm flex items-start space-x-3 transition-colors">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-amber-900 dark:text-amber-300">
              {isFr ? "Ventes antérieures détectées" : isHt ? "Vant anvan yo detekte" : "Prior Period Sales Detected"}
            </h4>
            <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-200/90 mt-1 leading-relaxed">
              {isFr
                ? "Certaines ventes importées (ex: QuickBooks) sont antérieures à cette période et n'ont pas encore généré de commission. Elles seront automatiquement incluses dans le cycle actuel ouvert."
                : isHt
                ? "Gen lavant ki te enpòte (egz: QuickBooks) ki te fèt anvan peryòd sa a epi ki poko gen komisyon. Y ap ajoute otomatikman nan sik aktif la."
                : "Some imported sales are dated before this period and haven't generated commissions yet. They will automatically be included in the open cycle."}
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900/90 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden backdrop-blur-sm transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 text-slate-900 dark:text-white pointer-events-none">
            <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            {isFr ? "Total Commissions (HTG)" : isHt ? "Total Komisyon (HTG)" : "Total Commissions (HTG)"}
          </h3>
          <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 font-mono tracking-tight">
            {loading ? (
              <div className="h-9 w-32 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            ) : (
              totalCommissions.toLocaleString("fr-HT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            {summaries.length} {isFr ? "employé(s) avec commissions actives" : isHt ? "anplwaye ak komisyon aktif" : "employee(s) with active commissions"}
          </p>
        </div>
      </div>

      {/* Performance & Commissions Table */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden backdrop-blur-sm transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">{isFr ? "Employé" : isHt ? "Anplwaye" : "Employee"}</th>
                <th className="px-6 py-4">{isFr ? "Ventes Brutes (HTG)" : isHt ? "Lavant Brit (HTG)" : "Gross Sales (HTG)"}</th>
                <th className="px-6 py-4">{isFr ? "Taux Appliqué" : isHt ? "Pousantaj Aplike" : "Applied Rate"}</th>
                <th className="px-6 py-4">{isFr ? "Commission (HTG)" : isHt ? "Komisyon (HTG)" : "Commission (HTG)"}</th>
                <th className="px-6 py-4">{isFr ? "Statut" : isHt ? "Statut" : "Status"}</th>
                <th className="px-6 py-4 text-right">{isFr ? "Action" : isHt ? "Aksyon" : "Action"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-cyan-600 dark:text-cyan-400 mx-auto" />
                    <p className="text-slate-600 dark:text-slate-400 mt-2.5 text-sm font-medium">
                      {isFr ? "Calcul des performances en cours..." : isHt ? "Kalkil pèfòmans ap fèt..." : "Calculating performance metrics..."}
                    </p>
                  </td>
                </tr>
              ) : summaries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 mb-4 border border-slate-200 dark:border-slate-700">
                      <Calendar className="h-6 w-6" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {isFr ? "Aucune vente enregistrée" : isHt ? "Pa gen lavant anrejistre" : "No sales recorded"}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 mt-1 max-w-sm mx-auto text-xs sm:text-sm">
                      {isFr
                        ? "Aucune performance n'a été enregistrée pour cette période. Pensez à importer vos ventes depuis QuickBooks si nécessaire."
                        : isHt
                        ? "Pa gen pèfòmans ki anrejistre pou peryòd sa a. Ou ka enpòte lavant depi QuickBooks si sa nesesè."
                        : "No performance recorded for this period. Import sales from QuickBooks if applicable."}
                    </p>
                  </td>
                </tr>
              ) : (
                summaries.map((summary) => {
                  const emp = employees.find(e => e.id === summary.employee_id);
                  return (
                    <tr key={summary.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">
                        {emp?.name || summary.employee_id}
                      </td>
                      <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-mono font-medium">
                        {summary.gross_sales.toLocaleString("fr-HT", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-mono">
                        {summary.commission_rate > 0 ? `${(summary.commission_rate * 100).toFixed(1)}%` : "N/A"}
                      </td>
                      <td className="px-6 py-4 font-bold text-cyan-600 dark:text-cyan-400 font-mono">
                        {summary.calculated_commission.toLocaleString("fr-HT", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                          summary.is_frozen 
                            ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700" 
                            : "bg-amber-50 dark:bg-amber-950/40 text-amber-750 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
                        }`}>
                          {summary.is_frozen 
                            ? (isFr ? "Clôturé" : isHt ? "Kloti" : "Closed") 
                            : (isFr ? "En cours" : isHt ? "An kou" : "In Progress")}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedSummary(summary)}
                          className="text-xs sm:text-sm font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded-lg px-3 py-1.5 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 border border-transparent hover:border-cyan-200 dark:hover:border-cyan-800 transition-colors cursor-pointer"
                          aria-label={`Détails pour ${emp?.name}`}
                        >
                          {isFr ? "Détails" : isHt ? "Detay" : "Details"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Accessible Modal */}
      {selectedSummary && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div 
            ref={modalRef}
            tabIndex={-1}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden focus:outline-none transition-colors"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-slate-850/80">
              <h3 id="modal-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {isFr ? "Détails des Commissions" : isHt ? "Detay Komisyon Yo" : "Commission Breakdown Details"}
              </h3>
              <button 
                onClick={() => setSelectedSummary(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 cursor-pointer"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider font-semibold">
                    {isFr ? "Employé" : isHt ? "Anplwaye" : "Employee"}
                  </div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {employees.find(e => e.id === selectedSummary.employee_id)?.name || selectedSummary.employee_id}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider font-semibold">
                    {isFr ? "Transactions Impliquées" : isHt ? "Tranzaksyon Enplike" : "Transactions Count"}
                  </div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">
                    {selectedSummary.transaction_count}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3 border-b border-slate-200 dark:border-slate-800 pb-2">
                  {isFr ? "Répartition par Département" : isHt ? "Repatisyon pa Depatman" : "Department Breakdown"}
                </h4>
                {Object.keys(selectedSummary.department_breakdown || {}).length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                    {isFr ? "Aucune donnée départementale" : isHt ? "Pa gen done depatmantal" : "No department data available"}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {Object.values(selectedSummary.department_breakdown).map((dept) => (
                      <div key={dept.departmentId} className="flex justify-between items-center text-sm p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <span className="text-slate-700 dark:text-slate-300 font-medium flex items-center">
                          <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 mr-2.5"></span>
                          {dept.departmentId === "unassigned" ? (isFr ? "Non assigné" : isHt ? "Pa asiyen" : "Unassigned") : dept.departmentId}
                        </span>
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                          {dept.salesAmount.toLocaleString("fr-HT", { minimumFractionDigits: 2 })} HTG
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80 flex justify-end">
              <button
                onClick={() => setSelectedSummary(null)}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-750 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors shadow-sm cursor-pointer"
              >
                {isFr ? "Fermer" : isHt ? "Fèmen" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
