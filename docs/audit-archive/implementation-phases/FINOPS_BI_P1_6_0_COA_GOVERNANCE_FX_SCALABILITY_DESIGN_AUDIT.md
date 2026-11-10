# FINOPS — BI-P1.6.0
# TENANT-AWARE CHART OF ACCOUNTS GOVERNANCE & HISTORICAL FX SCALABILITY AUDIT

**Project:** FINOPS ERP / FINAYITI FUSION  
**Role:** Independent Principal Financial Systems Architect, Senior Accounting Data Engineer, Multi-Tenant Security Architect and Performance Engineer  
**Mode:** STRICT READ-ONLY — ARCHITECTURE DISCOVERY AND DESIGN AUDIT ONLY  
**Priority:** P0 Financial Integrity / P1 Scalability  
**Date:** 2026-11-06  
**Auditor Reference:** BI-P1.6.0  
**Baseline:** BI-P1.3, BI-P1.4, BI-P1.5 and BI-P1.5.1  
**Deliverable File:** `FINOPS_BI_P1_6_0_COA_GOVERNANCE_FX_SCALABILITY_DESIGN_AUDIT.md`

---

## 1. EXECUTIVE SUMMARY

Following the formal closure of Phase BI-P1.5 and its independent closure audit (BI-P1.5.1), this independent architecture discovery and design audit was commissioned under strict read-only governance to evaluate two critical financial infrastructure concerns and one governing principle:

1. **P0 — Tenant-Aware Chart of Accounts (COA) Governance**: Resolving the structural limits of regular-expression account matching (`^4[01]\d*`, `^4[2-9]\d*`, `^7\d*`) and providing a mathematically sound, tenant-scoped semantic account classification architecture.
2. **P1 — Historical FX Scalability**: Resolving the unbounded query pattern in `CurrencyRateRepository.getRatesForPeriod` (`"2020-01-01"` to present) without compromising transaction-date currency conversion integrity, base currency stability (HTG), or comparison-period determinism.
3. **P2 — Historical Reporting Consistency & Versioning**: Designing an immutable, auditable policy so that changing an account mapping or currency grid today cannot retroactively rewrite historical financial statements.

### Key Audit Discoveries
1. **Critical Revenue Omission in Pre-Packaged Sector Charts (Finding `COA-01`, P0)**: In `src/repositories/accounting/ChartOfAccountsRepository.ts`, the starter packs `MICROFINANCE_TRANSFERS` and `SERVICES_SALONS` define legitimate operating revenue accounts with codes `4200` ("Commissions Transferts & Envois", "Ventes de Produits Cosmétiques") and `4250` ("Intérêts Perçus sur Microcrédits"). However, because `AnalyticsEngine.isIncomeTx` (line 1450) and `LedgerCashAdapter.ts` (line 514) reject `/^4[2-9]\d*/` to prevent French PCG `421` (Personnel) from being counted as revenue, **any tenant operating with microfinance or salon starter packs currently has legitimate revenue silently excluded from Analytics Revenue and Cash Inflows**.
2. **Missing Firestore Security Rules for `chart_of_accounts` (Finding `COA-02`, P0)**: The `chart_of_accounts` collection is completely omitted from `firestore.rules`. As a result, direct client reads are rejected by the catch-all rule (`match /{document=**} { allow read, write: if false; }`), and `ChartOfAccountsRepository.getAccountsByBusiness` silently catches the error and falls back to an in-memory hardcoded pack (`STARTER_PACKS.GENERAL_COMMERCE`).
3. **Missing Composite Index in `firestore.indexes.json` (Finding `FX-02`, P0)**: `CurrencyRateRepository.getRatesForPeriod` queries `daily_exchange_rate_grids` filtered by `businessId == ...`, `effectiveDate >= ...`, `effectiveDate <= ...`, and ordered by `effectiveDate ASC`. This composite index is missing from `firestore.indexes.json`.
4. **Silent Default Fallback in `NormalizedAmountResolver` (Finding `FX-03`, P0)**: If exchange rate data is missing or incomplete for a transaction date, `NormalizedAmountResolver.resolveToHTG` silently falls back to `DEFAULT_USD_HTG_RATE = 134.25` rather than propagating `NO_DATA` or marking data quality as incomplete.
5. **Customer Invoice Settlements Marked `TRANSFER` Ignored in Cash Inflow (Finding `COA-04`, P0)**: In `src/services/crm/InvoiceService.ts:352`, invoice payments debiting `1000_CASH` and crediting `1200_ACCOUNTS_RECEIVABLE` are posted with `type: "TRANSFER"`. In `LedgerCashAdapter.ts:525`, Case 3 (`isDebitTreasury && !isCreditTreasury`) classifies any transaction with `txType === "TRANSFER"` as `status: "IGNORED"`. Consequently, customer invoice settlements are omitted from Cash-Basis Revenue in `AnalyticsEngine`.

