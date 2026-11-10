# FINOPS ERP / FINAYITI FUSION
## BI-P1.7.3 — FINANCIAL POLICY APPROVAL REGISTER

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.3 — Business Owner Participation & Financial Policy Sign-Off  
**Document ID:** FINOPS_BI_P1_7_3_FINANCIAL_POLICY_APPROVAL_REGISTER  
**Governance Mode:** STRICT GOVERNANCE DOCUMENT PREPARATION — READ ONLY (NO CODE IMPLEMENTATION)  
**Status:** MASTER REGISTER INITIALIZED — AWAITING HUMAN SIGN-OFF EVIDENCE  

---

## 1. REGISTER OVERVIEW AND GOVERNANCE PURPOSE

This Master Register tracks the formal lifecycle of all accounting policy decisions (`BD-ACC-01` through `BD-ACC-06`) required to unblock software remediation across the FINOPS ERP / FINAYITI FUSION platform.

Each entry reflects the submission date, technical baseline, technical recommendation, human assigned authority, current sign-off status, and code implementation gate status.

---

## 2. MASTER POLICY DECISION MATRIX

| Decision ID | Policy Title | Technical Baseline | Technical Recommendation | Assigned Authority | Submission Date | Policy Status | Implementation Gate |
|---|---|---|---|---|---|---|---|
| **`BD-ACC-01`** | Accounts Receivable (AR) Semantics | Accrual billing model; issued invoices reflect in AR | **Option A** (Standard Accrual AR) | TO BE COMPLETED | 2026-11-09 | `PENDING` | `BLOCKED (NOT AUTHORIZED)` |
| **`BD-ACC-02`** | Accounts Payable (AP) Semantics | Vendor obligations accrued upon approval | **Option A** (Comprehensive Accrual AP) | TO BE COMPLETED | 2026-11-09 | `PENDING` | `BLOCKED (NOT AUTHORIZED)` |
| **`BD-ACC-03`** | Payroll Timing & Liability | Pay-period accrual vs disbursement date cash | **Option A** (Accrual Pay-Period) | TO BE COMPLETED | 2026-11-09 | `PENDING` | `BLOCKED (NOT AUTHORIZED)` |
| **`BD-ACC-04`** | Payroll COA Classification | Consolidated single payroll account | **Option A** (Dual COA Mapping) | TO BE COMPLETED | 2026-11-09 | `PENDING` | `BLOCKED (NOT AUTHORIZED)` |
| **`BD-ACC-05`** | EBITDA / Net Profit KPI Label | Metric = $R - E$ labeled "Bénéfice Net" | **Option A** (Relabel "Résultat d'Exploitation") | TO BE COMPLETED | 2026-11-09 | `PENDING` | `BLOCKED (NOT AUTHORIZED)` |
| **`BD-ACC-06`** | Historical FX Fallback Policy | `134.25` in Resolver vs `135.0` in Reports | **Option A** (Central FX Master Cascade) | TO BE COMPLETED | 2026-11-09 | `PENDING` | `BLOCKED (NOT AUTHORIZED)` |

---

## 3. DETAILED POLICY TRACKING LOGS

### LOG BD-ACC-01 — ACCOUNTS RECEIVABLE SEMANTICS
- **Description:** Definition of Accounts Receivable recognition criteria and handling of uncollected balances.
- **Audit Findings:** Revenue aggregation uses invoice issuance date. Unsettled invoices contribute to top-line receivables.
- **Current Status:** `PENDING` — Awaiting Human Selection & Signature.
- **Evidence Reference:** `FINOPS_BI_P1_7_3_BD_ACC_01_TO_06_DECISION_FORMS.md#form-1`
- **Implementation Readiness:** Design specifications ready; code execution frozen until sign-off.

### LOG BD-ACC-02 — ACCOUNTS PAYABLE SEMANTICS
- **Description:** Definition of Accounts Payable liability recognition across till vouchers and vendor invoices.
- **Audit Findings:** Operational expense commitments accrue upon manager sign-off.
- **Current Status:** `PENDING` — Awaiting Human Selection & Signature.
- **Evidence Reference:** `FINOPS_BI_P1_7_3_BD_ACC_01_TO_06_DECISION_FORMS.md#form-2`
- **Implementation Readiness:** Design specifications ready; code execution frozen until sign-off.

### LOG BD-ACC-03 — PAYROLL TIMING & LIABILITY
- **Description:** Recognition timing for payroll expenditure (pay-period accrual date vs disbursement date).
- **Audit Findings:** Blended payroll aggregation currently uses period processing date; needs formal business policy endorsement.
- **Current Status:** `PENDING` — Awaiting Human Selection & Signature.
- **Evidence Reference:** `FINOPS_BI_P1_7_3_BD_ACC_01_TO_06_DECISION_FORMS.md#form-3`
- **Implementation Readiness:** Design specifications ready; code execution frozen until sign-off.

### LOG BD-ACC-04 — PAYROLL COA CLASSIFICATION
- **Description:** Chart of Accounts mapping split between Direct Labor (COGS) and Administrative Expenses (OPEX).
- **Audit Findings:** Single GL account (`6100 - Payroll`) currently prevents gross margin calculation.
- **Current Status:** `PENDING` — Awaiting Human Selection & Signature.
- **Evidence Reference:** `FINOPS_BI_P1_7_3_BD_ACC_01_TO_06_DECISION_FORMS.md#form-4`
- **Implementation Readiness:** Design specifications ready; code execution frozen until sign-off.

### LOG BD-ACC-05 — EBITDA / OPERATING RESULT KPI LABEL
- **Description:** Re-labeling UI card "Bénéfice Net Réalisé" to "Résultat d'Exploitation" to match its mathematical formula ($Revenue - Expenses$).
- **Audit Findings:** P0 finding `KPI_SEMANTIC_MISMATCH` verified in `BI-P1.7.2.2` and `BI-P1.7.2.4`. Formula mathematically sound for Operating Result, but mislabeled as Net Profit.
- **Current Status:** `PENDING` — Awaiting Human Selection & Signature.
- **Evidence Reference:** `FINOPS_BI_P1_7_3_BD_ACC_01_TO_06_DECISION_FORMS.md#form-5`
- **Implementation Readiness:** UI change ready for execution immediately upon receiving sign-off.

### LOG BD-ACC-06 — HISTORICAL FX FALLBACK POLICY
- **Description:** Eliminating duplicate unapproved fallback constants (`134.25` vs `135.0`) in favor of a central rate master.
- **Audit Findings:** P0 finding `FX_POLICY_UNAPPROVED_FALLBACK` verified. Divergence creates a $7,500 HTG reporting variance on a $10,000 USD transaction.
- **Current Status:** `PENDING` — Awaiting Human Selection & Signature.
- **Evidence Reference:** `FINOPS_BI_P1_7_3_BD_ACC_01_TO_06_DECISION_FORMS.md#form-6`
- **Implementation Readiness:** Central FX Rate Master architecture fully specified; code execution frozen until sign-off.

---

## 4. AUDIT & GOVERNANCE SUMMARY

```text
TOTAL PENDING ACCOUNTING DECISIONS: 6
DECISIONS APPROVED BY BUSINESS OWNER: 0
DECISIONS REJECTED: 0
DECISIONS PENDING HUMAN SIGN-OFF: 6

POLICY APPROVAL STATUS: INCOMPLETE (0/6 SIGNED)
CODE IMPLEMENTATION PERMISSION: STRICTLY DENIED / FROZEN
NEXT GOVERNANCE ACTION: HUMAN EXECUTION OF BD-ACC-01 TO BD-ACC-06 DECISION FORMS
```
