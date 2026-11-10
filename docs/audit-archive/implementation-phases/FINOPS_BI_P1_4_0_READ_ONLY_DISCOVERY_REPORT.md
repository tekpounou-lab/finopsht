# FINOPS — BI-P1.4.0
## KPI Semantic Consistency & Analytics SSOT Consolidation
### READ-ONLY DISCOVERY & ARCHITECTURE AUDIT REPORT

**Version:** 1.0  
**Status:** COMPLETE (READ-ONLY AUDIT)  
**Date:** 2026-11-03  
**Auditor:** Independent Principal BI Architect, Financial Analytics Engineer and TypeScript/Firebase Auditor  
**Verdict:** **PASS WITH CONDITIONS (DECISION METIER REQUISE)**

---

## 1. EXECUTIVE SUMMARY

Following the successful stabilization of analytics architecture (BI-P0-B) and financial multi-currency normalization (BI-P1.3), this read-only discovery audit (BI-P1.4.0) investigates remaining semantic inconsistencies in attendance calculations and evaluates frontend metric duplication in `useBIDataAggregation.ts` relative to the canonical `AnalyticsEngine` Single Source of Truth (SSOT).

**Key Findings:**
1. **Attendance KPI Divergence**: Attendance is calculated using two distinct methodologies across modules:
   - **Method A (Hours-Based Ratio)**: Used in `AnalyticsEngine` (`AnalyticsEngine.ts:312-430`) and `AnalyticsContext.tsx`: Compares total actual worked hours (`workedHoursSum`) against expected contractual working hours (`expectedTotalHours`).
   - **Method B (Presence-Based Ratio)**: Used in `useBIDataAggregation.ts` (`useBIDataAggregation.ts:724-725` & `874-875`) and legacy branch/department aggregations: Computes presence frequency as `Present Attendance Records / Total Attendance Records`.
2. **Frontend Duplication in `useBIDataAggregation.ts`**: While `AnalyticsEngine.generateSnapshot` provides canonical calculations for revenue, expenses, profit, payroll cost, and attendance, `useBIDataAggregation.ts` independently recalculates payroll aggregates, expense breakdowns, branch metrics, department metrics, and cashflow timelines.
3. **TypeScript Baseline**: Verified at exactly **12 historical diagnostics and 0 new diagnostics**.

---

## 2. ATTENDANCE KPI IMPLEMENTATION INVENTORY

| Module / Component | File Location | Calculation Approach | Denominator / Basis |
|---|---|---|---|
| **Executive Dashboard & AnalyticsEngine** | `/src/domains/analytics/services/AnalyticsEngine.ts` | Hours-Based (`workedHours / expectedHours`) | Total expected contractual hours across active operational employees in period |
| **Performance Intelligence Center (PIC) Hook** | `/src/components/bi/hooks/useBIDataAggregation.ts` | Presence-Based (Branch/Dept level fallbacks) & SSOT fallback | Total attendance records or days present |
| **Workforce Profitability Engine** | `/src/domains/analytics/services/WorkforceProfitabilityEngine.ts` | Hours-Based (`workedHours / expectedHours`) | Contractual expected hours (`calculatedExpectedDays * dailyHours`) |
| **PIC Selectors** | `/src/domains/performance/selectors/index.ts` | Consumes `AnalyticsEngine.generateSnapshot` SSOT | Canonical SSOT snapshot metrics |

---

## 3. EXACT FORMULA COMPARISON

### Formula A — Hours-Based Attendance Rate (Canonical SSOT)
$$\text{Attendance Rate (\%)} = \min\left(100, \max\left(0, \frac{\sum \text{Worked Hours}}{\sum \text{Expected Contractual Hours}} \times 100\right)\right)$$
* **Source Files:** `/src/domains/analytics/services/AnalyticsEngine.ts` (L420-435).
* **Semantics:** Measures time-resource utilization against contractual obligations.

### Formula B — Presence-Based Attendance Ratio (Legacy Frontend Fallback)
$$\text{Attendance Rate (\%)} = \frac{\text{Present Attendance Records}}{\text{Total Attendance Records}} \times 100$$
* **Source Files:** `/src/components/bi/hooks/useBIDataAggregation.ts` (L724-725).
* **Semantics:** Measures frequency of presence regardless of shift duration or hours worked.

**Conclusion:** Two different metrics (time utilization vs presence frequency) are incorrectly presented under identical labels in different UI views.

---

## 4. ANALYTICS SSOT DUPLICATION INVENTORY (`useBIDataAggregation.ts`)

| Frontend Calculation Block | File Location | Exists in AnalyticsEngine? | Divergence Risk | Recommended Target |
|---|---|---|---|---|
| `payrollAggregates` | `useBIDataAggregation.ts:523` | Yes (`AnalyticsEngine.computePayrollCost`) | Low | Migrate to `effectiveSnapshot.payrollAggregates` |
| `branchMetrics` | `useBIDataAggregation.ts:674` | Yes (`effectiveSnapshot.branchPerformance`) | Medium (fallback logic diverges) | Standardize on `effectiveSnapshot.branchPerformance` |
| `enrichedDepartmentMetrics` | `useBIDataAggregation.ts:785` | Yes (`effectiveSnapshot.departmentPerformance`) | Medium | Standardize on `effectiveSnapshot.departmentPerformance` |
| `cashflowTimeline` | `useBIDataAggregation.ts:909` | Yes (`effectiveSnapshot.historicalTrends`) | Low | Standardize on `effectiveSnapshot.historicalTrends` |
| `expenseCategoryChartData` | `useBIDataAggregation.ts:964` | Yes (`effectiveSnapshot.expenseBreakdown`) | Low | Standardize on `effectiveSnapshot.expenseBreakdown` |

