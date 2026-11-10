# FINOPS — BI-P1.7.2.2
# FORMULA & LINEAGE MATRIX

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.2  
**Date:** 2026-11-08  
**Mode:** STRICT READ-ONLY — SOURCE-TO-UI FORENSIC VERIFICATION  

---

## 1. COMPREHENSIVE FINANCIAL FORMULA LINEAGE MATRIX

| Metric Name | Source Dataset | Inclusion Criteria | Exclusion Criteria | Sign Convention | Currency Normalization | Date & Timezone Boundaries | Reversal & Transfer Handling | Payroll & Tax Treatment | Null / Empty Data Handling |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Total Revenue ($R$)** | `LedgerTransaction` collection | `type === "INCOME"` or `type === "REVENUE"`; settled cash inflows in CASH mode | `type === "EXPENSE"`, `TRANSFER`, `EXCHANGE`, `ADVANCE`; void/reversed entries | Always positive ($+$) absolute value | Multi-currency normalized to HTG base via `NormalizedAmountResolver` | `toDateOnly(tx.date)` matching `startDate` to `endDate` in `America/Port-au-Prince` | `status === "REVERSED" \|\| "VOID" \|\| "CANCELLED"` strictly excluded | Non-payroll GL revenue | Returns `0` if empty; `null` if uninitialized |
| **Total Expenses ($E$)** | `LedgerTransaction` & `PayrollRecord` collections | `type === "EXPENSE"`, `PAYROLL`, `BONUS`, `COMPENSATION`; cash outflows in CASH mode | `type === "INCOME"`, `TRANSFER`, `EXCHANGE`, `ADVANCE`; Class 2 & 10 debits | Positive expense magnitude ($+$) subtracted from revenue | Multi-currency normalized to HTG base via `NormalizedAmountResolver` | `toDateOnly(tx.date)` or prorated payroll cycle dates | Class 2 liability settlements & Class 10 treasury transfers excluded; reversals excluded | Prorated Gross + Employer ONA/OFATMA social taxes in ACCRUAL mode | Returns `0` if empty; `null` if uninitialized |
| **Realized Net Profit ($P$)** | Derived SSOT Metric | Defined as $P = R - E$ | N/A | Positive ($+$) if $R > E$; Negative ($-$) if $R < E$ | Inherits base currency HTG | Matches reporting period date range | N/A (Derived from $R$ and $E$) | Fully includes payroll in $E$ | Returns `0` if $R=0$ and $E=0$; `null` if inputs null |
| **Net Profit Margin (%)** | Derived SSOT Metric | Defined as $\left(\frac{P}{R}\right) \times 100$ | Undefined if $R \le 0$ | Percentage (%) | Currency invariant | Matches reporting period | N/A | Fully reflects net profit | Returns `null` if $R \le 0$ |
| **Branch Revenue & Expenses** | Scoped `LedgerTransaction` & `PayrollRecord` | `branchId === selectedBranchId` or matching branch name | Transactions assigned to other branches | Inherits standard GL sign convention | Base currency HTG | Filter date range | Reversals and transfers excluded | Prorated by employee branch assignment | Returns `0` for empty branches |
| **Department Revenue & Expenses** | Scoped `LedgerTransaction` & `PayrollRecord` | `departmentId === selectedDeptId` or matching dept alias | Transactions assigned to other departments | Inherits standard GL sign convention | Base currency HTG | Filter date range | Reversals and transfers excluded | Prorated by employee department assignment | Returns `0` for empty departments |

---

## 2. ACCOUNTING MEASURE CLASSIFICATION

- **Realized Net Profit Semantics:** The system calculates **Operating Result** (*Résultat net d'exploitation*) before non-operating items, interest, taxes, and depreciation/amortization (D&A).
- **EBITDA Classification:** Explicitly deprecated to `undefined` (per DEF-9C-05) because fixed asset depreciation subledgers are not implemented.
