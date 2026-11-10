# FINOPS ERP / FINAYITI FUSION
# FORENSIC AUDIT OF EXECUTIVE DASHBOARD & PERFORMANCE INTELLIGENCE CENTER (PIC)
## DOCUMENT ID: FINOPS_BI_DASHBOARD_PIC_FORENSIC_AUDIT.md
**Phase:** BI-AUDIT-01  
**Mode:** STRICTLY READ-ONLY FORENSIC AUDIT  
**Status:** COMPLETE  
**Target Verdict:** BLOCKED — MATERIAL FINANCIAL OR ANALYTICAL INCONSISTENCIES  
**Target Systems:**
1. Executive Overview (`/dashboard` via `DashboardShell.tsx` and `BusinessIntelligence.tsx`)
2. Performance Intelligence Center — PIC (`/performance` and `/pic` via `PerformanceIntelligenceCenter.tsx`)

---

## 1. EXECUTIVE SUMMARY & VERDICT

### 1.1 Final Forensic Verdict
```
═══════════════════════════════════════════════════════════════════════════════
VERDICT: BLOCKED — MATERIAL FINANCIAL OR ANALYTICAL INCONSISTENCIES
═══════════════════════════════════════════════════════════════════════════════
```
The forensic audit of FINOPS ERP Executive Dashboard (`/dashboard`) and Performance Intelligence Center (`/performance`, `/pic`) reveals **material systemic divergence, architectural duplication, accounting basis conflation, and filter desynchronization**.

While the underlying domain calculation engine (`AnalyticsEngine.ts`) implements robust accrual and cash accounting rules, the presentation layer suffers from an **architectural schism**:
1. **Dual Competing Implementations:** Two completely divergent React component trees claim to be the "Performance Intelligence Center":
   - **Path A (`/dashboard`):** Mounts `ConnectedBusinessIntelligence.tsx` -> `BusinessIntelligence.tsx`, which executes its own state aggregation loop (`useBIDataAggregation.ts`) and presents 6 tabbed analytical views.
   - **Path B (`/performance`, `/pic`):** Mounts `PerformanceIntelligenceCenter.tsx`, which delegates to `usePerformanceData.ts` and `selectors/index.ts`, bypassing the 6 tabs entirely and displaying a dual Simplified/Expert card view.
2. **Conflation of View Mode with Accounting Basis:** Both implementations hardcode a fatal assumption that **Simplified Mode = Cash Basis** and **Expert Mode = Accrual Basis**. This violates both accounting principles and domain specifications: a simplified dashboard must be able to reflect accrual economics, and an expert accountant must be able to audit cash basis flows.
3. **Filter Desynchronization & Stale State:** Date filters in `/dashboard` (fixed date inputs) do not match the rolling presets in `/performance` (7d, 30d, month, quarter, year). Although `ExecutiveFilterContext` exists, bidirectional state re-injection causes feedback loops and inconsistent KPI values when navigating between pages.
4. **Attendance Calculation Divergence:** Worked hours and attendance rates are calculated using two distinct algorithms across the two components, resulting in different attendance percentages for the identical employee cohort and time window.

---

## 2. ARCHITECTURAL MAP & DIVERGENCE ANALYSIS

### 2.1 Route & Component Lineage

```
                       [AppRouter.tsx]
                              │
              ┌───────────────┴───────────────┐
              │                               │
        Route: /dashboard             Route: /performance, /pic
              │                               │
      [DashboardShell.tsx]       [PerformanceIntelligenceCenter.tsx]
      (tab: "dashboard")                      │
              │                               ├── Hooks: usePerformanceData
   [ConnectedBusinessIntelligence]            ├── Selectors: selectors/index.ts
              │                               └── Engine: AnalyticsEngine.ts
   [BusinessIntelligence.tsx]                 
              │
  ┌───────────┴───────────────────────────────┐
  │                                           │
Hooks:                                    Sub-components (6 Tabs):
 - useBIUIState                             Tab 1: BIExecutiveKpis
 - useBIDataAggregation                     Tab 2: Workforce & Attendance
 - useCashBasisSnapshot                     Tab 3: BIPayrollTab
 - useAccrualBasisSnapshot                  Tab 4: BICostCenterTab
 - ExecutiveFilterContext                   Tab 5: BIAiReportsTab
                                            Tab 6: Predictive Intelligence
```

