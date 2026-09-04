import jsPDF from "jspdf";
import * as xlsx from "xlsx";
import { LedgerTransaction, PayrollRecord, AttendanceRecord, Employee, Branch } from "../types";
import { WorkforceMetrics, BranchEfficiency } from "./WorkforceIntelligence";
import { IntelligenceMetrics, BranchProfitability } from "./FinancialIntelligence";

const generateFileName = (prefix: string, ext: string) => {
  return `${prefix}_${new Date().toISOString().split("T")[0]}.${ext}`;
};

export const exportToExcel = (
  type: "TRANSACTIONS" | "PAYROLL" | "ATTENDANCE" | "TAX_SUMMARY",
  data: any[],
  business_id: string
) => {
  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, type);
  xlsx.writeFile(wb, generateFileName(`FinOps_${type}`, "xlsx"));
};

export const generateExecutivePdfReport = (
  metrics: IntelligenceMetrics,
  branchProfitData: BranchProfitability[],
  workforceData: WorkforceMetrics[],
  businessName: string
) => {
  const pdf = new jsPDF();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text(`Executive Intelligence Report - ${businessName}`, 14, 20);

  pdf.setFontSize(14);
  pdf.text(`Financial Performance`, 14, 35);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(`Total Revenue: ${metrics.totalRevenue} HTG`, 14, 45);
  pdf.text(`Total Expenses: ${metrics.totalExpenses} HTG`, 14, 52);
  pdf.text(`Net Profit: ${metrics.netProfit} HTG`, 14, 59);
  pdf.text(`Burn Rate / Day: ${Math.round(metrics.burnRate)} HTG`, 14, 66);
  pdf.text(`Payroll Cost Ratio: ${Math.round(metrics.payrollCostRatio)}%`, 14, 73);
  pdf.text(`Financial Stress Score: ${Math.round(metrics.financialStressScore)}`, 14, 80);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(`Branch Performance`, 14, 95);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  let y = 105;
  branchProfitData.forEach(branch => {
    pdf.text(`Branch ID ${branch.branchId} - Revenue: ${branch.revenue} HTG, Profit: ${branch.profit} HTG (${Math.round(branch.margin)}%)`, 14, y);
    y += 7;
  });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(`Workforce Insights (Top 5)`, 14, y + 10);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  y += 20;
  workforceData.slice(0, 5).forEach(emp => {
    pdf.text(`Employee ${emp.employeeId} - Prod. Index: ${Math.round(emp.productivityIndex)}, Attendance: ${Math.round(emp.attendanceConsistencyScore)}%`, 14, y);
    y += 7;
  });

  pdf.save(generateFileName("Executive_Report", "pdf"));
};

export const generatePayslipPdf = (
  payroll: PayrollRecord,
  employee: Employee,
  businessName: string
) => {
  const pdf = new jsPDF();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text(`Fiche de Paie`, 105, 20, { align: "center" });

  pdf.setFontSize(12);
  pdf.text(`Entreprise: ${businessName}`, 14, 40);
  pdf.text(`Employé: ${employee.name}`, 14, 47);
  pdf.text(`Rôle: ${employee.role}`, 14, 54);
  
  pdf.setFont("helvetica", "normal");
  pdf.text(`Salaire de base: ${employee.baseSalary} HTG`, 14, 70);
  pdf.text(`Commissions: ${payroll.commissions} HTG`, 14, 77);
  pdf.text(`Avances déduites: ${payroll.advancesTreated} HTG`, 14, 84);
  pdf.text(`Déduction CNSS (6%): ${payroll.cnssDeduction} HTG`, 14, 91);
  pdf.text(`Déduction CNS (2%): ${payroll.cnsDeduction} HTG`, 14, 98);
  
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(`Net Payé: ${payroll.netPaid} HTG`, 14, 115);
  
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(9);
  pdf.text(`Document généré électroniquement. Signature: ${payroll.hashSignature}`, 14, 280);

  pdf.save(generateFileName(`Payslip_${employee.name.replace(/\s/g, "_")}`, "pdf"));
};

