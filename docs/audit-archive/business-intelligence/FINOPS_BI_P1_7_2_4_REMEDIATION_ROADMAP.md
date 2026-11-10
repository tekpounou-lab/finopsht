# FINOPS — BI-P1.7.2.4 REMEDIATION ROADMAP

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.4 — P0 KPI Semantic Correction & FX Policy Remediation Readiness  
**Role:** Independent Principal Financial Data Architect, Accounting Policy Analyst, FX Governance Specialist and Senior QA Authority  
**Mode:** STRICT READ-ONLY — REMEDIATION READINESS AND DECISION CONTROL  
**Date:** November 2026  

---

## 1. BOUNDED ROADMAP OVERVIEW

This roadmap outlines the exact execution sequence, file touchpoints, test suites, and prerequisite approvals required for future implementation of Workstream A (KPI Semantic Correction) and Workstream B (FX Policy Remediation).

**Execution Notice:** This document is for **PLANNING ONLY**. No implementation patches or code edits are executed in this phase.

---

## 2. WORKSTREAM A — KPI SEMANTIC CORRECTION ROADMAP

```text
[BD-ACC-05 Sign-Off] ──► [UI Label & Tooltip Updates] ──► [Export Header Sync] ──► [Vitest Validation]
```

- **Prerequisite:** Formal Business Owner sign-off on BD-ACC-05 (Selecting Option A: `"Résultat d'exploitation"`).
- **Affected Touchpoints:**
  1. `src/components/bi/components/BIExecutiveKpis.tsx`: Update card 3 display title to `"Résultat d'exploitation"`.
  2. `src/services/reports/ReportCenterEngine.ts`: Update report column headers from `"Bénéfice Net"` to `"Résultat d'exploitation"`.
  3. `src/services/AICFOChatService.ts`: Update AI CFO text descriptors to `"Résultat d'exploitation"`.
  4. `src/domains/performance/selectors/index.ts`: Update selector metric labels.
- **Test Validation:** Run `Vitest` on `BIDataAggregationSSOT.test.ts` and `AccrualBasisEngine.test.ts`.

---

## 3. WORKSTREAM B — FX POLICY REMEDIATION ROADMAP

```text
[BD-ACC-06 Sign-Off] ──► [Replace Hardcoded Fallbacks] ──► [Add isEstimated Prop] ──► [UI Badge & Footnotes]
```

- **Prerequisite:** Formal Business Owner sign-off on BD-ACC-06 (Selecting Option A: BRH Daily Rate with Carryforward & `isEstimated` Flag).
- **Affected Touchpoints:**
  1. `src/domains/analytics/utils/NormalizedAmountResolver.ts`: Replace fallback `134.25` with prior verified BRH carryforward logic; return `isEstimated: true`.
  2. `src/repositories/CurrencyRateRepository.ts`: Replace default `135.0` / `134.25` with structured error propagation.
  3. `src/components/bi/hooks/useBIDataAggregation.ts`: Wire rate context dynamically.
  4. `src/services/reports/ReportCenterEngine.ts`: Replace method default `135.0` with dynamic rate; add report footer.
  5. `src/components/payroll/modals/SalaryStructureModal.tsx`: Remove hardcoded option `"Auto exchange 135"`.
- **Test Validation:** Run `Vitest` on `NormalizedAmountResolver.test.ts` and `CentralExchangeRatesModule.test.ts`.

---

## 4. EXECUTION PRECONDITIONS & GOVERNANCE GATE

1. **Precondition 1:** Business Owner signs BD-ACC-05 and BD-ACC-06 approval documents.
2. **Precondition 2:** User issues explicit prompt authorizing implementation (e.g. `"Authorize BI-P1.7.2.4-IMP"`).
3. **Execution Gate:** **CLOSED**. Implementation is NOT authorized in phase `BI-P1.7.2.4`.
