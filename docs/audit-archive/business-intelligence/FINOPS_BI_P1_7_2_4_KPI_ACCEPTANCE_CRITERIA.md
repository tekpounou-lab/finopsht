# FINOPS — BI-P1.7.2.4 KPI ACCEPTANCE CRITERIA

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.4 — P0 KPI Semantic Correction & FX Policy Remediation Readiness  
**Role:** Independent Principal Financial Data Architect, Accounting Policy Analyst, FX Governance Specialist and Senior QA Authority  
**Mode:** STRICT READ-ONLY — REMEDIATION READINESS AND DECISION CONTROL  
**Date:** November 2026  

---

## 1. REMEDIATION ACCEPTANCE CRITERIA SPECIFICATION

The following 10 measurable acceptance criteria define the validation requirements for any authorized implementation phase addressing `P0-A: KPI_SEMANTIC_MISMATCH`.

---

## 2. MEASURABLE ACCEPTANCE MATRIX

| Criterion ID | Requirement / Rule | Verification Method | Target Expected Result | Pass / Fail Boundary |
|---|---|---|---|---|
| `AC-KPI-01` | **Label Accuracy:** Displayed UI label matches underlying formula. | Visual UI Inspection & DOM assertions | Label reads `"Résultat d'exploitation"` or `"Résultat opérationnel"` (Option A) in ACCRUAL mode. | Reject `"Bénéfice net réalisé"` when formula is $R - E$. |
| `AC-KPI-02` | **Tooltip Disclosure:** Hover tooltip explicitly explains formula and exclusions. | UI Tooltip Hover Inspection | Tooltip states: `Formule SSOT: Recettes (R) - Dépenses (E). Exclut amortissements, intérêts et impôts sur les sociétés.` | Reject missing or inaccurate tooltips. |
| `AC-KPI-03` | **Explicit Mode Semantics:** ACCRUAL and CASH mode labels are distinct. | Mode Switch Verification in UI | ACCRUAL = `"Résultat d'exploitation"`; CASH = `"Variation de trésorerie"`. | Reject shared or ambiguous mode labels. |
| `AC-KPI-04` | **Executive Consistency:** All BI dashboard components use identical definitions. | Cross-Component DOM Inspection | Executive KPI Grid, PIC, and Branch/Dept sections display identical values and titles. | Reject label divergence across cards. |
| `AC-KPI-05` | **Export Consistency:** PDF, Excel, and CSV exports use updated labels. | File Export Parsing | Exported headers contain `"Résultat d'exploitation"`. | Reject legacy `"Bénéfice Net"` in export columns. |
| `AC-KPI-06` | **Zero vs. Empty Disambiguation:** Zero profit distinguished from missing data. | Boundary Dataset Testing | Unfiltered zero-revenue/zero-expense displays `0 HTG`; missing branch data displays `N/D`. | Reject `N/D` for valid zero calculation. |
| `AC-KPI-07` | **Currency & Period Visibility:** Currency code and filter range clearly shown. | UI Card Inspection | Card displays `HTG` badge and filter date range subtitle. | Reject unbadged currency values. |
| `AC-KPI-08` | **Historical Invariance:** Historical calculation formulas remain mathematically intact. | Automated Snapshot Comparison | Historical $R - E$ calculation outputs remain 100% identical. | Reject changes to historical $R - E$ result numbers. |
| `AC-KPI-09` | **Automated Test Coverage:** Independent unit tests verify label and formula. | Vitest Suite Execution | 100% pass rate on `BIDataAggregationSSOT.test.ts` and `AccrualBasisEngine.test.ts`. | Reject unverified formula changes. |
| `AC-KPI-10` | **No Misleading Terminology:** Term `"Net Profit"` removed from Operating Result cards. | String Inspection across UI | Term `"Net Profit"` / `"Bénéfice Net"` removed from Operating Result UI text. | Reject misleading net profit terminology. |