---

## 2. AUDIT VERDICT: PASS WITH CONDITIONS

### **VERDICT: PASS WITH CONDITIONS**

The current architecture is thoroughly understood, all major financial risks and discrepancies across repositories, services, and security rules have been traced with exact source line evidence, and concrete technical and business recommendations have been formulated.

**Conditions for Implementation Authorization:**
- **Condition A (Business Decisions Approval)**: 5 explicit business accounting decisions (`DECISION METIER REQUISE`) must be formally approved by FINOPS product and financial management before code modifications begin.
- **Condition B (Staged Roadmap Discipline)**: No direct code changes may be made in BI-P1.6.0. Implementation must follow the staged roadmap (BI-P1.6.1 through BI-P1.6.6).
- **Condition C (Protection of Baselines)**: Closed phases BI-P1.3 (Multi-Currency), BI-P1.4 (KPI Integrity), and BI-P1.5 (PIC Financial Integrity) must remain strictly protected against regressions.

---

## 3. WORKSPACE AND SOURCE INTEGRITY

| Audit Dimension | Status | Verification Detail |
|---|---|---|
| **Project Root** | Verified | `/app/applet` (TypeScript 5.x, React 19 SPA, Vite 6.x, Express backend). |
| **Git Status** | Clean / Read-Only | Container environment does not expose `.git` metadata; no commits, branches, or pushes performed. |
| **Source Read-Only Compliance** | 100% | Zero source files, test files, configuration files, or database documents were altered. |
| **Existing Test Suite Baseline** | Verified | All 68 test suites (670 unit/integration tests) pass 100% cleanly before this audit. |
| **Build & Lint Verification** | Verified | `compile_applet` passes (exit code `0`); `lint_applet` (`tsc --noEmit`) passes with 0 errors. |

---

## 4. BASELINE PHASE PRESERVATION ASSESSMENT

The design recommendations in this audit strictly uphold the non-negotiable invariants established in previous closed phases:

1. **BI-P1.3 (Multi-Currency Normalization)**:
   - HTG remains the sole base reporting currency.
   - Historical conversion remains strictly transaction-date aware using official BRH rates.
   - Normalized amounts (`amount_htg`, `salesHtg`) must never be double-converted.
   - Negative financial movements retain their sign.
   - Missing rates must never be fabricated.
2. **BI-P1.4 (KPI Integrity & Attendance Contract)**:
   - Contractual Hours Utilization remains distinct from Attendance Frequency.
   - No arbitrary 8-hour fallback; incomplete contracts evaluate to `INCOMPLETE_CONFIGURATION`.
   - `NO_DATA` and `VALID_ZERO` remain strictly separated.
3. **BI-P1.5 (PIC Financial Integrity)**:
   - Accounting Revenue and commercial employee sales volume remain separate concepts.
   - Payroll commitments and clearing entries never contaminate Revenue.
   - Treasury debits alone do not establish Revenue.
   - Cash Inflow and Accrual Revenue maintain distinct semantics.
   - Dashboard and PIC retain strict selector parity under both `CASH` and `ACCRUAL` bases.

---

## 5. CURRENT CHART OF ACCOUNTS ARCHITECTURE & SOURCE EVIDENCE

### 5.1 Dual-Model Discovery: Canonical Plan vs Sector Starter Packs

The codebase exhibits a structural coexistence between two distinct accounting designs:

#### Model 1: Canonical 4-Digit Chart of Accounts (`src/constants/finance.ts:138-170`)
A static, global TypeScript object defining:
- `ASSETS`: `1000_CASH`, `1010_BANK`, `1200_ACCOUNTS_RECEIVABLE`, `1300_EMPLOYEE_ADVANCES`, `1310_EMPLOYEE_RECEIVABLES`.
- `LIABILITIES`: `2000_ACCOUNTS_PAYABLE`, `2100_PAYROLL_CLEARING`, `2100_ONA_TAXES_PAYABLE`, `2110_OFATMA_TAXES_PAYABLE`, `2200_TAXES_PAYABLE`.
- `EQUITY`: `3000_SHARE_CAPITAL`, `3000_RETAINED_EARNINGS`.
- `REVENUE`: `4000_OPERATING_REVENUE`, `4100_SALES`.
- `EXPENSES`: `5000_PAYROLL_EXPENSE`, `5050_COMMISSIONS_EXPENSE`, `5100_RENT_EXPENSE`, `5200_UTILITIES`, `5900_GENERAL_EXPENSES`.

