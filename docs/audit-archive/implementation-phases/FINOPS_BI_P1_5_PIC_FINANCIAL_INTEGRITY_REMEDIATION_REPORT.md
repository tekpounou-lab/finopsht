# FINOPS ERP — BI-P1.5 PIC FINANCIAL INTEGRITY & TEMPORAL FILTER REMEDIATION REPORT

**Phase:** BI-P1.5 — PIC Financial Integrity & Temporal Filter Remediation  
**Status:** **CLOSED — VERIFIED & REMEDIATED**  
**Date:** 2026-11-06  
**Governance Mode:** Controlled Implementation — Evidence-Driven (`GEMINI.md` v4.0 | `ADR-018`)  
**Baseline:** BI-P1.3 Closed | BI-P1.4 Closed | BI-P1.4.6 Verified  
**Investigation Reference:** `FINOPS_PIC_TEMPORAL_FILTER_REVENUE_PAYROLL_INVESTIGATION.md`

---

## 1. EXECUTIVE SUMMARY

An independent audit (`FINOPS_PIC_TEMPORAL_FILTER_REVENUE_PAYROLL_INVESTIGATION.md`) identified four confirmed defects (`DEF-TF-01`, `DEF-REV-01`, `DEF-CASH-01`, `DEF-LS-01`) causing committed July payroll or non-revenue ledger entries to appear under **Chiffre d'affaires (Revenue)** or diverge between headline KPIs and multi-dimensional tables in the Performance Intelligence Center (PIC) and Executive BI Dashboard when date filters were cleared (`period: "all"` / `startDate: "", endDate: ""`), partially specified, or restored from a prior `localStorage` session.

All four confirmed defects — plus a cross-selector `accountingMode` propagation divergence uncovered during regression verification — have been remediated with minimal, surgical changes across the analytics, cash-basis adapter, selector, hook, and context layers.

### Final Verification Verdict
| Verification Gate | Result | Scope & Exact Output |
|---|---|---|
| **Production Build (`compile_applet`)** | **PASS** | Vite + TypeScript production bundle compiled with exit code `0` (`Build succeeded - the applet is compiled`). |
| **TypeScript Static Check (`lint_applet` / `tsc --noEmit`)** | **PASS** | `0` compiler or type errors across the entire codebase (`Linting completed successfully`). |
| **Targeted BI-P1.5 & PIC Suites (`npx vitest run`)** | **PASS (10 / 10 suites, 116 / 116 tests)** | `100%` pass rate across `BIP15PICFinancialIntegrityRemediation.test.ts` (13), `Phase152RIndependentRuntimeVerification.test.ts` (21), `PerformanceIntelligenceCenter.test.ts` (7), `PerformanceIntelligenceDataIntegrity.test.ts` (11), `BIDataAggregationSSOT.test.ts` (14), `BIFilterRemediationAndAccountingRules.test.ts` (12), `BIFilterSynchronizationE2E.test.tsx` (16), `FilterArchitecture.test.tsx` (4), `BI_P1_4_6_RuntimeNullSafety.test.ts` (9), `PhaseBIPIC1SecurityAndIntegrity.test.ts` (9). |
| **Domain & Integration Regression Sweep (`npx vitest run`)** | **PASS (72 / 72 suites, 707 / 707 tests)** | Batch A: `35 / 35` suites (`391 / 391` tests) covering all BI/PIC, Cash Management & Adapters (`20 / 20` suites), and Security & Multi-Tenancy (`6 / 6` unit security suites). Batch B: `37 / 37` suites (`316 / 316` tests) covering Accounting, Date Normalization, Multi-Currency FX, Payroll Math/Reversals, Ratio Engine, Forensic Auditing, Golden Datasets, and BI/SSOT Integration suites. |

---

## 2. DEFECT-BY-DEFECT ROOT CAUSE & REMEDIATION EVIDENCE

