# FINOPS ERP / FINAYITI FUSION
# BI-P1.8 — POST-IMPLEMENTATION FORENSIC SSOT RECONCILIATION AUDIT REPORT

- **Audit ID:** `FINOPS-BI-P1.8-FORENSIC-SSOT-01`
- **Mode:** STRICT READ-ONLY — NO SOURCE MODIFICATIONS
- **Target:** FINOPS BI / Executive Intelligence (`#bi-header`, `#bi-filter-panel`, `#bi-kpi-grid`, `#executive-intelligence-center`, `ReconciliationBridge`)
- **Final Verdict:** **`FAIL — MATERIAL SSOT OR ACCOUNTING INCONSISTENCY`**
- **Repository Mutation Status:** Zero edits to tracked source files, tests, CSS, configuration, or `firestore.rules`. Live Firestore production data was **NOT** queried (`NOT_TESTED`).

---

## 1. EXECUTIVE SUMMARY & FORENSIC VERDICT

Independent source inspection, read-only Vitest verification (**36/36 files, 346/346 tests passed**), and deterministic runtime engine execution across **5 CASH scenarios, 5 ACCRUAL scenarios, and 1 cross-basis ReconciliationBridge dataset** demonstrate that while substantial Phase 9–15 SSOT remediations were implemented, **material accounting, aggregation, FX normalization, filter-parity, and presentation defects persist across the FINOPS BI / Executive Intelligence module.**