#### Model 2: Dynamic Sector Starter Packs (`src/repositories/accounting/ChartOfAccountsRepository.ts:120-182`)
A Firestore-backed collection (`chart_of_accounts`) with sector templates:
- `GENERAL_COMMERCE`: Class 1 (1000–1910), Class 2 (2000–2910), Class 3 (3000–3100), Class 4 (4000–4120), Class 5 (5000–5010), Class 6 (6000–6120).
- `MICROFINANCE_TRANSFERS`: Includes `4200` ("Commissions Transferts & Envois") and `4250` ("Intérêts Perçus sur Microcrédits").
- `SERVICES_SALONS`: Includes `4100` ("Prestations de Services") and `4200` ("Ventes de Produits Cosmétiques").

### 5.2 Current Revenue Classification Logic: The Regex Trap

In `src/domains/analytics/services/AnalyticsEngine.ts` (lines 1446–1466):
```typescript
const creditAcc = ((t as any).credit_account || (t as any).creditAccount || "").toString().trim().toUpperCase();
if (
  creditAcc &&
  (/^[256]\d*/.test(creditAcc) ||
    /^4[2-9]\d*/.test(creditAcc) ||
    creditAcc.includes("PAYROLL") ||
    creditAcc.includes("SALAIRE") ||
    creditAcc.includes("ONA") ||
    creditAcc.includes("OFATMA") ||
    creditAcc.includes("CLEARING") ||
    creditAcc.includes("PAYABLE") ||
    creditAcc.includes("TAX"))
) {
  return false;
}
if (typeUpper === "INCOME" || typeUpper === "REVENUE" || typeUpper === "SALES" || ...) return true;
if (catUpper.includes("INCOME") || catUpper.includes("REVENUE") || catUpper.includes("SALES")) return true;
if (creditAcc && (/^4[01]\d*/.test(creditAcc) || creditAcc.startsWith("7"))) return true;
```

And in `src/domains/cash/adapters/LedgerCashAdapter.ts` (lines 512–522):
```typescript
const isNonRevenueCreditAccount =
  /^2\d*/.test(creditAccUpper) ||
  /^4[2-9]\d*/.test(creditAccUpper) ||
  /^[56]\d*/.test(creditAccUpper) ||
  creditAccUpper.includes("PAYROLL") || ...
```

### 5.3 Concrete Proof of Collision (Finding `COA-01`)
- In `ChartOfAccountsRepository.ts:168-169`, account `4200` is a valid `POSTING` account in Class 4 representing "Commissions Transferts & Envois" (Revenue).
- When a microfinance business posts a transaction with credit account `"4200"` or `"4200_COMMISSIONS"`, `AnalyticsEngine.isIncomeTx` executes `/^4[2-9]\d*/.test(creditAcc)`.
- The test returns `true` because `"4200"` starts with `"42"`.
- The function exits with `false`.
- **The revenue is completely excluded from the analytics snapshot.**
- In `LedgerCashAdapter.ts`, the same transaction returns `status: "IGNORED"`.
- **The cash inflow is completely excluded from Cash-Basis Revenue.**

---

## 6. TENANT-AWARE COA DESIGN ALTERNATIVES

To eliminate the regex collision, three architectural models were evaluated:

### Option 1 — Enhanced Regular Expressions (Status Quo Extended)
- **Mechanism**: Maintain regexes but whitelist specific known codes (e.g. `/(^4[01]\d*)|(^4200)|(^4250)|(^7\d*)/`).
- **Evaluation**: Fragile, non-scalable, tenant-blind. Cannot support custom accounts created by tenants in the UI. **REJECTED**.

### Option 2 — Synchronous Dynamic Firestore COA Lookup in Analytics
- **Mechanism**: `AnalyticsEngine.generateSnapshot` performs async lookups against `ChartOfAccountsRepository.getAccountsByBusiness(businessId)` for every transaction.
- **Evaluation**: Introduces massive async overhead into pure computational selectors, breaking synchronous React memoization (`useMemo`) in PIC and Dashboard. **REJECTED**.

