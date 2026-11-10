# FINOPS — BI-P1.7.2.4 KPI SOURCE CONSUMER INVENTORY

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.4 — P0 KPI Semantic Correction & FX Policy Remediation Readiness  
**Role:** Independent Principal Financial Data Architect, Accounting Policy Analyst, FX Governance Specialist and Senior QA Authority  
**Mode:** STRICT READ-ONLY — REMEDIATION READINESS AND DECISION CONTROL  
**Date:** November 2026  

---

## 1. EXECUTIVE INVENTORY OVERVIEW

This document establishes the exhaustive inventory of all components, services, selectors, engines, and export utilities consuming the `netProfit` metric or its aliases (`profit`, `operatingResult`, `profitMarginPercentage`) across FINOPS ERP.

Every consumer is mapped to its exact source file, line range, selector hook, display label, accounting mode, and currency context.

---

## 2. KPI CONSUMER MAPPING MATRIX

| Consumer Component / Module | Source File Path | Line Range | Source Selector / Hook | Input Metric / Alias | Current Displayed Label | Current Tooltip / Context | Accounting Mode | Base Currency | Export & Downstream Impact |
|---|---|---|---|---|---|---|---|---|---|
| Executive KPI Grid | `src/components/bi/components/BIExecutiveKpis.tsx` | 38, 63, 183–202 | Props / `useAnalyticsFilters` | `netProfit` / `card3Value` | `"Bénéfice net réalisé"` (Accrual) / `"Variation de trésorerie"` (Cash) | `Formule SSOT: Recettes (R) - Dépenses (E) = P HTG` | ACCRUAL / CASH (Mode-aware) | `HTG` | Executive Dashboard |
| BI Data Aggregation Hook | `src/components/bi/hooks/useBIDataAggregation.ts` | 110–130 | `AnalyticsEngine.generateSnapshot` | `snapshot.profit.currentValue` | Pass-through prop | State wrapper | BOTH | `HTG` | BI Workspace State |
| Central Analytics Engine | `src/domains/analytics/services/AnalyticsEngine.ts` | 2770, 2822, 2864 | Internal `generateSnapshot` | `curProfitVal = curRevVal - totalCurExpenses` | Metric `netProfit` | Internal calculation | BOTH | `HTG` | Snapshot Object |
| Accrual Basis Engine | `src/domains/analytics/services/AccrualBasisEngine.ts` | 178–180, 259 | `AccrualBasisEngine.generateSnapshot` | `operatingResult = netIncome` | Metric `operatingResult` | Internal calculation | ACCRUAL | `HTG` | Accrual Snapshot |
| Performance Intelligence Center Selectors | `src/domains/performance/selectors/index.ts` | 244, 271, 535, 569 | Selector functions | `netProfit`, `profitMargin` | Metric `netProfit` | Performance scorecard metric | ACCRUAL | `HTG` | PIC Scorecards |
| CFO Financial Intelligence Service | `src/services/FinancialIntelligence.ts` | 40, 53, 81, 101, 105 | `FinancialIntelligence` | `netProfit = totalRevenue - totalExpenses` | Metric `netProfit` | Internal intelligence context | BOTH | `HTG` | AI CFO Insights |
| Financial Ratio Engine | `src/services/cfo/FinancialRatioEngine.ts` | 80, 84, 137, 293 | `FinancialRatioEngine` | `profit.netHTG` / `netProfit` | `profit_ratio` | Financial ratios | BOTH | `HTG` | Ratio Analysis |
| AICFO Chat Service | `src/services/AICFOChatService.ts` | 180, 196, 209, 216 | `AICFOChatService` | `netProfit`, `profit_ratio` | `"Bénéfice net"` / `cash_flow` | Natural language LLM context | BOTH | `HTG` | AI Chat Responses |
| Financial Snapshot Builder | `src/services/FinancialSnapshotBuilder.ts` | 420, 445, 554, 555 | `FinancialSnapshotBuilder` | `netMarginPercentage` | `netMarginPercentage` | Snapshot export schema | ACCRUAL | `HTG` | Snapshot Archival |
| Analytics KPI Registry | `src/modules/analytics/KPIs/registry.ts` | 116–117 | Registry definition | `netProfit` | `netProfit` | Registry entry | ACCRUAL | `HTG` | KPI Metadata |

---

## 3. CROSS-COMPONENT SEMANTIC INCONSISTENCIES IDENTIFIED

1. **Executive Dashboard vs. Underlying Engine:** `BIExecutiveKpis.tsx` displays `"Bénéfice net réalisé"`, whereas `AccrualBasisEngine.ts` explicitly comments that the metric represents `operatingResult` (Résultat net d'exploitation) and excludes tax/interest.
2. **AI CFO Context vs. Accrual Semantics:** `AICFOChatService.ts` maps `netProfit` to `cash_flow` in text responses, creating potential ambiguity between operating profit and net cash flow for non-financial users.
3. **Export & Archival Schema:** `FinancialSnapshotBuilder.ts` labels `netMarginPercentage` as `grossMarginPercentage` and `netMarginPercentage` identically, obscuring operating vs net margin distinctions in exported snapshots.