### 2.1 `DEF-TF-01` (P0) — Temporal Filter Fallback Collision & Caller Propagation

#### Root Cause
1. In `src/domains/analytics/services/AnalyticsEngine.ts` (`getPeriodRanges`), selecting `"CUSTOM"` with empty or partial `startDate` / `endDate` (such as PIC `period: "all"` where `calculateDateRangeForPeriod("all")` returns `{ startDate: "", endDate: "" }`) failed `if (customRange && customRange.startDate && customRange.endDate)` and silently fell back to the **current calendar month**, while `selectFilteredDataSet` treated empty bounds as unbounded history.
2. When `previous` period bounds were empty on unbounded queries, `AnalyticsEngine.generateSnapshot` passed `{ startDate: "", endDate: "" }` to `isInPeriod` / `isPayrollInPeriod` (which return `true` when both bounds are empty), duplicating current-period records into `previous` period metrics and producing `0%` change deltas or fabricated comparisons.
3. In `AnalyticsContext.tsx`, truthy `||` operators (`executiveFilters.startDate || analyticsFilters.dateRange.startDate`) overwrote intentional empty `""` strings with default month bounds, and `activeCustomRange` rejected empty strings (`if (filters.startDate && filters.endDate)`).
4. In `useBIDataAggregation.ts` and `usePerformanceData.ts`, clearing `startDate` prevented FX rate grid queries from fetching historical rates, and `selectExpertMetrics` (`src/domains/performance/selectors/index.ts`) called `AnalyticsEngine.generateSnapshot` without forwarding `accountingMode`, causing `selectExpertMetrics` to evaluate `"ACCRUAL"` (engine default) while `selectSimplifiedMetrics` evaluated `filters.accountingBasis || "CASH"`.

#### Implemented Fix
- **`src/domains/analytics/types/index.ts` (lines 9–23)**: Added `"ALL"` to `AnalyticsPeriod`.
- **`src/domains/analytics/services/AnalyticsEngine.ts`**:
  - `getPeriodRanges` (lines 546–580): Added `case "ALL"` and eliminated the silent current-calendar-month fallback for `"CUSTOM"` and `"ALL"` when `startDate` or `endDate` is empty. Bounded ranges compute an exact equal-duration `previous` range; unbounded (`""`..`""`) or single-bound open-ended ranges return exact bounded/open strings for `current` and `{ startDate: "", endDate: "" }` for `previous`.
  - `computeOperationalExpenses` (lines 820–841): Supported single-bound open-ended `DateRange` (`range.startDate || range.endDate`) instead of skipping filtering unless both bounds are present.
  - `generateSnapshot` (lines 1199–1200, 1286–1359, 1556–1558, 1596–1600, 1664–1724, 1770–1820, 2055–2056, 2754–2768): Added `hasPreviousPeriod = Boolean(previous.startDate || previous.endDate)` so `prevTxs`, `prevAttendance`, `prevPayroll`, `prevCashStatement`, `allTxsUpToPrevious`, and `prevDays` evaluate to empty/neutral when no bounded prior period exists; derived dataset-scoped `effectiveCashRange`, `effectiveAttendanceRange`, and `effectiveTrendRange` when unbounded while preserving `NO_DATA` semantics on empty cohorts.