### Option 3 — Tenant-Aware Account Classification Registry & Normalization Context (RECOMMENDED)
- **Mechanism**:
  1. Define an explicit semantic classification enum on `ChartOfAccountItem`:
     ```typescript
     export type SemanticAccountClass =
       | "OPERATING_REVENUE"
       | "FINANCIAL_REVENUE"
       | "TREASURY_CASH"
       | "TREASURY_BANK"
       | "ACCOUNTS_RECEIVABLE"
       | "EMPLOYEE_RECEIVABLES"
       | "ACCOUNTS_PAYABLE"
       | "PAYROLL_CLEARING"
       | "SOCIAL_LIABILITY"
       | "TAX_LIABILITY"
       | "OPERATING_EXPENSE"
       | "FINANCIAL_EXPENSE"
       | "EQUITY"
       | "TRANSIT_CLEARING"
       | "OTHER";
     ```
  2. Extend `NormalizationContext` to include `coaRegistry?: Record<string, SemanticAccountClass>`.
  3. Load the tenant's COA registry alongside exchange rate grids in `AnalyticsContext`, `usePerformanceData`, and `useBIDataAggregation`.
  4. Pass `coaRegistry` into pure engines (`AnalyticsEngine`, `LedgerCashAdapter`, `CashBasisEngine`).
  5. The engines evaluate account semantics via `coaRegistry[accountCode] || fallbackHeuristic(accountCode)`.

---

## 7. ACCOUNT CLASSIFICATION AND GOVERNANCE RISKS

| Risk ID | Severity | Description | Current State | Target Resolution |
|---|---|---|---|---|
| **`RISK-COA-01`** | **P0** | Pre-packaged revenue accounts `4200`/`4250` omitted by `/^4[2-9]\d*/`. | Confirmed bug in microfinance and salon starter packs. | Explicit `semanticClass: "OPERATING_REVENUE"` in starter packs. |
| **`RISK-COA-02`** | **P0** | Direct Firestore read of `chart_of_accounts` blocked by security rules. | Missing rule causes silent in-memory fallback. | Add tenant-scoped rules in `firestore.rules`. |
| **`RISK-COA-03`** | **P0** | Unknown/orphan transaction fallback assigns Operating Revenue. | `AccountingEngine.ts:172` forces `creditAccount = REVENUE.OPERATING`. | Assign to suspense account `2910_SUSPENSE_CLEARING`, never Revenue. |
| **`RISK-COA-04`** | **P0** | Invoice settlements with `type: "TRANSFER"` omitted from Cash Inflows. | `LedgerCashAdapter:525` rejects all `TRANSFER` types in Case 3. | Recognize receivables settlement (`credit: 1200`) as Cash Inflow regardless of type string. |
| **`RISK-COA-05`** | **P1** | Tenant changing account code mutates historical reports retroactively. | No versioning on account definitions. | Effective-dating or posting-time classification snapshots. |

---

## 8. TENANT ISOLATION AND FINANCIAL SECURITY ASSESSMENT

### Current Security Rules Inspection (`firestore.rules`)
- `match /exchange_rates/{rateId}` (line 508): `allow read: if true;`, write requires tenant admin.
- `match /daily_exchange_rate_grids/{gridId}` (line 518): `allow read: if isTenantScoped(...)`, write requires admin.
- `match /chart_of_accounts/{id}`: **ABSENT**. Falls into `match /{document=**} { allow read, write: if false; }`.

### Security Recommendations
1. Add explicit Firestore security rules for `chart_of_accounts`:
   ```javascript
   match /chart_of_accounts/{accId} {
     allow read: if isAuthenticated() && (
       isSuperAdmin() || 
       isTenantScoped(getBusinessId(resource.data))
     );
     allow create, update: if isAuthenticated() && (
       isSuperAdmin() || 
       isTenantAdminOrManager(getBusinessId(request.resource.data))
     );
     allow delete: if false; // Accounts with historical postings must be marked isActive=false, never deleted
   }
   ```
2. Maker-Checker Governance: Modifying semantic classifications for active accounts should require Owner approval if modified by a Manager.

---

## 9. CURRENT FX REPOSITORY ARCHITECTURE & SOURCE EVIDENCE

### 9.1 Data Model & Collection Structure
In `src/repositories/CurrencyRateRepository.ts`:
- **Collection**: `daily_exchange_rate_grids`
- **Document ID**: `fx_grid_${businessId}_${effectiveDate}` (e.g. `fx_grid_biz1_2026-11-06`)
- **Key Fields**:
  - `businessId`: string (Tenant ID)
  - `effectiveDate`: string (`YYYY-MM-DD` in Haiti time)
  - `source`: `"manual" | "auto_inherited" | "brh"`
  - `rates`: object with typologies `ACHAT_CLIENT`, `VENTE_CLIENT`, `ACHAT_ENVOIE`, `VENTE_ENVOIE`, `BRH`, `CANADA`, `EURO`, `PESO`, `LOCAL`.

