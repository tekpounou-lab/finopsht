# FINOPS — BI-P1.7.2.3 EXPENSE RECONCILIATION

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.3 — Independent Financial Data Population & KPI Semantic Verification  
**Role:** Independent Principal Financial Data Architect, Senior Accounting Auditor, Payroll Reconciliation Specialist and QA Authority  
**Mode:** STRICT READ-ONLY — SOURCE-TO-SNAPSHOT FINANCIAL RECONCILIATION  
**Date:** November 2026  

---

## 1. EXPENSE CATEGORIZATION FRAMEWORK

Expense reconciliation in FINOPS ERP strictly segregates operations across four distinct accounting categories:

```text
       ┌────────────────────────────────────────────────────────┐
       │                 FINANCIAL DISBURSEMENTS                │
       └───────────────────────────┬────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  A. P&L EXPENSE  │      │   B. LIABILITY   │      │C. BALANCE SHEET  │
│   RECOGNITION    │      │    SETTLEMENT    │      │     TRANSFER     │
│ (Class 5 Debits) │      │ (Class 2 Debits) │      │ (Class 10 / 13)  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

1. **Category A — P&L Expense Recognition:** Operating expenses debited to Class 5 accounts (`5000_PAYROLL_EXPENSE`, `5110_EMPLOYER_TAX_EXPENSE`, `5200_RENT_EXPENSE`, etc.). Included in Accrual Expenses.
2. **Category B — Liability Settlement:** Payments debiting Class 2 liability accounts (e.g. `2100_ONA_TAXES_PAYABLE`, `2000_ACCOUNTS_PAYABLE`). Reduces cash and liability; **EXCLUDED from P&L operating expense** via `isLiabilitySettlementTransaction()`.
3. **Category C — Balance Sheet Transfer:** Treasury transfers debiting Class 10 cash/bank or Class 13 employee advances. **EXCLUDED from P&L operating expense** via `isTreasuryTransferTransaction()`.
4. **Category D — Cash Disbursement:** Actual treasury outflows (Class 10 credits) in CASH mode (`CanonicalCashEngine`).

---

## 2. RECONCILIATION MATRIX BY EXPENSE TYPE

| Expense Category / Source | Source Entity | ACCRUAL Mode Treatment | CASH Mode Treatment | Anti-Double Count Rule | Evidence Category |
|---|---|---|---|---|---|
| Operational GL Expenses | `LedgerTransaction` | Included in `curNonPayrollExp` | Included if settled via Treasury credit leg | Filtered via `computeOperationalExpenses(includePayroll=false)` | `STATIC_SOURCE` |
| Supplier Invoice Settlements | `LedgerTransaction` | Expenses recognized on invoice date; settlement debiting AP excluded from P&L. | Included as `SUPPLIER_PAYMENT` cash outflow | Disambiguated in `isLiabilitySettlementTransaction()` | `STATIC_SOURCE` |
| Payroll Employment Cost | `PayrollRecord` | Included in `curPayrollCost` (Gross + Employer Taxes) | Included as `PAYROLL_NET_DISBURSEMENT` when paid | GL payroll entries filtered when computing non-payroll OPEX | `STATIC_SOURCE` |
| Statutory Tax Remittances (ONA/OFATMA) | `LedgerTransaction` | Accrued in payroll cost / GL; tax settlement debiting Class 2 liability excluded from P&L. | Included as `STATUTORY_TAX_REMITTANCE` cash outflow | Disambiguated in `isLiabilitySettlementTransaction()` | `STATIC_SOURCE` |
| Employee Advance Disbursements | `LedgerTransaction` | EXCLUDED from P&L (Debits Class 13 Asset) | Included as `ADVANCE_DISBURSEMENT` cash outflow | Disambiguated in `isPayrollExpenseTransaction()` (check 3) | `STATIC_SOURCE` |
| Internal Till / Safe Transfers | `LedgerTransaction` | EXCLUDED from P&L (Treasury Transfer) | Excluded from Net Cash Flow via transfer elimination | Disambiguated in `isTreasuryTransferTransaction()` | `STATIC_SOURCE` |
| Till Closure Discrepancies | `LedgerTransaction` | EXCLUDED from P&L (Operational Risk Variance) | Excluded from cash outflows | Filtered out in `computeOperationalExpenses()` | `STATIC_SOURCE` |

---

## 3. FORMULA & RECONCILIATION EQUATION

In `AnalyticsEngine.ts` (lines 1660–1673):

```typescript
// Total Accrual Expenses Equation
accrualCurExpenses = curNonPayrollExp + (curGlPayrollExp > 0 ? curGlPayrollExp : curPayrollCost);
```

- `curNonPayrollExp`: Non-payroll General Ledger operating expenses.
- `curGlPayrollExp`: Posted General Ledger payroll expenses (if available).
- `curPayrollCost`: Subledger payroll cost from sealed `PayrollRecord`s (Gross Salary + Employer ONA/OFATMA) used when GL payroll transactions are not posted.

---

## 4. LIMITATION & AUDIT VERDICT

- **Code Architecture & Formulas:** `VERIFIED (STATIC_SOURCE)`.
- **Runtime Dataset Population:** `NOT VERIFIED (RUNTIME DATASET)` due to read-only environment constraints preventing live database queries.
