export interface DrilldownState {
  kpi: "revenue" | "attendance" | "payroll" | "expenses" | "quickbooksSalesRevenue" | null;
  level: "summary" | "branch" | "department" | "employee" | "records" | "audit";
  branchId: string | null;
  departmentId: string | null;
  employeeId: string | null;
  recordId: string | null;
}

export const initialDrilldownState: DrilldownState = {
  kpi: null,
  level: "summary",
  branchId: null,
  departmentId: null,
  employeeId: null,
  recordId: null,
};

export class ExecutiveDrilldownService {
  /**
   * Transition drilldown state deeper into the hierarchy
   */
  static drillDown(
    currentState: DrilldownState,
    nextId: string,
    nextLevel?: DrilldownState["level"]
  ): DrilldownState {
    const newState = { ...currentState };

    if (!newState.kpi) {
      return currentState;
    }

    const levelTransitions: Record<DrilldownState["level"], DrilldownState["level"]> = {
      summary: "branch",
      branch: "department",
      department: "employee",
      employee: "records",
      records: "audit",
      audit: "audit"
    };

    const targetLevel = nextLevel || levelTransitions[newState.level] || "summary";
    newState.level = targetLevel;

    if (targetLevel === "branch") {
      newState.branchId = nextId;
    } else if (targetLevel === "department") {
      newState.departmentId = nextId;
    } else if (targetLevel === "employee") {
      newState.employeeId = nextId;
    } else if (targetLevel === "records") {
      newState.recordId = nextId;
    }

    return newState;
  }

  /**
   * Transition drilldown state back up the hierarchy
   */
  static drillUp(currentState: DrilldownState): DrilldownState {
    const newState = { ...currentState };

    if (newState.level === "audit") {
      newState.level = "records";
      newState.recordId = null;
    } else if (newState.level === "records") {
      newState.level = "employee";
      newState.employeeId = null;
    } else if (newState.level === "employee") {
      newState.level = "department";
      newState.departmentId = null;
    } else if (newState.level === "department") {
      newState.level = "branch";
      newState.branchId = null;
    } else if (newState.level === "branch") {
      newState.level = "summary";
      newState.kpi = null;
    }

    return newState;
  }

  /**
   * Generates a fully readable breadcrumb array describing the active drilldown path
   */
  static getBreadcrumbs(state: DrilldownState): { label: string; level: DrilldownState["level"] }[] {
    const crumbs: { label: string; level: DrilldownState["level"] }[] = [];

    if (!state.kpi) return crumbs;

    crumbs.push({ label: `${state.kpi.toUpperCase()} Summary`, level: "summary" });

    if (state.branchId) {
      crumbs.push({ label: `Branch: ${state.branchId}`, level: "branch" });
    }
    if (state.departmentId) {
      crumbs.push({ label: `Dept: ${state.departmentId}`, level: "department" });
    }
    if (state.employeeId) {
      crumbs.push({ label: `Staff: ${state.employeeId}`, level: "employee" });
    }
    if (state.recordId) {
      crumbs.push({ label: `Record: ${state.recordId}`, level: "records" });
    }

    return crumbs;
  }
}
