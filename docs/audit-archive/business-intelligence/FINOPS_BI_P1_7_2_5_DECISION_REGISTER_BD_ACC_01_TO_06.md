# FINOPS — BI-P1.7.2.5 DECISION REGISTER BD-ACC-01 TO BD-ACC-06

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.5 — Business Owner Decision Intake, Policy Approval & Implementation Authorization Gate  
**Role:** Independent Financial Governance Auditor, Business Authority Verification Specialist, Accounting Policy Controller and Implementation Authorization Gatekeeper  
**Mode:** STRICT READ-ONLY — GOVERNANCE EVIDENCE INTAKE  
**Date:** November 2026  

---

## 1. MASTER DECISION REGISTER SCOPE

This register maintains the authoritative accounting decision status for `BD-ACC-01` through `BD-ACC-06`.

Every decision specifies its required policy scope, technical dependencies, and current approval status.

---

## 2. MASTER DECISION REGISTER MATRIX

| Decision ID | Policy Domain | Required Policy Scope | Selected Business Option | Attributable Approval Evidence | Effective Date | Decision Status | Implementation Status |
|---|---|---|---|---|---|---|---|
| **BD-ACC-01** | Accounts Receivable Semantics | Define AR analytical metric; confirm cash vs accrual timing variance vs full AR subledger reconciliation; define opening/closing balance requirements. | **UNSELECTED** | **NONE** | **UNSPECIFIED** | `PENDING — AUTHORITY EVIDENCE MISSING` | **NOT AUTHORIZED** |
| **BD-ACC-02** | Accounts Payable Semantics | Define AP analytical metric; distinguish expense recognition from supplier liability settlement; define opening/closing balances. | **UNSELECTED** | **NONE** | **UNSPECIFIED** | `PENDING — AUTHORITY EVIDENCE MISSING` | **NOT AUTHORIZED** |
| **BD-ACC-03** | Payroll Accrual-to-Cash & Liability | Define accrued payroll cost, cash disbursements, opening/closing liabilities, advance recoveries, reversals, cross-period cycles. | **UNSELECTED** | **NONE** | **UNSPECIFIED** | `PENDING — AUTHORITY EVIDENCE MISSING` | **NOT AUTHORIZED** |
| **BD-ACC-04** | Payroll GL COA Governance | Approve authoritative payroll expense/liability accounts, employer contribution mappings, reversal rules, future COA governance. | **UNSELECTED** | **NONE** | **UNSPECIFIED** | `PENDING — AUTHORITY EVIDENCE MISSING` | **NOT AUTHORIZED** |
| **BD-ACC-05** | EBITDA / Operating Result KPI Semantics | Approve Option A (`"Résultat d'exploitation"`), Option B (`"EBIT"`), or Option C (`"Bénéfice Net"`). | **UNSELECTED** (Option A recommended technically) | **NONE** | **UNSPECIFIED** | `PENDING — AUTHORITY EVIDENCE MISSING` | **NOT AUTHORIZED** |
| **BD-ACC-06** | Historical FX Fallback & Governance | Approve Option A (BRH Daily Rate), Option B (Business Grid), or Option C (API Feed); define missing-rate carryforward rules. | **UNSELECTED** (Option A recommended technically) | **NONE** | **UNSPECIFIED** | `PENDING — AUTHORITY EVIDENCE MISSING` | **NOT AUTHORIZED** |

---

## 3. SUMMARY OF GOVERNANCE PRECONDITIONS

- **Pending Decisions Total:** 6 of 6.
- **Approved Decisions Total:** 0 of 6.
- **Governance Finding:** In the absence of signed Business Owner policy documents, all six accounting decisions remain strictly in `PENDING` status.
