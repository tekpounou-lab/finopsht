# FINOPS — BI-P1.7.2.3 CASH VS ACCRUAL RECONCILIATION

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.3 — Independent Financial Data Population & KPI Semantic Verification  
**Role:** Independent Principal Financial Data Architect, Senior Accounting Auditor, Payroll Reconciliation Specialist and QA Authority  
**Mode:** STRICT READ-ONLY — SOURCE-TO-SNAPSHOT FINANCIAL RECONCILIATION  
**Date:** November 2026  

---

## 1. DUAL ACCOUNTING PERSPECTIVE ARCHITECTURE

FINOPS ERP supports two independent accounting perspectives managed by the `actualAccountingMode` flag in `AnalyticsEngine.ts`:

```text
               ┌─────────────────────────────────────────┐
               │    EXECUTIVE ACCOUNTING MODE FILTER     │
               └────────────────────┬────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌──────────────────────┐                          ┌──────────────────────┐
│     ACCRUAL MODE     │                          │      CASH MODE       │
│  (AnalyticsEngine)   │                          │ (CanonicalCashEngine)│
├──────────────────────┤                          ├──────────────────────┤
│ • Recognized Revenue │                          │ • Cash Inflows       │
│ • Operating Expense  │                          │ • Cash Outflows      │
│ • Net Operating Profit│                         │ • Net Cash Variation │
└──────────────────────┘                          └──────────────────────┘
```

---

## 2. COMPARATIVE RECONCILIATION MATRIX

| Dimension | ACCRUAL Accounting Perspective | CASH Accounting Perspective | Legitimate Accounting Variance Cause | Evidence Category |
|---|---|---|---|---|
| Primary Objective | Economic performance & profitability | Liquidity, solvency & cash flow tracking | Timing of cash settlement | `STATIC_SOURCE` |
| Inflow / Income Driver | Recognized GL Revenue (`isIncomeTx`) | Actual cash/bank deposits (`Inflow`) | Credit sales / Accounts Receivable | `STATIC_SOURCE` |
| Outflow / Expense Driver | Recognized GL OPEX + Payroll Cost | Actual cash/bank disbursements (`Outflow`) | Unpaid supplier bills / Unpaid payroll | `STATIC_SOURCE` |
| Payroll Treatment | Gross Salary + Employer Statutory Taxes | Net Salary paid to employees + Tax remittances | Outstanding payroll liabilities | `STATIC_SOURCE` |
| Supplier Expense | Recognized on bill/invoice receipt | Recognized on cash payment | Accounts Payable accrual | `STATIC_SOURCE` |
| Customer Advances | Recorded as Deferred Income (Liability) | Recorded as Cash Inflow | Unearned revenue | `STATIC_SOURCE` |
| Employee Advances | Recorded as Asset Loan (Class 13) | Recorded as Cash Outflow | Asset creation vs cash disbursement | `STATIC_SOURCE` |
| Treasury Transfers | Zero P&L impact | Eliminated from Net Cash Flow | Intra-company balance sheet movements | `STATIC_SOURCE` |

---

## 3. TIMING DIFFERENCE EXPLANATION EQUATION

```text
Net Operating Result (Accrual) 
   + Non-Cash Expenses (Depreciation, Provisions)
   + Decrease in Accounts Receivable (Customer Collections)
   - Increase in Accounts Receivable (Uncollected Credit Sales)
   + Increase in Accounts Payable (Unpaid Supplier Bills)
   - Decrease in Accounts Payable (Supplier Payments)
   + Increase in Payroll Liabilities (Unpaid Salaries / Statutory Taxes)
   - Decrease in Payroll Liabilities (Payroll Disbursement)
─────────────────────────────────────────────────────────────
 = Net Cash Variation (Cash Flow)
```

---

## 4. AUDIT VERDICT

- **Dual-Perspective Separation:** `VERIFIED (STATIC_SOURCE)`.
- **Runtime Dataset Population:** `NOT VERIFIED (RUNTIME DATASET)` due to read-only environment constraints preventing live database queries.
