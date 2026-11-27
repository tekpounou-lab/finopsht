# FINOPS BI-P1.8 — TEST EXECUTION & DETERMINISTIC RUNTIME EVIDENCE

- **Audit ID:** `FINOPS-BI-P1.8-FORENSIC-SSOT-01`
- **Mode:** STRICT READ-ONLY — NO SOURCE MODIFICATIONS
- **Production Firestore Verification:** `NOT_TESTED` (read-only audit against codebase and deterministic fixtures; zero live production tenant data queried).

---

## 1. READ-ONLY VITEST SUITE EXECUTION (`PROVEN_UNIT` / `PROVEN_INTEGRATION`)

### Exact Command Executed
```bash
npx vitest run --reporter=default --silent \
  tests/unit/Phase9BCanonicalFormulaRemediation.test.ts \
  tests/unit/Phase9CCanonicalFormulaRemediation.test.ts \
  tests/unit/BIP15PICFinancialIntegrityRemediation.test.ts \
  tests/unit/ExecutiveKPIFilterIntegrity.test.ts \
  tests/unit/BIFilterSynchronizationE2E.test.tsx \
  tests/unit/BIDataAggregationSSOT.test.ts \
  tests/unit/PerformanceIntelligenceDataIntegrity.test.ts \
  tests/unit/Phase10EGoldenDatasetSSOT.test.ts \
  tests/unit/BISSOTCardConsistencyAudit.test.tsx \
  tests/unit/Phase151CashReconciliationGate.test.ts \
  tests/unit/integration/Phase7ERevenueKPISSOT.test.ts \
  tests/unit/PerformanceIntelligenceCenter.test.ts \
  tests/unit/Phase15FinancialReconciliationAudit.test.ts \
  tests/unit/integration/PayrollDeduplicationSSOT.test.ts \
  tests/unit/integration/SSOTInvariantMatrix.test.ts \
  tests/unit/Phase142Verification.test.ts \
  tests/unit/Phase1322Verification.test.ts \
  tests/unit/Phase1421RuntimeGate.test.ts \
  tests/unit/Phase1321Verification.test.ts \
  tests/unit/Phase1323Verification.test.ts \
  tests/unit/cash/CashViewModel.test.ts \
  tests/unit/cash/FinancialReconciliation.test.ts \
  tests/unit/cash/BIHarmonizationNonRegression.test.ts \
  tests/unit/cash/CashBasisEngine.test.ts \
  tests/unit/cash/CashSettlementAndMultiCurrency.test.ts \
  tests/unit/BI_P1_4_6_RuntimeNullSafety.test.ts \
  tests/unit/cash/CashAdapters.test.ts \
  tests/unit/CfoProfitVsCashFlowRemediation.test.ts \
  tests/unit/dateNormalization.test.ts \
  tests/unit/BIFilterRemediationAndAccountingRules.test.ts \
  tests/unit/Phase141Verification.test.ts \
  tests/unit/Phase1311SemanticContract.test.ts \
  tests/unit/TaxPolicyEngine.test.ts \
  tests/unit/FilterArchitecture.test.tsx \
  tests/unit/integration/WorkforceAnalyticsSSOT.test.ts \
  tests/unit/cash/NormalizedAmountResolver.test.ts
```

### Summary Output
- **Test Files:** `36 passed (36)`
- **Tests:** `346 passed (346)` | `0 failed` | `0 skipped`
- **Duration:** `33.16s` (`transform 2.74s, setup 551ms, import 18.72s, environment 6ms, tests 4.64s, prepare 4.30s`)

### Per-File Breakdown

| # | Test File | Tests | Duration | Status |
|---|---|---|---|---|
| 1 | `tests/unit/Phase9BCanonicalFormulaRemediation.test.ts` | 10 | 2374ms | PASS |
| 2 | `tests/unit/Phase9CCanonicalFormulaRemediation.test.ts` | 6 | 516ms | PASS |
| 3 | `tests/unit/BIP15PICFinancialIntegrityRemediation.test.ts` | 13 | 142ms | PASS |
| 4 | `tests/unit/ExecutiveKPIFilterIntegrity.test.ts` | 18 | 110ms | PASS |
| 5 | `tests/unit/BIFilterSynchronizationE2E.test.tsx` | 16 | 116ms | PASS |
| 6 | `tests/unit/BIDataAggregationSSOT.test.ts` | 14 | 101ms | PASS |
| 7 | `tests/unit/PerformanceIntelligenceDataIntegrity.test.ts` | 11 | 108ms | PASS |
| 8 | `tests/unit/Phase10EGoldenDatasetSSOT.test.ts` | 5 | 83ms | PASS |
| 9 | `tests/unit/BISSOTCardConsistencyAudit.test.tsx` | 10 | 96ms | PASS |
| 10 | `tests/unit/Phase151CashReconciliationGate.test.ts` | 13 | 85ms | PASS |
| 11 | `tests/unit/integration/Phase7ERevenueKPISSOT.test.ts` | 10 | 77ms | PASS |
| 12 | `tests/unit/PerformanceIntelligenceCenter.test.ts` | 7 | 68ms | PASS |
| 13 | `tests/unit/Phase15FinancialReconciliationAudit.test.ts` | 15 | 63ms | PASS |
| 14 | `tests/unit/integration/PayrollDeduplicationSSOT.test.ts` | 6 | 56ms | PASS |
| 15 | `tests/unit/integration/SSOTInvariantMatrix.test.ts` | 1 | 53ms | PASS |
| 16 | `tests/unit/Phase142Verification.test.ts` | 10 | 48ms | PASS |
| 17 | `tests/unit/Phase1322Verification.test.ts` | 12 | 47ms | PASS |
| 18 | `tests/unit/Phase1421RuntimeGate.test.ts` | 7 | 47ms | PASS |
| 19 | `tests/unit/Phase1321Verification.test.ts` | 17 | 48ms | PASS |
| 20 | `tests/unit/Phase1323Verification.test.ts` | 13 | 46ms | PASS |
| 21 | `tests/unit/cash/CashViewModel.test.ts` | 3 | 37ms | PASS |
| 22 | `tests/unit/cash/FinancialReconciliation.test.ts` | 4 | 43ms | PASS |
| 23 | `tests/unit/cash/BIHarmonizationNonRegression.test.ts` | 6 | 35ms | PASS |
| 24 | `tests/unit/cash/CashBasisEngine.test.ts` | 8 | 37ms | PASS |
| 25 | `tests/unit/cash/CashSettlementAndMultiCurrency.test.ts` | 13 | 37ms | PASS |
| 26 | `tests/unit/BI_P1_4_6_RuntimeNullSafety.test.ts` | 9 | 27ms | PASS |
| 27 | `tests/unit/cash/CashAdapters.test.ts` | 21 | 27ms | PASS |
| 28 | `tests/unit/CfoProfitVsCashFlowRemediation.test.ts` | 4 | 29ms | PASS |
| 29 | `tests/unit/dateNormalization.test.ts` | 13 | 15ms | PASS |
| 30 | `tests/unit/BIFilterRemediationAndAccountingRules.test.ts` | 12 | 12ms | PASS |
| 31 | `tests/unit/Phase141Verification.test.ts` | 10 | 13ms | PASS |
| 32 | `tests/unit/Phase1311SemanticContract.test.ts` | 8 | 11ms | PASS |
| 33 | `tests/unit/TaxPolicyEngine.test.ts` | 8 | 10ms | PASS |
| 34 | `tests/unit/FilterArchitecture.test.tsx` | 4 | 8ms | PASS |
| 35 | `tests/unit/integration/WorkforceAnalyticsSSOT.test.ts` | 4 | 9ms | PASS |
| 36 | `tests/unit/cash/NormalizedAmountResolver.test.ts` | 5 | 6ms | PASS |

