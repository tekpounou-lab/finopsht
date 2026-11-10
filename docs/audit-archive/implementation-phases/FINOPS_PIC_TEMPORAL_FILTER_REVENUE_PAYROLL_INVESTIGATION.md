# FINOPS PIC — P0 TEMPORAL FILTER & REVENUE/PAYROLL CONTAMINATION INVESTIGATION REPORT

**Role:** Principal BI Architect, Senior Financial Data Engineer and Independent QA Auditor  
**Project:** FINOPS ERP / FINAYITI FUSION  
**Module:** Performance Intelligence Center (PIC) & Analytics Engine  
**Phase:** BI-P1.4 / P0 Incident Investigation  
**Mode:** STRICT READ-ONLY INVESTIGATION  
**Executive Verdict:** **FAIL — DEFECTS CONFIRMED (REMEDIATION REQUIRED)**  

---

## 1. EXECUTIVE SUMMARY & VERDICT

An independent, read-only architectural investigation was conducted to audit the Performance Intelligence Center (PIC) following an incident report where an amount under **Chiffre d'affaires (Revenue)** appeared to correspond to committed payroll for a July period, even when the date filter was cleared or did not point to any date.

### Executive Verdict: **FAIL (4 Defects Confirmed)**
The investigation confirms that:
1. **Revenue and Payroll amounts are distinct in GL definitions, but collide under specific filter fallback, Cash-Basis classification, and subledger aggregation conditions.**
2. **Temporal Filter Fallback Collision:** When a date filter is cleared or `period: "all"` is selected (`startDate: ""`, `endDate: ""`), `selectFilteredDataSet` passes all historical records (including July), while `AnalyticsEngine.getPeriodRanges` falls back to the **current calendar month**, creating a severe boundary mismatch between selector filtering and engine calculation.
3. **Subledger Department Revenue Contamination:** In `AnalyticsEngine.ts` (lines 2074 & 2155), `departmentPerformance[].revenue` combines General Ledger income with commercial employee sales from payroll records (`salesFromPayroll`), which reads `p.sales` or `p.sales_cents`.
4. **Cash-Basis Inflow Spill:** In `CASH` accounting mode (`AccountingBasis = "CASH"`), `LedgerCashAdapter` classifies any transaction with a Class 10 Treasury debit (e.g., bank/cash debit with payroll clearing or liability credit) as a Cash Inflow (`INFLOW`), which `CashBasisEngine` sums into `totalInflow` and returns as Accounting Revenue.
5. **Stale LocalStorage Filter Persistence:** `ExecutiveFilterContext` restores previous session filters from `localStorage` (`finops_executive_filters_v3`). If July dates were saved in a previous session, they are silently restored on mount.

---

## 2. EXACT REPRODUCTION STEPS

### Scenario 1: Date Filter Cleared / `period: "all"` Boundary Mismatch
1. Open Performance Intelligence Center (`/pic` or `/performance`).
2. Set date filter preset to **"Toutes les dates" (`period: "all"`)** or clear `startDate` and `endDate`.
3. Observe `usePerformanceData` initializing `filters.startDate = ""` and `filters.endDate = ""`.
4. Observe `selectFilteredDataSet` in `src/domains/performance/selectors/index.ts` passing all historical transactions and payroll records (including July).
5. Observe `selectSimplifiedMetrics` passing `{ startDate: "", endDate: "" }` and `period: "CUSTOM"` to `AnalyticsEngine.generateSnapshot`.
6. `AnalyticsEngine.getPeriodRanges` evaluates `if (customRange && customRange.startDate && customRange.endDate)` as `false` because strings are empty, falling back to the current calendar month.
7. Discrepancy occurs: Total records count reflects all history, while period metrics reflect current month fallback with partial proration.

### Scenario 2: Cash-Basis Payroll Clearing Debit as Cash Inflow
1. Set `accountingBasis` to `"CASH"`.
2. Introduce a General Ledger transaction debiting a Bank/Cash account (`1010`) and crediting a Payroll Liability/Clearing account (`421`).
3. `LedgerCashAdapter.adaptTransaction` evaluates `isDebitTreasury = true` and `isCreditTreasury = false`.
4. `LedgerCashAdapter` tags the movement as `direction: "INFLOW"` and `movementType: "SALE"`.
5. `CashBasisEngine.executePipeline` sums `INFLOW` movements into `totalInflow`.
6. `calculateTotalRevenue` returns `cashStatement.totalInflow` as the company Revenue, causing payroll-related treasury debits to inflate revenue.

---

## 3. ROOT CAUSES & CODE EVIDENCE

| Defect ID | Root Cause Description | File Path | Line References | Severity |
|---|---|---|---|---|
| **DEF-TF-01** | `getPeriodRanges` falls back to current calendar month when `period: "CUSTOM"` has empty `startDate`/`endDate`, clashing with selector date matching. | `src/domains/analytics/services/AnalyticsEngine.ts` | Lines 546–574 | **P0** |
| **DEF-REV-01** | `departmentPerformance` sums `data.salesFromPayroll` (`p.sales`, `p.sales_cents`) into department `revenue`, contaminating accounting GL revenue. | `src/domains/analytics/services/AnalyticsEngine.ts` | Lines 2074, 2155 | **P0** |
| **DEF-CASH-01** | `LedgerCashAdapter` classifies any ledger transaction debiting Class 10 Treasury as `INFLOW`, causing non-sales debits (payroll clearing/refunds) to count as Revenue in Cash mode. | `src/domains/cash/adapters/LedgerCashAdapter.ts` | Lines 254–299, 485–538 | **P0** |
| **DEF-LS-01** | `ExecutiveFilterContext` loads persisted July filter state on mount from `localStorage` key `finops_executive_filters_v3` without user awareness. | `src/domains/analytics/context/ExecutiveFilterContext.tsx` | Lines 65–95 | **P1** |

