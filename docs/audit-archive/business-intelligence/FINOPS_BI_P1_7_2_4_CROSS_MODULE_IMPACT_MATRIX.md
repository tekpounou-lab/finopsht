# FINOPS — BI-P1.7.2.4 CROSS-MODULE IMPACT MATRIX

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.4 — P0 KPI Semantic Correction & FX Policy Remediation Readiness  
**Role:** Independent Principal Financial Data Architect, Accounting Policy Analyst, FX Governance Specialist and Senior QA Authority  
**Mode:** STRICT READ-ONLY — REMEDIATION READINESS AND DECISION CONTROL  
**Date:** November 2026  

---

## 1. CROSS-MODULE DEPENDENCY ANALYSIS

This matrix maps all downstream modules, pages, export engines, and background tasks impacted by Workstream A (KPI Semantic Correction) and Workstream B (FX Policy Remediation).

---

## 2. CROSS-MODULE IMPACT MATRIX

| Downstream Module | Source Files | Impacted Features & Utilities | Impact of Workstream A (KPI Semantic) | Impact of Workstream B (FX Policy) | Dependency Type | Risk & Mitigation Level |
|---|---|---|---|---|---|---|
| Business Intelligence Dashboard | `src/components/bi/components/BIExecutiveKpis.tsx`, `useBIDataAggregation.ts` | Executive KPI cards, tooltips, branch/dept views | Updates card 3 title to `"Résultat d'exploitation"` | Uses dynamic rate context; displays `ESTIMATED_FX` badge when rates missing | **DIRECT** | **LOW** (UI label & badge update) |
| Performance Intelligence Center (PIC) | `src/pages/PerformanceIntelligenceCenter.tsx`, `src/domains/performance/selectors/index.ts` | Performance scorecards, workforce productivity metrics | Synchronizes KPI metric labels to `"Résultat d'exploitation"` | Ensures scorecards convert USD targets using official rate grid | **DIRECT** | **LOW** (Selector alignment) |
| Payroll & HR Subledger | `src/services/payroll/PayrollService.ts`, `SalaryStructureModal.tsx` | Payroll calculation, USD base salary conversion | Zero impact (Payroll uses employment cost subledger) | Replaces hardcoded option `"Auto exchange 135"` with dynamic BRH rate | **INDIRECT** | **MEDIUM** (Salary USD conversion check) |
| Report Center & Export Engine | `src/services/reports/ReportCenterEngine.ts`, `ReportCenterConsole.tsx` | PDF financial statements, Excel/CSV exports | Updates export column headers to `"Résultat d'exploitation"` | Replaces parameter default `135.0` with dynamic rate; appends FX footnote | **DIRECT** | **MEDIUM** (Export template header update) |
| Financial Intelligence & AI CFO | `src/services/FinancialIntelligence.ts`, `AICFOChatService.ts`, `FinancialRatioEngine.ts` | Natural language answers, financial ratio calculations | Updates LLM prompt text and ratio descriptors to `"Operating Result"` | Ensures AI CFO quotes official BRH rates, avoiding hardcoded `135.0` | **INDIRECT** | **LOW** (LLM prompt text sync) |
| General Ledger Accounting | `src/services/AccountingEngine.ts`, `src/pages/FinanceLedger.tsx` | General Ledger journal entries, double-entry postings | Zero impact (P&L double-entry logic remains $R - E$) | Multi-currency postings resolve against official rate grid | **INDIRECT** | **LOW** (Posting engine untouched) |

---

## 3. SCOPE ISOLATION GUARANTEE

- **Direct Impacts:** Confined strictly to UI display labels, tooltip hover texts, export column headers, and exchange rate resolver methods.
- **Protected Core Logic:** General Ledger double-entry posting rules, Firestore database schemas, and accounting entry formulas remain 100% untouched.