---

## 2. CRITICAL AUDIT OF TEST-VS-SOURCE FALSE CONFIDENCE (`PROVEN_STATIC`)

Why did all 346 tests pass while critical P0 defects remain?

1. **Test-Local Logic Clones (`tests/unit/BIFilterSynchronizationE2E.test.tsx`, `tests/unit/BIFilterRemediationAndAccountingRules.test.ts`):**
   - These suites construct local inline filter functions mimicking expected behavior instead of invoking the actual `ExecutiveFilterContext.filterTransactions`, `AnalyticsContext`, or `useBIDataAggregation` implementations. Therefore, real production bugs (`AnalyticsContext` ignoring `employeeId` on GL transactions, omitting `cost_center_id`, and pre-dropping non-selected currencies) were never caught.
2. **Invalid FX Context Shape (`tests/unit/ExecutiveKPIFilterIntegrity.test.ts:227-230`):**
   - Passes `{ activeCurrency: "USD", usdToHtgRate: 132 } as any` as `normalizationContext` alongside HTG-only transactions, masking `NormalizedAmountResolver`'s `DEFAULT_USD_HTG_RATE = 134.25` silent fallback and `AnalyticsEngine` department raw-FX bug (`ACC-04`).
3. **Mocked React Component Unit Tests (`BISSOTCardConsistencyAudit.test.tsx`, `BIDataAggregationSSOT.test.ts`):**
   - Validate isolated props or mocked hook outputs rather than testing end-to-end synchronization between `BIExecutiveKpis` (which splits KPI-01..02 vs KPI-03 vs KPI-09 across 3 pipelines), `ExecutiveIntelligenceCenter` (`AnalyticsContext`), and `ReconciliationBridge` (`AccrualBasisEngine`).

---

## 3. EPHEMERAL DETERMINISTIC ENGINE RUNNER (`PROVEN_RUNTIME`)

Executed via `npx tsx /tmp/p18_audit_runner.ts` directly against `/app/applet/src/domains/...` (script deleted cleanly immediately after capturing JSON output):
- **5 CASH scenarios (`CASH-01`..`CASH-05`):** Proved `CASH-02` 2x Payroll+GL double-count (`90,000`), `CASH-02` missing `paidAt` blind spot (`0`), `CASH-02` `payrollCost` accrual leak (`87,200`), `CASH-03` `-20,000` invoice omission split, `CASH-03` `PARTIAL` invoice omission (`5,000`), and `CASH-04` silent USD drop in `AnalyticsEngine(CASH)`.
- **5 ACCRUAL scenarios (`ACC-01`..`ACC-05`):** Proved `ACC-01` Class `4100` `type: "OTHER"` double-counted as BOTH revenue and expense (`-5,000` profit distortion), `ACC-03` social-tax policy mismatch, `ACC-04` `AccrualBasisEngine` 1:1 USD+HTG addition (`10,100`), `ACC-04` `NormalizedAmountResolver` silent `134.25` fallback ignoring `exchange_rate: 132`, `ACC-04` intra-snapshot `departmentPerformance` raw unconverted `100` vs `13,425`, `ACC-05` intra-snapshot GL vs subledger split (`40,000` vs `37,250`), and `ACC-05` `AccrualBasisEngine.byDepartment` dropping non-payroll departments.
- **1 Cross-Basis Bridge scenario (`bridgeScenario`):** Proved `AccrualBasisEngine.reconciliation` (`10,050` / `25,050`) disagrees with both `CashBasisEngine` (`17,000 HTG` + `50 USD`) and `AnalyticsEngine` (`10,000` CASH / `31,600` ACCRUAL).
