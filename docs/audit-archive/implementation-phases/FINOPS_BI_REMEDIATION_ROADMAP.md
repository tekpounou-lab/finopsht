# FINOPS ERP / FINAYITI FUSION
# BI & PIC REMEDIATION ROADMAP
## DOCUMENT ID: FINOPS_BI_REMEDIATION_ROADMAP.md
**Phase:** BI-AUDIT-01  
**Classification:** ARCHITECTURAL & ENGINEERING ACTION PLAN  
**Status:** PROPOSED — PENDING HUMAN APPROVAL (STRICT READ-ONLY COMPLIANCE)

---

## 1. REMEDIATION PHILOSOPHY & GOVERNANCE

Remediation must strictly adhere to the FINOPS ERP Master Constitution (`GEMINI.md`):
- **Rule 1 (Correctness & Security First):** Financial metrics must reflect reality without exception.
- **Rule 3.1 & 3.2 (Architecture & Existing System First):** Leverage `AnalyticsEngine.ts` as the sole authoritative calculation engine. Do not create competing aggregators.
- **Rule 3.3 (Minimal Safe Change):** Refactor incrementally in prioritized phases with full backward compatibility and zero production breakage.
- **Rule 8 (Multi-Tenancy):** Maintain strict `business_id` partition at every stage.

---

## 2. PHASED REMEDIATION ROADMAP

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE P0: CORE SSOT & ACCOUNTING BASIS DECOUPLING                          │
│ Objective: Separate Accounting Basis (Cash/Accrual) from Mode (Simple/Expert)│
│ Risk: HIGH (Affects all executive financial metrics)                         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE P1: FILTER HARMONIZATION & PRESET PROPAGATION                        │
│ Objective: Unify date presets (7d, 30d, quarter) across Dashboard and PIC   │
│ Risk: MEDIUM (Affects filter state and user navigation)                      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE P2: CALCULATION HARMONIZATION (ATTENDANCE & PAYROLL)                  │
│ Objective: Eliminate divergent loops in useBIDataAggregation.ts              │
│ Risk: MEDIUM (Reconciles attendance % and employment cost)                   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE P3: ROUTE & UI RECONCILIATION                                        │
│ Objective: Harmonize the 6 tabs and unified shell between /dashboard and PIC│
│ Risk: LOW (UI presentation and layout cleanup)                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. DETAILED ACTION PLANS BY PHASE

### Phase P0: Core SSOT & Accounting Basis Decoupling
* **Target Issue:** FINDING-BI-02 (Conflation of Simplified Mode with Cash Basis and Expert Mode with Accrual Basis).
* **Scope of Changes:**
  1. Refactor state interfaces in `useBIUIState.ts`, `usePerformanceData.ts`, and `ExecutiveFilterContext.tsx`:
     ```typescript
     // Canonical Target State:
     interface AnalyticsFilterState {
       business_id: string;
       accountingBasis: "CASH" | "ACCRUAL"; // Decoupled accounting basis
       presentationMode: "SIMPLIFIED" | "EXPERT"; // Presentation density
       period: FilterPeriod;
       startDate: string;
       endDate: string;
       branchId: string;
       departmentId: string;
       currency: "HTG" | "USD";
     }
     ```
  2. Update `PerformanceIntelligenceCenter.tsx`:
     - Provide independent controls:
       - Toggle A: View Mode (Simple vs Expert).
       - Toggle B: Accounting Basis (Cash vs Accrual).
  3. Update `BusinessIntelligence.tsx`:
     - Remove `const nextMode = uiState.isSimplifiedMode ? "CASH" : "ACCRUAL";`
     - Allow both Cash and Accrual selection regardless of mode.
* **Validation Criteria:**
  - Simplified view displays Accrual metrics when Accrual is selected.
  - Expert view displays Cash statements when Cash is selected.
  - Zero regression in existing Vitest tests.

---

### Phase P1: Filter Harmonization & Preset Propagation
* **Target Issue:** FINDING-BI-03 (Date presets desynchronization between `/dashboard` and `/performance`).
* **Scope of Changes:**
  1. Extract a shared filter component or hook: `useUnifiedAnalyticsFilters()`.
  2. Bring the rich preset selector (`7d`, `30d`, `this_month`, `last_month`, `quarter`, `year`, `custom`) into `BIFiltersHeader.tsx`.
  3. Standardize date range calculation to use a single date utility (`src/utils/dateRangeHelpers.ts`).
  4. Ensure bidirectional synchronization in `ExecutiveFilterContext` does not overwrite custom ranges with month defaults upon component remounting.
* **Validation Criteria:**
  - Selecting "Last 30 Days" in PIC preserves the exact same date boundaries when navigating to Executive Dashboard.
  - Custom date inputs properly set period to `CUSTOM` across all modules.

---

### Phase P2: Calculation Harmonization (Attendance & Payroll)
* **Target Issue:** FINDING-BI-04 & FINDING-BI-05 (Attendance algorithm discrepancies and duplicate payroll aggregations).
* **Scope of Changes:**
  1. Deprecate the ad-hoc attendance hours fallback in `useBIDataAggregation.ts:275-316`.
  2. Refactor `useBIDataAggregation.ts` to directly consume `AnalyticsEngine.generateSnapshot()` for all top-level KPI metrics (`totalRevenue`, `totalExpenses`, `totalPayroll`, `netProfit`, `attendanceRate`, `activeHeadcount`).
  3. Reserve `useBIDataAggregation.ts` exclusively for secondary UI grouping (e.g., sorting departments for modal breakdown) without re-calculating top-level totals.
* **Validation Criteria:**
  - Attendance rate on `/dashboard` Tab 2 matches the attendance rate on `/performance` KPI card down to 0.1%.
  - Employment cost in Tab 3 equals the total payroll reported by `AnalyticsEngine`.

---

### Phase P3: Route & UI Reconciliation
* **Target Issue:** FINDING-BI-01 (Two competing implementations of "Performance Intelligence Center").
* **Scope of Changes:**
  1. Reconcile the user experience between `/dashboard` and `/performance`:
     - Option A (Recommended): Make `/dashboard` the high-level Executive Overview (Simplified View with key alerts and quick links) and `/performance` the full 6-tab deep-dive Performance Intelligence Center.
     - Option B: Embed the unified 6-tab PIC component in both `/dashboard` and `/performance` using a shared `<PICContainer />` with an initial tab prop.
  2. Standardize terminology: Ensure "Performance Intelligence Center (PIC)" clearly identifies the analytical hub, while "Executive Overview" identifies the dashboard summary.
* **Validation Criteria:**
  - Clear navigation hierarchy without duplicate competing components.
  - Clean UI presentation complying with design system and zero-pill discipline.

---

## 4. GOVERNANCE & STOP GATE

* **Current Status:** AUDIT COMPLETE — STRICT READ-ONLY MODE PRESERVED.
* **No code files have been modified.**
* **Next Step:** Await explicit authorization from the lead architect/user before initiating Phase P0.
