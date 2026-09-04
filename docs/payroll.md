# FINOPS ERP — Payroll Engine Specification (Payroll V3)

> **Detailed Specification**: For complete domain models, overtime calculations, advance recovery subsystems, and quincena snapshots, consult [`docs/PAYROLL_V3_ARCHITECTURE.md`](/docs/PAYROLL_V3_ARCHITECTURE.md).

## Overview

The FINOPS ERP Payroll Engine handles automated calculation, legal tax compliance, pessimistic cycle locking, and automatic General Ledger posting.

---

## 1. Core Payroll Processing Pipeline

```
[ Active Period Selected ]
          │
          ▼
[ Pessimistic Lock Activated ] ──(Freezes timecards & adjustments)
          │
          ▼
[ Calculation Engine Run ] ────(Base + Overtime 1.5x/2x + Bonuses - Tax/Advances)
          │
          ▼
[ Survival Floor Protection ] ─(Ensures net pay >= 15,000 HTG minimum)
          │
          ▼
[ Dry-Run Validation ] ────────(Forensic verification pass)
          │
          ▼
[ Cycle Sealed & Posted ] ─────(SHA-256 seal generated + Ledger journal posted)
```

---

## 2. Tax Calculation Formulas

- **Gross Pay**:
  $$\text{Gross} = \text{Base Salary} + (\text{Hourly Rate} \times 1.5 \times \text{OT150}) + (\text{Hourly Rate} \times 2.0 \times \text{OT200}) + \text{Bonuses}$$
- **ONA Withholding (CNSS)**:
  $$\text{Employee ONA} = \text{Gross} \times 0.06$$
  $$\text{Employer ONA} = \text{Gross} \times 0.06$$
- **OFATMA Withholding (CNS)**:
  $$\text{Employee OFATMA} = \text{Gross} \times 0.02$$
  $$\text{Employer OFATMA} = \text{Gross} \times 0.03$$
- **Survival Floor Protection**:
  If calculated $\text{Net Pay} < 15,000 \text{ HTG}$ and $\text{Gross} \ge 15,000 \text{ HTG}$, Net Pay is adjusted to the survival floor threshold ($15,000 \text{ HTG}$).

---

## 3. General Ledger Integration Rules

Upon posting a sealed payroll cycle, the system automatically creates a balanced double-entry transaction:

- **Debit**: `5100 - Payroll Expense (Masse Salariale)`
- **Credit**: `2100 - ONA Payable (Cotisations Sociales ONA)`
- **Credit**: `2110 - OFATMA Payable (Cotisations Sociales OFATMA)`
- **Credit**: `1010 - Bank Account / Net Payroll Clearing`
