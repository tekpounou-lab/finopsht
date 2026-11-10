# FINOPS — BI-P1.7.2.4 MISSING FX SAFETY SPECIFICATION

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.4 — P0 KPI Semantic Correction & FX Policy Remediation Readiness  
**Role:** Independent Principal Financial Data Architect, Accounting Policy Analyst, FX Governance Specialist and Senior QA Authority  
**Mode:** STRICT READ-ONLY — REMEDIATION READINESS AND DECISION CONTROL  
**Date:** November 2026  

---

## 1. TECHNICAL SAFETY ARCHITECTURE FOR MISSING FX RATES

To eliminate silent conversions using hardcoded constants (`134.25` or `135.0`), this specification defines the technical behavior, propagation schema, and UI indicators required when a historical exchange rate is missing for a transaction date.

```text
                               ┌───────────────────────────┐
                               │  MISSING FX RATE DETECTED │
                               └─────────────┬─────────────┘
                                             │
             ┌───────────────────────────────┴───────────────────────────────┐
             ▼                                                               ▼
┌──────────────────────────┐                                   ┌──────────────────────────┐
│  BEHAVIOR A: FAIL CLOSED │                                   │ BEHAVIOR B: FAIL SAFE    │
│  (Block Calculation)     │                                   │ (Carryforward + Flag)    │
├──────────────────────────┤                                   ├──────────────────────────┤
│ • Return N/D             │                                   │ • Use prior daily BRH    │
│ • Block Export           │                                   │ • Attach isEstimated=true│
│ • High operational halt  │                                   │ • Display amber badge    │
└──────────────────────────┘                                   └──────────────────────────┘
```

---

## 2. COMPARATIVE EVALUATION OF SAFETY BEHAVIORS

| Dimension | Behavior A: Fail Closed (Strict Block) | Behavior B: Fail Safe (Prior-Day Carryforward + Warning Flag) | Behavior C: Silent Fallback (Current Legacy) |
|---|---|---|---|
| **Calculation Behavior** | Rejects conversion; sets metric to `null` / `N/D`. | Converts using most recent prior verified BRH rate; attaches `isEstimatedFx: true`. | Converts silently using hardcoded `134.25` or `135.0`. |
| **UI Presentation** | Displays `N/D` with warning alert `[Taux de change indisponible]`. | Displays converted amount with amber badge `[Taux Estimé - BRH JJ/MM]`. | Displays converted amount with no indication of missing rate. |
| **Export Impact** | Blocks PDF/Excel export or exports explicit `INCOMPLETE_DATA` warning. | Exports converted values with footnote: `* Contient des conversions à taux estimé`. | Exports converted values as if 100% verified. |
| **Financial Integrity** | **HIGH** (Zero risk of unverified figures). | **HIGH** (Transparent estimation clearly communicated). | **LOW** (Unchecked risk of silent financial error). |
| **Operational Continuity** | **LOW** (Single missing rate date halts entire executive dashboard). | **HIGH** (Dashboard remains operational with clear disclaimer). | **HIGH** (Seamless but unverified). |

---

## 3. PROPAGATION SPECIFICATION ACROSS CONSUMERS

1. **`NormalizedAmountResolver.ts` Interface Extension:**
   ```typescript
   export interface NormalizedAmountResult {
     amountHtg: number;
     rateUsed: number;
     rateDate: string;
     rateSource: "OFFICIAL_BRH" | "PRIOR_DAY_CARRYFORWARD" | "MISSING_BLOCK";
     isEstimated: boolean;
   }
   ```
2. **Snapshot Object Schema:**
   - Attach `fxMetadata: { totalConvertedTxs: number, estimatedTxsCount: number, missingRatesDates: string[] }` to `AnalyticsSnapshot`.
3. **UI Badging:**
   - When `estimatedTxsCount > 0`, render an amber warning icon next to `Revenue`, `Expenses`, and `Operating Result` KPI cards with tooltip details.
4. **Export Footnote:**
   - `ReportCenterEngine.ts` appends a mandatory footer whenever `estimatedTxsCount > 0`.

---

## 4. AUDIT RECOMMENDATION

- **Recommended Safety Behavior:** **Behavior B (Fail Safe with Prior-Day Carryforward & Explicit `isEstimatedFx` Warning)**.
- **Status:** **`TECHNICALLY READY — BUSINESS APPROVAL PENDING`** (Subject to Business Owner sign-off on BD-ACC-06).
