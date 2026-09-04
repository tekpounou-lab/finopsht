# FINOPS ERP — Business Rules & Governance Specification

## Overview

FINOPS ERP enforces strict business rules across organizational hierarchy, multi-currency accounting, licensing tiers, and feature entitlement.

---

## 1. Organizational Structure Rules

1. **Multi-Tenant Hierarchy**:
   - `Organization` → `Business Unit` → `Department` → `Cost Center` → `Employee`.
2. **Employee Uniqueness**:
   - An employee must belong to exactly one active `Business Unit` and `Department` within a tenant (`businessId`).
   - Re-assignments publish `EmployeeTransferred` events to adjust cost center budgets.
3. **Cost Center Budgeting**:
   - Payroll expenses are auto-debited from the assigned employee's `Cost Center` budget during payroll cycle posting.

---

## 2. Currency & Tax Compliance Rules

1. **Base Currency**:
   - Default operating currency for calculation and reporting is **HTG (Haitian Gourde)**.
   - Dual-currency display (HTG / USD) applies exchange rate transformations dynamically using verified central bank rates.
2. **Social Security & Tax Withholding**:
   - **ONA (Organisme d'Assurance Vieillesse)**: Mandatory 6% employee contribution, matched by 6% employer contribution.
   - **OFATMA (Office d'Assurance Accidents du Travail, Maladie et Maternité)**: Mandatory 2% employee contribution, 3% employer contribution.

---

## 3. SaaS Licensing, Dynamic Capacity & Gateway Integration Rules

1. **Dynamic Subscription Plan Engine (`subscription_plans` SSOT)**:
   - Super Administrators have full administrative governance to dynamically modify plan capacity (e.g., changing collaborator limits from 10 to 30 or any custom threshold) without code modification or service interruption.
   - All tenant quota enforcements automatically inherit the updated limits stored in Firestore.
2. **Multi-Currency Pricing**:
   - Each subscription plan supports dual-currency baseline pricing (USD and HTG) with dedicated extra-seat fees per additional collaborator per month.
3. **Payment Gateway Readiness**:
   - Plans support multi-channel payment gateway bindings:
     - **Stripe**: Price IDs and Product IDs for international card payments.
     - **MonCash**: Digicel Haïti mobile money service codes and merchant identifiers.
     - **Natcash**: Natcom Haïti mobile money service codes and merchant identifiers.
     - **Bank Transfer**: National and international wire transfers with BRH compliance.
4. **Feature Resolver**:
   - Access to modules (`PAYROLL_V3`, `PREDICTIVE_ANALYTICS`, `FORENSIC_AUDIT`, `QR_ATTENDANCE`, `COMMISSION_ENGINE`) is validated dynamically via `FeatureResolver` and `PermissionService`.
   - Any plan adjustment triggers a cryptographically sealed SHA-256 `ForensicLog` entry.
