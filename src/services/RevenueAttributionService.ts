import {
  Employee,
  LedgerTransaction,
  Department,
  PayrollRecord,
  AttendanceRecord,
  EmployeeDepartmentActivity,
} from "../types";
import { ReferenceResolver } from "./ReferenceResolver";
import { NormalizationContext, NormalizedAmountResolver } from "../domains/analytics/utils/NormalizedAmountResolver";
import { toDateOnly } from "../utils/dateNormalization";

export interface EmployeeAttributionSummary {
  employeeId: string;
  homeDepartmentId: string;
  totalRevenueGenerated: number;
  operationalDistribution: Record<
    string,
    {
      departmentName: string;
      department_name: string;
      revenue: number;
      percentage: number;
    }
  >;
}

export interface DepartmentProfitabilitySummary {
  departmentId: string;
  departmentName: string;
  operationalRevenue: number;
  homeEmployeePayrollCost: number;
  commissionPayoutCost: number;
  totalDirectLaborCost: number;
  contributionMargin: number;
  operatingMarginPercentage: number;
  headcountHome: number;
  activeSellingEmployees: number;
}

export class RevenueAttributionService {
  /**
   * Calculates Cross-Department Revenue Attribution for an employee
   * (e.g. Employee in "Salon" selling 70% Salon, 20% Boissons, 10% Retail)
   */
  static calculateEmployeeAttribution(
    employee: Employee,
    transactions: LedgerTransaction[],
    departments: Department[],
    activities?: EmployeeDepartmentActivity[],
    normalizationContext?: NormalizationContext
  ): EmployeeAttributionSummary {
    // 1. If precalculated activities are provided, use them directly
    if (activities && activities.length > 0) {
      const empActivities = activities.filter((a: any) => a.employee_id === employee.id);
      const totalRevenue = empActivities.reduce((sum, a: any) => {
        const isAlreadyHtg = a.sales_amount_htg !== undefined;
        const amt = a.sales_amount_htg ?? a.sales_amount ?? 0;
        const currency = isAlreadyHtg ? "HTG" : (a.currency || a.currency_code || a.currencyCode || "HTG");
        const date = toDateOnly(a.date || a.created_at);
        const normalized = normalizationContext && amt !== 0
          ? NormalizedAmountResolver.resolveToHTG(amt, currency, date, normalizationContext)
          : amt;
        return sum + normalized;
      }, 0);
      const distribution: Record<
        string,
        { departmentName: string; department_name: string; revenue: number; percentage: number }
      > = {};

      empActivities.forEach((a: any) => {
        const isAlreadyHtg = a.sales_amount_htg !== undefined;
        const amt = a.sales_amount_htg ?? a.sales_amount ?? 0;
        const currency = isAlreadyHtg ? "HTG" : (a.currency || a.currency_code || a.currencyCode || "HTG");
        const date = toDateOnly(a.date || a.created_at);
        const normalized = normalizationContext && amt !== 0
          ? NormalizedAmountResolver.resolveToHTG(amt, currency, date, normalizationContext)
          : amt;

        distribution[a.department_id] = {
          departmentName: a.department_name,
          department_name: a.department_name,
          revenue: normalized,
          percentage: totalRevenue !== 0 ? Math.round((normalized / totalRevenue) * 100) : 0,
        };
      });

      return {
        employeeId: employee.id,
        homeDepartmentId: employee.departmentId,
        totalRevenueGenerated: totalRevenue,
        operationalDistribution: distribution,
      };
    }

    // 2. Otherwise fall back to robust resolver pipeline
    const empTxs = transactions.filter((t: any) => {
      const queryEmp = t.employeeId || t.employee_id || t.employee_email || t.employeeName || t.employee_name;
      const resolvedEmp = ReferenceResolver.resolveEmployee([employee], queryEmp);
      
      const typeUpper = (t.type || "").toUpperCase();
      const catUpper = (t.category || "").toUpperCase();
      const isRevenue = (
        typeUpper === "INCOME" || 
        typeUpper === "SALES" || 
        typeUpper === "REVENUE" || 
        catUpper === "REVENUE" || 
        catUpper === "SALES" || 
        catUpper === "VENTES" ||
        catUpper === "INCOME"
      );

      return resolvedEmp && resolvedEmp.id === employee.id && isRevenue && t.status !== "REVERSED";
    });

    const totalRevenue = empTxs.reduce((sum, t: any) => {
      const isAlreadyHtg = t.amount_htg !== undefined || t.amountHtg !== undefined;
      const amt = t.amount_htg ?? t.amountHtg ?? t.amount ?? 0;
      const currency = isAlreadyHtg ? "HTG" : (t.currency || t.currency_code || t.currencyCode || "HTG");
      const date = toDateOnly(t.date || t.created_at);
      const normalized = normalizationContext && amt !== 0
        ? NormalizedAmountResolver.resolveToHTG(amt, currency, date, normalizationContext)
        : amt;
      return sum + normalized;
    }, 0);
    const distribution: Record<
      string,
      { departmentName: string; department_name: string; revenue: number; percentage: number }
    > = {};

    empTxs.forEach((t: any) => {
      const queryDept = t.departmentId || t.department_id || t.department_code || t.department_name;
      const resolvedDept = ReferenceResolver.resolveDepartment(departments, queryDept);
      const opDeptId = resolvedDept?.id || "general";
      const deptName = resolvedDept?.name || "Opérationnel Générale";

      const isAlreadyHtg = t.amount_htg !== undefined || t.amountHtg !== undefined;
      const amt = t.amount_htg ?? t.amountHtg ?? t.amount ?? 0;
      const currency = isAlreadyHtg ? "HTG" : (t.currency || t.currency_code || t.currencyCode || "HTG");
      const date = toDateOnly(t.date || t.created_at);
      const normalized = normalizationContext && amt !== 0
        ? NormalizedAmountResolver.resolveToHTG(amt, currency, date, normalizationContext)
        : amt;

      if (!distribution[opDeptId]) {
        distribution[opDeptId] = {
          departmentName: deptName,
          department_name: deptName,
          revenue: 0,
          percentage: 0,
        };
      }

      distribution[opDeptId].revenue += normalized;
    });

    // Calculate percentages
    Object.keys(distribution).forEach((deptId) => {
      distribution[deptId].percentage =
        totalRevenue > 0
          ? Math.round((distribution[deptId].revenue / totalRevenue) * 100)
          : 0;
    });

    return {
      employeeId: employee.id,
      homeDepartmentId: employee.departmentId,
      totalRevenueGenerated: totalRevenue,
      operationalDistribution: distribution,
    };
  }

