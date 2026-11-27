# FINOPS ERP — Audits & Verification Archive (`/docs/audits/`)

This directory consolidates all forensic audits, remediation reports, security/RBAC verification matrices, and historical patch diffs.

---

## Subdirectories (Reorganized from Root)

| Subdirectory | Count | Scope |
|---|---|---|
| [`attendance/`](./attendance/) | 24 files | Attendance P0/P0.1/P0.2/P0.2.1 badge workflow traces, RBAC matrices, emulator reports, and transaction integrity reviews |
| [`business-intelligence/`](./business-intelligence/) | 21 files | BI P1.8 / P1.10 SSOT forensic audits, KPI reconciliation bridges, accrual/cash orthogonality matrices, and tax policy root-cause traces |
| [`p0-infrastructure/`](./p0-infrastructure/) | 19 files | P0 Firebase Admin initialization matrices, Vercel Node 22 packaging evidence, Cloud Run ADC migration audits, invitation 500/403 traces, and null-safe rules matrices |
| [`rbac/`](./rbac/) | 33 files | FINAYITI RBAC blueprint, Steps 1–4 endpoint coverage & operational profile enforcement reports/diffs, and `VULN_01` self-privilege-escalation remediation |

---

## Root-Level `/docs/audits/` Reports (Historical Phase Gates)

Directly inside `/docs/audits/` are 76 chronological phase-gate reports covering:
- **Bank Reconciliation & Cash Management:** `FINOPS_BANK_RECONCILIATION_*`, `FINOPS_CASH_MANAGEMENT_*`, `FINOPS_CASH_TRANSACTION_CATALOG_*`
- **BI Filters & Browser E2E:** `FINOPS_BI_E2E_*`, `FINOPS_BI_FILTERS_*`
- **FINAYITI Pre-Implementation Gates:** `FINOPS_FINAYITI_*_P02*`, `FINOPS_FINAYITI_*_P03*`
- **Module Governance (`MOD_GOV`):** `FINOPS_MODULE_GOVERNANCE_*`, `FINOPS_MOD_GOV_*`, `FINOPS_FIRESTORE_MOD_GOV_*`
- **Payroll & Schema Migrations:** `FINOPS_P1-4*`, `FINOPS_PAYROLL_*`, `FINOPS_SCHEMA_*`, `FINOPS_ONBOARDING_*`, `FINOPS_RH_PROFILE_*`

> For archived BI/implementation bundles from earlier cycles, also see [`../audit-archive/`](../audit-archive/).
