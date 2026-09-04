import { IdentityUserContext } from "./AICFOGovernanceTypes";
import { getRoleGovernancePolicy } from "./AICFORoleMatrix";

export class AICFODataMasking {
  /**
   * Sanitizes and masks an enterprise data snapshot based on user identity context.
   */
  public static maskSnapshot(
    snapshot: any,
    userContext: IdentityUserContext
  ): any {
    if (!snapshot) return null;
    const policy = getRoleGovernancePolicy(userContext.role);
    const role = policy.role;

    // OWNER has full unmasked visibility
    if (role === "OWNER") {
      return snapshot;
    }

    const maskedSnapshot = JSON.parse(JSON.stringify(snapshot));

    // 1. EMPLOYEE: Mask all company totals, profit, revenue, expenses. Keep only personal indicators.
    if (role === "EMPLOYEE") {
      return {
        tenant_isolation: `ISOLATED_USER_${userContext.userId}`,
        role: "EMPLOYEE",
        user_info: {
          id: userContext.userId,
          name: userContext.userName,
          branchId: userContext.branchId,
          departmentId: userContext.departmentId
        },
        notice: "Les données d'entreprise globales sont masquées selon les règles de gouvernance RBAC."
      };
    }

    // 2. SUPERVISOR: Keep team attendance & operational indicators. Mask company revenue, profit, payroll costs.
    if (role === "SUPERVISOR") {
      delete maskedSnapshot.revenue;
      delete maskedSnapshot.expenses;
      delete maskedSnapshot.profit;
      delete maskedSnapshot.cashFlow;
      delete maskedSnapshot.payrollTotal;
      delete maskedSnapshot.netIncome;

      maskedSnapshot.governance = {
        scope: "SUPERVISOR_OPERATIONAL_ONLY",
        branchId: userContext.branchId,
        departmentId: userContext.departmentId,
        maskedFields: ["revenue", "expenses", "profit", "payrollTotal", "individualSalaries"]
      };
      return maskedSnapshot;
    }

    // 3. HEAD TELLER: Keep cash operations and branch cash ledger summary. Mask company profit and payroll.
    if (role === "HEAD_TELLER") {
      delete maskedSnapshot.payrollTotal;
      delete maskedSnapshot.profit;
      delete maskedSnapshot.netIncome;
      delete maskedSnapshot.executiveSalaries;

      maskedSnapshot.governance = {
        scope: "HEAD_TELLER_CASH_OPERATIONS",
        branchId: userContext.branchId,
        maskedFields: ["payrollTotal", "profit", "executiveSalaries"]
      };
      return maskedSnapshot;
    }

    // 4. MANAGER: Keep branch revenue, expenses, and department totals. Mask individual salaries.
    if (role === "MANAGER") {
      delete maskedSnapshot.executiveSalaries;
      if (maskedSnapshot.employees) {
        maskedSnapshot.employees = maskedSnapshot.employees.map((emp: any) => ({
          id: emp.id,
          branchId: emp.branchId,
          departmentId: emp.departmentId,
          salary: "[MASQUÉ / DEPT_AGGREGATE_ONLY]",
          status: emp.status
        }));
      }

      maskedSnapshot.governance = {
        scope: "BRANCH_MANAGER_AGGREGATED",
        branchId: userContext.branchId,
        maskedFields: ["individualSalaries", "executiveSalaries"]
      };
      return maskedSnapshot;
    }

    // 5. SUPER ADMIN: System health and telemetry only
    if (role === "SUPER_ADMIN") {
      return {
        telemetry: {
          status: "OPTIMAL",
          module: "AI_CFO_GOVERNANCE",
          isolated_tenant: userContext.businessId
        },
        notice: "Les données financières privées du client sont masquées pour préserver le secret d'affaires."
      };
    }

    return maskedSnapshot;
  }

  /**
   * Filter and mask raw data lists (employees, ledger, attendance, payroll).
   */
  public static maskRawDataLists(
    lists: {
      employees?: any[];
      ledger?: any[];
      attendance?: any[];
      payroll?: any[];
    },
    userContext: IdentityUserContext
  ): {
    employees?: any[];
    ledger?: any[];
    attendance?: any[];
    payroll?: any[];
  } {
    const policy = getRoleGovernancePolicy(userContext.role);
    const role = policy.role;

    if (role === "OWNER") {
      return lists; // Full access
    }

    const result: any = {};

    // Filter employees list
    if (lists.employees && Array.isArray(lists.employees)) {
      if (role === "EMPLOYEE") {
        result.employees = lists.employees.filter((e: any) => e.id === userContext.userId || e.email === userContext.userEmail);
      } else if (role === "SUPERVISOR") {
        result.employees = lists.employees
          .filter((e: any) => e.departmentId === userContext.departmentId)
          .map((e: any) => ({ ...e, salary: "[MASQUÉ / RESTRICTED]" }));
      } else if (role === "MANAGER") {
        result.employees = lists.employees
          .filter((e: any) => !userContext.branchId || e.branchId === userContext.branchId)
          .map((e: any) => ({ ...e, salary: "[MASQUÉ / AGGREGATED]" }));
      } else if (role === "HEAD_TELLER") {
        result.employees = []; // Tellers do not inspect employee roster
      } else {
        result.employees = [];
      }
    }

    // Filter ledger list
    if (lists.ledger && Array.isArray(lists.ledger)) {
      if (role === "EMPLOYEE" || role === "SUPERVISOR" || role === "SUPER_ADMIN") {
        result.ledger = []; // Forbidden
      } else if (role === "MANAGER" || role === "HEAD_TELLER") {
        result.ledger = lists.ledger.filter((tx: any) => !userContext.branchId || tx.branchId === userContext.branchId);
      }
    }

    // Filter attendance list
    if (lists.attendance && Array.isArray(lists.attendance)) {
      if (role === "EMPLOYEE") {
        result.attendance = lists.attendance.filter((a: any) => a.employeeId === userContext.userId);
      } else if (role === "SUPERVISOR") {
        result.attendance = lists.attendance.filter((a: any) => !userContext.departmentId || a.departmentId === userContext.departmentId);
      } else if (role === "MANAGER") {
        result.attendance = lists.attendance.filter((a: any) => !userContext.branchId || a.branchId === userContext.branchId);
      } else {
        result.attendance = lists.attendance;
      }
    }

    // Filter payroll list
    if (lists.payroll && Array.isArray(lists.payroll)) {
      if (role === "EMPLOYEE") {
        result.payroll = lists.payroll.filter((p: any) => p.employeeId === userContext.userId);
      } else if (role === "MANAGER") {
        // Return aggregated payroll statistics rather than individual payslips
        result.payroll = lists.payroll
          .filter((p: any) => !userContext.branchId || p.branchId === userContext.branchId)
          .map((p: any) => ({
            id: p.id,
            cycleId: p.cycleId,
            baseSalary: "[MASQUÉ / AGGREGATED]",
            netPay: "[MASQUÉ / AGGREGATED]",
            status: p.status
          }));
      } else {
        result.payroll = [];
      }
    }

    return result;
  }
}
