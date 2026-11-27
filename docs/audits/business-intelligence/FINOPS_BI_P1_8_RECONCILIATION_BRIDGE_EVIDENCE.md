# FINOPS BI-P1.8 — RECONCILIATION BRIDGE FORENSIC EVIDENCE

- **Target Components:**
  - `src/components/analytics/ReconciliationBridge.tsx` (active in `BusinessIntelligence.tsx:403-407`)
  - `src/domains/analytics/services/AccrualBasisEngine.ts:367-377` (data producer)
  - `src/domains/cash/reconciliation/FinancialReconciliationBridge.tsx` (unused sibling component in main Tab 1 Executive view)
- **Verdict:** **`FAIL — MATERIAL CONTRADICTION & MISLEADING PRESENTATION`**

---

## 1. DETERMINISTIC CROSS-BASIS RUNTIME SIMULATION (`bridgeScenario`, `PROVEN_RUNTIME`)

A unified mixed dataset was executed simultaneously through `AccrualBasisEngine.generateSnapshot`, `CashBasisEngine.executeMultiCurrencyPipeline`, `AnalyticsEngine.generateSnapshot(..., "CASH")`, and `AnalyticsEngine.generateSnapshot(..., "ACCRUAL")`:

### Input Dataset (`2026-10-01` .. `2026-10-31`, `biz_1`, BRH grid `1 USD = 132 HTG` on `2026-10-10`)
- GL cash sale: `10,000 HTG` (`PAID`, `debit_account: "1000_CASH"`, `2026-10-05`)
- GL unpaid AR credit sale: `15,000 HTG` (`POSTED`, `debit_account: "1200_ACCOUNTS_RECEIVABLE"`, `2026-10-08`)
- GL paid OPEX: `4,000 HTG` (`PAID`, `credit_account: "1000_CASH"`, `2026-10-09`)
- GL unpaid AP expense: `9,000 HTG` (`POSTED`, `credit_account: "2000_ACCOUNTS_PAYABLE"`, `2026-10-10`)
- GL foreign-currency cash receipt: `50 USD` (`PAID`, `debit_account: "1000_CASH"`, `2026-10-10`, BRH `132` -> `6,600 HTG`)
- Paid CRM invoice (no GL transaction): `7,000 HTG` (`PAID`, `paidAt: "2026-10-12"`)
- Payroll subledger: `20,000 HTG` accrued (`status: "PAID"`, `grossSalary: 20,000`, `netPaid: 14,000`, `paidAt: "2026-10-15"`, no employer tax)

### Observed Runtime Outputs Across Engines

| Metric | `AccrualBasisEngine.reconciliation` (Feeds `ReconciliationBridge`) | `CashBasisEngine` (`HTG` Bucket) | `CashBasisEngine` (`USD` Bucket) | `AnalyticsEngine("CASH")` | `AnalyticsEngine("ACCRUAL")` |
|---|---|---|---|---|---|
| **Cash Revenue / Inflow** | `10,050` *(10,000 HTG + 50 USD raw! Ignores 7,000 invoice!)* | `17,000` *(10,000 GL + 7,000 CRM Invoice)* | `50` *(strictly isolated)* | `10,000` *(ignores 7,000 invoice & drops 50 USD!)* | N/A |
| **Accrual Revenue** | `25,050` *(10,000 + 15,000 + 50 USD raw!)* | N/A | N/A | N/A | `31,600` *(10,000 + 15,000 + 6,600 FX)* |
| **Revenue Variance (Accrual − Cash)** | `+15,000` | N/A | N/A | N/A | N/A |
| **Cash Payroll** | `14,000` *(paid netPaid from subledger)* | `14,000` *(OUTFLOW)* | `0` | `14,000` *(in totalOutflow)*; **`payrollCost: 20,000`** *(accrual leak!)* | N/A |
| **Accrual Payroll** | `20,000` | N/A | N/A | N/A | `20,000` |
| **Payroll Variance (Accrual − Cash)** | `+6,000` | N/A | N/A | N/A | N/A |
| **Cash Expenses (Non-Payroll)** | `4,000` | `4,000` *(excl. payroll)* / `18,000` *(totalOutflow)* | `0` | `18,000` *(totalOutflow)* | N/A |
| **Accrual Expenses (Non-Payroll)** | `13,000` | N/A | N/A | N/A | `33,000` *(13,000 non-payroll + 20,000 payroll)* |
| **Expense Variance (Accrual − Cash)** | `+9,000` | N/A | N/A | N/A | N/A |
| **Net Result / Cash Flow** | Accrual Net: `-7,950` *(25,050 - 13,000 - 20,000)* | `-1,000` *(17,000 - 18,000)* | `+50` | `-8,000` *(10,000 - 18,000)* | `-1,400` *(31,600 - 33,000)* |

