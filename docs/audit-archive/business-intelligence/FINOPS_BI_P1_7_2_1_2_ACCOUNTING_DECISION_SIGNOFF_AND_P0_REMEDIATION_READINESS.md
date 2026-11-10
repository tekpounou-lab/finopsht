# FINOPS — BI-P1.7.2.1.2
# ACCOUNTING DECISION SIGN-OFF & P0 FINANCIAL REMEDIATION READINESS

**Project:** FINOPS ERP / FINAYITI FUSION  
**Role:** Independent Principal Financial Data Architect, Chief Accounting Policy Analyst, Senior FX Auditor and QA Authority  
**Mode:** STRICT READ-ONLY — BUSINESS DECISION VALIDATION & IMPLEMENTATION READINESS  
**Priority:** P0 — FINANCIAL INTEGRITY  
**Date:** 2026-11-06  
**Baseline:** BI-P1.7.2.1.1 Targeted FX Fallback, Payroll Liability Semantics & Evidence Traceability Revalidation  
**Authorization:** AUDIT, POLICY ANALYSIS AND READINESS DESIGN ONLY — NO IMPLEMENTATION AUTHORIZED

---

## 1. EXECUTIVE SUMMARY & GOVERNANCE CONTEXT

### 1.1 Purpose
This document presents the formal **Accounting Decision Sign-off and P0 Financial Remediation Readiness Assessment** following the findings of audit phases `BI-P1.7.2`, `BI-P1.7.2.1`, and `BI-P1.7.2.1.1`.

The primary objectives of this phase are:
1. **Consolidate all unresolved accounting decisions** (`BD-ACC-01` through `BD-ACC-06` and legacy business decisions `BD-01` through `BD-05`).
2. **Classify decision status strictly** according to whether signed business/user authorization documentation exists.
3. **Analyze the financial, technical, and operational impact** of each accounting policy option.
4. **Establish the P0 remediation readiness matrix** and structure a non-breaking 4-phase technical remediation roadmap.
5. **Enforce strict read-only governance** to ensure zero unapproved code modifications occur prior to formal sign-off.

### 1.2 Governance Mode & Scope Boundaries
- **Operating Mode:** STRICT READ-ONLY.
- **Production Code Changes:** 0 files modified / 0 lines created.
- **Test / Fixture Changes:** 0 files modified.
- **Data Model Changes:** 0 Firestore documents modified.
- **Authorization Status:** AUDIT, POLICY ANALYSIS & READINESS SPECIFICATION ONLY. No implementation is authorized under phase `BI-P1.7.2.1.2`.

---

## 2. ACCOUNTING BUSINESS DECISIONS INVENTORY (`BD-ACC-01` TO `BD-ACC-06`)

Per the `GEMINI.md` engineering constitution, any architectural or business decision lacking an explicit signed user or business sign-off document must be classified as **`PENDING BUSINESS OWNER APPROVAL`** (or **`PENDING USER APPROVAL`**).

