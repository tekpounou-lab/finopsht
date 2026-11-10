# FINOPS — BI-P1.7.2.3 PAYROLL DOUBLE-COUNT ANALYSIS

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.3 — Independent Financial Data Population & KPI Semantic Verification  
**Role:** Independent Principal Financial Data Architect, Senior Accounting Auditor, Payroll Reconciliation Specialist and QA Authority  
**Mode:** STRICT READ-ONLY — SOURCE-TO-SNAPSHOT FINANCIAL RECONCILIATION  
**Date:** November 2026  

---

## 1. PAYROLL LIFECYCLE TRACEABILITY

```text
[Payroll Calculation] ──► [PayrollRecord] ──► [Sealed / Approved]
                                                    │
                                                    ▼
[Snapshot Accrual Cost] ◄── [AnalyticsEngine] ◄── [AccountingEngine Posting]
       │                                            │
       ▼                                            ▼
[Gross + Employer Taxes]                    [GL Payroll Transaction]
                                                    │
                                                    ▼
                                            [Bank Settlement] ──► [Cash Outflow]
```

1. **Calculation & Subledger:** `PayrollCalculationEngine` derives gross pay, employee deductions (ONA, OFATMA, IRI), and employer statutory contributions (ONA 3–6%, OFATMA 2–6%). Records created in `PayrollRecord`.
2. **Approval & Sealing:** Cycle status changes from `DRAFT` to `SEALED` / `APPROVED`.
3. **GL Posting:** `AccountingEngine` posts double-entry entries:
   - Debit `5000_PAYROLL_EXPENSE` (Gross Salary)
   - Debit `5110_EMPLOYER_TAX_EXPENSE` (Employer ONA/OFATMA)
   - Credit `2100_PAYROLL_CLEARING` / `2110_TAXES_PAYABLE`
4. **Disbursement & Settlement:** Cash/bank payment credits Treasury (`1010_BANK`) and debits Liability (`2100_PAYROLL_CLEARING`).

---

## 2. ANTI-DOUBLE-COUNTING MECHANISM (P0 CONTROL)

In `AnalyticsEngine.ts`:

- Helper `isPayrollRelatedTransaction(t)` (lines 366–368) identifies General Ledger payroll entries based on debit accounts (`5000_PAYROLL_EXPENSE`, `5110_EMPLOYER_TAX_EXPENSE`), transaction types (`PAYROLL`, `BONUS`), or keywords.
- When `AnalyticsEngine.computeOperationalExpenses()` computes non-payroll operating expenses, `includePayrollTransactions = false` is passed (lines 869–872):
  ```typescript
  if (!includePayrollTransactions && isPayrollRelatedTransaction(t)) {
    return false; // Strips GL payroll entries from non-payroll expenses!
  }
  ```
- In `generateSnapshot` (lines 1660–1662):
  ```typescript
  accrualCurExpenses = curNonPayrollExp + (curGlPayrollExp > 0 ? curGlPayrollExp : curPayrollCost);
  ```
  - If GL payroll transactions are posted (`curGlPayrollExp > 0`), the GL payroll amount is used.
  - If GL payroll transactions are NOT posted, `curPayrollCost` from sealed `PayrollRecord`s is used.
  - **Result:** Payroll expense is included EXACTLY ONCE. Double-counting between GL and subledger is strictly prevented.

---

## 3. EVALUATION OF 10 PAYROLL LIFECYCLE STATES

| # | Payroll State | ACCRUAL Mode Treatment | CASH Mode Treatment | Accounting Classification | Evidence Category |
|---|---|---|---|---|---|
| 1 | Calculated but unsealed (`DRAFT`) | EXCLUDED from subledger payroll cost | EXCLUDED from cash outflows | Unaccrued draft | `STATIC_SOURCE` |
| 2 | Sealed but unpaid (`SEALED`) | INCLUDED in accrual expenses (Gross + Employer Taxes) | EXCLUDED (0 cash disbursed) | Accrued Employment Expense & Outstanding Liability | `STATIC_SOURCE` |
| 3 | Partially paid | INCLUDED in accrual expenses (Prorated cycle) | INCLUDED (Actual paid net amount) | Accrued Expense & Partial Liability Settlement | `STATIC_SOURCE` |
| 4 | Fully paid | INCLUDED in accrual expenses | INCLUDED (Full net pay + tax remittance) | Accrued Expense & Fully Settled Liability | `STATIC_SOURCE` |
| 5 | Paid in later reporting period | Accrued in period 1; 0 expense in period 2 | 0 outflow in period 1; Cash outflow in period 2 | Timing difference (Liability Settlement) | `STATIC_SOURCE` |
| 6 | Payroll reversal (`CANCELLED` / `VOID`) | EXCLUDED (Filtered out by status check) | EXCLUDED | Voided transaction | `STATIC_SOURCE` |
| 7 | Payroll correction / adjustment | Adjusted gross/tax included in accrual expense | Adjusted cash disbursement included | Accrual & Cash adjustment | `STATIC_SOURCE` |
| 8 | Employer social contributions (ONA/OFATMA) | INCLUDED in `curPayrollCost` / GL expense | Included when tax liability is remitted to state | P&L Expense & Statutory Tax Liability | `STATIC_SOURCE` |
| 9 | Employee tax & social deductions (IRI/ONA) | Included within Gross Salary (P&L expense) | Deducted from Net Pay; remitted to state | Pass-through withholding liability (No separate P&L expense) | `STATIC_SOURCE` |
| 10 | Employee advance settlement | Deducted from Net Pay; reduces Class 13 advance asset | Reduces net cash paid to employee | Asset recovery (Receivable settlement) | `STATIC_SOURCE` |

---

## 4. SALARY COMPONENTS & CUMULATIVE LIABILITY LIMITATION

1. **Salary Component Definitions:**
   - **Gross Salary:** Total salary earned by employee before employee deductions.
   - **Net Pay:** Gross salary minus employee deductions (ONA 6%, OFATMA 1%, IRI tax).
   - **Total Employer Cost:** Gross Salary + Employer Statutory Contributions (ONA 3–6%, OFATMA 2–6%).
2. **Documented Limitation:**
   - The snapshot computes period employment expense and period cash disbursements.
   - However, without persistent opening and closing balance-sheet liability accounts for payroll in the snapshot model, **cumulative payroll liability reconciliation cannot be established at runtime** in the BI view alone.

---

## 5. AUDIT VERDICT

- **Double-Count Protection Logic:** `VERIFIED (STATIC_SOURCE)`.
- **Cumulative Liability Reconciliation:** `NOT VERIFIED (LIMITATION DOCUMENTED)`.
