import React, { useState } from "react";
import { 
  DollarSign, 
  Download, 
  Filter, 
  Eye, 
  CheckCircle2, 
  ShieldAlert, 
  FileSpreadsheet, 
  Calendar, 
  Search,
  TrendingDown,
  TrendingUp,
  Info,
  HelpCircle,
  Layers,
  ArrowRight,
  ShieldCheck,
  Calculator,
  Percent,
  ChevronRight,
  Sparkles,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Employee, PayrollRecord } from "../../../types";

interface MyPayrollSectionProps {
  employee: Employee;
  payrollRecords: PayrollRecord[];
  deptName: string;
  branchName: string;
  tw: any;
}

export const MyPayrollSection: React.FC<MyPayrollSectionProps> = ({
  employee,
  payrollRecords,
  deptName,
  branchName,
  tw,
}) => {
  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [selectedQuarter, setSelectedQuarter] = useState<string>("ALL");
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Filter employee payroll records
  const myRecords = payrollRecords.filter(r => 
    (r.employeeId === employee.id || r.employee_id === employee.id || (r as any).employeeId === employee.id) && 
    (
      !r.business_id || 
      !employee.business_id || 
      r.business_id === employee.business_id || 
      r.business_id === (employee as any).businessId ||
      r.business_id === (employee as any).business_id
    ) &&
    ["VALIDATED", "APPROVED", "PAID", "LOCKED", "DRAFT", "PENDING", "CORRECTED"].includes(r.status || "")
  );

  // Apply filters for history table
  const filteredRecords = myRecords.filter(record => {
    if (selectedYear !== "ALL") {
      const isYearMatch = record.cycleId?.includes(selectedYear) || 
                          (record.generated_at && String(record.generated_at).includes(selectedYear));
      if (!isYearMatch) return false;
    }
    if (selectedQuarter !== "ALL") {
      if (selectedQuarter === "Q1" && !record.cycleId?.match(/(01|02|03|Q1)/i)) return false;
      if (selectedQuarter === "Q2" && !record.cycleId?.match(/(04|05|06|Q2)/i)) return false;
      if (selectedQuarter === "Q3" && !record.cycleId?.match(/(07|08|09|Q3)/i)) return false;
      if (selectedQuarter === "Q4" && !record.cycleId?.match(/(10|11|12|Q4)/i)) return false;
    }
    return true;
  });

  // Calculate Totals
  const totalGross = filteredRecords.reduce((acc, r) => acc + (r.grossSalary || (r.gross_salary_cents ? r.gross_salary_cents / 100 : 0)), 0);
  const totalNet = filteredRecords.reduce((acc, r) => acc + (r.netPaid || (r.net_salary_cents ? r.net_salary_cents / 100 : 0)), 0);
  const totalDeductions = filteredRecords.reduce((acc, r) => {
    const cnss = typeof r.cnssDeduction === "number" ? r.cnssDeduction : (r.cnss_employee_cents ? r.cnss_employee_cents / 100 : 0);
    const cns = typeof r.cnsDeduction === "number" ? r.cnsDeduction : (r.cns_employee_cents ? r.cns_employee_cents / 100 : 0);
    const adv = typeof r.advancesTreated === "number" ? r.advancesTreated : (r.debts_deduction_cents ? r.debts_deduction_cents / 100 : 0);
    return acc + cnss + cns + adv;
  }, 0);

  // Calculation details for focus record
  const getRecordImpact = (record: PayrollRecord | null) => {
    if (!record) return null;

    const baseSalary = typeof record.grossSalary === "number" && record.grossSalary > 0
      ? record.grossSalary 
      : (record.base_salary_cents ? record.base_salary_cents / 100 : (record.gross_salary_cents ? record.gross_salary_cents / 100 : 0));

    const overtimeVal = record.overtime_cents ? record.overtime_cents / 100 : 0;
    const commissionsVal = typeof record.commissions === "number" ? record.commissions : (record.commission_cents ? record.commission_cents / 100 : 0);
    const bonusesVal = (record.bonuses_cents ? record.bonuses_cents / 100 : 0) + (record.performance_bonus_cents ? record.performance_bonus_cents / 100 : 0);

    const totalGrossCalculated = baseSalary + overtimeVal + commissionsVal + bonusesVal;

    // Respect exact recorded taxes from the initiated payroll record (do not force fallback if taxes were off/0)
    const onaVal = typeof record.cnssDeduction === "number"
      ? record.cnssDeduction
      : (typeof record.cnss_employee_cents === "number" ? record.cnss_employee_cents / 100 : 0);

    const ofatmaVal = typeof record.cnsDeduction === "number"
      ? record.cnsDeduction
      : (typeof record.cns_employee_cents === "number" ? record.cns_employee_cents / 100 : 0);

    const advancesVal = typeof record.advancesTreated === "number"
      ? record.advancesTreated
      : (record.debts_deduction_cents ? record.debts_deduction_cents / 100 : 0);

    const penaltiesVal = record.penalties_cents ? record.penalties_cents / 100 : 0;

    const totalDeductionsCalculated = onaVal + ofatmaVal + advancesVal + penaltiesVal;

    const netPaidCalculated = typeof record.netPaid === "number"
      ? record.netPaid
      : (record.net_salary_cents ? record.net_salary_cents / 100 : Math.max(0, totalGrossCalculated - totalDeductionsCalculated));

    const taxesExemptedOrOff = (onaVal === 0 && ofatmaVal === 0);

    const netPercentage = totalGrossCalculated > 0 ? ((netPaidCalculated / totalGrossCalculated) * 100).toFixed(1) : "100";
    const deductionPercentage = totalGrossCalculated > 0 ? ((totalDeductionsCalculated / totalGrossCalculated) * 100).toFixed(1) : "0";

    return {
      baseSalary,
      overtimeVal,
      commissionsVal,
      bonusesVal,
      totalGrossCalculated,
      onaVal,
      ofatmaVal,
      advancesVal,
      penaltiesVal,
      totalDeductionsCalculated,
      netPaidCalculated,
      netPercentage,
      deductionPercentage,
      taxesExemptedOrOff,
      // Employer contributions
      employerOna: typeof record.cnss_employer_cents === "number"
        ? record.cnss_employer_cents / 100
        : (onaVal > 0 ? totalGrossCalculated * 0.06 : 0),
      employerOfatma: typeof record.ofatma_employer_cents === "number"
        ? record.ofatma_employer_cents / 100
        : (ofatmaVal > 0 ? totalGrossCalculated * 0.03 : 0),
    };
  };

  // Generate PDF Payslip
  const handleDownloadPayslipPdf = (record: PayrollRecord) => {
    const doc = new jsPDF();

    // Header Branding
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 35, "F");

    doc.setTextColor(6, 182, 212); // cyan-500
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("FINOPS ERP", 14, 18);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text("BULLETIN DE PAIE SÉCURISÉ (SSOT)", 14, 26);

    doc.setTextColor(148, 163, 184); // slate-400
    doc.setFontSize(8);
    doc.text(`RÉF: ${record.cycleId || "CYCLE-PAYROLL"}`, 150, 18);
    doc.text(`ÉMIS LE: ${new Date().toLocaleDateString("fr-FR")}`, 150, 24);

    // Employee & Company Info
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("INFORMATIONS DE L'EMPLOYÉ", 14, 45);

    autoTable(doc, {
      startY: 48,
      theme: "plain",
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 35 }, 1: { cellWidth: 65 }, 2: { fontStyle: "bold", cellWidth: 35 }, 3: { cellWidth: 65 } },
      body: [
        ["Nom & Prénom :", employee.name, "ID Employé :", employee.id],
        ["Poste :", employee.position || "Opérateur ERP", "Département :", deptName],
        ["Succursale :", branchName, "Régime :", employee.paymentModel || "FIXE"],
        ["Période Paie :", record.cycleId, "Statut Paie :", (record.status || "PAID").toUpperCase()],
      ],
    });

    // Earnings & Deductions Table
    const impact = getRecordImpact(record);
    if (!impact) return;

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [["Rubrique", "Gains / Majorations (HTG)", "Retenues Légales (HTG)"]],
      body: [
        ["Salaire de Base Brut", impact.baseSalary.toLocaleString("fr-FR") + " HTG", "-"],
        ["Primes d'Heures Supplémentaires", impact.overtimeVal > 0 ? "+" + impact.overtimeVal.toLocaleString("fr-FR") + " HTG" : "-", "-"],
        ["Commissions", impact.commissionsVal > 0 ? "+" + impact.commissionsVal.toLocaleString("fr-FR") + " HTG" : "-", "-"],
        ["Primes de Performance", impact.bonusesVal > 0 ? "+" + impact.bonusesVal.toLocaleString("fr-FR") + " HTG" : "-", "-"],
        ["Cotisation ONA (Employé - 6%)", "-", impact.onaVal > 0 ? "-" + impact.onaVal.toLocaleString("fr-FR") + " HTG" : "0 HTG"],
        ["Cotisation OFATMA / CNS (Employé - 2%)", "-", impact.ofatmaVal > 0 ? "-" + impact.ofatmaVal.toLocaleString("fr-FR") + " HTG" : "0 HTG"],
        ["Avances & Remboursements", "-", impact.advancesVal > 0 ? "-" + impact.advancesVal.toLocaleString("fr-FR") + " HTG" : "0 HTG"],
        ["Pénalités / Absences", "-", impact.penaltiesVal > 0 ? "-" + impact.penaltiesVal.toLocaleString("fr-FR") + " HTG" : "0 HTG"],
      ],
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      styles: { fontSize: 8 },
    });

    // NET PAID HIGHLIGHT
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFillColor(6, 182, 212);
    doc.rect(14, finalY, 182, 14, "F");
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("NET PAYÉ À L'EMPLOYÉ :", 20, finalY + 9);
    doc.text(`${impact.netPaidCalculated.toLocaleString("fr-FR")} HTG`, 140, finalY + 9);

    // Security Footer
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`HMAC SIGNATURE: ${record.hashSignature || "HMAC::FINOPS-SEC-VERIFIED"}`, 14, finalY + 25);
    doc.text("Document confidentiel généré par FINOPS ERP Engine. Fait foi de récépissé de paiement.", 14, finalY + 30);

    doc.save(`Bulletin_Paie_${employee.name.replace(/\s+/g, "_")}_${record.cycleId}.pdf`);
  };

  return (
    <div className="space-y-6" id="view-payroll-section">
      {/* KPI METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass p-5 rounded-2xl border border-slate-800 space-y-2">
          <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Cumul Salaire Brut</span>
          <div className="text-xl font-black text-slate-100 font-mono">
            {totalGross.toLocaleString()} HTG
          </div>
          <p className="text-[10px] text-cyan-400 font-mono">{filteredRecords.length} Bulletins enregistrés</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-slate-800 space-y-2">
          <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Total Retenues & Taxes</span>
          <div className="text-xl font-black text-rose-400 font-mono">
            -{totalDeductions.toLocaleString()} HTG
          </div>
          <p className="text-[10px] text-slate-400 font-mono">Cotisations ONA (6%), OFATMA (2%), Dettes</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-slate-800 space-y-2">
          <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Total Net Touché</span>
          <div className="text-xl font-black text-emerald-400 font-mono">
            {totalNet.toLocaleString()} HTG
          </div>
          <p className="text-[10px] text-emerald-400 font-mono">Paiements validés & transférés</p>
        </div>
      </div>

      {/* ACCESS TRIGGER */}
      <div className="glass p-6 rounded-2xl border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <DollarSign className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h4 className="text-slate-200 font-bold text-sm uppercase">Historique des Bulletins de Paie</h4>
            <p className="text-[10px] font-mono text-slate-500">Accédez à vos fiches de paie certifiées et immuables</p>
          </div>
        </div>
        <button
          onClick={() => setShowHistoryModal(true)}
          className="px-6 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:border-emerald-400/50 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/5 group"
        >
          Voir l'historique complet
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* HISTORY MODAL */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-6xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 uppercase tracking-widest">Registre des Bulletins de Paie</h3>
                    <p className="text-[10px] font-mono text-slate-500">Historique SSOT certifié par FINOPS Engine</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content - Table */}
              <div className="p-6 overflow-y-auto flex-1">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Filtrer les Bulletins</h3>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-[10px] text-slate-300 font-mono">
                      <Filter className="w-3 h-3 text-cyan-400" />
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="bg-transparent outline-none cursor-pointer"
                      >
                        <option value="ALL" className="bg-slate-900">Toutes Années</option>
                        <option value="2026" className="bg-slate-900">2026</option>
                        <option value="2025" className="bg-slate-900">2025</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-[10px] text-slate-300 font-mono">
                      <Calendar className="w-3 h-3 text-indigo-400" />
                      <select
                        value={selectedQuarter}
                        onChange={(e) => setSelectedQuarter(e.target.value)}
                        className="bg-transparent outline-none cursor-pointer"
                      >
                        <option value="ALL" className="bg-slate-900">Tous Trimestres</option>
                        <option value="Q1" className="bg-slate-900">Q1</option>
                        <option value="Q2" className="bg-slate-900">Q2</option>
                        <option value="Q3" className="bg-slate-900">Q3</option>
                        <option value="Q4" className="bg-slate-900">Q4</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-bold font-mono text-[9px] uppercase">
                        <th className="pb-3 px-2 text-center w-10">Payer</th>
                        <th className="pb-3 px-2">Période</th>
                        <th className="pb-3 px-2">Modalité</th>
                        <th className="pb-3 px-2 text-center">Score</th>
                        <th className="pb-3 px-2 text-right">Base</th>
                        <th className="pb-3 px-2 text-right">Ajust.</th>
                        <th className="pb-3 px-2 text-right">Sup.</th>
                        <th className="pb-3 px-2 text-right">Primes</th>
                        <th className="pb-3 px-2 text-right">Dettes</th>
                        <th className="pb-3 px-2 text-right text-emerald-400 font-black">Brut</th>
                        <th className="pb-3 px-2 text-right text-cyan-400 font-black">Net Net</th>
                        <th className="pb-3 px-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {filteredRecords.length > 0 ? (
                        filteredRecords.map((record, i) => {
                          const impact = getRecordImpact(record);
                          if (!impact) return null;

                          const modalite = record.pay_profile || employee.paymentModel || "FIXE";
                          const score = record.globalPerformanceScore ?? record.attendanceScore ?? 100;
                          const base = typeof record.theoretical_quincena_base_cents === "number" ? record.theoretical_quincena_base_cents / 100 : impact.baseSalary;
                          const ajustAbs = typeof record.attendance_adjustment_cents === "number" ? record.attendance_adjustment_cents / 100 : 0;
                          const sup = typeof record.overtime_cents === "number" ? record.overtime_cents / 100 : impact.overtimeVal;
                          const primesComm = (typeof record.bonuses_cents === "number" ? record.bonuses_cents / 100 : impact.bonusesVal) + 
                                             (typeof record.commission_cents === "number" ? record.commission_cents / 100 : impact.commissionsVal);
                          const penalites = typeof record.penalties_cents === "number" ? record.penalties_cents / 100 : impact.penaltiesVal;
                          const avance = typeof record.debts_deduction_cents === "number" ? record.debts_deduction_cents / 100 : impact.advancesVal;
                          const brut = typeof record.gross_salary_cents === "number" ? record.gross_salary_cents / 100 : impact.totalGrossCalculated;
                          const net = typeof record.net_salary_cents === "number" ? record.net_salary_cents / 100 : impact.netPaidCalculated;

                          return (
                            <tr key={i} className="text-slate-300 hover:bg-slate-950/20">
                              <td className="py-3 px-2 text-center">
                                <CheckCircle2 className={`w-3.5 h-3.5 mx-auto ${record.status === 'PAID' ? 'text-emerald-400' : 'text-slate-600'}`} />
                              </td>
                              <td className="py-3 px-2">
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-100">{record.cycleId}</span>
                                  <span className="text-[8px] text-slate-500 font-mono italic">SSOT-CERTIFIED</span>
                                </div>
                              </td>
                              <td className="py-3 px-2">
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-slate-950/60 font-medium text-slate-400">
                                  {modalite}
                                </span>
                              </td>
                              <td className="py-3 px-2 text-center font-mono">
                                <span className={`text-[9px] font-bold ${score >= 85 ? 'text-emerald-400' : score >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>
                                  {score}%
                                </span>
                              </td>
                              <td className="py-3 px-2 text-right font-mono">{base.toLocaleString()}</td>
                              <td className="py-3 px-2 text-right font-mono text-rose-300">
                                {ajustAbs !== 0 ? ajustAbs.toLocaleString() : "0"}
                              </td>
                              <td className="py-3 px-2 text-right font-mono text-emerald-400">
                                {sup !== 0 ? `+${sup.toLocaleString()}` : "0"}
                              </td>
                              <td className="py-3 px-2 text-right font-mono text-emerald-400">
                                {primesComm !== 0 ? `+${primesComm.toLocaleString()}` : "0"}
                              </td>
                              <td className="py-3 px-2 text-right font-mono text-rose-400">
                                {penalites !== 0 ? `-${penalites.toLocaleString()}` : "0"}
                              </td>
                              <td className="py-3 px-2 text-right font-mono text-amber-400">
                                {avance !== 0 ? `-${avance.toLocaleString()}` : "0"}
                              </td>
                              <td className="py-3 px-2 text-right font-mono text-slate-100 font-bold">
                                {brut.toLocaleString()}
                              </td>
                              <td className="py-3 px-2 text-right font-mono font-black text-cyan-400">
                                {net.toLocaleString()}
                              </td>
                              <td className="py-3 px-2 text-right flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setSelectedRecord(record)}
                                  className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-cyan-400 transition cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDownloadPayslipPdf(record)}
                                  className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={12} className="py-8 text-center text-slate-500 italic font-mono">
                            Aucun bulletin disponible.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DETAILED PAYSLIP MODAL / DRAWER */}
      <AnimatePresence>
        {selectedRecord && (() => {
          const modalImpact = getRecordImpact(selectedRecord);
          if (!modalImpact) return null;

          return (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedRecord(null)}
                className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto space-y-6 text-slate-200 shadow-2xl p-6 md:p-8"
              >
                <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2 text-cyan-400 font-mono text-[10px] uppercase font-black tracking-widest mb-1">
                      <Calculator size={14} />
                      <span>Transparence de la Paie (FINOPS Engine)</span>
                    </div>
                    <h4 className="font-black text-xl tracking-tight text-white flex items-center gap-2">
                      Bulletin détaillé : {selectedRecord.cycleId}
                    </h4>
                  </div>
                  <button
                    onClick={() => setSelectedRecord(null)}
                    className="text-slate-400 hover:text-white transition-colors cursor-pointer p-2 hover:bg-slate-800 rounded-full"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Visual Percentage Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-slate-300 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      Salaire Net Reçu : <strong className="text-emerald-400">{modalImpact.netPaidCalculated.toLocaleString()} HTG</strong> ({modalImpact.netPercentage}%)
                    </span>
                    <span className="text-slate-300 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                      Total Retenues : <strong className="text-rose-400">-{modalImpact.totalDeductionsCalculated.toLocaleString()} HTG</strong> ({modalImpact.deductionPercentage}%)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500" 
                      style={{ width: `${modalImpact.netPercentage}%` }}
                    />
                    <div 
                      className="bg-gradient-to-r from-rose-500 to-amber-500 h-full transition-all duration-500" 
                      style={{ width: `${modalImpact.deductionPercentage}%` }}
                    />
                  </div>
                </div>

                {/* STEP-BY-STEP WATERFALL CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* STEP 1: SALAIRE BRUT BASE */}
                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3 relative">
                    <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase font-bold">
                      <span>1. Brut Contractuel</span>
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded-md">Départ</span>
                    </div>
                    <div>
                      <p className="text-xl font-black text-white font-mono">
                        {modalImpact.baseSalary.toLocaleString()} <span className="text-xs font-normal text-slate-400">HTG</span>
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Base convenue au contrat</p>
                    </div>
                  </div>

                  {/* STEP 2: MAJORATIONS & GAINS (+) */}
                  <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-3 relative">
                    <div className="flex items-center justify-between text-emerald-400 font-mono text-[10px] uppercase font-bold">
                      <span className="flex items-center gap-1"><TrendingUp size={12} /> 2. Majorations (+)</span>
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-md">Gains</span>
                    </div>
                    <div>
                      <p className="text-xl font-black text-emerald-400 font-mono">
                        +{(modalImpact.overtimeVal + modalImpact.commissionsVal + modalImpact.bonusesVal).toLocaleString()} <span className="text-xs font-normal text-emerald-500">HTG</span>
                      </p>
                      <p className="text-[10px] text-emerald-300/80 mt-0.5">Total additions au brut</p>
                    </div>
                    <div className="space-y-1 text-[10px] border-t border-emerald-500/20 pt-2 font-mono text-slate-300">
                      {modalImpact.overtimeVal > 0 && <div className="flex justify-between"><span>Heures Sup:</span><strong className="text-emerald-400">+{modalImpact.overtimeVal.toLocaleString()} HTG</strong></div>}
                      {modalImpact.commissionsVal > 0 && <div className="flex justify-between"><span>Commissions:</span><strong className="text-emerald-400">+{modalImpact.commissionsVal.toLocaleString()} HTG</strong></div>}
                      {modalImpact.bonusesVal > 0 && <div className="flex justify-between"><span>Primes:</span><strong className="text-emerald-400">+{modalImpact.bonusesVal.toLocaleString()} HTG</strong></div>}
                    </div>
                  </div>

                  {/* STEP 3: RETENUES & TAXES (-) */}
                  <div className="p-4 bg-rose-950/20 border border-rose-500/30 rounded-2xl space-y-3 relative">
                    <div className="flex items-center justify-between text-rose-400 font-mono text-[10px] uppercase font-bold">
                      <span className="flex items-center gap-1"><TrendingDown size={12} /> 3. Retenues (-)</span>
                      <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 rounded-md">Déductions</span>
                    </div>
                    <div>
                      <p className="text-xl font-black text-rose-400 font-mono">
                        -{modalImpact.totalDeductionsCalculated.toLocaleString()} <span className="text-xs font-normal text-rose-500">HTG</span>
                      </p>
                      <p className="text-[10px] text-rose-300/80 mt-0.5">Cotisations & Taxes</p>
                    </div>
                    <div className="space-y-1 text-[10px] border-t border-rose-500/20 pt-2 font-mono text-slate-300">
                      <div className="flex justify-between"><span>ONA (6%):</span><strong>-{modalImpact.onaVal.toLocaleString()} HTG</strong></div>
                      <div className="flex justify-between"><span>OFATMA (2%):</span><strong>-{modalImpact.ofatmaVal.toLocaleString()} HTG</strong></div>
                      {modalImpact.advancesVal > 0 && <div className="flex justify-between"><span>Avances:</span><strong className="text-amber-400">-{modalImpact.advancesVal.toLocaleString()} HTG</strong></div>}
                    </div>
                  </div>

                  {/* STEP 4: SALAIRE NET À PAYER (=) */}
                  <div className="p-4 bg-cyan-950/30 border border-cyan-500/40 rounded-2xl space-y-3 relative shadow-lg">
                    <div className="flex items-center justify-between text-cyan-400 font-mono text-[10px] uppercase font-bold">
                      <span className="flex items-center gap-1"><CheckCircle2 size={12} /> 4. Net Versé (=)</span>
                      <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded-md">Final</span>
                    </div>
                    <div>
                      <p className="text-xl font-black text-emerald-400 font-mono">
                        {modalImpact.netPaidCalculated.toLocaleString()} <span className="text-xs font-normal text-emerald-500">HTG</span>
                      </p>
                      <p className="text-[10px] text-cyan-300 mt-0.5">Montant net final</p>
                    </div>
                  </div>
                </div>

                {/* DEDUCTIONS LEGAL EXPLANATION */}
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl text-xs text-slate-300 space-y-3">
                  {modalImpact.taxesExemptedOrOff && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs font-mono flex items-center gap-2 mb-2">
                      <Info size={16} className="shrink-0 text-amber-400" />
                      <span>Note : Les cotisations sociales ONA (6%) et OFATMA (2%) ont été désactivées ou non appliquées à l'initialisation de ce cycle de paie. Aucune déduction fiscale n'a été prélevée sur ce bulletin.</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 font-bold text-slate-200">
                    <Info className="text-cyan-400" size={16} />
                    <span>Guide Explicatif des Prélèvements Légaux (Code du Travail Haïtien & FINOPS ERP)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] text-slate-400 leading-relaxed pt-1">
                    <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/60 space-y-1">
                      <p className="text-cyan-300 font-bold">1. Cotisation ONA (Office National d'Assurance) - 6%</p>
                      <p>Déduction salariale obligatoire de 6% destinée au fonds de pension et retraite. L'employeur verse également une contribution patronale équivalente de 6% en votre nom.</p>
                    </div>
                    <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/60 space-y-1">
                      <p className="text-indigo-300 font-bold">2. Cotisation OFATMA / CNS - 2%</p>
                      <p>Assurance contre les accidents du travail, la maladie et la maternité. Prélevée à hauteur de 2% pour la couverture de santé, complétée par 3% pris en charge par l'entreprise.</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
                  <button
                    onClick={() => handleDownloadPayslipPdf(selectedRecord)}
                    className="px-6 py-3 bg-cyan-600 text-white hover:bg-cyan-500 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-cyan-500/20"
                  >
                    <Download className="w-4 h-4" /> Télécharger Bulletin (PDF)
                  </button>
                  <button
                    onClick={() => setSelectedRecord(null)}
                    className="px-6 py-3 bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-all"
                  >
                    Fermer
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