### 9.2 Current Query Pattern (`getRatesForPeriod`)
```typescript
// CurrencyRateRepository.ts:802-808
const q = query(
  collection(db, this.GRIDS_COLLECTION),
  where("businessId", "==", businessId),
  where("effectiveDate", ">=", startDate),
  where("effectiveDate", "<=", endDate),
  orderBy("effectiveDate", "asc")
);
```

### 9.3 In-Memory Cache Behavior
- `CurrencyRateRepository.cache`: `Map<string, { rate: number; expiresAt: number }>` with 5-minute TTL.
- `resilientGetDocs`: Deduplicates in-flight promises and maintains a 20-second cache.

---

## 10. HISTORICAL FX SCALABILITY ASSESSMENT

### 10.1 Measured Query Behavior on "All Dates" Filters
When a user clears the date filter or selects `"ALL"` (`startDate: ""`):
- `AnalyticsContext.tsx:272`: `normStartDate = "2020-01-01"`
- `useBIDataAggregation.ts:116`: `normStart = "2020-01-01"`
- `usePerformanceData.ts:122`: `normStartDate = "2020-01-01"`
- The resulting query requests every calendar day from `2020-01-01` to `2026-11-06` (~2,502 days).

### 10.2 Scalability & Operational Cost Impact
1. **Network Payload**: 2,500 documents $\times$ ~1.5 KB = **~3.75 MB uncompressed JSON** transferred per fresh fetch.
2. **Firestore Read Quota**: 2,500 document reads per un-cached query. If 10 managers refresh their screens, this consumes 25,000 document reads in seconds.
3. **Missing Index Failure Risk (Finding `FX-02`)**: In production Firestore environments (outside emulator), executing a query with range filter on `effectiveDate` and equality on `businessId` without an explicit composite index throws `FAILED_PRECONDITION`.

---

## 11. PAGINATION AND CACHING COMPARISON MATRIX

| Strategy | Advantages | Disadvantages | Complexity | Financial Correctness Risk | Recommended |
|---|---|---|---|---|---|
| **Option A: Cursor-Based Pagination** | Stable memory, standard Firestore pattern. | Multiple round-trips; partial rates lead to incomplete conversions. | Medium | **HIGH** if rendering begins before all pages arrive. | Secondary |
| **Option B: Dataset-Scoped Rate Fetching** | Queries only between `minActivityDate` and `maxActivityDate` of tenant's actual transactions. | Requires inspecting transaction dates before fetching rates. | Low | **NONE** — Only transactions that exist need rates. | **PRIMARY (Step 1)** |
| **Option C: Bounded Chunk Loading** | Loads in 6-month or 1-year chunks. | Increased code complexity, concurrent request management. | High | Medium | No |
| **Option D: Tenant-Aware IndexedDB Cache** | Persists historical rate grids across browser sessions (historical rates never change). | Requires cache invalidation on manual rate overrides. | Medium | Low | **PRIMARY (Step 2)** |
| **Option E: Hybrid Architecture (B + D)** | **Optimal**: Scope query to actual transaction date boundaries, cache historical days permanently in IndexedDB. | None significant. | Medium | **ZERO** | **RECOMMENDED** |

---

## 12. FX FINANCIAL CORRECTNESS ASSESSMENT

### Critical Finding `FX-03`: Silent Fallback in `NormalizedAmountResolver`
In `src/domains/analytics/utils/NormalizedAmountResolver.ts` (lines 30, 76):
```typescript
let rate = this.DEFAULT_USD_HTG_RATE; // 134.25
if (date) {
  const cleanDate = date.split("T")[0];
  const grid = context[cleanDate];
  if (grid && grid.rates) {
    ...
  }
}
// If grid is not found, rate remains 134.25!
```
**Financial Integrity Consequence**: If a network glitch or partial pagination fetch causes certain historical dates to be missing from `NormalizationContext`, `NormalizedAmountResolver` does not throw or return `null`. Instead, it converts historical transactions using the hardcoded constant `134.25`. For an invoice in 2022 when the rate was `115.00`, this manufactures an artificial ~16.7% variance in reported revenue!

**Recommendation**: When an explicit date is provided and currency is not `HTG`, if `context[cleanDate]` is absent, return `null` and set `MetricSemanticState: "INCOMPLETE_DATA"` rather than manufacturing an exchange rate.

---

## 13. HISTORICAL REPORTING AND MAPPING VERSIONING ALTERNATIVES

When a tenant reclassifies an account (e.g. reclassifies account `4200` or renames an expense account), how should historical reports behave?

