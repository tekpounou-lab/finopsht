# FINOPS — BI-P1.7.2.3 SOURCE DATA INVENTORY

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.3 — Independent Financial Data Population & KPI Semantic Verification  
**Role:** Independent Principal Financial Data Architect, Senior Accounting Auditor, Payroll Reconciliation Specialist and QA Authority  
**Mode:** STRICT READ-ONLY — SOURCE-TO-SNAPSHOT FINANCIAL RECONCILIATION  
**Date:** November 2026  

---

## 1. EXECUTIVE SUMMARY & INVENTORY SCOPE

This document establishes the definitive inventory of actual source collections, repositories, domain models, and processing engines consumed by the Business Intelligence (BI) and Performance Intelligence (PIC) financial analytics pipeline in FINOPS ERP.

Every financial calculation in `AnalyticsEngine.ts` and `CanonicalCashEngine.ts` traces to specific entities and repositories.

---

## 2. SOURCE DATA INVENTORY MATRIX

| Entity / Collection | Repository File & Primary Method | Primary Key | Tenant Key | Currency Field | Amount Fields | Transaction Date | Accounting Date | Status Field & Values | Reversal Reference | GL Account Fields | Branch / Dept Fields | Evidence Category |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `LedgerTransaction` (`ledger_transactions`) | `src/repositories/LedgerRepository.ts` (`listByBusiness`) | `id` | `business_id` / `businessId` | `currency` | `amount`, `amount_cents`, `amount_htg`, `debit`, `credit` | `date`, `transaction_date` | `effectiveAccountingDate`, `effective_date` | `status` (`POSTED`, `REVERSED`, `VOID`, `PENDING`) | `referenceTransactionId`, `is_reversed` | `debit_account`, `credit_account` | `branch_id`, `department_id` | `STATIC_SOURCE` |
| `PayrollRecord` (`payroll_records`) | `src/repositories/PayrollRepository.ts` (`getPayrollRecordsByCycle`) | `id` | `business_id` / `businessId` | `currency` | `grossSalary`, `grossSalaryHtg`, `gross_salary_cents`, `netPay`, `employer_contributions_cents` | `paymentDate` | `period_start`, `period_end`, `effectiveAccountingDate` | `status` (`SEALED`, `APPROVED`, `CANCELLED`, `DRAFT`) | `reversal_of`, `isExcluded` | Mapped via `PayrollService` / `AccountingEngine` | `branch_id`, `department_id` | `STATIC_SOURCE` |
| `PayrollCycle` (`payroll_cycles`) | `src/repositories/PayrollRepository.ts` (`getCycles`) | `id` | `business_id` / `businessId` | `currency` | `totalGrossCents`, `totalNetCents`, `totalEmployerTaxCents` | `processed_at`, `createdAt` | `startDate`, `endDate` | `status` (`DRAFT`, `APPROVED`, `SEALED`, `PAID`) | N/A | Class 5 / Class 2 accounts | `branch_id` | `STATIC_SOURCE` |
| `ChartOfAccounts` (`chart_of_accounts`) | `src/repositories/accounting/ChartOfAccountsRepository.ts` | `code` | `business_id` | N/A | N/A | N/A | N/A | `is_active` (`true`/`false`) | N/A | `code`, `account_type`, `parent_code` | N/A | `STATIC_SOURCE` |
| `DailyExchangeRateGrid` (`daily_exchange_rates`) | `src/repositories/CurrencyRateRepository.ts` (`getRateForDate`) | `date` | `business_id` | Base: `HTG` | `rates.BRH`, `rates.CANADA`, `rates.EURO`, `rates.PESO` | `date` | `effective_date` | `status` | N/A | N/A | N/A | `STATIC_SOURCE` |
| `Branch` (`branches`) | `src/repositories/organization/index.ts` | `id` | `business_id` | N/A | N/A | N/A | N/A | `status` (`ACTIVE`, `INACTIVE`) | N/A | N/A | `id`, `name` | `STATIC_SOURCE` |
| `Department` (`departments`) | `src/repositories/organization/index.ts` | `id` | `business_id` | N/A | N/A | N/A | N/A | `status` (`ACTIVE`, `INACTIVE`) | N/A | N/A | `id`, `name`, `branch_id` | `STATIC_SOURCE` |

---

## 3. ENGINE & ADAPTER INVENTORY

1. **`AnalyticsEngine` (`src/domains/analytics/services/AnalyticsEngine.ts`):**
   - Central financial snapshot generator (`generateSnapshot`).
   - Sources: `LedgerTransaction[]`, `PayrollRecord[]`, `AttendanceRecord[]`, `Branch[]`, `Department[]`.
   - Accounting Modes: `ACCRUAL` (default) and `CASH`.

2. **`NormalizedAmountResolver` (`src/domains/analytics/utils/NormalizedAmountResolver.ts`):**
   - Converts foreign currency amounts (USD, CAD, EUR, DOP) to HTG.
   - Fallback Rate: `134.25` (technical code constant, unapproved business policy).

3. **`LedgerCashAdapter` (`src/domains/cash/adapters/LedgerCashAdapter.ts`):**
   - Adapts `LedgerTransaction` records into `NormalizedCashMovement`.
   - Uses `TreasuryClassification` to detect Class 10 cash legs.

4. **`CanonicalCashEngine` (`src/domains/cash/engine/CashBasisEngine.ts`):**
   - Processes adapted cash movements to derive cash inflows, outflows, and net cash flow.

5. **`AccountingEngine` (`src/services/AccountingEngine.ts`):**
   - Enforces double-entry rules and maps business events to debit/credit accounts.

6. **`PayrollCalculationEngine` (`src/components/payroll/services/PayrollCalculationEngine.ts`) & `PayrollService` (`src/services/payroll/PayrollService.ts`):**
   - Calculates gross salaries, statutory deductions (ONA, OFATMA, IRI), and employer contributions.

---

## 4. LIMITATION & EVIDENCE CONCLUSION

- **Evidence Category:** `STATIC_SOURCE` (Code inspection of repositories and models).
- **Limitation:** Live Firestore production database records were not queried directly in this read-only audit turn. Runtime database population is categorized as `NOT VERIFIED (RUNTIME DATASET)` while data schema structure and mapping logic are `VERIFIED (STATIC_SOURCE)`.