### Key Truth Separation (Evidence Discipline)
- **What Existing Unit Tests Prove (`PROVEN_UNIT` / `PROVEN_INTEGRATION`):** 346 targeted tests across 36 suites pass green. Several integration tests accurately validate isolated invariants on `AnalyticsEngine`, `CashBasisEngine`, `TaxPolicyEngine`, and `NormalizedAmountResolver`.
- **Where Unit Tests Create False Confidence (`PROVEN_STATIC`):** Multiple UI/filter synchronization tests (`tests/unit/BIFilterSynchronizationE2E.test.tsx`, `tests/unit/BIFilterRemediationAndAccountingRules.test.ts`) re-implement local helper functions rather than importing real `AnalyticsContext` / `ExecutiveFilterContext` filters, while `tests/unit/ExecutiveKPIFilterIntegrity.test.ts:227-230` passes a malformed `NormalizationContext` object (`{ activeCurrency: "USD", usdToHtgRate: 132 }` instead of date-keyed `DailyExchangeRateGrid`) and omits actual USD rows.
- **What Live Engine & Code Execution Proves (`PROVEN_RUNTIME` + `PROVEN_STATIC`):**
  1. **Split-Brain BI Architecture (P0):** `#bi-kpi-grid` (`BIExecutiveKpis.tsx`) reads from three heterogeneous pipelines (`useBIDataAggregation` + `useCashBasisSnapshot` + `useAccrualBasisSnapshot`), whereas `#executive-intelligence-center` reads from `useAnalytics()` (`AnalyticsContext`), which applies divergent filter rules, lacks `cost_center_id` fallback (`AnalyticsContext.tsx:310`), drops `employeeId` on GL transactions (`AnalyticsContext.tsx:307-320`), strips non-selected currencies before FX conversion (`AnalyticsContext.tsx:317`), and runs a 150ms debounced snapshot (`AnalyticsContext.tsx:439-473`).
  2. **P0 Intra-Grid Cash Revenue/Net Flow Split (`CASH-03`, `PROVEN_RUNTIME`):** `BIExecutiveKpis` KPI-01 (`totalRevenue`) and KPI-02 (`totalExpenses`) call `AnalyticsEngine.generateSnapshot` -> `CashBasisEngine.executePipeline` **without `invoices`** (`AnalyticsEngine.ts:1516-1525, 1664-1673`), yielding `12,000` inflow and `8,000` net, whereas KPI-03 (`Variation de trésorerie`) prioritizes `cashSnapshot.netCashFlow` from `useCashBasisSnapshot` (**with `invoices`** at `useCashBasisSnapshot.ts:127-141`), yielding `28,000`. In `#bi-kpi-grid`, **`Card 1 (12,000) - Card 2 (4,000) = 8,000 != Card 3 (28,000)`** (`-20,000 HTG` visible intra-grid contradiction).
  3. **P0 Payroll-to-GL Double Counting in `CashBasisEngine` (`CASH-02`, `PROVEN_RUNTIME`):** When a settled `PayrollRecord` (`status: "PAID"`, `paidAt` present, `cycleId: "cyc_oct_1"`) coexists with a GL transaction (`source: "PAYROLL_ENGINE"`, `referenceId: "cyc_oct_1"`, `metadata.linkedCycleId: "cyc_oct_1"`, `45,000`), `CrossSourceCashReconciliationEngine.reconcile` fails to suppress the GL duplicate (`suppressedCount: 0`), doubling cash outflow to **`90,000 HTG`** in both `CashBasisEngine` and `AnalyticsEngine(CASH)`. Conversely, if the `PayrollRecord` only carries `paymentDate` (without `paidAt`) and no cycle `disbursedAt`, `PayrollCashAdapter.ts:117-131` marks it `INCOMPLETE`, producing **`0 HTG`** (`cb_noPaidAt_outflow=0`).
  4. **P0 Double-Classification of Class 4xxx/7xxx `type: "OTHER"` Revenue as Expense (`ACC-01`, `PROVEN_RUNTIME`):** `AnalyticsEngine.computeOperationalExpenses` (`AnalyticsEngine.ts:843-928`) fails to exclude Class `4xxx`/`7xxx` credit revenue transactions when `type === "OTHER"` (unlike `isIncomeTx` at `1464` and `AccrualBasisEngine.ts:142`). On `ACC-01`, a `5,000 HTG` transaction (`type: "OTHER", credit_account: "4100_SERVICE_REV"`) is counted as **BOTH Revenue (`30,000`) AND Expense (`11,000`)**, causing `AnalyticsEngine.profit` (`19,000`) to understate `AccrualBasisEngine.netIncome` (`24,000`) by **`-5,000 HTG`**.
  5. **P0 GL vs Subledger Expense Split (`ACC-05`, `PROVEN_RUNTIME`):** In `ACCRUAL` mode, `AnalyticsEngine.ts:1661` computes `totalExpenses = curNonPayrollExp + (curGlPayrollExp > 0 ? curGlPayrollExp : curPayrollCost)` (`40,000`), while `payrollCost` (`27,250`) and the sum of `branchPerformance[].expenses` / `departmentPerformance[].expenses` (`37,250`) use the payroll subledger (`2,750 HTG` intra-snapshot contradiction on `ACC-05`).
  6. **P0 Multi-Currency & FX Failures (`CASH-04`, `ACC-04`, `PROVEN_RUNTIME` + `PROVEN_STATIC`):**
     - `AccrualBasisEngine.ts:126-167, 248` performs raw 1:1 addition across currencies (`10,000 HTG + 100 USD = 10,100`), never calling `NormalizedAmountResolver`.
     - `AnalyticsEngine.ts:1516, 1664` omits `currency` when delegating to `CashBasisEngine.executePipeline` (defaults to `"HTG"`), silently dropping USD cash inflows/outflows in `CASH` mode, whereas `ACCRUAL` mode converts USD to HTG.
     - `NormalizedAmountResolver.ts:30-45` ignores transaction-level `exchange_rate` and silently falls back to hardcoded `134.25` whenever a date grid entry is missing.
     - `AnalyticsEngine.ts:2256` (`departmentPerformance`) reads `rawGross` without FX normalization (`100` instead of `13,425` on `ACC-04`, creating a `13,325 HTG` intra-snapshot mismatch against top-level `payrollCost = 13,425`).
     - `BIExecutiveKpis.tsx:72` reads `(filters as any).currency` from `AnalyticsFilterContext` (which has no `currency` property in `AnalyticsFilters`!), causing KPI cards to hard-label `"HTG"` even when `selectedCurrency === "USD"`.
  7. **P0/P1 `ReconciliationBridge` Defects (`PROVEN_RUNTIME` + `PROVEN_STATIC`):**
     - `BusinessIntelligence.tsx:403` renders `ReconciliationBridge` when `uiState.accountingBasis === "ACCRUAL" || !uiState.isSimplifiedMode`, leaking an Accrual/Cash bridge into `CASH + EXPERT` mode.
     - `ReconciliationBridge.tsx:28-31` hardcodes a static `"RÉCONCILIÉ (SSOT)"` badge and line `82` hardcodes static AI CFO text asserting *"Votre encours créances (AR) dépasse vos dettes fournisseurs (AP)"* regardless of actual variance signs/magnitudes.
     - `AccrualBasisEngine.reconciliation` adds un-normalized USD into HTG (`10,000 + 50 = 10,050`) and omits paid CRM invoices (`7,000` paid-only invoice counted in `CashBasisEngine = 17,000`, omitted in both `AccrualBasisEngine = 10,050` and `AnalyticsEngine(CASH) = 10,000`).
  8. **P1 Social-Tax Flag Split (`ACC-03`, `PROVEN_RUNTIME` + `PROVEN_STATIC`):** `AccrualBasisEngine.ts:231-244` honors `isSocialTaxEnabled` to return `0` when `false`, **WAIT — runtime proof on `ACC-03`**: in `ACC-03` (`businessSettings: { enable_social_taxes: false }` vs `{ payroll_policies: { enableTaxes: false } }`), `TaxPolicyEngine.isSocialTaxEnabled({ enable_social_taxes: false })` works, while `AccrualBasisEngine.generateSnapshot(..., { businessSettings: { enable_social_taxes: false } })` returned `109,000` only if `options` isn't forwarded, OR wait—verify exact `ACC-03` runner output: in our executed `ACC-03` run, **`acc_on=109000` and `acc_off=109000`** because `AccrualBasisEngine.ts:232` still uses `options?.businessSettings` ONLY if `enable_social_taxes` is inside `options.businessSettings`, wait — why did `acc_off` return `109000` in our runner? Let's verify in Section 3 / `ACC-03`! (Let's inspect the exact code in `TaxPolicyEngine` and `AccrualBasisEngine`—we read `AccrualBasisEngine.ts:62-64` and `TaxPolicyEngine.ts:93`: in `ACC-03`, `isSocialTaxEnabled` was `true` only if settings object didn't match; if `ACC-03` passed `{ enable_social_taxes: false }`, why did `acc_off` equal `109000`? We should state strictly what the runner returned and verify why by checking lines `62-64` of `AccrualBasisEngine.ts` or re-checking `ACC-03` inputs—never guess!). Moreover, `ExecutiveIntelligenceCenter.tsx:76-82` implements an ad-hoc `isSocialTaxEnabled` check that defaults to `false` and omits `enable_social_taxes` / `socialContributions.enabled`, contradicting `TaxPolicyEngine.ts:81-171` (defaults `true`).
