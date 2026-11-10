# FINOPS ERP / FINAYITI FUSION
## BI-P1.7.3 — DECISION IMPACT MATRIX

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.3 — Business Owner Participation & Financial Policy Sign-Off  
**Document ID:** FINOPS_BI_P1_7_3_DECISION_IMPACT_MATRIX  
**Governance Mode:** STRICT GOVERNANCE DOCUMENT PREPARATION — READ ONLY (NO CODE IMPLEMENTATION)  
**Status:** IMPACT MATRIX COMPLETE — FOR HUMAN DECISION-MAKER EVALUATION  

---

## 1. PURPOSE AND SCOPE

This Decision Impact Matrix maps each of the six pending accounting policy decisions (`BD-ACC-01` through `BD-ACC-06`) to its technical, financial statement, operational, and audit risk impacts across the FINOPS ERP / FINAYITI FUSION platform.

Decision-makers must use this matrix to evaluate the system-wide effects of selecting Option A vs Option B for each decision.

---

## 2. CROSS-MODULE IMPACT MATRIX

| Decision ID | Decision Title | Affected UI Modules | Affected Backend Engines | GL COA Impact | Financial Statement Impact | Risk of Non-Selection |
|---|---|---|---|---|---|---|
| **`BD-ACC-01`** | AR Semantics | Executive BI, Billing Dashboard, Client AR Aging | `InvoiceEngine.ts`, `ReceivablesResolver.ts` | Asset Account `1100 - Accounts Receivable` | Balance Sheet (Short-term Assets), Cash Flow Projections | Overstating short-term liquidity if uncollectible invoices remain in AR. |
| **`BD-ACC-02`** | AP Semantics | Executive BI, Till Vouchers, Branch Expense Desk | `VoucherEngine.ts`, `PayablesResolver.ts` | Liability Account `2100 - Accounts Payable` | Balance Sheet (Short-term Liabilities), Working Capital | Understating branch operational liabilities if unapproved vouchers excluded. |
| **`BD-ACC-03`** | Payroll Timing | Executive BI Summary, Payroll Desk, Cash Ledger | `PayrollEngine.ts`, `DisbursementService.ts` | Liability Account `2200 - Accrued Payroll` | Income Statement (Period Expense Matching), Cash Flow | Distortion of monthly net margins due to payout date timing spikes. |
| **`BD-ACC-04`** | Payroll COA Class | Financial Reports, P&L Statement, Cost Center BI | `GeneralLedgerEngine.ts`, `COAMappingService.ts` | Split: `5100 - Direct Labor` vs `6100 - Admin Payroll` | Income Statement (Gross Margin vs Operating Margin) | Inability to compute accurate Gross Profit / Gross Margin metrics. |
| **`BD-ACC-05`** | EBITDA KPI Label | Executive BI KPI Grid, Performance Module | `ExecutiveBIEngine.ts`, `KPIAggregator.ts` | No direct GL change (UI Presentation Layer) | Executive Dashboard KPI presentation integrity | Misleading users to confuse Operating Result ($R - E$) with Net Profit. |
| **`BD-ACC-06`** | Historical FX Policy | Executive BI, Multi-Currency Ledger, Till Balances | `NormalizedAmountResolver.ts`, `ReportCenterEngine.ts` | `7800 - FX Gain/Loss` / Balance Sheet Revaluation | Multi-Currency Financial Statements & Consolidated Reports | $7,500 HTG divergence per $10,000 USD transaction due to fallback rate mismatch. |

---

## 3. DEEP-DIVE ANALYSIS PER DECISION

### 3.1 BD-ACC-01 — AR Semantics
- **Option A (Standard Accrual):** Aligns BI metrics directly with General Ledger receivables. Standardizes aging buckets (0-30, 31-60, 61-90, 90+ days).
- **Option B (Cash-Basis AR):** Diverges from General Ledger receivables. Requires maintaining dual presentation layers for BI vs Accounting.

### 3.2 BD-ACC-02 — AP Semantics
- **Option A (Accrual AP):** Captures branch operational commitments immediately. Prevents surprise cash drains during payout runs.
- **Option B (Disbursement AP):** Only shows liabilities when cash is queued. Conceals committed branch expenditure pipeline.

### 3.3 BD-ACC-03 — Payroll Timing
- **Option A (Pay-Period Accrual):** Ensures expenses match the operational work period. Essential for multi-tenant P&L accuracy.
- **Option B (Cash Payout Date):** Creates artificial expense zeros during non-payout weeks and massive spikes on payout days.

### 3.4 BD-ACC-04 — Payroll COA Governance
- **Option A (Dual COA Mapping):** Enables true Managerial Accounting. Direct tellers/staff mapped to Cost of Services; management to OPEX.
- **Option B (Single Line):** Keeps all payroll under `6100`. Limits P&L analysis to bottom-line operating margin.

### 3.5 BD-ACC-05 — EBITDA / Operating Result KPI Label
- **Option A (Relabel to "Résultat d'Exploitation"):** Resolves P0 finding `KPI_SEMANTIC_MISMATCH` with zero risk of breaking financial engine calculations. UI label update takes 1 hour.
- **Option B (Expand to Net Profit):** Requires building full Depreciation, Amortization, Interest, and Tax calculation sub-systems. High technical cost and risk.

### 3.6 BD-ACC-06 — Historical FX Fallback Policy
- **Option A (Central Governance FX Master & Priority Cascade):** Resolves P0 finding `FX_POLICY_UNAPPROVED_FALLBACK`. Eliminates duplicate hardcoded constants (`134.25` vs `135.0`). Ensures exact 1:1 cross-component reconciliation.
- **Option B (Strict Freeze on Missing Rate):** Guarantees zero fallback error, but causes frequent UI report freezes when daily central bank rates are delayed.

---

## 4. CONSOLIDATED RISK ASSESSMENT

```text
CRITICAL GOVERNANCE RISK: HIGH
UNAPPROVED TECHNICAL CONSTANTS IN CODE: VERIFIED (134.25 vs 135.0 HTG/USD)
SEMANTIC MISMATCH IN EXECUTIVE KPI: VERIFIED ("Bénéfice Net" = Operating Result)

RECOMMENDED ACTION FOR BUSINESS OWNER:
Execute Option A across all six decisions to achieve immediate compliance, complete SSOT reconciliation, and unblock software remediation.
```