---

## 4. DATA LINEAGE: REVENUE VS. PAYROLL

```
[General Ledger Transactions] ── (type: INCOME / category: INCOME) ──► GL Income Sum ───┐
                                                                                         ├──► Accounting Revenue (SSOT)
[Cash Movements (Cash Mode)]  ── (direction: INFLOW & Treasury)     ──► Cash Inflows ───┘

[Payroll Records] ────────────► (netPaid / grossSalary / Taxes)     ──► Payroll Cost (SSOT) ──► Total Payroll Expenses
```

### Key Invariant Rules:
1. **GL Income vs. Commercial Sales:** Commercial employee sales (`sales_cents`, `salesVolume`) on `PayrollRecord` belong exclusively to commercial performance and commission attribution, **NEVER** to General Ledger company revenue.
2. **Payroll Outflows vs. Inflows:** Payroll disbursements are strictly `OUTFLOW` movements in Cash Basis. Payroll liability settlements or reversals must **NEVER** be categorized as `INFLOW`.

---

## 5. TEMPORAL FILTER SCENARIO VERIFICATION MATRIX

| Scenario | Filter State | Query Boundaries | Included Records | Revenue Result | Payroll Result | Stale Data Reused? | Status |
|---|---|---|---|---|---|---|---|
| **A. Valid July Period** | `2026-07-01` to `2026-07-31` | `2026-07-01` .. `2026-07-31` | July Txs & Payrolls | July GL Income | July Payroll | No | **PASS** |
| **B. Period with No Data** | `2025-01-01` to `2025-01-31` | `2025-01-01` .. `2025-01-31` | 0 records | `0` / `NO_DATA` | `0` / `NO_DATA` | No | **PASS** |
| **C. No Date Filter (`all`)** | `period: "all"`, `""` .. `""` | Engine fallback vs Selector unbounded | Selector: All history. Engine: Current month | Mismatched | Mismatched | Yes (Boundary collision) | **FAIL (DEF-TF-01)** |
| **D. Cleared Date Filter** | Reset to default | `30d` trailing | 30 days trailing | 30d Revenue | 30d Payroll | Restores `localStorage` | **PASS WITH CONDITIONS** |
| **E. Outside History** | `2010-01-01` to `2010-01-31` | `2010-01-01` .. `2010-01-31` | 0 records | `0` / `NO_DATA` | `0` / `NO_DATA` | No | **PASS** |
| **F. Switch July -> Empty** | July -> 2025-01-01 | Re-evaluates `useMemo` | 0 records | `0` / `NO_DATA` | `0` / `NO_DATA` | No (Cache invalidates) | **PASS** |
| **G. Switch July -> August** | July -> August | Re-evaluates `useMemo` | August records | August Revenue | August Payroll | No | **PASS** |

---

## 6. NO_DATA CONTRACT VERIFICATION

The `KPIComparison<number | null>` contract mandates:
- When a valid selected period has zero matching records, metrics return `null` with `state: "NO_DATA"`.
- `AnalyticsEngine.compareNullableValues` correctly maps `null` to `state: "NO_DATA"`.
- `SmartKPICard.tsx` correctly displays `—` or `N/D` for `NO_DATA` states.
- **Defect Impact:** Under DEF-TF-01, when `period: "all"` is selected, `getPeriodRanges` falls back to the current month instead of evaluating an unbounded period or returning `NO_DATA` for empty ranges.

---

## 7. RECOMMENDED MINIMAL CORRECTIVE ACTIONS (POST-AUTHORIZATION ONLY)

1. **Fix DEF-TF-01 (`AnalyticsEngine.ts`):**
   - Handle `period === "CUSTOM"` when `startDate` and `endDate` are empty strings by deriving min/max dates across dataset or treating range as full history, rather than falling back to current calendar month.
2. **Fix DEF-REV-01 (`AnalyticsEngine.ts`):**
   - In `departmentPerformance` calculation (line 2155), remove `data.salesFromPayroll` from accounting department `revenue`. Restrict department revenue strictly to `data.glIncome` (posted GL Income).
3. **Fix DEF-CASH-01 (`LedgerCashAdapter.ts`):**
   - Check transaction type in `LedgerCashAdapter`. If `type === "PAYROLL"` or category is payroll-related, forbid `INFLOW` classification even if debit account is Treasury.
4. **Fix DEF-LS-01 (`ExecutiveFilterContext.tsx`):**
   - Validate loaded `localStorage` dates against current application bounds or provide an explicit user toggle to clear persisted temporal filters.

---

## 8. STOP GATE

```text
================================================================================
                                 STOP GATE
================================================================================
STRICT READ-ONLY INVESTIGATION IS COMPLETE.
NO SOURCE CODE FILES HAVE BEEN MODIFIED.
NO COMMITS OR PUSHES HAVE BEEN EXECUTED.

AWAITING EXPLICIT USER AUTHORIZATION BEFORE APPLYING ANY REMEDIATION FIXES.
================================================================================
```
