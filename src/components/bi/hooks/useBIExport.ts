import { finopsEventOrchestrator } from "../../../services/finopsEventOrchestrator";
import { generateExecutivePdfReport, exportToExcel, generatePayrollPdfReport } from "../../../services/EnterpriseReportingEngine";
import { Employee, LedgerTransaction, AttendanceRecord, ForensicLog, Business, PayrollRecord } from "../../../types";
import { EnrichedBranchMetric, EmployeeScorecard } from "../types";
import { ReportType } from "./useBIUIState";

interface UseBIExportParams {
  currentBusiness?: Business;
  reportType: ReportType;
  employees: Employee[];
  ledgerTransactions: LedgerTransaction[];
  filteredAttendance: AttendanceRecord[];
  branchMetrics: EnrichedBranchMetric[];
  employeeScorecards: EmployeeScorecard[];
  filteredPayrolls?: PayrollRecord[];
  forensicLogs: ForensicLog[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMarginPercentage: number;
  attendanceConsistencyPct: number | null;
  payrollTaxesTotal: number;
  totalPayrollMass: number;
  totalCommissionPaid: number;
  startDate: string;
  endDate: string;
}

function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  // CSV Formula Injection Prevention: neutralize formula triggers =, +, -, @
  if (/^[=+\-@]/.test(str)) {
    str = "'" + str;
  }
  // Escape double quotes
  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

export function useBIExport(params: UseBIExportParams) {
  const triggerDownload = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportData = (format: "csv" | "excel" | "pdf") => {
    if (!params.currentBusiness) return;
    const filename = `FINOPS_BI_${params.reportType.toUpperCase()}_${new Date().toISOString().split("T")[0]}.${format === "excel" ? "xlsx" : format}`;

    if (format === "pdf") {
      if (params.reportType === "payroll") {
        generatePayrollPdfReport((params.filteredPayrolls && params.filteredPayrolls.length > 0) ? params.filteredPayrolls : params.employeeScorecards, params.currentBusiness.name);
      } else {
        const metrics = {
          totalRevenue: params.totalRevenue,
          totalExpenses: params.totalExpenses,
          netProfit: params.netProfit,
          burnRate: params.totalExpenses / 30,
          payrollCostRatio: params.totalRevenue > 0 ? (params.totalPayrollMass / params.totalRevenue) * 100 : 0,
          financialStressScore: 100,
          cashflow: params.netProfit,
        };
        const branchProfitData = params.branchMetrics.map((b) => ({
          branchId: b.branchName,
          revenue: b.revenue,
          expenses: b.expenses,
          profit: b.profit,
          margin: b.margin,
        }));
        generateExecutivePdfReport(metrics, branchProfitData, params.employeeScorecards as any, params.currentBusiness.name);
      }
      finopsEventOrchestrator.emit("REPORTS", params.currentBusiness.id, { action: "PDF_EXPORTED", reportType: params.reportType });
      return;
    }

    if (format === "excel") {
      let excelType: "TRANSACTIONS" | "PAYROLL" | "ATTENDANCE" | "TAX_SUMMARY" = "TRANSACTIONS";
      let exportData: any[] = [];

      if (params.reportType === "payroll") {
        excelType = "PAYROLL";
        exportData = (params.filteredPayrolls && params.filteredPayrolls.length > 0) ? params.filteredPayrolls : params.employeeScorecards;
      } else if (params.reportType === "attendance") {
        excelType = "ATTENDANCE";
        exportData = params.filteredAttendance;
      } else if (params.reportType === "profitability") {
        excelType = "TRANSACTIONS";
        exportData = params.branchMetrics;
      } else {
        excelType = "TAX_SUMMARY";
        exportData = params.forensicLogs.slice(0, 100);
      }

      exportToExcel(excelType, exportData, params.currentBusiness.id);
      finopsEventOrchestrator.emit("REPORTS", params.currentBusiness.id, { action: "EXCEL_EXPORTED", reportType: params.reportType });
      return;
    }

    // CSV format
    let csvContent = "";
    if (params.reportType === "payroll") {
      csvContent = "ID Record,ID Employé,Nom,Département,Période Début,Période Fin,Salaire Brut,Commissions,Avances,CNSS,CNS,Impôt Sur Revenu,Net Payé,Statut\n";
      const payrollList = params.filteredPayrolls || [];
      payrollList.forEach((rec) => {
        const id = escapeCsvCell(rec.id);
        const empId = escapeCsvCell(rec.employeeId);
        const name = escapeCsvCell(rec.employeeName || "");
        const dept = escapeCsvCell(rec.department_id || (rec as any).department || "");
        const start = escapeCsvCell(rec.period_start || rec.startDate || "");
        const end = escapeCsvCell(rec.period_end || rec.endDate || "");
        const gross = rec.grossSalary !== undefined ? rec.grossSalary : (rec.baseSalary || 0);
        const commissions = rec.commissions || 0;
        const advances = rec.advancesTreated !== undefined ? rec.advancesTreated : (rec.advances || 0);
        const cnss = rec.cnssDeduction || 0;
        const cns = rec.cnsDeduction || 0;
        const tax = rec.taxDeduction || 0;
        const net = rec.netPaid || 0;
        const status = escapeCsvCell(rec.status || "");
        csvContent += `${id},${empId},${name},${dept},${start},${end},${gross},${commissions},${advances},${cnss},${cns},${tax},${net},${status}\n`;
      });
    } else if (params.reportType === "attendance") {
      csvContent = "ID,Employé,Date,Arrivée (Check-In),Départ (Check-Out),Heures Prévues,Heures Réelles,Variance,Statut\n";
      params.filteredAttendance.forEach((rec) => {
        csvContent += `${escapeCsvCell(rec.id)},${escapeCsvCell(rec.employeeName)},${escapeCsvCell(rec.date)},${escapeCsvCell(rec.checkIn)},${escapeCsvCell(rec.checkOut || "N/A")},${rec.plannedHours},${rec.realHours},${rec.variance},${escapeCsvCell(rec.status)}\n`;
      });
    } else if (params.reportType === "profitability") {
      csvContent = "Succursale,Total Personnel,Recettes,Dépenses,Bénéfice Net,Marge de Rentabilité,Productivité Client,Risque Opérationnel\n";
      params.branchMetrics.forEach((bm) => {
        csvContent += `${escapeCsvCell(bm.branchName)},${bm.employeeCount},${bm.revenue},${bm.expenses},${bm.profit},${escapeCsvCell(bm.attendanceRate !== null && bm.attendanceRate !== undefined ? `${bm.attendanceRate}%` : "N/D")},${bm.efficiencyScore},${bm.efficiencyScore}\n`;
      });
    } else if (params.reportType === "employee") {
      csvContent = "Nom Employe,Rôle,Succursale,Département,Heures Travailes,Taux Conduite,Retards,Absences,Avances,Productivité Index\n";
      params.employeeScorecards.forEach((sc) => {
        csvContent += `${escapeCsvCell(sc.employeeName)},"",${escapeCsvCell(sc.branchId)},${escapeCsvCell(sc.departmentId)},${sc.totalHours},${escapeCsvCell(sc.attendanceConsistencyScore !== null && sc.attendanceConsistencyScore !== undefined ? `${sc.attendanceConsistencyScore}%` : "N/D")},${sc.latenessScore},0,0,${sc.productivityIndex}\n`;
      });
    } else {
      csvContent = "ID Log,Horodatage,Agent,Rôle,Opération Auditée,État Initial,État Final,Adresse IP,Signature HMAC\n";
      params.forensicLogs.slice(0, 50).forEach((l) => {
        csvContent += `${escapeCsvCell(l.id)},${escapeCsvCell(l.timestamp)},${escapeCsvCell(l.userName)},${escapeCsvCell(l.userRole)},${escapeCsvCell(l.action)},${escapeCsvCell((l.beforeState || "").substring(0, 30) + "...")},${escapeCsvCell((l.afterState || "").substring(0, 30) + "...")},${escapeCsvCell(l.ipAddress)},${escapeCsvCell(l.signature)}\n`;
      });
    }

    triggerDownload(filename, csvContent, "text/csv;charset=utf-8;");
    finopsEventOrchestrator.emit("REPORTS", params.currentBusiness.id, { action: "REPORT_GENERATED", format, reportType: params.reportType });
  };

  return { handleExportData };
}