- **`src/domains/analytics/context/AnalyticsContext.tsx` (lines 83–95, 259–294)**: Preserved empty `""` dates via nullish coalescing (`??`), forwarded `accountingMode: executiveFilters.accountingBasis || executiveFilters.accountingMode || "CASH"`, updated `activeCustomRange` to accept defined empty strings, and queried FX rate grids from `"2020-01-01"` when unbounded.
- **`src/components/bi/hooks/useBIDataAggregation.ts` (lines 79–85, 110–130, 463–480)**: Reset `normalizationContext({})` and queried FX rate grids across `"2020-01-01"`..`normEndDate` when `startDate` is empty; passed `{ startDate: startDate ?? "", endDate: endDate ?? "" }` to `AnalyticsEngine.generateSnapshot`.
- **`src/hooks/usePerformanceData.ts` (lines 115–144, 341–365)**: Reset `normalizationContext({})` and queried FX rate grids from `"2020-01-01"` when `filters.startDate === ""`; derived `effectiveFilters` propagating `execFilters.accountingBasis` into `selectSimplifiedMetrics`, `selectExpertMetrics`, and `selectCashBasisExpertMetrics` while preserving `[businessId, refreshIndex]` network fetch isolation.
- **`src/domains/performance/selectors/index.ts` (lines 305–320)**: Aligned `selectExpertMetrics` to pass `accountingMode: filters.accountingBasis || (filters as any).accountingMode || "CASH"` to `AnalyticsEngine.generateSnapshot`, matching `selectSimplifiedMetrics` (line 238).

---

### 2.2 `DEF-REV-01` (P0) — Subledger Department Revenue Contamination

#### Root Cause
In `src/domains/analytics/services/AnalyticsEngine.ts` (Section 6 — Department breakdown), `departmentPerformance[].revenue` accumulated `salesFromPayroll` (from `payroll_records.sales_cents` / `salesHtg`) and used `data.salesFromPayroll !== 0 ? data.salesFromPayroll : data.glIncome`. This leaked commercial payroll sales attribution into accounting department revenue and discarded genuine employee-linked GL income whenever commercial payroll sales existed.

#### Implemented Fix
- **`src/domains/analytics/services/AnalyticsEngine.ts` (lines 2160–2342)**:
  - Removed `salesFromPayroll` from `deptMap` and `departmentPerformance[].revenue` completely.
  - Preserved commercial employee sales attribution (`sales_cents` / `salesHtg`) strictly on `employeeScorecards[].salesVolume` (lines 2369–2382) for commission and workforce productivity reporting.
  - Computed `departmentPerformance[].revenue` strictly from mode-aware accounting SSOT: `CanonicalCashEngine.executePipeline` inflows in `CASH` mode, and posted non-reversed `isIncomeTx(t)` entries (`data.glIncome`) in `ACCRUAL` mode.

---

### 2.3 `DEF-CASH-01` (P0) — Cash-Basis & Accrual Inflow Classification Spill

#### Root Cause
1. In `src/domains/cash/adapters/LedgerCashAdapter.ts` (`adaptTransaction`, Case 3: `isDebitTreasury && !isCreditTreasury`), any non-transfer transaction debiting a Class 10 Treasury account (`1000_CASH`, `1010_BANK`, etc.) was unconditionally classified as `direction: "INFLOW"`. Consequently, payroll clearing credits (`2100_PAYROLL_CLEARING`), French/Haitian PCG payroll/social liability accounts (`421`, `431`, `44x`), salary/tax adjustments, penalties, or one-sided transfers debiting Treasury inflated `cashStatement.totalInflow` (and Cash-Basis Revenue).
2. In `src/domains/analytics/services/AnalyticsEngine.ts` (`isIncomeTx`), `creditAcc.startsWith("4")` matched Class 4 third-party/personnel/tax liability accounts (`421`, `431`, `44x`) in addition to revenue accounts (`40x`, `41x`).

