import { finopsEventOrchestrator } from "../../../services/finopsEventOrchestrator";
import { generateExecutivePdfReport, exportToExcel, generatePayrollPdfReport } from "../../../services/EnterpriseReportingEngine";
import { Employee, LedgerTransaction, AttendanceRecord, ForensicLog, Business } from "../../../types";
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
  forensicLogs: ForensicLog[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMarginPercentage: number;
  attendanceConsistencyPct: number;
  payrollTaxesTotal: number;
  totalPayrollMass: number;
  totalCommissionPaid: number;
  startDate: string;
  endDate: string;
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
        generatePayrollPdfReport(params.employeeScorecards, params.currentBusiness.name);
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
        exportData = params.employeeScorecards;
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
      csvContent = "ID,Nom,Salaire de Base,CNSS (6%),CNS (2%),Commissions,Avances,Net Estimé\n";
      params.employees.forEach((emp) => {
        const salary = emp.baseSalary || 0;
        const cnss = salary * 0.06;
        const cns = salary * 0.02;
        const commissions = 0;
        const advances = 0;
        const net = salary - cnss - cns + commissions - advances;
        csvContent += `"${emp.id}","${emp.name}",${salary},${cnss},${cns},${commissions},${advances},${net}\n`;
      });
    } else if (params.reportType === "attendance") {
      csvContent = "ID,Employé,Date,Arrivée (Check-In),Départ (Check-Out),Heures Prévues,Heures Réelles,Variance,Statut\n";
      params.filteredAttendance.forEach((rec) => {
        csvContent += `"${rec.id}","${rec.employeeName}","${rec.date}","${rec.checkIn}","${rec.checkOut || "N/A"}",${rec.plannedHours},${rec.realHours},${rec.variance},"${rec.status}"\n`;
      });
    } else if (params.reportType === "profitability") {
      csvContent = "Succursale,Total Personnel,Recettes,Dépenses,Bénéfice Net,Marge de Rentabilité,Productivité Client,Risque Opérationnel\n";
      params.branchMetrics.forEach((bm) => {
        csvContent += `"${bm.branchName}",${bm.employeeCount},${bm.revenue},${bm.expenses},${bm.profit},"${bm.attendanceRate}%",${bm.efficiencyScore},${bm.efficiencyScore}\n`;
      });
    } else if (params.reportType === "employee") {
      csvContent = "Nom Employe,Rôle,Succursale,Département,Heures Travailes,Taux Conduite,Retards,Absences,Avances,Productivité Index\n";
      params.employeeScorecards.forEach((sc) => {
        csvContent += `"${sc.employeeName}","","${sc.branchId}","${sc.departmentId}",${sc.totalHours},"${sc.attendanceConsistencyScore}%",${sc.latenessScore},0,0,${sc.productivityIndex}\n`;
      });
    } else {
      csvContent = "ID Log,Horodatage,Agent,Rôle,Opération Auditée,État Initial,État Final,Adresse IP,Signature HMAC\n";
      params.forensicLogs.slice(0, 50).forEach((l) => {
        csvContent += `"${l.id}","${l.timestamp}","${l.userName}","${l.userRole}","${l.action}","${(l.beforeState || "").substring(0, 30)}...","${(l.afterState || "").substring(0, 30)}...","${l.ipAddress}","${l.signature}"\n`;
      });
    }

    triggerDownload(filename, csvContent, "text/csv;charset=utf-8;");
    finopsEventOrchestrator.emit("REPORTS", params.currentBusiness.id, { action: "REPORT_GENERATED", format, reportType: params.reportType });
  };

  return { handleExportData };
}
