import React, { useState, useMemo } from "react";
import { PayrollRecord, Role, PayrollCycle } from "../../../types";
import { 
  FileText, 
  DollarSign, 
  UserCheck, 
  Building2, 
  Eye, 
  Trash2, 
  Lock,
  Download,
  Printer,
  ShieldCheck,
  CheckSquare,
  Square,
  HelpCircle,
  FileSpreadsheet
} from "lucide-react";

interface PayrollRunTableProps {
  records: PayrollRecord[];
  isLocked: boolean;
  currentRole: Role;
  activeCycle?: PayrollCycle | null;
  onViewRecordDetails: (record: PayrollRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  onToggleExcludeRecord?: (recordId: string) => void;
}

export const PayrollRunTable: React.FC<PayrollRunTableProps> = ({
  records,
  isLocked,
  currentRole,
  activeCycle,
  onViewRecordDetails,
  onDeleteRecord,
  onToggleExcludeRecord,
}) => {
  // Local exclusion state for instant UI responsiveness
  const [excludedMap, setExcludedMap] = useState<Record<string, boolean>>({});

  const handleToggleExclude = (recId: string) => {
    if (isLocked || activeCycle?.status === "SEALED" || activeCycle?.status === "LOCKED") return;
    setExcludedMap((prev) => ({
      ...prev,
      [recId]: !prev[recId],
    }));
    if (onToggleExcludeRecord) {
      onToggleExcludeRecord(recId);
    }
  };

  // Helper to safely extract values from cents or plain numbers
  const extractVal = (centsVal?: number, numVal?: number, fallback = 0): number => {
    if (centsVal !== undefined && centsVal !== null && !isNaN(centsVal)) {
      return centsVal / 100;
    }
    if (numVal !== undefined && numVal !== null && !isNaN(numVal)) {
      return numVal;
    }
    return fallback;
  };

  // Process rows with formatted columns
  const computedRows = useMemo(() => {
    return records.map((r) => {
      const isExcluded = excludedMap[r.id] !== undefined ? excludedMap[r.id] : Boolean(r.isExcluded);

      const base = extractVal(r.theoretical_quincena_base_cents, (r as any).baseSalary ?? ((r as any).base_salary_cents ? (r as any).base_salary_cents / 100 : 0));
      const sales = extractVal(r.sales_cents, (r as any).salesHtg);
      
      const commRateNum = r.commission_rate_used ?? r.commission_rate ?? ((r as any).commissionRate ?? 0.05);
      const rateDisplay = r.pay_profile === "FIXED" ? "-" : `${Math.round(commRateNum * 100)}%`;

      const commission = extractVal(r.commission_cents, (r as any).commissions);
      
      const hours = (r as any).workedHours !== undefined
        ? (r as any).workedHours
        : (r.worked_minutes ? Math.round(r.worked_minutes / 60) : 88);

      const prime = extractVal(r.overtime_cents, (r as any).primes ?? (r as any).overtimePayout);
      const penalty = extractVal(r.penalties_cents, (r as any).penalties ?? (r as any).absencePenalties);
      const bonus = extractVal(r.bonuses_cents, (r as any).bonuses ?? (r as any).bonusesAddition);

      const gross = extractVal(r.gross_salary_cents, r.grossSalary);
      
      const onaFee = extractVal(r.cnss_employee_cents, r.cnssDeduction);
      const ofatmaFee = extractVal(r.cns_employee_cents, r.cnsDeduction);
      const govFees = onaFee + ofatmaFee;

      const advances = extractVal(r.debts_deduction_cents, (r as any).advancesTreated ?? (r as any).advances);
      const net = extractVal(r.net_salary_cents, r.netPaid);

      return {
        ...r,
        isExcluded,
        base,
        sales,
        rateDisplay,
        commission,
        hours,
        prime,
        penalty,
        bonus,
        gross,
        govFees,
        advances,
        net,
      };
    });
  }, [records, excludedMap]);

  // Aggregate totals across all included records
  const totals = useMemo(() => {
    return computedRows.reduce(
      (acc, r) => {
        if (r.isExcluded) return acc;
        return {
          base: acc.base + r.base,
          sales: acc.sales + r.sales,
          commission: acc.commission + r.commission,
          hours: acc.hours + r.hours,
          prime: acc.prime + r.prime,
          penalty: acc.penalty + r.penalty,
          bonus: acc.bonus + r.bonus,
          gross: acc.gross + r.gross,
          govFees: acc.govFees + r.govFees,
          advances: acc.advances + r.advances,
          net: acc.net + r.net,
        };
      },
      { base: 0, sales: 0, commission: 0, hours: 0, prime: 0, penalty: 0, bonus: 0, gross: 0, govFees: 0, advances: 0, net: 0 }
    );
  }, [computedRows]);

  // CSV Export for Livre d'Émargement
  const handleExportCSV = () => {
    const headers = [
      "PAYER",
      "EMPLOYÉ",
      "ID",
      "RÉGIME",
      "BASE (HTG)",
      "SALES GL (HTG)",
      "RATE",
      "COMMISSION (HTG)",
      "HOURS",
      "PRIME (HTG)",
      "PENALTY (HTG)",
      "BONUS (HTG)",
      "GROSS (HTG)",
      "GOV FEES (HTG)",
      "NET (HTG)",
      "STATUT",
    ];

    const rows = computedRows.map((r) => [
      r.isExcluded ? "NON" : "OUI",
      `"${r.employeeName.replace(/"/g, '""')}"`,
      r.employeeId,
      r.pay_profile || "FIXED",
      r.base,
      r.sales,
      r.rateDisplay,
      r.commission,
      r.hours,
      r.prime,
      r.penalty,
      r.bonus,
      r.gross,
      r.govFees,
      r.net,
      r.status || "CALCULATED",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Livre_Emargement_${activeCycle?.id || "cycle"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  if (records.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center shadow-xl">
        <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3">
          <FileSpreadsheet className="w-6 h-6 text-indigo-400" />
        </div>
        <h3 className="text-base font-semibold text-slate-200">Livre d'Émargement Vierge</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
          Aucun bulletin calculé pour ce cycle. Cliquez sur le bouton <span className="text-emerald-400 font-semibold">"Lancer Calcul Paie"</span> ci-dessus pour ventiler automatiquement les rubriques salariales.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl space-y-0">
      {/* Header Banner: Livre d'Émargement des Émoluments */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-950/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Livre d'Émargement des Émoluments
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-indigo-950/60 text-indigo-400 border border-indigo-800/60 rounded-full">
                Quinzaine Légale
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Feuille de calcul analytique & ventilation des rubriques (Salaires, Primes, Commissions, Retenues)
            </p>
          </div>
        </div>

        {/* Period & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {activeCycle && (
            <span className="font-mono text-[11px] text-slate-300 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
              {activeCycle.startDate} → {activeCycle.endDate}
            </span>
          )}
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 transition active:scale-95"
            title="Exporter en fichier CSV"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 transition active:scale-95"
            title="Imprimer ou sauvegarder en PDF"
          >
            <Printer className="w-3.5 h-3.5 text-rose-400" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Desktop Spreadsheet Table with the 15 Columns */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-sans text-xs hidden md:table">
          <thead>
            <tr className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-800">
              <th className="py-3 px-3 text-center w-12" title="Inclure ou exclure de la paie">PAYER ?</th>
              <th className="py-3 px-3">EMPLOYÉ</th>
              <th className="py-3 px-3">RÉGIME</th>
              <th className="py-3 px-3 text-right">BASE</th>
              <th className="py-3 px-3 text-right" title="Volume des Ventes issues du Grand Livre">SALES (GL)</th>
              <th className="py-3 px-3 text-right text-indigo-400">RATE</th>
              <th className="py-3 px-3 text-right">COMMISSION</th>
              <th className="py-3 px-3 text-right">HOURS</th>
              <th className="py-3 px-3 text-right">PRIME</th>
              <th className="py-3 px-3 text-right">PENALTY</th>
              <th className="py-3 px-3 text-right">BONUS</th>
              <th className="py-3 px-3 text-right text-emerald-400 font-black">GROSS</th>
              <th className="py-3 px-3 text-right text-rose-400 font-black" title="Retenues ONA (6%) + OFATMA (2%)">GOV FEES</th>
              <th className="py-3 px-3 text-right text-cyan-400 font-black">NET</th>
              <th className="py-3 px-3 text-center">TRACE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium">
            {computedRows.map((r) => {
              const isPayerDisabled = isLocked || activeCycle?.status === "SEALED" || activeCycle?.status === "LOCKED";

              return (
                <tr
                  key={r.id}
                  className={`transition-colors ${
                    r.isExcluded ? "bg-slate-950/40 opacity-50" : "hover:bg-slate-800/30"
                  }`}
                >
                  {/* 1. PAYER ? */}
                  <td className="py-2.5 px-3 text-center">
                    <input
                      type="checkbox"
                      checked={!r.isExcluded}
                      disabled={isPayerDisabled}
                      onChange={() => handleToggleExclude(r.id)}
                      className="w-4 h-4 border-slate-700 bg-slate-950 text-emerald-500 rounded focus:ring-0 cursor-pointer disabled:cursor-not-allowed"
                      title={r.isExcluded ? "Exclu de la paie (cliquez pour inclure)" : "Inclus dans la paie (cliquez pour exclure)"}
                    />
                  </td>

                  {/* 2. EMPLOYÉ */}
                  <td className="py-2.5 px-3">
                    <div className={`font-semibold ${r.isExcluded ? "text-slate-400 line-through" : "text-white"}`}>
                      {r.employeeName}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">{r.employeeId}</span>
                  </td>

                  {/* 3. RÉGIME */}
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-950 text-slate-300 border border-slate-800">
                      {r.pay_profile || "FIXED"}
                    </span>
                  </td>

                  {/* 4. BASE */}
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                    {r.base.toLocaleString("fr-FR")}
                  </td>

                  {/* 5. SALES (GL) */}
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                    {r.sales > 0 ? r.sales.toLocaleString("fr-FR") : "0"}
                  </td>

                  {/* 6. RATE */}
                  <td className="py-2.5 px-3 text-right font-mono text-indigo-300 font-semibold">
                    {r.rateDisplay}
                  </td>

                  {/* 7. COMMISSION */}
                  <td className="py-2.5 px-3 text-right font-mono text-cyan-400">
                    {r.commission > 0 ? r.commission.toLocaleString("fr-FR") : "0"}
                  </td>

                  {/* 8. HOURS */}
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                    {r.hours}h
                  </td>

                  {/* 9. PRIME */}
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                    {r.prime > 0 ? `+${r.prime.toLocaleString("fr-FR")}` : "0"}
                  </td>

                  {/* 10. PENALTY */}
                  <td className="py-2.5 px-3 text-right font-mono text-rose-400">
                    {r.penalty > 0 ? `-${r.penalty.toLocaleString("fr-FR")}` : "0"}
                  </td>

                  {/* 11. BONUS */}
                  <td className="py-2.5 px-3 text-right font-mono text-cyan-400">
                    {r.bonus > 0 ? `+${r.bonus.toLocaleString("fr-FR")}` : "0"}
                  </td>

                  {/* 12. GROSS */}
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-400 font-bold">
                    {r.gross.toLocaleString("fr-FR")}
                  </td>

                  {/* 13. GOV FEES */}
                  <td className="py-2.5 px-3 text-right font-mono text-rose-400 font-bold">
                    {r.govFees > 0 ? `-${r.govFees.toLocaleString("fr-FR")}` : "0"}
                  </td>

                  {/* 14. NET */}
                  <td className="py-2.5 px-3 text-right font-mono text-cyan-400 font-bold">
                    <div className="flex items-center justify-end gap-1">
                      <span>{r.net.toLocaleString("fr-FR")}</span>
                      {r.advances > 0 && (
                        <span className="text-[9px] bg-rose-500/10 border border-rose-500/20 text-rose-400 px-1 py-0.2 rounded font-mono" title={`Avance sur salaire déduite: -${r.advances.toLocaleString("fr-FR")} HTG`}>
                          💳 -{r.advances.toLocaleString("fr-FR")}
                        </span>
                      )}
                      {r.protectionRuleEnforced && (
                        <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1 py-0.2 rounded" title="Seuil de subsistance 15,000 HTG appliqué">
                          🛡️
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 15. TRACE */}
                  <td className="py-2.5 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => onViewRecordDetails(r)}
                      className="px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800/60 text-cyan-300 rounded-md text-[11px] font-mono font-semibold transition active:scale-95 flex items-center justify-center gap-1 mx-auto"
                      title="Inspecter le calcul détaillé et l'empreinte forensique"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Trace</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Table Footer: Totaux analytiques */}
          <tfoot>
            <tr className="bg-slate-950 border-t-2 border-slate-800 text-slate-300 font-bold text-xs">
              <td colSpan={3} className="py-3 px-3 uppercase tracking-wider text-slate-400 font-bold">
                Totaux du cycle ({records.length} inscrits)
              </td>
              <td className="py-3 px-3 text-right font-mono text-white">
                {totals.base.toLocaleString("fr-FR")}
              </td>
              <td className="py-3 px-3 text-right font-mono text-white">
                {totals.sales.toLocaleString("fr-FR")}
              </td>
              <td className="py-3 px-3 text-right font-mono text-slate-500">-</td>
              <td className="py-3 px-3 text-right font-mono text-cyan-400">
                {totals.commission.toLocaleString("fr-FR")}
              </td>
              <td className="py-3 px-3 text-right font-mono text-slate-300">
                {totals.hours}h
              </td>
              <td className="py-3 px-3 text-right font-mono text-emerald-400">
                {totals.prime.toLocaleString("fr-FR")}
              </td>
              <td className="py-3 px-3 text-right font-mono text-rose-400">
                {totals.penalty.toLocaleString("fr-FR")}
              </td>
              <td className="py-3 px-3 text-right font-mono text-cyan-400">
                {totals.bonus.toLocaleString("fr-FR")}
              </td>
              <td className="py-3 px-3 text-right font-mono text-emerald-400 font-black">
                {totals.gross.toLocaleString("fr-FR")}
              </td>
              <td className="py-3 px-3 text-right font-mono text-rose-400 font-black">
                {totals.govFees > 0 ? `-${totals.govFees.toLocaleString("fr-FR")}` : "0"}
              </td>
              <td className="py-3 px-3 text-right font-mono text-cyan-400 font-black text-sm">
                {totals.net.toLocaleString("fr-FR")} HTG
              </td>
              <td className="py-3 px-3 text-center font-mono text-[10px] text-slate-500">
                SEAL OK
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Responsive Mobile Cards (screens < md) */}
      <div className="flex flex-col md:hidden divide-y divide-slate-800">
        {computedRows.map((r) => {
          const isPayerDisabled = isLocked || activeCycle?.status === "SEALED" || activeCycle?.status === "LOCKED";

          return (
            <div
              key={r.id}
              className={`p-4 flex flex-col gap-3 transition-colors ${
                r.isExcluded ? "bg-slate-950/30 opacity-60" : "hover:bg-slate-800/20"
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-sm ${r.isExcluded ? "text-slate-400 line-through" : "text-white"}`}>
                      {r.employeeName}
                    </span>
                    {r.isExcluded && (
                      <span className="text-[9px] bg-rose-500/10 border border-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-mono font-semibold">
                        EXCLU
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-500 font-mono">ID: {r.employeeId}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-950 text-slate-400 border border-slate-800">
                      {r.pay_profile || "FIXED"}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-cyan-400 font-bold text-base font-mono block">
                    {r.net.toLocaleString("fr-FR")} HTG
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Net Période</span>
                </div>
              </div>

              {/* Rubrics Grid */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 text-[11px] font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Base:</span>
                  <span className="text-slate-200">{r.base.toLocaleString("fr-FR")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ventes GL:</span>
                  <span className="text-slate-200">{r.sales.toLocaleString("fr-FR")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Heures:</span>
                  <span className="text-slate-200">{r.hours}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Commission:</span>
                  <span className="text-cyan-400">+{r.commission.toLocaleString("fr-FR")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Primes/OT:</span>
                  <span className="text-emerald-400">+{r.prime.toLocaleString("fr-FR")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pénalités:</span>
                  <span className="text-rose-400">{r.penalty > 0 ? `-${r.penalty.toLocaleString("fr-FR")}` : "0"}</span>
                </div>
                {r.advances > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Avance (Dette):</span>
                    <span className="text-rose-400">-{r.advances.toLocaleString("fr-FR")}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Brut (Gross):</span>
                  <span className="text-emerald-400 font-bold">{r.gross.toLocaleString("fr-FR")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Taxes (ONA):</span>
                  <span className="text-rose-400 font-bold">{r.govFees > 0 ? `-${r.govFees.toLocaleString("fr-FR")}` : "0"}</span>
                </div>
              </div>

              {/* Exclusion & Trace Controls */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={!r.isExcluded}
                    disabled={isPayerDisabled}
                    onChange={() => handleToggleExclude(r.id)}
                    className="w-4 h-4 border-slate-700 bg-slate-950 text-emerald-500 rounded focus:ring-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span>Payer cet employé</span>
                </label>

                <button
                  type="button"
                  onClick={() => onViewRecordDetails(r)}
                  className="px-3 py-1.5 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800/60 text-cyan-300 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Trace</span>
                </button>
              </div>
            </div>
          );
        })}

        {/* Mobile Totals Box */}
        <div className="p-4 bg-slate-950 font-mono text-xs space-y-1.5 border-t border-slate-800">
          <div className="flex justify-between font-sans text-slate-400 uppercase font-bold text-[10px]">
            <span>Masse Salariale Brute:</span>
            <span className="text-emerald-400 font-mono">{totals.gross.toLocaleString("fr-FR")} HTG</span>
          </div>
          <div className="flex justify-between font-sans text-slate-400 uppercase font-bold text-[10px]">
            <span>Total Déductions ONA/OFATMA:</span>
            <span className="text-rose-400 font-mono">-{totals.govFees.toLocaleString("fr-FR")} HTG</span>
          </div>
          <div className="flex justify-between font-sans text-slate-200 uppercase font-bold text-xs pt-1 border-t border-slate-800">
            <span>Net Total à Payer:</span>
            <span className="text-cyan-400 font-bold text-sm font-mono">{totals.net.toLocaleString("fr-FR")} HTG</span>
          </div>
        </div>
      </div>
    </div>
  );
};
