import { BusinessFact, AnalyticsResult, DimensionType, DrilldownResult } from '../types';
import { KPIRegistry } from '../KPIs/registry';
import { RevenueEngine } from '../engines/RevenueEngine';
import { EmployeeEngine } from '../engines/EmployeeEngine';
import { DepartmentEngine } from '../engines/DepartmentEngine';
import { BranchEngine } from '../engines/BranchEngine';
import { CostCenterEngine } from '../engines/CostCenterEngine';
import { ExplainabilityEngine } from '../engines/ExplainabilityEngine';

// Helper to match dates within a selected month or range
export function isDateInSelectedPeriod(date: Date, selectedMonth: number | string, selectedYear: number): boolean {
  if (date.getFullYear() !== selectedYear) return false;
  const m = date.getMonth();

  if (typeof selectedMonth === 'number') {
    return m === selectedMonth;
  }

  switch (selectedMonth) {
    case 'Q1':
      return m >= 0 && m <= 2;
    case 'Q2':
      return m >= 3 && m <= 5;
    case 'Q3':
      return m >= 6 && m <= 8;
    case 'Q4':
      return m >= 9 && m <= 11;
    case 'H1':
      return m >= 0 && m <= 5;
    case 'H2':
      return m >= 6 && m <= 11;
    case 'YEAR':
      return true;
    case 'TODAY': {
      const today = new Date();
      return date.getDate() === today.getDate() && m === today.getMonth();
    }
    case 'THIS_WEEK': {
      const today = new Date();
      const diffTime = Math.abs(today.getTime() - date.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    }
    default:
      return false;
  }
}

export class AnalyticsEngine {
  private revenueEngine = new RevenueEngine();
  private employeeEngine = new EmployeeEngine();
  private departmentEngine = new DepartmentEngine();
  private branchEngine = new BranchEngine();
  private costCenterEngine = new CostCenterEngine();
  private explainabilityEngine = new ExplainabilityEngine();

  // Helper to map operational raw data to unified BusinessFact representation
  mapToBusinessFacts(
    businessId: string,
    transactions: any[],
    payrolls: any[],
    attendanceLogs: any[],
    employees: any[] = []
  ): BusinessFact[] {
    const facts: BusinessFact[] = [];

    // Map Ledger Transactions
    transactions.forEach(tx => {
      if (tx.business_id !== businessId) return;
      facts.push({
        id: tx.id,
        businessId: tx.business_id,
        branchId: tx.branch_id || tx.branchId,
        departmentId: tx.department_id || tx.departmentId,
        employeeId: tx.employeeId || tx.employee_id,
        type: 'transaction',
        amount: Number(tx.amount) || 0,
        date: new Date(tx.date),
        category: tx.type, // 'INCOME' or 'EXPENSE'
        subcategory: tx.category, // e.g. 'Consulting', 'Office Supplies'
        product: tx.product,
        service: tx.service,
        metadata: {
          description: tx.description,
          type: tx.type,
          subcategory: tx.category,
          product: tx.product,
          service: tx.service,
          reference: tx.reference,
          payment_method: tx.payment_method,
          payrollCycleId: tx.metadata?.payrollCycleId
        }
      });
    });

    // Map Payrolls
    payrolls.forEach(pay => {
      if (pay.business_id !== businessId && pay.businessId !== businessId) return;
      
      const matchedEmployee = employees.find(e => e.id === pay.employeeId);
      const deptId = pay.department_id || pay.departmentId || matchedEmployee?.department_id;
      const brId = pay.branch_id || pay.branchId || matchedEmployee?.branch_id;
      
      facts.push({
        id: pay.id,
        businessId,
        branchId: brId,
        departmentId: deptId,
        employeeId: pay.employeeId,
        type: 'payroll',
        amount: Number(pay.netPaid || pay.grossSalary) || 0,
        date: new Date(pay.paymentDate || pay.createdAt || pay.date),
        category: 'PAYROLL',
        metadata: {
          employeeName: matchedEmployee?.name || pay.employeeName || 'Staff',
          grossSalary: pay.grossSalary,
          netPaid: pay.netPaid,
          deductions: pay.deductions,
          payrollCycleId: pay.payrollCycleId || pay.cycleId
        }
      });
    });

    // Map Attendance Logs
    attendanceLogs.forEach(att => {
      if (att.business_id !== businessId && att.businessId !== businessId) return;

      const matchedEmployee = employees.find(e => e.id === att.employeeId);
      const deptId = att.department_id || att.departmentId || matchedEmployee?.department_id;
      const brId = att.branch_id || att.branchId || matchedEmployee?.branch_id;

      facts.push({
        id: att.id,
        businessId,
        branchId: brId,
        departmentId: deptId,
        employeeId: att.employeeId,
        type: 'attendance',
        amount: 0,
        date: new Date(att.date),
        metadata: {
          employeeName: matchedEmployee?.name || 'Staff',
          status: att.status || (att.isPresent ? 'PRESENT' : 'ABSENT'),
          isPresent: att.isPresent ?? (att.status === 'PRESENT' || att.status === 'present'),
          clockIn: att.clockIn,
          clockOut: att.clockOut
        }
      });
    });

    return facts;
  }

  // Orchestrate calculations for the comprehensive monthly/period summary
  runAnalytics(
    businessId: string,
    selectedMonth: number | string,
    selectedYear: number,
    transactions: any[],
    payrolls: any[],
    attendanceLogs: any[],
    employees: any[] = [],
    departments: any[] = []
  ) {
    const allFacts = this.mapToBusinessFacts(businessId, transactions, payrolls, attendanceLogs, employees);

    // Filter facts to the target month or range & year
    const periodFacts = allFacts.filter(f => {
      return isDateInSelectedPeriod(f.date, selectedMonth, selectedYear);
    });

    // Compute central KPI values
    const kpis: Record<string, { id: string; name: string; description: string; value: number; format: string; color: string }> = {};
    Object.keys(KPIRegistry).forEach(kpiId => {
      const kpi = KPIRegistry[kpiId];
      kpis[kpiId] = {
        id: kpi.id,
        name: kpi.name,
        description: kpi.description,
        value: kpi.formula(periodFacts),
        format: kpi.format,
        color: kpi.color
      };
    });

    // Run specialized engines
    const revenueDetails = this.revenueEngine.calculateRevenueBreakdown(periodFacts);
    const trendDetails = this.revenueEngine.calculateMonthlyTrends(allFacts);
    const advancedFinancials = this.revenueEngine.calculateAdvancedFinancials(allFacts, periodFacts); // run on all facts for historical timeline
    const employeeDetails = this.employeeEngine.calculateEmployeeMetrics(periodFacts);
    const departmentDetails = this.departmentEngine.calculateDepartmentMetrics(periodFacts, departments);
    const branchDetails = this.branchEngine.calculateBranchMetrics(periodFacts);
    const costCenterDetails = this.costCenterEngine.calculateCostCenterMetrics(periodFacts);

    return {
      businessId,
      period: typeof selectedMonth === 'number'
        ? `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`
        : `${selectedYear}-${selectedMonth}`,
      kpis,
      revenueDetails,
      trendDetails,
      employeeDetails,
      departmentDetails,
      branchDetails,
      costCenterDetails,
      advancedFinancials,
      factsCount: periodFacts.length
    };
  }

  // Drilldown / Explainability query
  explainKPI(
    businessId: string,
    selectedMonth: number | string,
    selectedYear: number,
    kpiId: string,
    dimension: DimensionType,
    transactions: any[],
    payrolls: any[],
    attendanceLogs: any[],
    employees: any[] = [],
    departments: any[] = [],
    branches: any[] = []
  ): DrilldownResult {
    const allFacts = this.mapToBusinessFacts(businessId, transactions, payrolls, attendanceLogs, employees);
    const periodFacts = allFacts.filter(f => {
      return isDateInSelectedPeriod(f.date, selectedMonth, selectedYear);
    });

    return this.explainabilityEngine.explainMetric(kpiId, periodFacts, dimension, departments, branches);
  }
}
