# FINOPS — BI-P1.7.2.4 FX PROVENANCE AND PIPELINE REVIEW

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.4 — P0 KPI Semantic Correction & FX Policy Remediation Readiness  
**Role:** Independent Principal Financial Data Architect, Accounting Policy Analyst, FX Governance Specialist and Senior QA Authority  
**Mode:** STRICT READ-ONLY — REMEDIATION READINESS AND DECISION CONTROL  
**Date:** November 2026  

---

## 1. END-TO-END FX PIPELINE TRACEABILITY

```text
[Firestore: daily_exchange_rates] ──► [CurrencyRateRepository] ──► [NormalizationContext]
                                                                        │
                                                                        ▼
[AnalyticsEngine Snapshot] ◄── [NormalizedAmountResolver.resolveToHTG]
         │
         ▼
[BI Executive KPIs] ──► [ReportCenterEngine] ──► [PDF / Excel / CSV Exports]
```

1. **Source Storage:** Collection `daily_exchange_rates` stores daily rate grids keyed by date string (`YYYY-MM-DD`).
2. **Repository Retrieval:** `CurrencyRateRepository.ts` retrieves rate grids for requested date ranges (`getRateForDate`, `getRatesForRange`).
3. **Context Assembly:** `useBIDataAggregation.ts` populates `NormalizationContext` map.
4. **Amount Normalization:** `NormalizedAmountResolver.resolveToHTG(amt, currency, date, context)` applies conversion.
5. **Snapshot & UI Rendering:** `AnalyticsEngine.ts` embeds normalized HTG figures into snapshot.
6. **Export Processing:** `ReportCenterEngine.ts` exports figures to reports.

---

## 2. FX PIPELINE AUDIT MATRIX

| Pipeline Stage | Source Method / File | Rate Resolution Logic | Missing Date Fallback Behavior | Rate Provenance Auditability | Evidence Category |
|---|---|---|---|---|---|
| Rate Storage | Firestore `daily_exchange_rates` | Stores BRH, Commercial, and Envoy rate typologies. | Document absent | Original rate source stored in Firestore document | `STATIC_SOURCE` |
| Repository Fetch | `CurrencyRateRepository.ts` | Queries rate document by ISO date `YYYY-MM-DD`. | Falls back to `134.25` / `135.0` | Retains raw document ID | `STATIC_SOURCE` |
| Context Resolver | `NormalizedAmountResolver.ts` | Resolves grid rate for target currency and date. | Falls back to hardcoded `134.25` | Returns scalar rate applied | `STATIC_SOURCE` |
| Engine Conversion | `AnalyticsEngine.ts` | `sign * absAmount * rate` converted to 2 decimals. | Applies fallback without UI flag | Embedded in snapshot metric | `STATIC_SOURCE` |
| Export Generation | `ReportCenterEngine.ts` | Formats report columns using converted HTG values. | Uses method default `135.0` | PDF contains no missing-rate flag | `STATIC_SOURCE` |

---

## 3. PROVENANCE & GOVERNANCE FINDINGS

1. **Lack of Incomplete Data Propagation:** When `NormalizedAmountResolver.ts` falls back to `134.25`, the calculation succeeds silently without attaching an `isFxRateMissing: true` or `isEstimated: true` flag to the resulting snapshot metric.
2. **Audit Provenance Gap:** The snapshot stores the converted HTG amount, but does NOT persist the exact scalar exchange rate used or whether it originated from an official BRH daily rate vs a fallback.
3. **Verdict:** `NOT VERIFIED (UNAPPROVED TECHNICAL FALLBACK)` for all conversions lacking an authoritative historical rate record in `daily_exchange_rates`.