  /**
   * Calculates Department Profitability P&L with strict separation of:
   * - Operational Revenue (Revenue generated in this dept regardless of seller home dept)
   * - Home Employee Payroll Cost (Base salaries of employees whose home dept is this dept)
   * - Commission Payout Cost (Commissions paid on sales inside this operational dept)
   */
  static calculateDepartmentProfitability(
    department: Department,
    allEmployees: Employee[],
    allTransactions: LedgerTransaction[],
    allPayrollRecords: PayrollRecord[],
    activities?: EmployeeDepartmentActivity[],
    normalizationContext?: NormalizationContext
  ): DepartmentProfitabilitySummary {
    const homeEmployees = allEmployees.filter(
      (e) => e.departmentId === department.id || (e as any).department_id === department.id
    );

    const homeEmployeePayrollCost = homeEmployees.reduce((sum, emp) => {
      const payrollRec = allPayrollRecords.find(
        (p: any) => p.employeeId === emp.id || p.employee_id === emp.id
      );
      if (payrollRec) {
        const isAlreadyHtg = (payrollRec as any).grossSalaryHtg !== undefined;
        const rawGross = (payrollRec as any).grossSalaryHtg ?? (payrollRec.grossSalary || (payrollRec.gross_salary_cents ? payrollRec.gross_salary_cents / 100 : 0));
        const currency = isAlreadyHtg ? "HTG" : ((payrollRec as any).currency || (payrollRec as any).currency_code || (payrollRec as any).currencyCode || "HTG");
        const date = toDateOnly((payrollRec as any).paymentDate || (payrollRec as any).effectiveAccountingDate || (payrollRec as any).created_at);
        const normalized = normalizationContext && rawGross !== 0
          ? NormalizedAmountResolver.resolveToHTG(rawGross, currency, date, normalizationContext)
          : rawGross;
        return sum + normalized;
      }
      return sum;
    }, 0);

    // 1. If precalculated activities are provided, use them for revenue and commissions
    if (activities && activities.length > 0) {
      const deptActivities = activities.filter((a: any) => a.department_id === department.id);
      const operationalRevenue = deptActivities.reduce((sum, a: any) => {
        const isAlreadyHtg = a.sales_amount_htg !== undefined;
        const amt = a.sales_amount_htg ?? a.sales_amount ?? 0;
        const currency = isAlreadyHtg ? "HTG" : (a.currency || a.currency_code || a.currencyCode || "HTG");
        const date = toDateOnly(a.date || a.created_at);
        const normalized = normalizationContext && amt !== 0
          ? NormalizedAmountResolver.resolveToHTG(amt, currency, date, normalizationContext)
          : amt;
        return sum + normalized;
      }, 0);
      const distinctSellingEmps = new Set(deptActivities.map((a: any) => a.employee_id));
      const commissionPayoutCost = deptActivities.reduce((sum, a: any) => {
        const isAlreadyHtg = a.commission_amount_htg !== undefined;
        const amt = a.commission_amount_htg ?? a.commission_amount ?? 0;
        const currency = isAlreadyHtg ? "HTG" : (a.currency || a.currency_code || a.currencyCode || "HTG");
        const date = toDateOnly(a.date || a.created_at);
        const normalized = normalizationContext && amt !== 0
          ? NormalizedAmountResolver.resolveToHTG(amt, currency, date, normalizationContext)
          : amt;
        return sum + normalized;
      }, 0);

      const totalDirectLaborCost = homeEmployeePayrollCost + commissionPayoutCost;
      const contributionMargin = operationalRevenue - totalDirectLaborCost;
      const operatingMarginPercentage =
        operationalRevenue !== 0
          ? Math.round((contributionMargin / operationalRevenue) * 100)
          : 0;

      return {
        departmentId: department.id,
        departmentName: department.name,
        operationalRevenue,
        homeEmployeePayrollCost,
        commissionPayoutCost,
        totalDirectLaborCost,
        contributionMargin,
        operatingMarginPercentage,
        headcountHome: homeEmployees.length,
        activeSellingEmployees: distinctSellingEmps.size,
      };
    }

    // 2. Otherwise fall back to robust transaction filter
    const deptTxs = allTransactions.filter((t: any) => {
      const queryDept = t.departmentId || t.department_id || t.department_code || t.department_name;
      const resolvedDept = ReferenceResolver.resolveDepartment([department], queryDept);
      
      const typeUpper = (t.type || "").toUpperCase();
      const catUpper = (t.category || "").toUpperCase();
      const isRevenue = (
        typeUpper === "INCOME" || 
        typeUpper === "SALES" || 
        typeUpper === "REVENUE" || 
        catUpper === "REVENUE" || 
        catUpper === "SALES" || 
        catUpper === "VENTES" ||
        catUpper === "INCOME"
      );

      return resolvedDept && resolvedDept.id === department.id && isRevenue && t.status !== "REVERSED";
    });

    const operationalRevenue = deptTxs.reduce((sum, t: any) => {
      const isAlreadyHtg = t.amount_htg !== undefined || t.amountHtg !== undefined;
      const amt = t.amount_htg ?? t.amountHtg ?? t.amount ?? 0;
      const currency = isAlreadyHtg ? "HTG" : (t.currency || t.currency_code || t.currencyCode || "HTG");
      const date = toDateOnly(t.date || t.created_at);
      const normalized = normalizationContext && amt !== 0
        ? NormalizedAmountResolver.resolveToHTG(amt, currency, date, normalizationContext)
        : amt;
      return sum + normalized;
    }, 0);

    // Active selling employees in this department
    const distinctSellingEmps = new Set(
      deptTxs.map((t: any) => t.employeeId || t.employee_id).filter(Boolean)
    );

    // Commission Payout Cost (Directly on transactions in this dept)
    const commissionPayoutCost = deptTxs.reduce((sum, t: any) => {
      const isAlreadyHtg = t.commission_calculated_htg !== undefined;
      const comm = t.commission_calculated_htg ?? t.metadata?.commission_calculated ?? 0;
      const currency = isAlreadyHtg ? "HTG" : (t.currency || t.currency_code || t.currencyCode || "HTG");
      const date = toDateOnly(t.date || t.created_at);
      const normalized = normalizationContext && comm !== 0
        ? NormalizedAmountResolver.resolveToHTG(comm, currency, date, normalizationContext)
        : comm;
      return sum + normalized;
    }, 0);

    const totalDirectLaborCost = homeEmployeePayrollCost + commissionPayoutCost;
    const contributionMargin = operationalRevenue - totalDirectLaborCost;
    const operatingMarginPercentage =
      operationalRevenue > 0
        ? Math.round((contributionMargin / operationalRevenue) * 100)
        : 0;

    return {
      departmentId: department.id,
      departmentName: department.name,
      operationalRevenue,
      homeEmployeePayrollCost,
      commissionPayoutCost,
      totalDirectLaborCost,
      contributionMargin,
      operatingMarginPercentage,
      headcountHome: homeEmployees.length,
      activeSellingEmployees: distinctSellingEmps.size,
    };
  }
}
