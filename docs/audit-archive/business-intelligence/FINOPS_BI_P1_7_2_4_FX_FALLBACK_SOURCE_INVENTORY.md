# FINOPS — BI-P1.7.2.4 FX FALLBACK SOURCE INVENTORY

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.4 — P0 KPI Semantic Correction & FX Policy Remediation Readiness  
**Role:** Independent Principal Financial Data Architect, Accounting Policy Analyst, FX Governance Specialist and Senior QA Authority  
**Mode:** STRICT READ-ONLY — REMEDIATION READINESS AND DECISION CONTROL  
**Date:** November 2026  

---

## 1. EXECUTIVE FX FALLBACK INVENTORY OVERVIEW

This inventory documents all hardcoded USD/HTG fallback rates, constants, and default conversion paths identified across production source files in FINOPS ERP.

Finding `P0-B: FX_POLICY_UNAPPROVED_FALLBACK` classifies these values as **unapproved technical code fallbacks**, NOT approved financial policies.

---

## 2. HARDCODED FX FALLBACK INVENTORY MATRIX

| Source File Path | Line Number | Identifier / Constant Name | Hardcoded Rate Value | Trigger Condition | Affected Financial Calculation / Callers | Missing-Data Warning Signal | Governance Classification |
|---|---|---|---|---|---|---|---|
| `src/domains/analytics/utils/NormalizedAmountResolver.ts` | 6, 30 | `DEFAULT_USD_HTG_RATE` | `134.25` | Missing `DailyExchangeRateGrid` entry for transaction date | Currency normalization in `AnalyticsEngine.ts` | **NONE** (Silent conversion) | `FX_POLICY_UNAPPROVED_FALLBACK` |
| `src/repositories/CurrencyRateRepository.ts` | 80, 633, 643, 664, 672 | `ratesObj.BRH \|\| 134.25` | `134.25` | Missing BRH rate object in Firestore document | Foreign currency rate lookup fallback | **NONE** (Silent conversion) | `FX_POLICY_UNAPPROVED_FALLBACK` |
| `src/repositories/CurrencyRateRepository.ts` | 121 | `DEFAULT_RATE` | `135.0` | Empty collection returned from Firestore query | Default rate fallback in repository methods | Log warning in dev console | `FX_POLICY_UNAPPROVED_FALLBACK` |
| `src/constants/finance.ts` | 184 | `DEFAULT_USD_TO_HTG_EXCHANGE_RATE` | `135.0` | Global constant export for fallback UI initializers | `useBIDataAggregation.ts`, Report Engines | **NONE** (Silent fallback) | `FX_POLICY_UNAPPROVED_FALLBACK` |
| `src/components/bi/hooks/useBIDataAggregation.ts` | 76 | `useState<number>(135.0)` | `135.0` | Initial state before Firestore rate fetch | BI filter context rate parameter | **NONE** (Silent fallback) | `FX_POLICY_UNAPPROVED_FALLBACK` |
| `src/services/reports/ReportCenterEngine.ts` | 251, 345, 439 | `brhRate: number = 135.0` | `135.0` | Default method parameter in PDF/Excel report generator | Financial report exports | **NONE** (Silent fallback) | `FX_POLICY_UNAPPROVED_FALLBACK` |
| `src/components/reports/ReportCenterConsole.tsx` | 98 | `useState<number>(135.0)` | `135.0` | Initial state in report console UI | Report generation options | **NONE** (Silent fallback) | `FX_POLICY_UNAPPROVED_FALLBACK` |
| `src/components/payroll/modals/SalaryStructureModal.tsx` | 72 | `<option>` hardcoded label | `135.0` | Currency selector rendering | Payroll salary structure USD modal | Hardcoded option text `"Auto exchange 135"` | `FX_POLICY_UNAPPROVED_FALLBACK` |
| `src/domains/analytics/components/PredictiveIntelligenceCenter.tsx` | 100, 396, 398 | Inline division `/ 135` | `135.0` | USD currency toggle active | Predictive intelligence limit conversion | **NONE** (Silent calculation) | `FX_POLICY_UNAPPROVED_FALLBACK` |
| `src/domains/analytics/components/WorkforceProfitabilityDashboard.tsx` | 232 | Inline division `/ 135` | `135.0` | USD currency toggle active | Workforce profitability metrics | **NONE** (Silent calculation) | `FX_POLICY_UNAPPROVED_FALLBACK` |
| `src/domains/analytics/components/WorkforceIntelligenceFramework.tsx` | 276 | Inline division `/ 135` | `135.0` | USD currency toggle active | Workforce intelligence metrics | **NONE** (Silent calculation) | `FX_POLICY_UNAPPROVED_FALLBACK` |

---

## 3. INTERACTION RISKS BETWEEN 134.25 AND 135.0

- Both technical fallbacks coexist in the codebase and can affect the **same financial snapshot** through separate execution paths:
  1. `NormalizedAmountResolver.ts` uses `134.25` for transaction-level normalization in `AnalyticsEngine.ts`.
  2. `ReportCenterEngine.ts` and `PredictiveIntelligenceCenter.tsx` use `135.0` for UI projections and PDF exports.
- **Resulting Variance:** A $10,000 USD transaction converts to $1,342,500\text{ HTG}$ in `AnalyticsEngine`, but $1,350,000\text{ HTG}$ in `ReportCenterEngine` — creating an uncoordinated **$7,500\text{ HTG}$ discrepancy** caused purely by conflicting technical default constants!