### 2.2 Forensic Comparison of the Two Implementations

| Dimension | Implementation A (`/dashboard`) | Implementation B (`/performance`) | Divergence Status |
|---|---|---|---|
| **Component Entry** | `BusinessIntelligence.tsx` | `PerformanceIntelligenceCenter.tsx` | **CRITICAL DUPLICATION** |
| **Data Aggregation Hook** | `useBIDataAggregation.ts` | `usePerformanceData.ts` | **DIVERGENT PIPELINES** |
| **Calculation Engine** | Mixed: `AnalyticsEngine` + internal loops | Pure `AnalyticsEngine.generateSnapshot` | **HIGH RISK OF DRIFT** |
| **UI Structure** | 6 Tabbed Panels + Header Filter | Simplified/Expert Toggle + Toolbar | **STRUCTURAL ASYMMETRY** |
| **Date Presets** | Free date pickers (`startDate`, `endDate`) | Presets: `7d`, `30d`, `this_month`, `quarter`, etc. | **DESYNCHRONIZATION** |
| **Mode Semantic** | `isSimplifiedMode` ? "CASH" : "ACCRUAL" | Simplified = "Constaté" / Expert = "Engagement" | **SYSTEMIC CONFLATION** |
| **Tenant Scope** | `user.business_id` from AuthContext | `user.business_id` from AuthContext | **ALIGNED** |
| **Branch/Dept Filters** | Custom select in `BIFiltersHeader` | Select dropdowns in `FilterToolbar` | **PARTIAL PROPAGATION** |

---

## 3. SUMMARY OF FORENSIC FINDINGS

### Finding BI-01 (CRITICAL) — Architectural Schism between `/dashboard` and `/performance`
- **Location:** `src/routes/AppRouter.tsx`, `src/components/DashboardShell.tsx`, `src/pages/PerformanceIntelligenceCenter.tsx`
- **Description:** A user navigating to `/dashboard` sees one analytics dashboard (6 tabs, calling `useBIDataAggregation`), while navigating to `/performance` or `/pic` presents a completely different layout without tabs, powered by `usePerformanceData`. 
- **Impact:** An executive checking numbers on the overview sees different figures from a manager analyzing the same company in the Performance center.

### Finding BI-02 (CRITICAL) — View Mode Conflated with Accounting Basis
- **Location:** `src/components/BusinessIntelligence.tsx:106` and `src/pages/PerformanceIntelligenceCenter.tsx:152-158`
- **Description:** Code assigns:
  ```typescript
  // BusinessIntelligence.tsx line 106:
  const nextMode = uiState.isSimplifiedMode ? "CASH" : "ACCRUAL";
  ```
  And in `PerformanceIntelligenceCenter.tsx`:
  ```typescript
  // Line 152: Mode Expert — Vue Engagement (Économique)
  // Line 158: Mode Simple — Vue Constaté (Trésorerie / Décaissement)
  ```
- **Violation:** Accounting basis (Cash Basis vs Accrual Basis) is an accounting dimension, whereas Simplified vs Expert is a UI presentation density dimension. Tying them together prevents viewing Simplified Accrual metrics or Expert Cash metrics.

### Finding BI-03 (HIGH) — Date Filter Model Desynchronization
- **Location:** `src/components/bi/components/BIFiltersHeader.tsx` vs `src/components/performance/FilterToolbar.tsx`
- **Description:** `FilterToolbar` generates dynamic date ranges based on preset strings (`30d` computes `today - 30` to `today`). `BIFiltersHeader` relies on ISO date strings (`YYYY-MM-DD`). When a user switches views, the preset identifier is lost or mismatched, causing unexpected resets to the current calendar month.