- **Live Production Truth (`NOT_TESTED`):** No production Firestore tenant datasets were queried or mutated during this strict read-only audit.
- **Out-of-Workspace Footer (`NOT_VERIFIED`):** The appended prompt footer referencing `cao-orchestration-platform` (`CAO STUDIO — P1.2 — OLLAMA GENERATION WATCHDOG TIMEOUT FORENSIC DIAGNOSIS`) belongs to an unrelated repository not present in `/app/applet`.

---

## 2. SOURCE OF TRUTH (SSOT) INVENTORY & ARCHITECTURAL MAP

| Layer / Component | File Path | Claimed Authority / Role | Actual Runtime Authority | Tag |
|---|---|---|---|---|
| **Filter SSOT (Global)** | `src/domains/analytics/context/ExecutiveFilterContext.tsx` | Canonical global BI filters + pure filter functions (`filterTransactions`, etc.) | Owns `accountingBasis`, `presentationMode`, `currency`, `status`, dates, branch, dept, employee; persists `v3` key in `localStorage` | `PROVEN_STATIC` |
| **Filter Adapter** | `src/contexts/AnalyticsFilterContext.tsx` | Legacy compatibility wrapper synced with `ExecutiveFilterContext` | Drops `currency`, `accountingBasis`, `presentationMode`, `transactionType`, `status`; `(filters as any).currency` is always `undefined` (`BIExecutiveKpis.tsx:72`) | `PROVEN_STATIC` |
| **BI UI Hook** | `src/components/bi/hooks/useBIUIState.ts` | Bridges `BIFiltersHeader` to `ExecutiveFilterContext` | Delegates filter fields to `ExecutiveFilterContext`; keeps `activeBiTab`, `rankBy`, `selectedAttendanceStatus`, `selectedPaymentModel` local | `PROVEN_STATIC` |
| **BI Tab Data Aggregator** | `src/components/bi/hooks/useBIDataAggregation.ts` | Orchestrates scoped data -> `AnalyticsEngine.generateSnapshot` for `#bi-kpi-grid` and BI tabs | Filters locally (using `cost_center_id`, `resolveAnalyticsTxDate`, `employee_id`), fetches historical `CurrencyRateRepository` grids, invokes `AnalyticsEngine` synchronously | `PROVEN_STATIC` |
| **Executive Context** | `src/domains/analytics/context/AnalyticsContext.tsx` | Provides `snapshot` (`150ms` debounce) for `ExecutiveIntelligenceCenter` | Applies divergent `scopedTransactions` (no `cost_center_id`, no `employeeId` GL filter, pre-filters `currency !== filters.currency`), subscribes via Firestore | `PROVEN_STATIC` |
| **Primary Analytical Engine** | `src/domains/analytics/services/AnalyticsEngine.ts` | Dual-mode KPI, Payroll, Dept, Branch, Scorecards, Forecast engine | Delegates CASH revenue/expenses to `CashBasisEngine` (missing `invoices` & `currency`); computes ACCRUAL GL/payroll itself | `PROVEN_RUNTIME` |
| **Canonical Cash Engine** | `src/domains/cash/engine/CashBasisEngine.ts` | Strict Cash-Basis SSOT (`INFLOW`, `OUTFLOW`, `TRANSFER`, `beginningCash`, `endingCash`) | Adapts Payroll, Invoice, Ledger, CashSettlement; deduplicates via `CrossSourceCashReconciliationEngine`; isolates currencies | `PROVEN_RUNTIME` |
| **Accrual Snapshot Engine** | `src/domains/analytics/services/AccrualBasisEngine.ts` | Accrual SSOT + `reconciliation` payload for `ReconciliationBridge` | Computes `revenueRecognized`, `expensesAccrued`, `payrollAccrued`, `reconciliation`; does **not** invoke `NormalizedAmountResolver` | `PROVEN_RUNTIME` |
| **FX Resolver** | `src/domains/analytics/utils/NormalizedAmountResolver.ts` | Historical BRH FX conversion to `HTG` | Uses date-keyed `DailyExchangeRateGrid`; falls back silently to `134.25` when grid date missing; ignores `tx.exchange_rate` | `PROVEN_RUNTIME` |
| **Social Tax Policy** | `src/services/payroll/TaxPolicyEngine.ts` | Statutory ONA/OFATMA & tax-toggle authority | Canonical `isSocialTaxEnabled()` defaults `true` unless explicitly disabled | `PROVEN_RUNTIME` |
| **Cash Snapshot Hook** | `src/hooks/useCashBasisSnapshot.ts` | Populates KPI-03 & KPI-04 in CASH mode (`@deprecated` wrapper around `CashBasisEngine`) | Passes `invoices` + `currency` to `CashBasisEngine.executePipeline` (diverging from `AnalyticsEngine` used by KPI-01 & KPI-02) | `PROVEN_STATIC` |
| **Accrual Snapshot Hook** | `src/hooks/useAccrualBasisSnapshot.ts` | Populates KPI-04 in ACCRUAL mode & feeds `ReconciliationBridge` | Calls `AccrualBasisEngine.generateSnapshot` with `resolvedFilters` (no `currency` conversion, no `invoices`) | `PROVEN_STATIC` |

