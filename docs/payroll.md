# FINOPS ERP — Payroll Engine Specification (Payroll V3)

> **Detailed Specification**: For complete domain models, overtime calculations, advance recovery subsystems, and quincena snapshots, consult [`docs/PAYROLL_V3_ARCHITECTURE.md`](/docs/PAYROLL_V3_ARCHITECTURE.md).

## Overview

The FINOPS ERP Payroll Engine handles automated calculation, legal tax compliance, pessimistic cycle locking, and automatic General Ledger posting.

---

## 1. Core Payroll Processing Pipeline

```
[ Cycle Creation / Selection ] ───(Automatic Naming + Deduplication)
          │
          ▼
[ Draft Parameter Adjustments ] ──(Edit dates, exclude staff, toggle ONA/OFATMA, soft-delete draft)
          │
          ▼
[ Calculation Engine Run ] ──────(FIXED/COMMISSION/HYBRID + Overtime + Bonuses - Absences/Advances - Dynamic ONA/OFATMA)
          │
          ▼
[ Survival Floor Protection ] ───(Ensures net pay >= 15,000 HTG minimum)
          │
          ▼
[ Dry-Run Validation ] ──────────(Forensic verification pass + Debug Tracing)
          │
          ▼
[ Cycle Sealed & Posted ] ───────(SHA-256 seal generated + Ledger journal posted)
```

---

## 2. Calculation & Deduction Formulas

- **Gross Pay**:
  $$\text{Gross} = \text{Base Salary} + \text{Commissions} + \text{Overtime (1.5x/2.0x)} + \text{Bonuses} - \text{Penalties}$$
- **Penalties (`PENALTY`)**:
  - Absences: If worked hours $< 94\text{h}$ (in a $96\text{h}$ quinzaine), $\text{Absence Penalty} = (96 - \text{Worked Hours}) \times \text{Hourly Rate}$.
  - Tardiness: Multiplied according to policy rate multiplier or fixed per-incident late fee.
  - Total penalties are deducted from Gross Pay and tracked in `penalty`, `penalties`, and `absencePenalties`.
- **Statutory Taxes & Dynamic Toggle (`enableTaxes`)**:
  - When `enableTaxes` or `isTaxesEnabled` is `false`, tax deductions are strictly $0\text{ HTG}$ across ONA and OFATMA (`GOV FEES` = 0).
  - When enabled:
    - ONA: $\text{Employee} = \text{Gross} \times 0.06$, $\text{Employer} = \text{Gross} \times 0.06$
    - OFATMA: $\text{Employee} = \text{Gross} \times 0.02$, $\text{Employer} = \text{Gross} \times 0.03$
- **Salary Advance Recovery (`advances` / `debts_deduction_cents`)**:
  - Unreimbursed active advances from `salary_advances` or ledger advance records are automatically recovered up to their installment schedule and deducted directly from the Net Pay.
- **Survival Floor Protection**:
  - If calculated $\text{Net Pay} < 15,000 \text{ HTG}$ and $\text{Gross} \ge 15,000 \text{ HTG}$, Net Pay is adjusted to the survival floor threshold ($15,000 \text{ HTG}$), followed by debt recoveries.

---

## 3. General Ledger Integration Rules

Upon posting a sealed payroll cycle, the system automatically creates a balanced double-entry transaction:

- **Debit**: `5100 - Payroll Expense (Masse Salariale)`
- **Credit**: `2100 - ONA Payable (Cotisations Sociales ONA)`
- **Credit**: `2110 - OFATMA Payable (Cotisations Sociales OFATMA)`
- **Credit**: `1010 - Bank Account / Net Payroll Clearing`