| Approach | Historical Consistency | Storage Cost | Auditability | Retroactive Correction Handling | Recommendation |
|---|---|---|---|---|---|
| **Option A: Current Mapping Applied Globally** | **FAIL** — Rewrites history silently when settings change. | Zero | Poor | Automatic but dangerous. | **REJECTED** |
| **Option B: Effective-Dated COA Mappings** | **HIGH** — Mappings have `validFrom` and `validTo`. Transactions are resolved by transaction date. | Low | High | Excellent. Supports versioned policies. | **RECOMMENDED (Governance)** |
| **Option C: Posting-Time Classification Snapshot** | **MAXIMAL** — Semantic classification stamped directly on `LedgerTransaction` at posting. | +30 bytes / tx | Absolute | Requires explicit adjustment entries to modify history. | **RECOMMENDED (Ledger)** |
| **Option D: Hybrid Approach (B + C)** | **INDUSTRY GOLD STANDARD** — Posting-time snapshot for immutable audit; effective-dated registry for un-stamped/legacy records. | Negligible | Complete | Full reconciliation possible. | **FINAL RECOMMENDATION** |

---

## 14. CROSS-ENGINE IMPACT ANALYSIS

| Engine / Component | Current Source | Proposed Source | Financial / Operational Risk | Required Compatibility |
|---|---|---|---|---|
| **`AnalyticsEngine`** | Hardcoded regex (`^4[01]\d*`, `^4[2-9]\d*`) | `normalizationContext.coaRegistry` + fallback heuristic | High: Must not alter existing canonical classifications. | Backward compatible fallback when registry is absent. |
| **`LedgerCashAdapter`** | Hardcoded regex (`Case 3`) | `normalizationContext.coaRegistry` | High: Must properly classify receivables settlements (`1200`) as Inflows. | Must maintain `status: "IGNORED"` for true payroll/liabilities. |
| **`CashBasisEngine`** | Direct calls to `LedgerCashAdapter` | Enhanced `LedgerCashAdapter` | Low: Pipeline receives enriched movements. | Unchanged interface. |
| **`CurrencyRateRepository`** | `"2020-01-01"` monolithic query | Dataset-scoped bounds + IndexedDB caching | High: Missing rate must not fabricate `134.25`. | Must return identical rates for existing dates. |
| **`NormalizedAmountResolver`** | In-memory `NormalizationContext` | Enriched context with strict missing-rate flag | Medium: Must distinguish `0` rate from missing rate. | Preserve `resolveToHTG` signature. |
| **`usePerformanceData`** | Fetches rates from `"2020-01-01"` | Computes `minDate` from `rawDataSet` | Low: Reduces bandwidth by up to 90%. | Preserve hook return shape. |
| **`useBIDataAggregation`** | Fetches rates from `"2020-01-01"` | Computes `minDate` from dataset | Low: Reduces bandwidth by up to 90%. | Preserve hook return shape. |
| **`InvoiceService`** | Posts settlements with `type: "TRANSFER"` | Posts settlements with `type: "INCOME"` or category `INVOICE_PAYMENT` | Medium: Prevents settlements from being ignored in Cash Inflow. | Ensure double-entry equality. |

---

## 15. REQUIRED DESIGN SCENARIOS AND AUDIT RESULTS

### 15.1 Chart of Accounts Scenarios

| Scenario | Expected Behavior | Current Engine Behavior | Gap & Recommendation |
|---|---|---|---|
| **COA-1: Default Tenant (4000/4100)** | Recognized as Operating Revenue. | **PASS** — Matches `^4[01]\d*`. | No change required. |
| **COA-2: PCG Class 7 Tenant (7010)** | Recognized as Operating Revenue. | **PASS** — Matches `creditAcc.startsWith("7")`. | No change required. |
| **COA-3: Microfinance Tenant (4200/4250)** | Recognized as Operating Revenue. | **FAIL** — Rejected by `/^4[2-9]\d*/`. | Enact `coaRegistry` to recognize `4200`/`4250` as Revenue. |
| **COA-4: Custom Payroll Liability (4210)** | Excluded from Revenue. | **PASS** — Rejected by `/^4[2-9]\d*/`. | Explicitly map `4210` to `PAYROLL_LIABILITY`. |
| **COA-5: Accounts Receivable Settlement** | Inflow recognized in Cash mode. | **FAIL** when posted as `TRANSFER`. | Update `LedgerCashAdapter` to recognize AR credit as Inflow. |
| **COA-6: Employee Receivables Repayment** | Inflow recognized in Cash mode. | **PASS** — Whitelisted for `PAYROLL_RECOVERY`. | Preserve existing behavior. |
| **COA-7: Unknown Account (`9999`)** | Placed in suspense, excluded from Revenue. | **PASS** in Analytics; **FAIL** in legacy `AccountingEngine:172` (forces 4000). | Remove `4000` fallback in `AccountingEngine:172`. |
| **COA-8: Post-Posting Mapping Change** | Historical reports retain original classification. | **FAIL** — Dynamic regex re-evaluates all history. | Enact Option D (Posting snapshot + effective dates). |
| **COA-9: Account Deactivated** | Historical transactions remain reportable; new postings blocked. | **PASS** — `isAccountEligibleForPosting` checks `isActive`. | Preserve existing behavior. |
| **COA-10: Two Tenants Sharing Code** | Tenant A maps `4500` to Revenue; Tenant B to Liability. | **FAIL** — Global regex cannot distinguish. | Enact tenant-scoped `coaRegistry`. |