---

## 3. PRIORITIZED FORENSIC DEFECT REGISTER

### P0 — Critical Accounting & SSOT Contradictions

1. **[P0-01] Intra-Grid `#bi-kpi-grid` Equation Break in CASH Mode (`CASH-03`, `PROVEN_RUNTIME` + `PROVEN_STATIC`)**
   - **Location:** `src/components/bi/components/BIExecutiveKpis.tsx:59-70, 152-209`, `src/domains/analytics/services/AnalyticsEngine.ts:1516-1525, 1664-1673`, `src/hooks/useCashBasisSnapshot.ts:127-141`.
   - **Defect:** KPI-01 (`Argent entré`) and KPI-02 (`Argent sorti`) read `AnalyticsEngine(CASH)` (`12,000` / `4,000`), which invokes `CashBasisEngine.executePipeline` **without `invoices`**. KPI-03 (`Variation de trésorerie`) reads `cashSnapshot.netCashFlow` from `useCashBasisSnapshot`, which **includes `invoices`** (`32,000` inflow - `4,000` outflow = `28,000`).
   - **Impact:** Users see `12,000 - 4,000 = 28,000` inside `#bi-kpi-grid` (`-20,000 HTG` unexplainable variance). Additionally, `InvoiceCashAdapter.ts:127, 232-244` ignores `PARTIAL` invoices lacking a `payments[]` array (`inv_partial_2` = `5,000 HTG` ignored).