#### Implemented Fix
- **`src/domains/cash/adapters/LedgerCashAdapter.ts` (lines 485–542)**:
  - In Case 3 (`isDebitTreasury && !isCreditTreasury`), added strict guardrails for active (`!isReversed`) transactions so:
    - Payroll/social/bonus/penalty/compensation entries (`PAYROLL`, `BONUS`, `PENALTY`, `COMPENSATION`, `PAYROLL_ENGINE` non-repayment entries, or payroll/ONA/OFATMA/CNSS/CNS categories),
    - Non-revenue credit accounts (`^2\d*`, `^4[2-9]\d*`, `^[56]\d*`, or accounts containing `PAYROLL`, `SALAIRE`, `ONA`, `OFATMA`, `CLEARING`, `PAYABLE`, `TAX`), and
    - Non-revenue ledger types (`TRANSFER`, `EXPENSE`, `REFUND`, `CORRECTION`, `ADJUSTMENT`, `ADVANCE`)
    return `status: "IGNORED"` (never `INFLOW`), while preserving `REVERSED` audit records (`status: "REVERSED"`, `0` net cash impact) and legitimate `PAYROLL_RECOVERY` / `REPAYMENT` / `RECOUVREMENT` repayments against `1310_EMPLOYEE_RECEIVABLES`.
- **`src/domains/analytics/services/AnalyticsEngine.ts` (lines 1408–1467)**:
  - Hardened `isIncomeTx` to reject payroll-related entries (except explicit employee receivable repayments), reject non-revenue types (`EXPENSE`, `PAYROLL`, `TRANSFER`, `EXCHANGE`, `ADVANCE`, `PENALTY`, `BONUS`, `COMPENSATION`, `CORRECTION`, `ADJUSTMENT`, `REFUND`), reject Class `2/5/6` and PCG `42x–49x` (`^4[2-9]\d*`) credit accounts, and match operating revenue credit accounts strictly via `^4[01]\d*` (and Class 7 `7*`).

---

### 2.4 `DEF-LS-01` (P1) — Stale `localStorage` Filter Restoration

#### Root Cause
In `src/domains/analytics/context/ExecutiveFilterContext.tsx`, static module-level `defaultFilters` computed dates once at bundle evaluation time, and `loadPersistedExecutiveFilters` restored `finops_executive_filters_v3` across days/sessions without TTL, calendar validation, or bounds ordering checks, silently re-applying historical July dates on mount.

#### Implemented Fix
- **`src/domains/analytics/context/ExecutiveFilterContext.tsx` (lines 44–250, 358–384)**:
  - Replaced static module-level `defaultFilters` with `createDefaultExecutiveFilters(refDate)`.
  - Added `sanitizeRestoredDateBounds` and `loadPersistedExecutiveFilters(refDate)` enforcing:
    - Removal of legacy `finops_executive_filters_v2` storage key;
    - Stamping persisted v3 entries with `_persistedAt` (epoch ms) and `_persistedDate` (`YYYY-MM-DD`);
    - Automatic expiration of un-timestamped entries, cross-day entries (`_persistedDate !== todayStr`), and entries exceeding 12 hours (`PERSISTED_FILTER_TTL_MS = 12 * 60 * 60 * 1000`), resetting temporal bounds to current trailing 30-day defaults while preserving safe non-temporal preferences (`accountingBasis`, `presentationMode`);
    - Preservation of active same-day (`< 12h`) valid custom ranges and explicit cleared `"All Dates"` (`startDate: ""`, `endDate: ""`) selections;
    - Rejection of non-ISO dates (`isValidIsoDateStr`) and inverted ranges (`startDate > endDate`);
    - Added `clearPersistedFilters` to context state and supported single-bound open-ended dates in `filterPayrolls` (`normBounds.startDate || normBounds.endDate`).

---

## 3. COMPLETE INVENTORY OF MODIFIED & CREATED FILES

