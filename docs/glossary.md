# FINOPS ERP — Domain & Technical Glossary (Single Source of Truth)

> **Code Implementation**: All fiscal, accounting, and payroll terms, enumeration constants, and semantic Zod validators are centralized in [`src/constants/finance.ts`](/src/constants/finance.ts).

---

## 1. Statutory Fiscal & Social Security Terms

- **ONA (Office National d'Assurance-Vieillesse)**:
  - *Statutory Role*: Public Haitian social security administration managing mandatory old-age pension and retirement schemes.
  - *Standard Rates*: **6% Employee Withholding**, **6% Employer Contribution** (Total 12%).
  - *Legacy ERP Alias*: Frequently referred to in generic accounting engines as **`CNSS`** (`cnssRateEmployee`, `cnssRateEmployer`, `cnss_employee_cents`).
  - *Legal Basis*: Décret du 28 août 1967 régissant l'Office National d'Assurance-Vieillesse.
  - *Accounting Ledger Account*: `2100_ONA_TAXES_PAYABLE` (Liabilities).

- **OFATMA (Office d'Assurance Accidents du Travail, Maladie et Maternité)**:
  - *Statutory Role*: Public Haitian social security administration covering occupational accidents, work-related illnesses, and maternity.
  - *Standard Rates*: **2% Employee Withholding**, **3% Standard Employer Contribution** (2% for low-risk commerce, up to 6% for high-risk industrial work).
  - *Legacy ERP Alias*: Frequently referred to in generic payroll models as **`CNS`** (`cnsRateEmployee`, `cnsRateEmployer`, `cns_employee_cents`).
  - *Legal Basis*: Loi organique régissant l'OFATMA et Code du Travail Haïtien.
  - *Accounting Ledger Account*: `2110_OFATMA_TAXES_PAYABLE` (Liabilities).

- **Survival Floor (Seuil de Survie / Plafond de Protection Salariale)**:
  - *Definition*: Mandatory legal net payout floor benchmarked at **15,000 HTG**.
  - *Rule*: When an employee's gross pay is $\ge 15,000\text{ HTG}$, the net payout cannot drop below $15,000\text{ HTG}$ due to tax deductions or loan/advance recoupments.
  - *Constant*: `SURVIVAL_FLOOR_HTG = 15000` in `src/constants/finance.ts`.

---

## 2. Core Architectural & Financial Terms

- **Business Snapshot**: An immutable rollup document produced by `SnapshotEngine.ts` summarizing financial and workforce aggregates for sub-second analytical reporting.
- **Chart of Accounts (COA)**: Standardized accounting account hierarchy (`1000` Cash, `1010` Bank, `2100` ONA Payable, `2110` OFATMA Payable, `4000` Revenue, `5000` Payroll) defined in `CHART_OF_ACCOUNTS`.
- **Cost Center**: An organizational sub-unit to which payroll expenses and operational overhead are allocated for departmental budget tracking.
- **Double-Entry Equilibrium Rule**: Fundamental accounting invariant requiring $\sum \text{Debits} = \sum \text{Credits}$ for every posted transaction, validated via `validateDoubleEntryEquilibrium`.
- **Dry-Run**: A trial execution pass of payroll or ledger operations without persisting records to Firestore.
- **Forensic Audit Log**: A signed audit event record containing SHA-256 signatures for tamper verification.
- **HTG (Haitian Gourde)**: The primary currency of calculation for statutory taxes (ONA/OFATMA) and base salary calculations in FINOPS ERP (`BASE_CURRENCY = "HTG"`).
- **Pessimistic Lock**: A temporary system lock applied to a payroll cycle that freezes timecards and adjustments during calculation.
- **Quincena**: The standard 15-day bi-weekly payroll cycle (Q1: 1st–15th, Q2: 16th–End of Month).
- **Repository Pattern**: An abstraction layer that encapsulates data access logic away from UI components and business services.
- **Zod Semantic Validation**: Strict runtime schema enforcement for financial amounts (`AmountHtgSchema`, `AmountCentsSchema`) and tax rates (`PercentageRateSchema`, `TaxRateConfigSchema`).