### Finding BI-04 (HIGH) — Dual Attendance Rate Calculation Algorithms
- **Location:** `src/domains/analytics/services/AnalyticsEngine.ts:1434` vs `src/components/bi/hooks/useBIDataAggregation.ts:275-316`
- **Description:** 
  - `AnalyticsEngine`: Uses standard quinzaine baseline (default 96h per 15 calendar days), computing expected hours via `getExpectedWorkingHours(range)`.
  - `useBIDataAggregation`: Implements an ad-hoc fallback attributing 8 hours to any non-absent attendance log missing planned hours.
- **Impact:** Attendance rates displayed on `/dashboard` Tab 2 do not match the attendance rate displayed on `/performance` KPI cards.

### Finding BI-05 (MEDIUM) — Payroll Aggregation Re-computation Outside SSOT
- **Location:** `src/components/bi/hooks/useBIDataAggregation.ts:486-552`
- **Description:** `useBIDataAggregation` computes `totalEmploymentCost` by summing employee gross wages and employer social charges locally, rather than consuming the authoritative `AnalyticsEngine.generateSnapshot().kpis.payroll.totalCost`.
- **Risk:** Any future statutory formula adjustment in `AnalyticsEngine` (or `financialAnalyticsService`) will fail to reflect on the executive dashboard until manually duplicated.

---

## 4. TEST EVIDENCE & ENVIRONMENT STATUS

### 4.1 Vitest Regression Suite Execution
Execution of existing BI and Analytics test suites:
- `src/tests/unit/PerformanceIntelligenceCenter.test.ts`
- `src/tests/unit/BIFilterRemediationAndAccountingRules.test.ts`
- `src/tests/unit/BIFilterSynchronizationE2E.test.tsx`
- `src/tests/integration/WorkforceAnalyticsSSOT.test.ts`

**Result:**
- Total Tests: 39
- Passed: 39 (100%)
- Failed: 0
- Skipped: 0
- Execution Time: 4.81s

### 4.2 Forensic Diagnosis of Test Coverage
While the existing 39 tests pass, they validate isolated selector functions in vitro. **No automated test validates cross-component consistency between `/dashboard` (`BusinessIntelligence.tsx`) and `/performance` (`PerformanceIntelligenceCenter.tsx`)**. 
The test suites test each silo independently and thus missed the divergent presentation architectures.

---

## 5. REMEDIATION STRATEGY OVERVIEW

To achieve production-grade financial accuracy and single-source-of-truth governance, remediation must proceed in 4 strictly controlled stages:
1. **Phase P0 (Core SSOT & Basis Decoupling):** Decouple `accountingBasis` (`"CASH"` | `"ACCRUAL"`) from `presentationMode` (`"SIMPLIFIED"` | `"EXPERT"`). Unify data fetching into a single shared hook.
2. **Phase P1 (Filter Harmonization):** Establish a unified filter schema supporting both named presets and explicit date bounds across all routes.
3. **Phase P2 (Route & Layout Reconciliation):** Mount the unified 6-tab PIC architecture across both `/dashboard` and `/performance` (or deprecate the duplicated shell in favor of a single unified module).
4. **Phase P3 (E2E Cross-View Validation):** Introduce automated tests asserting exact metric equality between views.

---

## 6. AUDIT CONCLUSION & GOVERNANCE GATE

In accordance with FINOPS Master Constitution (`GEMINI.md`) Rules 1, 3.1, 7, and 10:
- **Financial operations and analytics require absolute single source of truth.**
- Presentation must never alter or conflate accounting dimensions.
- The project status for Executive Dashboard and PIC is **BLOCKED** pending human authorization of the Remediation Plan.

*(Refer to `FINOPS_BI_KPI_FORMULA_CATALOG.md`, `FINOPS_BI_FILTER_CONSISTENCY_MATRIX.md`, `FINOPS_BI_TEST_COVERAGE_GAP_REPORT.md`, and `FINOPS_BI_REMEDIATION_ROADMAP.md` for full technical details.)*