---

## 5. PROPOSED KPI SEMANTIC DICTIONARY

1. **Revenue (Chiffre d'affaires)**: Total recognized General Ledger income (Accrual mode) or total settled cash inflows (Cash mode). Source: `AnalyticsEngine`. Consumed by Dashboard, PIC.
2. **Operational Expenses (Dépenses d'exploitation)**: Total P&L operational expenses excluding till closure risk discrepancies (`TILL_DISCREPANCY`, `CASH_SHORTAGE`). Source: `AnalyticsEngine`.
3. **Payroll Cost (Masse Salariale / Coût de l'emploi)**: Prorated gross salaries plus employer social contributions (`ONA`, `OFATMA`) from sealed payroll records. Source: `AnalyticsEngine`.
4. **Net Profit (Bénéfice Net)**: Revenue minus Total Operational Expenses and Payroll Cost. Source: `AnalyticsEngine`.
5. **Attendance Rate (Taux d'assiduité)**: Canonical time-utilization ratio (`Worked Hours / Expected Contractual Hours`). Source: `AnalyticsEngine`.
6. **Workforce Productivity (Productivité du personnel)**: Multi-factor operational score combining attendance rate, efficiency, and ROI. Source: `WorkforceProfitabilityEngine`.
7. **Employee-Attributed Sales (Ventes attribuées par employé)**: Commercial attribution of sales volume per employee for commission calculation. Source: `RevenueAttributionService`.
8. **Department Profitability (Rentabilité par département)**: Contribution margin per department separating operational revenue and direct labor cost. Source: `RevenueAttributionService`.
9. **Cash Operational Discrepancies (Écarts de caisse)**: Till variance movements isolated from P&L expenses. Source: `CashBasisEngine` / `AnalyticsEngine`.

---

## 6. REQUIRED BUSINESS DECISIONS (`DECISION METIER REQUISE`)

1. **`DECISION METIER REQUISE — ATTENDANCE DENOMINATOR`**: Should the official platform attendance rate be strictly hours-based (`Worked Hours / Expected Contractual Hours`) or presence-based (`Days Present / Expected Days`), or should both be displayed distinctly as *Time Utilization Rate* and *Presence Frequency Rate*?
2. **`DECISION METIER REQUISE — FRONTEND AGGREGATION PURGE`**: Is it authorized to fully deprecate local fallback calculations in `useBIDataAggregation.ts` and mandate 100% reliance on `effectiveSnapshot` from `AnalyticsContext`?

---

## 7. REGRESSION TEST COVERAGE MATRIX

| Test Suite | Target Component | Coverage Status |
|---|---|---|
| `PerformanceIntelligenceCenter.test.ts` | PIC Selectors & Metrics | **PASS** (7/7 tests passing) |
| `NormalizedAmountResolver.test.ts` | Multi-currency Normalization & Sign Integrity | **PASS** (5/5 tests passing) |
| `CashBasisEngine.test.ts` | Cash-Basis Pipeline | **PASS** (8/8 tests passing) |
| `useBIDataAggregation` Tests | Frontend Aggregation & Filters | **NOT VERIFIED** (Needs dedicated integration test) |

---

## 8. TYPESCRIPT BASELINE EVIDENCE

- **Command executed:** `npx tsc --noEmit` (via `npm run lint`).
- **Result:** Exactly **12 historical diagnostics and 0 new diagnostics**.
- **Status:** **PASS**.

---

## 9. RECOMMENDED IMPLEMENTATION SEQUENCE (FOR BI-P1.4)

1. **Step 1**: Formalize attendance semantic definition (Hours-based SSOT as primary, presence frequency as secondary).
2. **Step 2**: Refactor `useBIDataAggregation.ts` to consume `AnalyticsEngine` SSOT snapshots for branch, department, and payroll aggregates without duplicate frontend loops.
3. **Step 3**: Add integration tests validating Dashboard-PIC metric parity.

---

## 10. FINAL GATE & SCOPE FOR BI-P1.4

- **Recommended Scope**: SSOT consolidation in `useBIDataAggregation.ts` and unified attendance KPI definition.
- **Explicit Exclusions**: No changes to accounting formulas, BRH exchange rate rules, or database schemas.
- **Acceptance Criteria**: Zero metric divergence between Dashboard and PIC views; 100% test coverage for unified attendance.
- **Unresolved Business Decisions**: `DECISION METIER REQUISE` regarding attendance definition.
- **Implementation Risk**: Low to Medium (frontend refactoring).

**STOP. Read-only discovery audit complete. Awaiting human review and business decision before BI-P1.4.1 authorization.**