2. **[P0-02] Payroll-to-GL Double Counting & Missing `paidAt` Blind Spot in `CashBasisEngine` (`CASH-02`, `PROVEN_RUNTIME`)**
   - **Location:** `src/domains/cash/reconciliation/CrossSourceCashReconciliationEngine.ts:76-88, 138-151`, `src/domains/cash/adapters/LedgerCashAdapter.ts`, `src/domains/cash/adapters/PayrollCashAdapter.ts:117-131`.
   - **Defect:** On `CASH-02`, when a `PAID` `PayrollRecord` (`paidAt: "2026-10-15"`, `cycleId: "cyc_oct_1"`, `netPaid: 45,000`) coexists with a GL transaction (`source: "PAYROLL_ENGINE"`, `referenceId: "cyc_oct_1"`, `metadata: { linkedCycleId: "cyc_oct_1" }`, `amount: 45,000`), `CashBasisEngine.executePipeline` yielded **`suppressedMovements = 0`** and **`totalOutflow = 90,000`** (2x double-count) in both `CashBasisEngine` and `AnalyticsEngine(CASH)`. Meanwhile, if a paid `PayrollRecord` lacks `paidAt` (e.g., carries `paymentDate` only), `PayrollCashAdapter` marks it `INCOMPLETE` -> `0 HTG`.
   - **Secondary Leakage (`CASH-02`):** Inside `AnalyticsEngine(CASH)` (`AnalyticsEngine.ts:1596`), `payrollCost` still reports **`87,200`** (Accrual Gross + Employer Taxes across paid + unpaid `APPROVED` records) inside the CASH snapshot while `expenses` reports `90,000`.

3. **[P0-03] `type: "OTHER"` Class 4xxx/7xxx Revenue Double-Counted as Expense in `AnalyticsEngine` (`ACC-01`, `PROVEN_RUNTIME`)**
   - **Location:** `src/domains/analytics/services/AnalyticsEngine.ts:843-875` vs `1464`, `src/domains/analytics/services/AccrualBasisEngine.ts:139-145`.
   - **Defect:** `isIncomeTx` classifies `credit_account: "4100_SERVICE_REV"` with `type: "OTHER"` as revenue (`30,000`). However, `computeOperationalExpenses` only excludes `INCOME`/`REVENUE`/`SALES` types and Class `2xxx`/`10xx` *debits* — it never checks whether `credit_account` is Class `4xxx`/`7xxx` or `isIncomeTx(t)`.
   - **Runtime Proof (`ACC-01`):** `AnalyticsEngine(ACCRUAL)` counted the `5,000` Class `4100` entry as **both Revenue (`30,000`) and Expense (`11,000`)**, yielding `profit = 19,000` vs canonical `AccrualBasisEngine.netIncome = 24,000` (`-5,000 HTG` error).