### Production Source Files Modified (8 files)
1. `src/domains/analytics/types/index.ts` — Added `"ALL"` to `AnalyticsPeriod`.
2. `src/domains/analytics/services/AnalyticsEngine.ts` — `getPeriodRanges`, `computeOperationalExpenses`, `isIncomeTx`, `generateSnapshot` (`hasPreviousPeriod`, dataset-scoped effective unbounded ranges, department revenue isolation).
3. `src/domains/cash/adapters/LedgerCashAdapter.ts` — Case 3 Treasury debit inflow guardrails excluding payroll, clearing/liabilities, PCG `42x–49x`, and non-revenue ledger types.
4. `src/domains/analytics/context/ExecutiveFilterContext.tsx` — `createDefaultExecutiveFilters`, `loadPersistedExecutiveFilters` (12h TTL, cross-day expiration, calendar & ordering validation), `clearPersistedFilters`, single-bound `filterPayrolls`.
5. `src/domains/analytics/context/AnalyticsContext.tsx` — Nullish coalescing `??` for empty `""` dates, `accountingMode` propagation, `activeCustomRange` & unbounded FX grid fetch.
6. `src/components/bi/hooks/useBIDataAggregation.ts` — Unbounded `normalizationContext` reset & FX grid fetch, empty-string date preservation to `AnalyticsEngine.generateSnapshot`.
7. `src/hooks/usePerformanceData.ts` — Unbounded `normalizationContext` reset & FX grid fetch, `effectiveFilters` propagating `execFilters.accountingBasis` to all PIC selectors.
8. `src/domains/performance/selectors/index.ts` — Explicit `accountingMode` forwarding in `selectExpertMetrics` aligned with `selectSimplifiedMetrics`.

### Test & Documentation Files Created / Updated (4 files)
1. `src/tests/unit/BIP15PICFinancialIntegrityRemediation.test.ts` *(Created)* — 13 targeted unit & integration tests verifying all 4 defects (`DEF-TF-01`, `DEF-REV-01`, `DEF-CASH-01`, `DEF-LS-01`), Cash & Accrual modes, unbounded `"ALL"` / `""` ranges, single-bound open ranges, department revenue isolation, PCG `421`/`431`/`44x` guardrails, and `localStorage` expiration/validation.
2. `src/tests/unit/Phase152RIndependentRuntimeVerification.test.ts` *(Updated)* — Explicit `accountingBasis: "ACCRUAL"` and `"CASH"` scope parity assertions (`109,000` HTG Accrual vs. `92,000` HTG Cash bank disbursement) in Scenario I.
3. `docs/decision-log.md` *(Updated)* — Added `ADR-018: BI-P1.5 PIC Financial Integrity, Temporal Filter Unbounded Semantics & Cash/Accrual Revenue Isolation`.
4. `docs/changelog.md` *(Updated)* — Added release entry `[4.6.0] - 2026-11-06`.

---

## 4. SECURITY, MULTI-TENANCY & KNOWN LIMITATIONS

- **Multi-Tenant Isolation Preserved**: All changes preserve strict `business_id` / `businessId` tenant scoping in `AnalyticsEngine`, `LedgerCashAdapter`, `CanonicalCashEngine`, `usePerformanceData` (`rawDataSet` cleared on `businessId` switch), and `useBIDataAggregation`. No cross-tenant reads or caches were introduced.
- **No Unapproved Chart of Accounts or Schema Changes**: All accounting filters operate strictly on existing canonical COA prefixes (`10xx`, `12xx`, `1310`, `2xxx`, `40x–41x` vs. `42x–49x`, `5xxx`, `6xxx`, `7xxx`) without altering Firestore collections, indexes, or security rules.
- **Scope Notes & Remaining Limitations**:
  - Verification across the 72 passing suites (`707 / 707` tests) runs against deterministic in-memory unit/integration fixtures and mocked storage; live Firestore Emulator suites require an active local emulator (`localhost:8080`).
  - Three pre-existing unrelated legacy suites outside BI-P1.5 (`src/tests/integration/NamingAndIntegrityPhase2.test.ts` attempting live GCP Firestore gRPC calls without service credentials, and legacy payroll suites `src/tests/unit/PayrollAdversarialValidation.test.ts` and `src/tests/integration/Phase131RuntimeVerification.integration.test.ts` asserting historical `TaxPolicyEngine.isAttendanceRequiredForPayroll` default behavior) remain untouched outside this phase's scope.
