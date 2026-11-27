# FINOPS ERP — Documentation Index (`/docs/`)

This directory is the architectural, security, operational, and audit knowledge base for **FINOPS ERP / FINAYITI Fusion**.

> **New to the codebase?** Start with [`../GEMINI.md`](../GEMINI.md) and [`../HANDOFF.md`](../HANDOFF.md).

---

## 1. Governance, Baseline & History

| Document | Description |
|---|---|
| [`FINOPS_CERTIFIED_BASELINE.md`](./FINOPS_CERTIFIED_BASELINE.md) | Frozen financial core governance (v4.0), change-control levels (`Level 0`–`Level 4`), and SSOT guarantees |
| [`decision-log.md`](./decision-log.md) | Architecture Decision Records (`ADR-001` through `ADR-019`) |
| [`changelog.md`](./changelog.md) | Chronological release & architectural changelog |
| [`roadmap.md`](./roadmap.md) | Completed sprint milestones and upcoming expansion phases |
| [`project-structure.md`](./project-structure.md) | Repository folder map and layer responsibilities |
| [`coding-standards.md`](./coding-standards.md) | TypeScript, React, testing, and naming conventions |
| [`technical-debt.md`](./technical-debt.md) | Tracked technical debt and remediation priorities |
| [`glossary.md`](./glossary.md) | Domain terminology (Haïti statutory payroll, accounting, cash management) |

---

## 2. Core System & Domain Specifications

| Document | Domain / Focus |
|---|---|
| [`architecture.md`](./architecture.md) | High-level system architecture and layered boundaries |
| [`firestore-architecture.md`](./firestore-architecture.md) | Firestore collection design, indexing, and multi-tenant isolation |
| [`repositories.md`](./repositories.md) | Repository pattern, error handling, and Firestore encapsulation |
| [`services.md`](./services.md) | Pure domain engines & server-side services |
| [`business-rules.md`](./business-rules.md) | Core ERP invariants and cross-module business rules |
| [`payroll.md`](./payroll.md) | Statutory payroll rules (ONA, OFATMA, survival floor, sealing) |
| [`accounting.md`](./accounting.md) | Double-entry Chart of Accounts, reversals, and SSOT rules |
| [`analytics.md`](./analytics.md) | `AnalyticsEngine`, Cash vs. Accrual modes, and BI KPI formulas |
| [`permissions.md`](./permissions.md) | 7-tier RBAC roles, `PermissionService`, and Maker-Checker rules |
| [`security.md`](./security.md) | Tenant isolation, Firestore rules, auth middleware, and secrets policy |
| [`deployment.md`](./deployment.md) | CI/CD & hosting template *(note: see `HANDOFF.md` for live named DB & Vercel WIF details)* |
| [`performance.md`](./performance.md) | Query optimization, listener management, and table virtualization |
| [`refactoring.md`](./refactoring.md) | Safe refactoring guidelines and change classification |
| [`ui-design-system.md`](./ui-design-system.md) | Tailwind tokens, `src/components/ui/` primitives, and UX patterns |

---

## 3. Subdirectories

| Folder | Contents |
|---|---|
| [`architecture/`](./architecture/README.md) | Deep-dive module specs (`data-model.md`, `LEDGER_MODULE.md`, `PAYROLL_V3_ARCHITECTURE.md`, `IDENTITY_MAPPING_AND_TENANCY.md`, `INVITATION_MANAGEMENT.md`, `EVENT_DRIVEN_ARCHITECTURE.md`, etc.) |
| [`audits/`](./audits/README.md) | Classified forensic audits, remediation reports, verification matrices, and patch diffs (`attendance/`, `business-intelligence/`, `p0-infrastructure/`, `rbac/`, plus phase reports) |
| [`audit-archive/`](./audit-archive/) | Archived historical BI & implementation-phase audit bundles (`business-intelligence/`, `implementation-phases/`) |
| [`engineering/`](./engineering/) | Engineering audit reports & manual validation checklists (`FINOPS_ENG_01_*`, `FINOPS_ENG_05_*`, `FINOPS_POST_ENG_05_*`) |
| [`performance/`](./performance/optimizations.md) | Performance engineering notes and optimization guides |
| [`sre/`](./sre/DISASTER_RECOVERY.md) | Site Reliability Engineering & Disaster Recovery runbook |
