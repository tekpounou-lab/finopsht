# FINOPS — BI-P1.7.2.4 KPI SEMANTIC DECISION BRIEF

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.4 — P0 KPI Semantic Correction & FX Policy Remediation Readiness  
**Role:** Independent Principal Financial Data Architect, Accounting Policy Analyst, FX Governance Specialist and Senior QA Authority  
**Mode:** STRICT READ-ONLY — REMEDIATION READINESS AND DECISION CONTROL  
**Date:** November 2026  

---

## 1. PURPOSE AND ISSUANCE

This Decision Brief presents the formal business alternatives for resolving finding `P0-A: KPI_SEMANTIC_MISMATCH` regarding the UI display label `"Bénéfice net réalisé"` (`tbi.netProfit`).

The current formula calculates **Operating Result (Résultat d'Exploitation) / EBIT** ($R - E$):
- **Included:** Recognized Revenue, Operating Expenses, Gross Salaries, Employer Statutory Taxes (ONA/OFATMA).
- **Excluded:** Depreciation & Amortization (D&A), Interest Income/Expense, Corporate Income Tax, Non-Operating Gains/Losses.

Decision Status: **`DECISION METIER REQUISE`** (Awaiting formal Business Owner sign-off for BD-ACC-05).

---

## 2. REMEDIATION ALTERNATIVES COMPARISON

```text
       ┌────────────────────────────────────────────────────────┐
       │              KPI REMEDIATION ALTERNATIVES              │
       └───────────────────────────┬────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│     OPTION A     │      │     OPTION B     │      │     OPTION C     │
│  "Résultat       │      │     "EBIT"       │      │  "Bénéfice Net   │
│  opérationnel"   │      │   (Operating)    │      │  (Full Net Pay)" │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

| Dimension | Option A: Rename to "Résultat opérationnel" | Option B: Rename to "EBIT" | Option C: Full Net Income Calculation |
|---|---|---|---|
| **Accounting Meaning** | Operating Result before interest, tax, D&A | Earnings Before Interest and Taxes | Final Net Profit after D&A, interest, income taxes |
| **Formula Required** | $R - E$ (Unchanged) | $R - E$ (Unchanged) | $R - E - \text{D\&A} \pm \text{Interest} - \text{Taxes}$ |
| **Data Requirements** | Existing data population | Existing data population | Requires new D&A subledgers, loan interest, tax rate tables |
| **UI Label Changes** | Change `"Bénéfice net réalisé"` to `"Résultat d'exploitation"` / `"Résultat opérationnel"` | Change `"Bénéfice net réalisé"` to `"EBIT"` | Retain `"Bénéfice net réalisé"` |
| **Historical Impact** | Historical numbers remain 100% identical; only UI label changes | Historical numbers remain 100% identical; only UI label changes | Historical numbers would change to reflect interest/taxes |
| **Implementation Risk** | **LOW** (UI translation & label update) | **LOW** (UI translation & label update) | **HIGH** (Engine rework & missing subledger dependencies) |
| **Required Approval** | Business Owner approval of BD-ACC-05 (Option A) | Business Owner approval of BD-ACC-05 (Option B) | Business Owner approval of BD-ACC-05 (Option C) + D&A module build |

---

## 3. AUDIT RECOMMENDATION

- **Recommended Path:** **Option A ("Résultat d'exploitation" / "Résultat opérationnel")**.
- **Rationale:** Accurately reflects the existing, verified SSOT formula ($R - E$) without requiring unbuilt D&A or corporate tax modules, eliminating executive misinterpretation while preserving 100% mathematical integrity across historical snapshots.
- **Decision Status:** **`DECISION METIER REQUISE`**.
