# FINOPS ERP / FINAYITI FUSION
# MULTI-DIMENSIONAL FILTER CONSISTENCY MATRIX
## DOCUMENT ID: FINOPS_BI_FILTER_CONSISTENCY_MATRIX.md
**Phase:** BI-AUDIT-01  
**Classification:** FORENSIC FILTER PROPAGATION AUDIT  
**Scope:** Propagation and Integrity across Tenant, Period, Basis, Mode, Branch, Department, Employee, and Module

---

## 1. FILTER ARCHITECTURE OVERVIEW

FINOPS ERP relies on two primary filter layers for analytics:
1. **Global Context Layer:** `ExecutiveFilterContext` (`src/contexts/ExecutiveFilterContext.tsx`) and `AnalyticsFilterContext` (`src/contexts/AnalyticsFilterContext.tsx`).
2. **Local Component State:**
   - In `/dashboard`: `useBIUIState.ts` (`uiState.startDate`, `uiState.endDate`, `uiState.selectedBranch`, `uiState.selectedDepartment`, `uiState.isSimplifiedMode`).
   - In `/performance`: `usePerformanceData.ts` (`filterState.period`, `filterState.branchId`, `filterState.departmentId`, `filterState.metricType`, `filterState.searchQuery`).

---

## 2. MULTI-DIMENSIONAL CONSISTENCY MATRIX

| Dimension | Canonical Target Behavior | Implementation A (`/dashboard`) | Implementation B (`/performance`) | Audit Finding & Integrity Status |
|---|---|---|---|---|
| **1. Tenant Boundary (`business_id`)** | Strict isolation. Never query or compute metrics across multiple tenants. | Filtered by `business_id` from `useAuth` context. | Filtered by `business_id` from `useAuth` context. | **PASS** — Tenant isolation is strictly enforced in both pipelines. |
| **2. Date Period (Presets)** | Seamless support for `7d`, `30d`, `this_month`, `last_month`, `quarter`, `year`. | **NOT SUPPORTED**. Only exposes raw date inputs (`startDate`, `endDate`). Defaults to first and last day of month. | Supported via `FilterToolbar.tsx` with dynamic calculation from reference date. | **FAIL (DESYNCHRONIZATION)** — Preset selection in PIC is lost upon returning to Executive Dashboard. |
| **3. Date Period (Custom Range)** | Arbitrary date bounds `[startDate, endDate]` propagated identically. | Custom inputs write to local state; pushes to `ExecutiveFilterContext`. | Custom modal writes to `filterState`; pushes to `ExecutiveFilterContext`. | **PASS WITH FRICTION** — Propagation succeeds but triggers redundant re-renders. |
| **4. Accounting Basis** | Orthogonal choice: `"CASH"` (Trésorerie) vs `"ACCRUAL"` (Engagement). | **HARDCODED CONFLATION:** Inverted from mode: `isSimplifiedMode ? "CASH" : "ACCRUAL"`. | **HARDCODED CONFLATION:** Simplified View = "Constaté" (Cash); Expert View = "Engagement" (Accrual). | **CRITICAL FAILURE** — User cannot view Simplified Accrual or Expert Cash metrics. |
| **5. Presentation Mode** | Ergonomic density toggle: `"SIMPLIFIED"` (executive cards) vs `"EXPERT"` (deep-dive metrics). | Switches between high-level cards and detailed tabs, but alters accounting basis! | Switches between `PICSimplifiedView` and `PICExpertView`, altering accounting basis! | **CRITICAL FAILURE** — Mode changes accounting math instead of presentation density. |
| **6. Currency & Multi-Currency** | Base currency HTG with USD conversion using central rates from `CentralExchangeRateService`. | Displays amounts in HTG; limited USD conversion toggle. | Displays amounts in HTG; fixed currency rendering. | **PASS (MONO-CURRENCY HTG)** — USD multi-currency not fully surfaced in BI views. |
| **7. Branch Scoping (`branch_id`)** | `"ALL"` aggregates all branches. Specific ID restricts transactions, employees, payrolls, attendance. | Filtered in `useBIDataAggregation` by comparing `record.branch_id === selectedBranch`. | Filtered in `selectors/index.ts` by passing `branchId` to `AnalyticsEngine`. | **PASS** — Both implementations accurately scope records to selected branch. |
| **8. Department Scoping (`department_id`)** | `"ALL"` aggregates all departments. Specific ID scopes workforce and payroll. | Filtered in `useBIDataAggregation` by comparing `record.department_id === selectedDepartment`. | Filtered in `selectors/index.ts` by passing `departmentId` to `AnalyticsEngine`. | **PASS** — Department filtering operates consistently. |
| **9. Employee Scoping (`employee_id`)** | Drilldown to individual employee records in workforce and payroll tabs. | Supported in Tab 2 (Workforce) and Tab 3 (Payroll). | Search query filter in `FilterToolbar` filters employee names in memory. | **PASS** — Consistent local search behavior. |
| **10. Module Cross-Navigation** | Switching between `/dashboard` and `/performance` maintains filter state. | Pushes local state to `ExecutiveFilterContext` on mount and change. | Pushes filter state to `ExecutiveFilterContext` on mount and change. | **FAIL (RACE CONDITIONS)** — Bi-directional sync causes ping-pong state overwrites. |

---

## 3. DEEP-DIVE: THE BASIS-MODE CONFLATION FLAW

### Architectural Breakdown

```
                       User Intent
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
    "I want an executive          "I want a detailed
     simplified summary"           financial view"
            │                               │
            ▼                               ▼
  Currently Forced Into:          Currently Forced Into:
     CASH BASIS                      ACCRUAL BASIS
  (Physical Money In/Out)         (Earned/Incurred Econ)
```

### Business and Operational Consequences:
1. **Invisible Liabilities for Executives:** An executive viewing the Simplified Dashboard will **not see accrued unpaid payroll or vendor accounts payable**, because Simplified forces Cash Basis. They may see a positive cash profit when the company is actually running a severe accrual operating deficit.
2. **Inaccessible Cash Flows for Accountants:** A CFO using Expert Mode cannot review cash collections and disbursements without switching back to Simplified Mode, which strips away all detailed breakdowns.
3. **Canonical Solution Requirement:**
   - `accountingBasis` must be an independent state dimension: `'CASH' | 'ACCRUAL'`.
   - `viewMode` must be an independent presentation dimension: `'SIMPLIFIED' | 'EXPERT'`.
   - Both modes must support both accounting bases!

---

## 4. PROPAGATION LIFECYCLE & STATE FLOW

```
[User interacts with Filter Toolbar]
                 │
                 ▼
      Updates Local State
  (filterState in usePerformanceData)
                 │
                 ▼
   Calculates AnalyticsEngine Snapshot
  (Passing branch, dept, period, etc.)
                 │
                 ▼
     Publishes to ExecutiveFilterContext
                 │
                 ▼
   [User navigates to /dashboard]
                 │
                 ▼
   BusinessIntelligence.tsx mounts
                 │
                 ▼
   Reads ExecutiveFilterContext, BUT
   useBIUIState defaults to local defaults!
                 │
                 ▼
   OVERWRITES ExecutiveFilterContext with its defaults!
                 │
                 ▼
          [STALE STATE BUG]
```

This sequence proves why users experience filters and cards failing to stay synchronized across views.
