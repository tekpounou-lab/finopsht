# FINOPS ERP — Currency & Exchange Rate Engine Specification

## Overview

FINOPS ERP operates within a dual-currency environment, utilizing **HTG (Haitian Gourde)** as the primary reporting/functional currency and **USD (US Dollar)** as a transactional and payment denomination. For financial compliance, auditability, and fiscal reporting, exchange rates cannot be hardcoded. 

This document defines the **Currency & Exchange Rate Engine (CERE)**, the authoritative rate sources, historical point-in-time conversions, audit trail compliance, and the `CurrencyRateRepository`.

---

## 1. Authoritative Rate Governance

To ensure consistency and regulatory compliance, FINOPS ERP enforces strict rules on exchange rate authority:

1. **Primary Authoritative Source**: The official daily exchange rate published by the **Banque de la République d'Haïti (BRH)** is the authoritative source for standard calculations.
2. **Administrative Override**: Admins with `SUPER_ADMIN` or `ADMIN` roles can specify custom exchange rates at the tenant level (`businessId`) for specific contracts or billing cycles.
3. **Forensic Audit Guard**: Any manual override or modification of the active exchange rate publishes a forensic log to the `AuditService` containing the before/after values, the actor's identity, and the justification.

---

## 2. Historical Point-in-Time Conversions

For audits, past transactions and ledger postings must be converted using the exchange rate that was **effective on the date of the transaction**, not the current spot rate.

```
                  [ Conversion Request ]
                            │
             (Amount, From, To, Target Date)
                            ▼
          +------------------------------------+
          |      CurrencyRateRepository        |
          +-----------------+------------------+
                            │
              (Look up: effectiveDate == Date)
                            ├─► Match Found: Use Rate
                            │
                            └─► Match Not Found:
                                 Find nearest rate recorded
                                 before or on target Date.
                                 Fallback to global default (135)
                                 if no past rate exists.
```

### 2.1 The Conversion Formula

When converting from standard **USD** to functional **HTG** at a historical timestamp $T$:

$$\text{Value}_{\text{HTG}}(T) = \text{Value}_{\text{USD}} \times \text{ExchangeRate}(T)$$

Where $\text{ExchangeRate}(T)$ is the active rate multiplier resolved for timestamp $T$.

---

## 3. High-Fidelity Exchange Rate Schema

All exchange rates are stored inside the `/businesses/{businessId}/exchange_rates` collection. Authoritative fallback or default system-wide rates are placed inside the `"SYSTEM"` tenant partition.

### 3.1 ExchangeRate Model

```typescript
export interface ExchangeRate {
  id: string;                    // Format: {from}_{to}_{effectiveDate} (e.g. "USD_HTG_2026-08-10")
  businessId: string;            // Tenant ID ("SYSTEM" for global BRH defaults)
  fromCurrency: "HTG" | "USD";   // Source denomination
  toCurrency: "HTG" | "USD";     // Target denomination
  rate: number;                  // Exchange rate multiplier
  effectiveDate: string;         // YYYY-MM-DD for day-based audit locking
  source: "BRH" | "ADMIN_OVERRIDE"; // Source of rate authority
  actorId: string;               // Firebase Auth User UID who created/updated it
  justification?: string;        // Legal justification for admin override
  createdAt: string;             // ISO-8601 timestamp
  updatedAt: string;             // ISO-8601 timestamp
}
```

---

## 4. `CurrencyRateRepository` Implementation

The repository encapsulates firestore lookups, local caching to prevent database roundtrips for identical days, and fallback resolution.

```typescript
export interface ICurrencyRateRepository {
  getLatestRate(businessId: string, from: string, to: string): Promise<number>;
  getRateAtDate(businessId: string, from: string, to: string, date: string): Promise<number>;
  setRate(rate: ExchangeRate): Promise<void>;
  convert(amount: number, from: string, to: string, businessId: string, date?: string): Promise<number>;
}
```

### 4.1 Local Thread-Safe Cache
To support dense calculations (e.g. running payroll on 1,000 employees without launching 1,000 individual Firestore queries), the repository utilizes an in-memory `RateCache` mapping `${businessId}:${from}:${to}:${date}` with a TTL of 5 minutes.