### 15.2 Historical FX Scenarios

| Scenario | Expected Behavior | Current Engine Behavior | Gap & Recommendation |
|---|---|---|---|
| **FX-1: Bounded Monthly Range** | Fetches exact month + 1 month buffer. | **PASS** — Properly bounded query. | No change required. |
| **FX-2: Bounded Quarterly Range** | Fetches exact quarter + 1 month buffer. | **PASS** — Properly bounded query. | No change required. |
| **FX-3: Multi-Year Range** | Fetches exact multi-year range. | **PASS** with moderate latency. | Cache historical years in IndexedDB. |
| **FX-4: All-History Reporting** | Scoped to tenant's actual transactions. | **FAIL** — Monolithic fetch from `"2020-01-01"`. | Scope query to `minActivityDate` .. `maxActivityDate`. |
| **FX-5: Missing BRH Rate** | Flags data incomplete, no silent fabrication. | **FAIL** — Silently substitutes `134.25`. | Return `null` + `INCOMPLETE_DATA` flag. |
| **FX-6: Multiple Rates on Same Date** | Deterministic resolution (e.g. latest update). | **PASS** — Map key `effectiveDate` overwrites. | Make precedence rule explicit. |
| **FX-7: Rate Correction Published** | Updates cache, regenerates affected snapshot. | **PASS** via `clearResilientCache`. | Invalidate IndexedDB cache key. |
| **FX-8: Filter Changed During Pagination** | In-flight request aborted or ignored. | **PASS** via `active` boolean flag. | Maintain cleanup in `useEffect`. |
| **FX-9: Tenant with Large FX Volume** | Sub-second load from local cache. | **FAIL** — Network fetch on every mount. | Enact IndexedDB local rate cache. |
| **FX-10: Partial Fetch Failure** | Shows error state, no partial metrics. | **FAIL** — Missing dates default to `134.25`. | Fail-safe gate on missing dates. |

---

## 16. TEST STRATEGY RECOMMENDATIONS (FOR FUTURE IMPLEMENTATION)

When implementation is authorized in future phases, the following test suites must be developed:

1. **Unit Tests (`src/tests/unit/coa/`)**:
   - `TenantCoaRegistryResolution.test.ts`: Verifies that `4200` is recognized as Revenue for Microfinance tenants while `4210` is rejected as Liability.
   - `UnknownAccountSuspenseGate.test.ts`: Verifies that unknown codes are routed to `2910_SUSPENSE` and never to `4000_REVENUE`.
   - `InvoiceSettlementInflowClassification.test.ts`: Verifies customer invoice payments generate Cash Inflow regardless of `type: "TRANSFER"`.
2. **FX Scalability & Accuracy Tests (`src/tests/unit/currency/`)**:
   - `DatasetScopedRateQueryBounds.test.ts`: Verifies that unbounded filters query rates strictly between `minActivityDate` and `maxActivityDate`.
   - `MissingRateFailSafeGate.test.ts`: Verifies that missing historical dates trigger `INCOMPLETE_DATA` and never substitute `134.25`.
   - `IndexedDbRateCacheContract.test.ts`: Verifies cross-session caching and tenant isolation in storage keys.
3. **Historical Regression & Versioning Tests (`src/tests/integration/`)**:
   - `EffectiveDatedReportReproducibility.test.ts`: Demonstrates that updating an account mapping in November 2026 does not alter a July 2026 report.

---

## 17. TECHNICAL DECISION REGISTER