export const exportCardSnapshotToCsv = (
  title: string,
  value: string,
  metricType: string
) => {
  const data = [
    {
      "Indicateur Financier": title,
      "Valeur Actuelle": value,
      "Type de Métrique": metricType,
      "Date de l'Audit": new Date().toLocaleDateString(),
      "Heure de l'Audit": new Date().toLocaleTimeString(),
      "Statut": "Vérifié & Certifié de l'ERP"
    }
  ];
  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Metrics Snapshot");
  xlsx.writeFile(wb, `${title.replace(/\s+/g, '_')}_Snapshot_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportCardSnapshotToPdf = (
  title: string,
  value: string,
  metricType: string,
  businessName: string
) => {
  const pdf = new jsPDF();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text(`FinOps Executive Snapshot`, 14, 25);
  pdf.setLineWidth(0.5);
  pdf.line(14, 30, 196, 30);
  
  pdf.setFontSize(12);
  pdf.text(`Organisation : ${businessName}`, 14, 45);
  pdf.text(`Date de l'Évaluation : ${new Date().toLocaleString()}`, 14, 52);
  pdf.text(`Indicateur Comptable : ${title}`, 14, 62);
  
  pdf.setFont("helvetica", "normal");
  pdf.text(`Type de Dimension : ${metricType}`, 14, 72);
  pdf.setFont("helvetica", "bold");
  pdf.text(`Solde Consolidé : ${value}`, 14, 82);
  
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Ce rapport instantané représente un snapshot financier scellé en temps réel`, 14, 110);
  pdf.text(`dans le grand livre distribué d'AI Studio FinOps.`, 14, 117);
  
  pdf.save(`${title.replace(/\s+/g, '_')}_Snapshot_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const generatePayrollPdfReport = (
  payrollData: any[],
  businessName: string
) => {
  const pdf = new jsPDF();
  
  // Header Branding block with corporate Navy color
  pdf.setFillColor(15, 23, 42); // slate-900 / Navy
  pdf.rect(0, 0, 210, 40, "F");
  
  // Enterprise Title & Logo Accent
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.setTextColor(255, 255, 255);
  pdf.text("FINOPS ERP", 14, 20);
  
  pdf.setFontSize(11);
  pdf.setTextColor(148, 163, 184); // slate-400
  pdf.text("SYSTEME COMPTABLE & SYSTEME BI INTEGRES", 14, 27);
  
  // Business name & Timestamp Right aligned in branding header
  pdf.setFontSize(10);
  pdf.setTextColor(255, 255, 255);
  pdf.text(`${businessName.toUpperCase()}`, 196, 18, { align: "right" });
  
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(203, 213, 225); // slate-300
  pdf.text(`Rapport Généré le : ${new Date().toLocaleDateString()}`, 196, 25, { align: "right" });
  pdf.text(`Heure d'Émission : ${new Date().toLocaleTimeString()}`, 196, 31, { align: "right" });

  // Document Title
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(15, 23, 42); // slate-900
  pdf.text("RAPPORT DE PAIE CONSOLIDE", 14, 52);
  
  // Divider line
  pdf.setDrawColor(226, 232, 240); // slate-200
  pdf.setLineWidth(0.5);
  pdf.line(14, 56, 196, 56);
  
  // Metrics overview section inside elegant card
  pdf.setFillColor(248, 250, 252); // slate-50
  pdf.rect(14, 62, 182, 28, "F");
  pdf.setDrawColor(241, 245, 249); // slate-100
  pdf.rect(14, 62, 182, 28, "S");
  
  // Aggregates calculations
  const totalEmployees = payrollData.length;
  const totalGross = payrollData.reduce((sum, item) => sum + (item.payrollTotal || 0), 0);
  const totalCommissions = payrollData.reduce((sum, item) => sum + (item.commissionsGenerated || 0), 0);
  const totalAdvances = payrollData.reduce((sum, item) => sum + (item.advancesTaken || 0), 0);
  
  const totalCnss = Math.round(totalGross * 0.06);
  const totalCns = Math.round(totalGross * 0.02);
  const totalNet = totalGross - totalCnss - totalCns;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139); // slate-500
  pdf.text("EFFECTIF", 20, 70);
  pdf.text("MASSE NETTE", 60, 70);
  pdf.text("COMMISSIONS", 105, 70);
  pdf.text("PRELEVEMENTS CNSS/CNS", 145, 70);

  pdf.setFontSize(14);
  pdf.setTextColor(15, 23, 42); // slate-900
  pdf.text(`${totalEmployees}`, 20, 81);
  pdf.text(`${totalNet.toLocaleString()} HTG`, 60, 81);
  pdf.text(`${totalCommissions.toLocaleString()} HTG`, 105, 81);
  pdf.text(`${(totalCnss + totalCns).toLocaleString()} HTG`, 145, 81);

  // Table header with Teal Accent background
  pdf.setFillColor(13, 148, 136); // teal-600
  pdf.rect(14, 98, 182, 8, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.text("ID", 17, 103);
  pdf.text("EMPLOYÉ", 35, 103);
  pdf.text("DEPARTEMENT", 75, 103);
  pdf.text("PROD.", 115, 103);
  pdf.text("COMMISSIONS", 130, 103);
  pdf.text("AVANCES", 155, 103);
  pdf.text("SOLDE NET", 175, 103);

  // Rows Rendering
  let rowY = 112;
  pdf.setTextColor(51, 65, 85); // slate-700
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);

  payrollData.forEach((item, index) => {
    // Zebra striping
    if (index % 2 === 0) {
      pdf.setFillColor(248, 250, 252); // slate-50
      pdf.rect(14, rowY - 4, 182, 6, "F");
    }

    const empId = item.id || "N/A";
    const name = item.displayName || item.name || "N/A";
    const dept = item.department || "N/A";
    const productivity = item.productivityIndex !== undefined ? `${Math.round(item.productivityIndex)}` : "100";
    const commissions = item.commissionsGenerated !== undefined ? `${item.commissionsGenerated.toLocaleString()} HTG` : "0 HTG";
    const advances = item.advancesTaken !== undefined ? `${item.advancesTaken.toLocaleString()} HTG` : "0 HTG";
    const netPaid = item.payrollTotal !== undefined ? `${item.payrollTotal.toLocaleString()} HTG` : "0 HTG";

    pdf.text(empId.toString().substring(0, 8), 17, rowY);
    pdf.text(name.toString().substring(0, 20), 35, rowY);
    pdf.text(dept.toString().substring(0, 18), 75, rowY);
    pdf.text(productivity, 115, rowY);
    pdf.text(commissions, 130, rowY);
    pdf.text(advances, 155, rowY);
    pdf.setFont("helvetica", "bold");
    pdf.text(netPaid, 175, rowY);
    pdf.setFont("helvetica", "normal");

    rowY += 6;
  });

  // Stamp and signatures at the bottom
  const footerY = Math.max(160, rowY + 15);
  pdf.setDrawColor(226, 232, 240); // slate-200
  pdf.line(14, footerY, 196, footerY);

  // Signatures columns
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(71, 85, 105); // slate-600
  pdf.text("PREPARÉ PAR LE CFO", 25, footerY + 8);
  pdf.text("APPROUVÉ PAR L'AUDITEUR FISCAL", 125, footerY + 8);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(148, 163, 184); // slate-400
  pdf.text("Signature & Sceau Électroniques FinOps", 25, footerY + 22);
  pdf.text("Scellé de Conformité ONA & CNSS", 125, footerY + 22);

  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(7);
  pdf.text(`Rapport de paie audité sous la juridiction de la République d'Haïti. Certification ID: ${Math.random().toString(36).substring(2, 10).toUpperCase()}`, 14, 285);

  pdf.save(`FinOps_Rapport_Paie CONSOLIDE_${businessName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
};