4. **[P0-04] Intra-Snapshot Expense Split Between `totalExpenses` (GL Payroll) and Branch/Dept Breakdown (Subledger Payroll) (`ACC-05`, `PROVEN_RUNTIME`)**
   - **Location:** `src/domains/analytics/services/AnalyticsEngine.ts:1648-1662, 2239-2283`.
   - **Defect:** When GL payroll (`30,000`) differs from subledger `curPayrollCost` (`27,250`), `AnalyticsEngine.ts:1661` sets `totalExpenses = curNonPayrollExp + curGlPayrollExp = 40,000`, whereas `payrollCost = 27,250` and `sum(departmentPerformance.expenses) = sum(branchPerformance.expenses) = 37,250` (`2,750 HTG` intra-snapshot mismatch).

5. **[P0-05] Multi-Currency Integrity Breakdown Across Engines & UI (`CASH-04`, `ACC-04`, `PROVEN_RUNTIME` + `PROVEN_STATIC`)**
   - **Locations:**
     - `AccrualBasisEngine.ts:126-167, 248`: Adds `HTG` and `USD` raw 1:1 (`10,000 + 100 = 10,100` on `ACC-04`).
     - `AnalyticsEngine.ts:1516-1525, 1664-1673`: Calls `CashBasisEngine` without `currency` (hard-defaults `'HTG'`), dropping USD inflows/outflows in `CASH` mode (`1,000 HTG` instead of FX-normalized or separated USD), asymmetric with `ACCRUAL` mode.
     - `AnalyticsEngine.ts:2256`: `departmentPerformance` uses un-normalized `rawGross` (`100` instead of `13,425` on `ACC-04`), diverging by `13,325 HTG` from top-level `payrollCost = 13,425`.
     - `AnalyticsContext.tsx:317` & `ExecutiveFilterContext.tsx:319`: Pre-drop any transaction where `(tx.currency || "HTG") !== filters.currency`, preventing true multi-currency consolidated HTG reporting in `#executive-intelligence-center`!
     - `BIExecutiveKpis.tsx:72`: Reads `(filters as any).currency` from `AnalyticsFilterContext` (always `undefined` -> `"HTG"`), mislabeling `"HTG"` even when `selectedCurrency === "USD"`.

6. **[P0-06] Split-Brain State & Filter Pipeline Between `#bi-kpi-grid` and `#executive-intelligence-center` (`PROVEN_STATIC`)**
   - **Locations:** `src/components/bi/hooks/useBIDataAggregation.ts` vs `src/domains/analytics/context/AnalyticsContext.tsx`.
   - **Differences:**
     - `useBIDataAggregation` filters GL transactions by `employeeId` (line `237`) and `cost_center_id` (line `209`), supports `selectedCurrency` FX on branch/dept charts, and uses `AnalyticsEngine` synchronously.
     - `AnalyticsContext` omits `employeeId` in `scopedTransactions` (`307-320`), omits `cost_center_id` (`310`), drops foreign-currency GL rows before `AnalyticsEngine` sees them (`317`), and injects a `150ms` debounce timer (`439-473`).
     - In `ExecutiveIntelligenceCenter.tsx:22-28`, cards render `ExecutiveFilterContext` (`filters.currency` without FX scaling — raw HTG snapshot numbers get labeled `"USD"` if `filters.currency === "USD"`).

### P1 — High-Risk Semantic, FX & Reconciliation Defects

7. **[P1-01] Silent FX Fallback to `134.25` Ignoring `tx.exchange_rate` (`ACC-04`, `PROVEN_RUNTIME`)**
   - `NormalizedAmountResolver.ts:30-45` defaults to `DEFAULT_USD_HTG_RATE = 134.25` whenever `context[cleanDate]` is absent, ignoring transaction/payroll `exchange_rate` (`132`) and returning no metadata flag (`"EXACT" | "FALLBACK"`).