---

## 2. CRITICAL DEFECTS IN `ReconciliationBridge` & ITS INTEGRATION

1. **[P0] Cross-Engine Value Contradiction on the Same BI Screen (`PROVEN_RUNTIME`):**
   - When the user views Tab 1 (`Executive`) in `ACCRUAL + EXPERT`, `BIExecutiveKpis` KPI-01 (`Chiffre d'Affaires`) renders **`31,600 HTG`** (`AnalyticsEngine`), while `ReconciliationBridge` directly below renders `Engagé (Accrual)` = **`25,050 HTG`** (`AccrualBasisEngine`) — a **`6,550 HTG` unexplainable variance** caused by `AccrualBasisEngine` summing raw USD `50` without FX normalization!
   - Simultaneously, `ReconciliationBridge` states `Constaté (Cash)` Revenue = **`10,050`**, diverging from both `AnalyticsEngine("CASH")` (**`10,000`**) and `CashBasisEngine` / `useCashBasisSnapshot` (**`17,000 HTG` + `50 USD`**) because `AccrualBasisEngine` does not ingest CRM `invoices` and performs raw USD+HTG addition.

2. **[P0/P1] Hardcoded False AI CFO Analysis (`src/components/analytics/ReconciliationBridge.tsx:82`, `PROVEN_STATIC`):**
   - Line `82` unconditionally renders:
     > *"« {reconciliation.variancePayroll.toLocaleString()} {currency} d'écart net entre salaires engagés et décaissés. Votre encours créances (AR) dépasse vos dettes fournisseurs (AP), maintenant un fonds de roulement solide. »"*
   - This assertion is **completely hardcoded** and never compares `accountsReceivable` vs `accountsPayable` or `varianceRevenue` vs `varianceExpenses`. If `AP > AR` (negative working-capital timing), the component falsely reassures executives that receivables exceed payables.

3. **[P1] Unconditional Static `"RÉCONCILIÉ (SSOT)"` Badge (`src/components/analytics/ReconciliationBridge.tsx:28-31`, `PROVEN_STATIC`):**
   - The green badge `"RÉCONCILIÉ (SSOT)"` renders unconditionally whenever `snapshot !== null`, performing zero mathematical equality check (`cash + variance === accrual`, FX completeness, or subledger vs GL tie-out). Contrast this with `FinancialReconciliationBridge.tsx:34-55`, which actually inspects `quality: 'COMPLETE' | 'PARTIAL' | 'INCOMPLETE'`, though `FinancialReconciliationBridge` is not mounted in `BusinessIntelligence.tsx`.

4. **[P1] Accounting Basis & Currency Leakage (`BusinessIntelligence.tsx:403-407`, `PROVEN_STATIC`):**
   - Line `403`: `{(uiState.accountingBasis === "ACCRUAL" || !uiState.isSimplifiedMode) && (...)}` renders the Accrual-sourced `ReconciliationBridge` even when `accountingBasis === "CASH"` and `presentationMode === "EXPERT"`.
   - Line `405`: Passes `currency={execFilters.currency || "HTG"}` to `ReconciliationBridge`, so setting `execFilters.currency = "USD"` re-labels raw HTG/mixed numbers as `"USD"` without converting them.
