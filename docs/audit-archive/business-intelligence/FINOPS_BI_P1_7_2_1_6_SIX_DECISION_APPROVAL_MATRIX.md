# FINOPS — BI-P1.7.2.1.6
# SIX DECISION APPROVAL MATRIX

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.1.6  
**Date:** 2026-11-08  
**Mode:** STRICT READ-ONLY — EXTERNAL GOVERNANCE EVIDENCE INTAKE  
**Baseline:** BI-P1.7.2.1.5  

---

## 1. DECISION REGISTER & EVALUATION MATRIX

| Decision ID | Decision Title & Scope | Exact Proposed Decision Wording | Approver Identity / Role | Evidence Reference | Approval Date | Scope | Decision Status | Reviewer Assessment |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BD-ACC-01** | AR Metric Definition & Presentation | Present AR as in-period timing variance (`Accrual Revenue - Cash Revenue`) labeled *"Variance Temporelle des Produits"* with UI tooltip disclosure | Unassigned / Awaiting Owner Response | None | None | Global | **NOT PROVIDED / PENDING** | No attributable sign-off form submitted |
| **BD-ACC-02** | AP Metric Definition & Presentation | Present AP as in-period timing variance (`Accrual Expenses - Cash Expenses`) labeled *"Variance Temporelle des Charges"* with UI tooltip disclosure | Unassigned / Awaiting Owner Response | None | None | Global | **NOT PROVIDED / PENDING** | No attributable sign-off form submitted |
| **BD-ACC-03** | Payroll Accrual-to-Cash Timing Variance & Liability | Model B: Sealing registers payroll liability (`2100`); cash payout requires `payrollRunId` foreign key to settle liability against treasury (`1000/1010`) | Unassigned / Awaiting Owner Response | None | None | Global | **NOT PROVIDED / PENDING** | No attributable sign-off form submitted |
| **BD-ACC-04** | Authoritative Payroll-related GL Classification | Model C: Primary guardrail via COA `64xx` account codes and category tags; description keyword regex demoted to secondary audit flags | Unassigned / Awaiting Owner Response | None | None | Global | **NOT PROVIDED / PENDING** | No attributable sign-off form submitted |
| **BD-ACC-05** | EBITDA / Operating Result Presentation Semantics | Operating Result (*Résultat net d'exploitation*) is canonical; EBITDA remains explicitly `undefined` pending fixed asset D&A subledgers | Unassigned / Awaiting Owner Response | None | None | Global | **NOT PROVIDED / PENDING** | No attributable sign-off form submitted |
| **BD-ACC-06** | FX Policy & Missing Historical Rate Behavior | Option A/C: Historical financial normalization utilizes date-specific BRH grids. Missing historical rates fail closed (`incompleteData: true`). Silent fallback prohibited | Unassigned / Awaiting Owner Response | None | None | Global | **NOT PROVIDED / PENDING** | No attributable sign-off form submitted |

---

## 2. DECISION STATUS SUMMARY

- Total Decisions Evaluated: 6
- Decisions Approved: 0
- Decisions Rejected: 0
- Decisions Deferred: 0
- Decisions Pending / Not Provided: 6
- Overall Approval Status: **`ALL 6 DECISIONS REMAIN PENDING`**