| Decision Code | Domain / Subject | Options Evaluated | Current System Implementation | Recommended Accounting Posture | Formal Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BD-ACC-01** | Accounts Receivable (AR) Semantics | **A:** Full AR Aging & Subledger<br>**B:** In-period timing variance (`accrualRevenue - cashRevenue`) | In-period timing variance calculated in `AccrualBasisEngine.ts` | Retain timing variance metric, add UI tooltip clarifying non-aging scope | **PENDING BUSINESS OWNER APPROVAL** |
| **BD-ACC-02** | Accounts Payable (AP) Semantics | **A:** Full AP Subledger & Unpaid Invoices<br>**B:** In-period timing variance (`accrualExpenses - cashExpenses`) | In-period timing variance calculated in `AccrualBasisEngine.ts` | Retain timing variance metric, add UI tooltip clarifying non-aging scope | **PENDING BUSINESS OWNER APPROVAL** |
| **BD-ACC-03** | Payroll GL Disbursement Lifecycle | **A:** Sealing creates liability only<br>**B:** Sealing creates liability & links cash disbursement<br>**C:** Sealing auto-triggers instant cash disbursement | Sealing accrues payroll liability; cash payments originate independently in till/safe modules | **Model B:** Sealing registers payroll liability; disbursement links transaction to sealed run ID | **PENDING BUSINESS OWNER APPROVAL** |
| **BD-ACC-04** | Payroll Classification Governance | **A:** Keyword matching (`isPayrollRelatedTransaction`)<br>**B:** Chart of Accounts (COA) account mapping<br>**C:** Hybrid COA primary with keyword audit fallback | Keyword string matching on transaction description/category | **Option C:** Account code primary (`COA 64xx`) with keyword anomaly flags | **PENDING BUSINESS OWNER APPROVAL** |
| **BD-ACC-05** | EBITDA vs Operating Result Governance | **A:** Deprecate EBITDA (`undefined`), use `operatingResult`<br>**B:** Approximate EBITDA with mock D&A additions | EBITDA field deprecated to `undefined` (DEF-9C-05); `operatingResult` is canonical | Retain `operatingResult` (Résultat net d'exploitation) as authoritative operating metric | **PENDING BUSINESS OWNER APPROVAL** |
| **BD-ACC-06** | FX Fallback & Missing Rate Policy | **A:** Fail closed on missing rate (flag `incompleteData`)<br>**B:** Constant fallback rate (`135.0 HTG/USD`)<br>**C:** Dual rate (Historical BRH vs Live spot) | Hardcoded `135.0 HTG/USD` fallback in `CurrencyRateRepository.ts` & `useBIDataAggregation.ts` | **Option A & C:** Fail closed for missing historical rate, set `incompleteData: true`, eliminate silent fallback | **PENDING BUSINESS OWNER APPROVAL** |

---

## 3. LEGACY BUSINESS DECISION CROSS-REFERENCE (`BD-01` TO `BD-05`)

For continuity with audits `BI-P1.7.0` through `BI-P1.7.1-P0A`, the legacy decisions map directly to `BD-ACC-01` through `BD-ACC-06`:

1. **BD-01 (Global Search Scope):** Declared **NOT AUTHORIZED**. BI Global Search remains scoped to analytical filtering without executing cross-view database queries. Status: **NOT AUTHORIZED**.
2. **BD-02 (AR/AP Subledger Scope):** Mapped to `BD-ACC-01` & `BD-ACC-02`. Current formulas measure in-period timing difference, not full balance sheet aging. Status: **PENDING BUSINESS OWNER APPROVAL**.
3. **BD-03 (Payroll Disbursement Linkage):** Mapped to `BD-ACC-03`. Requires transaction-level linkage between cash disbursements and sealed payroll runs. Status: **PENDING BUSINESS OWNER APPROVAL**.
4. **BD-04 (Payroll Classifier Guardrails):** Mapped to `BD-ACC-04`. Transitioning from loose description regex to COA 64xx validation. Status: **PENDING BUSINESS OWNER APPROVAL**.
5. **BD-05 (FX Fallback Strategy):** Mapped to `BD-ACC-06`. Replacing silent static `135.0` conversion with explicit rate availability checks and `incompleteData` warnings. Status: **PENDING BUSINESS OWNER APPROVAL**.

---

## 4. TECHNICAL RISK & FINANCIAL INTEGRITY ANALYSIS

### 4.1 FX Fallback Risk (`BD-ACC-06`)
- **Current Behavior:** When historical exchange rate records are missing for a target date, `NormalizedAmountResolver.ts` uses default `134.25`, while `CurrencyRateRepository.ts` and `useBIDataAggregation.ts` default to `135.0 HTG/USD`.
- **Financial Risk:** Silent conversion using static rates distorts executive reporting totals in multi-currency HTG/USD environments, creating non-auditable variances between financial statements and cash positions.
- **Target Posture:** Explicit resolution via `CurrencyRateRepository`. If no rate exists for the transaction date or period, set `health.incompleteData = true`, record a rate warning in `AnalyticsHealth`, and require user confirmation or rate entry.

### 4.2 Payroll Liability & Cash Disbursement Linkage (`BD-ACC-03`)
- **Current Behavior:** Payroll sealing records an accrued payroll expense in `AccrualBasisEngine.ts`. Cash payments recorded in cash management (tills/safes) are matched to payroll solely via keyword regex matching (`isPayrollRelatedTransaction`).
- **Financial Risk:** If payroll disbursements are categorized under non-standard transaction descriptions, cash disbursements are excluded from payroll cash outflow calculations, creating false liability overstatements.
- **Target Posture:** Implement `payrollRunId` foreign key in cash transactions during payout. Link cash disbursements directly to sealed payroll run IDs for exact reconciliation.

### 4.3 Classifier Governance (`BD-ACC-04`)
- **Current Behavior:** `AnalyticsEngine.isPayrollRelatedTransaction` checks string inclusion for `payroll`, `paie`, `salaire`, `gabon`, etc.
- **Financial Risk:** Fragile text matching can misclassify non-payroll vendor payouts containing similar words or fail to classify legitimate payroll transfers with non-standard labels.
- **Target Posture:** COA Primary Guardrail. Classify transactions based on standard General Ledger account codes (`641000 - Salaires et Traitements`, `645000 - Cotisations Sociales`). Fall back to metadata tags (`category: 'PAYROLL'`) with keyword flagging as a secondary audit trace.

### 4.4 Multi-Tenant Chart of Accounts (COA) Governance
- **Current Behavior:** Hardcoded account prefix assumptions in analytics engines.
- **Financial Risk:** Multi-tenant SaaS deployments with custom Charts of Accounts could experience incorrect revenue or expense categorization.
- **Target Posture:** Ensure account classification respects tenant-specific COA definitions loaded from `COARepository`.

---

## 5. PRIORITIZED P0 FINANCIAL REMEDIATION ROADMAP

Upon receiving explicit user implementation authorization, technical remediation will proceed strictly according to the following 4-phase sequence:

```
[Phase 1: BI-P0-FX] ──> [Phase 2: BI-P0-PAYROLL-LIFECYCLE] ──> [Phase 3: BI-P0-CLASSIFIER-GOVERNANCE] ──> [Phase 4: BI-P0-RECONCILIATION-UI]
```

### Phase 1: `BI-P0-FX` — Fail-Closed FX Resolution & Health Propagation
- **Objective:** Eliminate silent fallback rates (`135.0` / `134.25`).
- **Scope:** `NormalizedAmountResolver.ts`, `CurrencyRateRepository.ts`, `useBIDataAggregation.ts`.
- **Deliverables:**
  1. Enforce strict lookup for date-specific exchange rates.
  2. Flag `incompleteData = true` in `AnalyticsHealth` when FX data is missing for any multi-currency record.
  3. Propagate FX missing rate warnings to the BI Executive Dashboard status bar.

### Phase 2: `BI-P0-PAYROLL-LIFECYCLE` — GL Cash Disbursement Linkage
- **Objective:** Establish formal identity linkage between sealed payroll runs and cash disbursements.
- **Scope:** `CashManagementRepository.ts`, `PayrollRepository.ts`, `AnalyticsEngine.ts`.
- **Deliverables:**
  1. Add `payrollRunId?: string` optional field to `CashTransaction`.
  2. Populate `payrollRunId` upon cash payout execution.
  3. Update `computePayrollCost` to prioritize `payrollRunId` linked transactions over keyword matching.

### Phase 3: `BI-P0-CLASSIFIER-GOVERNANCE` — COA Account-Based Classification
- **Objective:** Replace regex string matching with account code classification.
- **Scope:** `AnalyticsEngine.ts`, `AccrualBasisEngine.ts`.
- **Deliverables:**
  1. Refactor `isPayrollRelatedTransaction` to inspect transaction `accountId` against `COA` 64xx account series.
  2. Retain description regex matching as an audit flag (`isUnclassifiedPayrollCandidate`).

### Phase 4: `BI-P0-RECONCILIATION-UI` — UI Variance Clarification Tooltips
- **Objective:** Disambiguate timing variance metrics from balance sheet AR/AP aging subledgers.
- **Scope:** `ReconciliationBridge.tsx`, `ExecutiveIntelligenceCenter.tsx`.
- **Deliverables:**
  1. Add descriptive tooltips to "Variance AR" and "Variance AP" cards.
  2. Display explicit label: *"Variance temporelle courante (Produits/Charges calculés non encore encaissés/décaisés)"*.

---

## 6. GOVERNANCE GATE & ACCEPTANCE CRITERIA MATRIX

| Criteria ID | Domain | Requirement Description | Verification Method | Pass/Fail Condition |
| :--- | :--- | :--- | :--- | :--- |
| **AC-P0-01** | FX Governance | No hardcoded `135.0` fallback used for missing historical rates | Automated Unit Test | `PASS` if `incompleteData` flag is set when historical rate missing |
| **AC-P0-02** | FX Health | Health status contains FX warning when conversion rate absent | Integration Test | `PASS` if `health.warnings` includes missing rate details |
| **AC-P0-03** | Payroll Linkage | Cash disbursement linked to `payrollRunId` correctly reconciles payroll cash outflow | Unit & Integration Test | `PASS` if `payrollRunId` matches cash disbursement transaction |
| **AC-P0-04** | Classifier Integrity | COA 64xx account code correctly classifies payroll transaction without keyword regex dependency | Unit Test | `PASS` if non-labeled payroll transaction with account 641000 is classified |
| **AC-P0-05** | AR/AP Disambiguation | UI bridge cards explicitly state in-period timing scope | Visual / Spec Audit | `PASS` if tooltip and subtitle explicitly clarify timing variance |
| **AC-P0-06** | Non-Regression | All existing 33 unit tests pass without failure | Vitest CLI | `PASS` if 33/33 tests green |

---

## 7. FORMAL SIGN-OFF & STOP GATE STATEMENT

### 7.1 Sign-off Status
- **Technical Read-only Audit:** COMPLETE & CERTIFIED.
- **Business Policy Approvals (`BD-ACC-01` to `BD-ACC-06`):** PENDING FORMAL BUSINESS OWNER SIGN-OFF.
- **Remediation Plan Readiness:** CERTIFIED & READY FOR STAGED IMPLEMENTATION.

### 7.2 Required STOP GATE Output
```text
BD-ACC-01 AR SEMANTICS: PENDING
BD-ACC-02 AP SEMANTICS: PENDING
BD-ACC-03 PAYROLL DISBURSEMENT POLICY: PENDING
BD-ACC-04 PAYROLL CLASSIFICATION POLICY: PENDING
BD-ACC-05 EBITDA / OPERATING RESULT POLICY: PENDING
BD-ACC-06 FX FALLBACK POLICY: PENDING
HISTORICAL FX FALLBACK RISK: OPEN
FX INCOMPLETE-DATA PROPAGATION: READY
AR/AP METRIC SEMANTICS: READY
PAYROLL LIABILITY MODEL: READY
PAYROLL CLASSIFICATION GOVERNANCE: READY
TENANT-AWARE COA GOVERNANCE: READY
P0 REMEDIATION PHASES READY: 4
BUSINESS DECISIONS PENDING: 6
PRODUCTION SOURCE MODIFICATIONS: NONE
TEST / FIXTURE MODIFICATIONS: NONE
GLOBAL SEARCH IMPLEMENTATION: NOT AUTHORIZED
FINAL VERDICT: READY WITH CONDITIONS
NEXT IMPLEMENTATION AUTHORIZATION: NOT GRANTED

STOP.
```
