# FINOPS — BI-P1.7.2.3 KPI SEMANTIC REVIEW

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.3 — Independent Financial Data Population & KPI Semantic Verification  
**Role:** Independent Principal Financial Data Architect, Senior Accounting Auditor, Payroll Reconciliation Specialist and QA Authority  
**Mode:** STRICT READ-ONLY — SOURCE-TO-SNAPSHOT FINANCIAL RECONCILIATION  
**Date:** November 2026  

---

## 1. KPI FORMULA & INCLUSION ANALYSIS

In `AnalyticsEngine.ts` (lines 1746–1749):

```typescript
// Current Implementation Equation
curProfitVal = curRevVal - totalCurExpenses;
```

Where:
- `curRevVal`: Total recognized General Ledger Revenue (Class 7).
- `totalCurExpenses`: Non-payroll General Ledger OPEX (Class 5) + Total Employment Cost (Gross Salary + Employer ONA/OFATMA statutory contributions).

---

## 2. ACCOUNTING POPULATION INCLUSION & EXCLUSION EVALUATION

| Accounting Category | Included in Formula? | Financial Description |
|---|---|---|
| Operating Revenues (Sales, Services) | **INCLUDED** | Primary operating turnover |
| Non-Payroll Operating Expenses (Rent, Utilities, Supplies) | **INCLUDED** | Class 5 operating expenses |
| Gross Salaries & Wages | **INCLUDED** | Direct compensation expense |
| Employer Social Contributions (ONA, OFATMA) | **INCLUDED** | Statutory payroll taxes paid by employer |
| Depreciation & Amortization (D&A) | **EXCLUDED** | Non-cash fixed asset allocation |
| Financial Income & Interest Expense | **EXCLUDED** | Bank interest, loan financing costs |
| Corporate Income Tax / Corporate Tax Provisions | **EXCLUDED** | State tax on profits |
| Extraordinary / Non-Operating Gains & Losses | **EXCLUDED** | Asset sales, foreign currency gains/losses |

---

## 3. ACCOUNTING CLASSIFICATION BENCHMARK

Evaluating the current formula against standard accounting metrics:

| Metric Definition | Formula | Formula Match Status | Classification Findings |
|---|---|---|---|
| Gross Profit | Revenue - Cost of Goods Sold (COGS) | **NO MATCH** | Excludes general OPEX, which is included here. |
| **Operating Result / EBIT** | **Revenue - Operating Expenses (OPEX + Payroll)** | **EXACT MATCH** | **The current formula computes Operating Result / EBIT.** |
| EBITDA | Operating Result + D&A | **PARTIAL MATCH** | Matches EBIT because D&A is excluded from OPEX. |
| Profit Before Tax (EBT) | Operating Result + Financial Income - Financial Expense | **NO MATCH** | Excludes financial income/expenses. |
| Net Income After Tax (Net Profit) | EBT - Income Taxes | **NO MATCH** | Excludes interest, taxes, and non-operating items. |

---

## 4. AUDIT FINDING & SEMANTIC MISMATCH DISCLOSURE

- **Finding Code:** `KPI_SEMANTIC_MISMATCH`.
- **UI Label:** `"Bénéfice net réalisé"` (`tbi.netProfit`).
- **Actual Accounting Metric:** **Operating Result (Résultat d'Exploitation) / EBIT**.
- **Audit Conclusion:** The UI label `"Bénéfice net réalisé"` is semantically inaccurate because the underlying calculation computes Operating Result prior to interest, depreciation, amortization, and income taxes.
- **Action in Phase BI-P1.7.2.3:** Per STRICT READ-ONLY scope rules, **no code, formula, or label change is performed in this turn**. The finding is documented for future business policy decision (BD-ACC-05).
