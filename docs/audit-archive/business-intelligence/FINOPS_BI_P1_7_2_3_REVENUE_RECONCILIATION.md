# FINOPS — BI-P1.7.2.3 REVENUE RECONCILIATION

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.3 — Independent Financial Data Population & KPI Semantic Verification  
**Role:** Independent Principal Financial Data Architect, Senior Accounting Auditor, Payroll Reconciliation Specialist and QA Authority  
**Mode:** STRICT READ-ONLY — SOURCE-TO-SNAPSHOT FINANCIAL RECONCILIATION  
**Date:** November 2026  

---

## 1. REVENUE RECONSTRUCTION PIPELINE & RULES

In `AnalyticsEngine.ts` (`src/domains/analytics/services/AnalyticsEngine.ts`, lines 1514–1540), revenue is calculated using mode-aware logic:

1. **ACCRUAL Mode:**
   - Filters transactions using `isIncomeTx(t)` (lines 1408–1467):
     - **Status Check:** Excludes `REVERSED`, `VOID`, `VOIDED`, `CANCELLED`, or `is_reversed`.
     - **Payroll Exclusion:** Excludes payroll-related entries unless category is explicitly `PAYROLL_RECOVERY`, `REPAYMENT`, or `RECOUVREMENT`.
     - **Type Exclusion:** Excludes `EXPENSE`, `PAYROLL`, `TRANSFER`, `EXCHANGE`, `ADVANCE`, `PENALTY`, `BONUS`, `COMPENSATION`, `CORRECTION`, `ADJUSTMENT`, `REFUND`.
     - **Credit Account Check:** Excludes debits/credits to Class 2 (Liabilities), Class 5/6 (Expenses), Class 42–49 (Payroll/Tax Clearing), `ONA`, `OFATMA`.
     - **Inclusion Criteria:** Includes `type === 'INCOME'`, `'REVENUE'`, `'SALES'`, `'VENTE'`, `'VENTES'`, `'CREDIT'`, category containing income keywords, or `credit_account` starting with `40`/`41` (AR) or `7` (Revenue).
   - **Rule DEF-9B-05 (Strict Revenue Semantics):** Revenue originates *strictly* from posted General Ledger Income transactions (or cash inflows in cash mode). Commercial employee sales (`sales_cents` on payroll records) represent commercial attribution for commissions and productivity, NOT recognized company revenue. If posted GL income is zero, accounting revenue is `0.00` (NO FALLBACK to payroll sales).

2. **CASH Mode:**
   - Evaluates `CanonicalCashEngine.executePipeline()` using `LedgerCashAdapter.ts`.
   - Requires an explicit Treasury debit leg (Class 10 `1000_CASH` / `1010_BANK`) and non-treasury credit leg.
   - Non-revenue cash receipts (transfers, borrowings, refunds, payroll clearing) are strictly excluded via `DEF-CASH-01`.

---

## 2. SOURCE-TO-SNAPSHOT RECONCILIATION FLOW

```text
Source Transactions (ledger_transactions)
       │
       ▼
Eligibility Filter (isIncomeTx / Treasury Debit Check)
       │
       ▼
Currency Normalization (NormalizedAmountResolver.resolveToHTG)
       │
       ▼
Period & Scope Filter (matchesBusiness, DateRange overlap)
       │
       ▼
AnalyticsEngine Revenue Calculation (curRevVal)
       │
       ▼
Displayed KPI (totalRevenue / Card 1)
```

---

## 3. CASH INFLOW VS ACCRUAL REVENUE CLASSIFICATION

| Transaction Scenario | Cash Movement | Accrual Income | Included in ACCRUAL Revenue? | Included in CASH Revenue? | Classification Rationale | Evidence Category |
|---|---|---|---|---|---|---|
| Direct Cash Sales | Inflow | Revenue | YES | YES | Creates both cash inflow and P&L revenue. | `STATIC_SOURCE` |
| Credit Invoice Issued | None | Revenue | YES | NO | P&L revenue recognized on accrual date; no immediate cash. | `STATIC_SOURCE` |
| Customer Invoice Settlement | Inflow | Balance Sheet | NO | YES (Inflow) | Settles Accounts Receivable (Class 41); Cash inflow, not new P&L revenue. | `STATIC_SOURCE` |
| Customer Advance Received | Inflow | Liability | NO | NO (Excluded by DEF-CASH-01) | Unearned revenue liability (Class 2); not operating revenue. | `STATIC_SOURCE` |
| Customer Refund Issued | Outflow | Revenue Reduction | NO (Reduces Income) | Outflow | Contra-revenue adjustment; reduces cash/revenue. | `STATIC_SOURCE` |
| Internal Cash Transfer | Treasury Transfer | None | NO | NO | Balance sheet treasury movement (Class 10 to Class 10). | `STATIC_SOURCE` |

---

## 4. LIMITATION & AUDIT VERDICT

- **Code Logic:** `VERIFIED (STATIC_SOURCE)`.
- **Runtime Dataset Population:** `NOT VERIFIED (RUNTIME DATASET)` due to read-only environment constraints preventing live database queries.