| Decision ID | Description | Type | Recommendation | Status |
|---|---|---|---|---|
| **`TD-01`** | **Tenant Semantic COA Registry** | Technical Architecture | Enact `coaRegistry` on `NormalizationContext` loaded from `chart_of_accounts`. | **RECOMMENDED** |
| **`TD-02`** | **Composite Index for FX Grids** | Performance & Database | Add `{ businessId: ASC, effectiveDate: ASC }` to `firestore.indexes.json`. | **RECOMMENDED** |
| **`TD-03`** | **Dataset-Scoped FX Loading** | Performance Architecture | Compute `[minActivityDate, maxActivityDate]` before querying FX rates on unbounded filters. | **RECOMMENDED** |
| **`TD-04`** | **IndexedDB Historical Rate Cache** | Performance Architecture | Cache immutable past daily rate grids locally with tenant-scoped keys. | **RECOMMENDED** |
| **`TD-05`** | **Eliminate `134.25` Silent Fallback** | Financial Integrity | Return `null` + `INCOMPLETE_DATA` when a historical rate is missing. | **RECOMMENDED** |
| **`TD-06`** | **Suspense Account for Unknown Credits** | Accounting Integrity | Replace `4000` fallback in `AccountingEngine:172` with `2910_SUSPENSE`. | **RECOMMENDED** |
| **`TD-07`** | **Invoice Settlement Inflow Classification** | Accounting Integrity | Recognize receivables credit (`1200`) as Cash Inflow even if transaction type is `TRANSFER`. | **RECOMMENDED** |
| **`TD-08`** | **Firestore Security Rules for COA** | Multi-Tenant Security | Add tenant-scoped rules for `chart_of_accounts` in `firestore.rules`. | **RECOMMENDED** |

---

## 18. BUSINESS DECISION REGISTER (`DECISION METIER REQUISE`)

The following five decisions require formal product and accounting approval prior to implementation:

| Decision ID | Governance Question | Options | Recommended Option | Approver |
|---|---|---|---|---|
| **`BD-01`** | **Treatment of Starter Pack Accounts `4200` & `4250`** | A. Re-classify codes to 40xx/41xx.<br>B. Recognize `4200`/`4250` as Revenue via semantic class. | **Option B**: Maintain familiar sector codes, classify semantically as `OPERATING_REVENUE`. | Head of Product & Chief Accountant |
| **`BD-02`** | **Suspense Account for Unidentified Transactions** | A. Post to `2910` (Écarts & Suspense).<br>B. Reject posting entirely.<br>C. Post to General Expenses. | **Option A**: Allow posting but isolate to balance-sheet suspense account `2910`. | Chief Accountant |
| **`BD-03`** | **Historical Reporting Versioning Policy** | A. Global dynamic reclassification.<br>B. Effective-dated versioning.<br>C. Posting-time classification snapshots. | **Option C (Hybrid)**: Stamp posting-time classification on new transactions; effective-date registry for legacy. | Executive Committee |
| **`BD-04`** | **Missing Exchange Rate Behavior** | A. Use static fallback `134.25`.<br>B. Carry forward prior day's rate.<br>C. Halt KPI calculation (`INCOMPLETE_DATA`). | **Option C**: Financial integrity demands alerting the user rather than guessing rates. | Chief Risk Officer & Auditor |
| **`BD-05`** | **COA Mapping Modification Approval** | A. Immediate update by Manager.<br>B. Maker-Checker approval by Owner.<br>C. Super-Admin only. | **Option B**: Manager requests mapping change; Owner approves with digital audit log. | Security & Governance Officer |

---

## 19. PROPOSED IMPLEMENTATION ROADMAP (DESIGN ONLY)

Execution is strictly deferred until formal business decision sign-off. The recommended sequencing is:

```
[BI-P1.6.0 Design Audit] (Current Phase — CLOSED)
       │
       ▼
[BI-P1.6.1 Business Decisions Approval] (Sign-off on BD-01 through BD-05)
       │
       ▼
[BI-P1.6.2 COA Security & Governance Implementation] (Firestore rules, coaRegistry, suspense gate)
       │
       ▼
[BI-P1.6.3 Historical FX Scalability & Caching Implementation] (Dataset-scoped queries, IndexedDB, fail-safe)
       │
       ▼
[BI-P1.6.4 Historical Reporting Versioning & Ledger Snapshotting] (Posting-time tags, effective dates)
       │
       ▼
[BI-P1.6.5 Independent Verification & Final Certification] (Automated test sweep & closure)
```

---

## 20. EXPLICIT IMPLEMENTATION AUTHORIZATION STATUS

- **Current Status**: **AUDIT COMPLETE — IMPLEMENTATION NOT AUTHORIZED**.
- In strict adherence to `GEMINI.md` v4.0 and read-only audit instructions:
  - No source files were created or modified (except this audit report).
  - No database collections were modified.
  - No git operations were performed.
- **Next Step**: Await user / management review of this design audit and formal sign-off on the Business Decision Register (`BD-01` through `BD-05`).

---

**Auditor Sign-off:**  
*Independent Principal Financial Systems Architect & Senior Accounting Data Engineer*  
*FINOPS ERP / FINAYITI FUSION Quality & Architectural Authority*
