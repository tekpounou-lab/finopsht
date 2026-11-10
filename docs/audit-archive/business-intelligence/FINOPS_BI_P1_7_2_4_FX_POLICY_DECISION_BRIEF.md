# FINOPS — BI-P1.7.2.4 FX POLICY DECISION BRIEF

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.4 — P0 KPI Semantic Correction & FX Policy Remediation Readiness  
**Role:** Independent Principal Financial Data Architect, Accounting Policy Analyst, FX Governance Specialist and Senior QA Authority  
**Mode:** STRICT READ-ONLY — REMEDIATION READINESS AND DECISION CONTROL  
**Date:** November 2026  

---

## 1. PURPOSE AND POLICY SCOPE

This Decision Brief presents the formal business alternatives for approving decision **BD-ACC-06 (Historical FX Fallback & Governance Policy)** to replace unapproved code constants (`134.25` and `135.0`).

Decision Status: **`DECISION METIER REQUISE`** (Awaiting formal Business Owner approval for BD-ACC-06).

---

## 2. POLICY ALTERNATIVES COMPARISON

```text
       ┌────────────────────────────────────────────────────────┐
       │             FX POLICY GOVERNANCE ALTERNATIVES          │
       └───────────────────────────┬────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│     OPTION A     │      │     OPTION B     │      │     OPTION C     │
│ Official BRH Daily│     │ Business-Managed │      │ Automated API    │
│ Rate Feed        │      │ Rate Grid        │      │ Feed + Fail Safe │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

| Dimension | Option A: Official BRH Daily Rate Feed | Option B: Business-Managed Rate Grid | Option C: API Integration + Safety Fallback Policy |
|---|---|---|---|
| **Authoritative Source** | BRH (Banque de la République d'Haïti) official reference rate publication. | Internal finance team manual rate table maintained in `daily_exchange_rates`. | External banking API with fallback to most recent verified BRH rate. |
| **Effective-Date Rule** | Rate published on date $T$ applies to transactions on date $T$. | Explicit effective date range entered by finance manager. | Real-time spot rate for current date; daily BRH rate for historical dates. |
| **Missing Rate Policy** | **Fail-Safe Propagation:** Uses most recent available prior BRH rate; flags snapshot as `ESTIMATED_FX`. | **Strict Data Entry:** Blocks transaction posting until rate is entered by finance user. | Uses latest verified rate and flags metric with `INCOMPLETE_FX` indicator. |
| **Audit Trail** | Retains BRH publication timestamp and raw document reference. | Retains user ID, timestamp, and manager approval log. | Retains API payload digest and fallback source. |
| **Operational Risks** | Weekend/holiday rate gaps require explicit prior-day carryforward rule. | User delay in updating rate table could delay transaction entry. | API downtime requires robust local fallback policy. |
| **Required Approval** | Business Owner approval of BD-ACC-06 (Option A) | Business Owner approval of BD-ACC-06 (Option B) | Business Owner approval of BD-ACC-06 (Option C) |

---

## 3. AUDIT RECOMMENDATION

- **Recommended Policy:** **Option A (BRH Daily Rate with Prior-Day Carryforward & Explicit `ESTIMATED_FX` Warning)**.
- **Rationale:** Aligns with Haitian financial regulations (BRH as canonical reference), eliminates unapproved arbitrary code constants (`134.25` / `135.0`), and ensures total transparency by visibly flagging estimated calculations whenever a rate gap occurs.
- **Decision Status:** **`DECISION METIER REQUISE`**.
