import {
  Employee,
  LedgerTransaction,
  Department,
  PayrollRecord,
  AttendanceRecord,
  EmployeeDepartmentActivity,
} from "../types";
import { ReferenceResolver } from "./ReferenceResolver";

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
    activities?: EmployeeDepartmentActivity[]
  ): EmployeeAttributionSummary {
    // 1. If precalculated activities are provided, use them directly
    if (activities && activities.length > 0) {
      const empActivities = activities.filter((a) => a.employee_id === employee.id);
      const totalRevenue = empActivities.reduce((sum, a) => sum + a.sales_amount, 0);
      const distribution: Record<
        string,
        { departmentName: string; department_name: string; revenue: number; percentage: number }
      > = {};

      empActivities.forEach((a) => {
        distribution[a.department_id] = {
          departmentName: a.department_name,
          department_name: a.department_name,
          revenue: a.sales_amount,
          percentage: totalRevenue > 0 ? Math.round((a.sales_amount / totalRevenue) * 100) : 0,
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
    const empTxs = transactions.filter((t) => {
      const queryEmp = t.employeeId || (t as any).employee_id || t.employee_email || t.employeeName || (t as any).employee_name;
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

    const totalRevenue = empTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
    const distribution: Record<
      string,
      { departmentName: string; department_name: string; revenue: number; percentage: number }
    > = {};

    empTxs.forEach((t) => {
      const queryDept = t.departmentId || t.department_id || t.department_code || t.department_name;
      const resolvedDept = ReferenceResolver.resolveDepartment(departments, queryDept);
      const opDeptId = resolvedDept?.id || "general";
      const deptName = resolvedDept?.name || "Opérationnel Générale";

      if (!distribution[opDeptId]) {
        distribution[opDeptId] = {
          departmentName: deptName,
          department_name: deptName,
          revenue: 0,
          percentage: 0,
        };
      }

      distribution[opDeptId].revenue += t.amount || 0;
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
    activities?: EmployeeDepartmentActivity[]
  ): DepartmentProfitabilitySummary {
    const homeEmployees = allEmployees.filter(
      (e) => e.departmentId === department.id || (e as any).department_id === department.id
    );

    const homeEmployeePayrollCost = homeEmployees.reduce((sum, emp) => {
      const payrollRec = allPayrollRecords.find(
        (p) => p.employeeId === emp.id || p.employee_id === emp.id
      );
      if (payrollRec) {
        return sum + (payrollRec.grossSalary || (payrollRec.gross_salary_cents ? payrollRec.gross_salary_cents / 100 : 0));
      }
      return sum;
    }, 0);

    // 1. If precalculated activities are provided, use them for revenue and commissions
    if (activities && activities.length > 0) {
      const deptActivities = activities.filter((a) => a.department_id === department.id);
      const operationalRevenue = deptActivities.reduce((sum, a) => sum + a.sales_amount, 0);
      const distinctSellingEmps = new Set(deptActivities.map((a) => a.employee_id));
      const commissionPayoutCost = deptActivities.reduce((sum, a) => sum + a.commission_amount, 0);

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

    // 2. Otherwise fall back to robust transaction filter
    const deptTxs = allTransactions.filter((t) => {
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

    const operationalRevenue = deptTxs.reduce((sum, t) => sum + (t.amount || 0), 0);

    // Active selling employees in this department
    const distinctSellingEmps = new Set(
      deptTxs.map((t) => t.employeeId || (t as any).employee_id).filter(Boolean)
    );

    // Commission Payout Cost (Directly on transactions in this dept)
    const commissionPayoutCost = deptTxs.reduce((sum, t) => {
      const comm = (t.metadata as any)?.commission_calculated || 0;
      return sum + comm;
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