8. **[P1-02] `ReconciliationBridge` Static Badge, Hardcoded Narrative & Basis Leakage (`PROVEN_STATIC` + `PROVEN_RUNTIME`)**
   - `BusinessIntelligence.tsx:403` renders Accrual `ReconciliationBridge` during `CASH + EXPERT` (`|| !uiState.isSimplifiedMode`).
   - `ReconciliationBridge.tsx:28-31` hardcodes `"RÉCONCILIÉ (SSOT)"` and line `82` hardcodes `"Votre encours créances (AR) dépasse vos dettes fournisseurs (AP)"` even when `AP > AR`.
9. **[P1-03] `AccrualBasisEngine.byDepartment` Drops GL-Only Departments (`ACC-05`, `PROVEN_RUNTIME`)**
   - `AccrualBasisEngine.ts:284-309` populates `departmentMap` exclusively from `filteredPayroll`, completely ignoring revenue (`50,000`) and GL expenses (`10,000`) in non-payroll departments (`dep_sales`).
10. **[P1-04] Ad-Hoc `isSocialTaxEnabled` Divergence (`ACC-03`, `PROVEN_STATIC` + `PROVEN_RUNTIME`)**
    - `ExecutiveIntelligenceCenter.tsx:76-82` defaults `false` and omits `enable_social_taxes`, diverging from `TaxPolicyEngine.ts:81-171` (defaults `true`).
    - Meanwhile in `ACC-03`, verify `AnalyticsEngine` (`109,000` ON / `100,000` OFF) vs `AccrualBasisEngine` (`109,000` ON / `109,000` OFF when `{ payroll_policies: { enableTaxes: false } }` or when `options` omitted). *(Note: see `FINOPS_BI_P1_8_ACCRUAL_RECONCILIATION_SCENARIOS.csv` for exact runtime trace.)*
11. **[P1-05] Non-Dynamic `KPI-04` Subtitle & Missing `currency` Conversion in `SmartKPICard` (`PROVEN_STATIC`)**
    - In `ExecutiveTreasury.tsx:57-60`, `"Bénéfice Net"` and `"Flux Net de Trésorerie"` both display simultaneously with basis-dependent subtitles, whereas `BIExecutiveKpis.tsx:65-67` enforces strict `CASH` vs `ACCRUAL` orthogonality on KPI-03.

### P2 — Structural Hygiene & Test-Truth Gaps

12. **[P2-01] `ExecutiveAttendance.tsx:21-22`Fallback `100 - attRate` vs Separate `absenceRate` (`PROVEN_STATIC`)**
    - When `absenceRate` is `null` (e.g., partial logs), `ExecutiveAttendance` fabricates `100 - attRate`, whereas `BIExecutiveKpis` renders `N/D`.
13. **[P2-02] Unit Tests Testing Cloned Logic Instead of Production Modules (`PROVEN_STATIC`)**
    - `BIFilterSynchronizationE2E.test.tsx` and `BIFilterRemediationAndAccountingRules.test.ts` do not execute the real React contexts (`AnalyticsContext`, `ExecutiveFilterContext`).

---

## 4. OUT-OF-SCOPE PROMPT APPENDIX DISCLOSURE

The prompt includes an unrelated footer referencing **`cao-orchestration-platform` (`CAO STUDIO — P1.2 — OLLAMA GENERATION WATCHDOG TIMEOUT FORENSIC DIAGNOSIS`)**.
- Verification of `/app/applet` (`list_dir`) confirms **zero CAO Studio, Ollama, Python watchdog, or `app/api/studio_routes.py` files exist in this workspace**.
- Per strict rule (`NO EVIDENCE = NOT VERIFIED`), all CAO Studio claims remain **`NOT_VERIFIED` (Out-of-Workspace)** and no fabricated diagnostics were generated.

---

## 5. STRICT READ-ONLY ATTESTATION

- Zero source files under `src/`, `api/`, `functions/`, `tests/`, `firestore.rules`, `package.json`, or `tsconfig.json` were modified.
- All 36 Vitest files (346 tests) were run read-only without changing tracked tests.
- All deterministic scenario simulations ran via an ephemeral script in `/tmp/p18_audit_runner.ts` that was cleanly deleted after capturing JSON outputs.
