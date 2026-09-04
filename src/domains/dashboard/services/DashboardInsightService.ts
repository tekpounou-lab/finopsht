export interface ExecutiveInsightDTO {
  totalActiveEmployees: number;
  monthlyPayrollEstimate: number;
  pendingLeavesCount: number;
  workforceHealthScore: number; // 0 - 100
  complianceStatus: "OPTIMAL" | "ATTENTION" | "CRITICAL";
}

export class DashboardInsightService {
  /**
   * Computes high-level executive insights from domain collections.
   */
  public static computeExecutiveInsights(
    employees: any[] = [],
    payrollCycles: any[] = [],
    leaveRequests: any[] = []
  ): ExecutiveInsightDTO {
    const activeEmps = employees.filter((e) => e.status === "ACTIVE" || !e.status);
    const activeCount = activeEmps.length;

    let totalPayrollEstimate = 0;
    activeEmps.forEach((e) => {
      const salary = e.baseSalary || e.salary || 0;
      totalPayrollEstimate += typeof salary === "number" ? salary : parseFloat(salary) || 0;
    });

    const pendingLeaves = leaveRequests.filter((l) => l.status === "PENDING" || l.status === "PENDING_APPROVAL").length;

    // Health Score calculation (100 base - 5 per pending leave - 10 if active count 0)
    let healthScore = 100;
    if (activeCount === 0) healthScore -= 20;
    healthScore = Math.max(0, Math.min(100, healthScore - pendingLeaves * 5));

    let complianceStatus: "OPTIMAL" | "ATTENTION" | "CRITICAL" = "OPTIMAL";
    if (healthScore < 60) {
      complianceStatus = "CRITICAL";
    } else if (healthScore < 85) {
      complianceStatus = "ATTENTION";
    }

    return {
      totalActiveEmployees: activeCount,
      monthlyPayrollEstimate: Math.round(totalPayrollEstimate * 100) / 100,
      pendingLeavesCount: pendingLeaves,
      workforceHealthScore: healthScore,
      complianceStatus
    };
  }

  /**
   * Filters employees by multi-tenant branch and department selections.
   */
  public static filterEmployeesByBranchDept(
    employees: any[],
    branchId?: string,
    deptId?: string
  ): any[] {
    return employees.filter((emp) => {
      if (branchId && emp.branchId !== branchId && emp.branch_id !== branchId) {
        return false;
      }
      if (deptId && emp.departmentId !== deptId && emp.department_id !== deptId) {
        return false;
      }
      return true;
    });
  }
}
