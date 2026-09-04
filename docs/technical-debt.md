# FINOPS ERP — Technical Debt Inventory & Sprint Remediation Strategy

## Overview

This living document serves as the authoritative registry for tracking large files, architectural complexity, and technical debt across the FINOPS ERP ecosystem. 

To ensure continuous system health and prevent code rot, technical debt remediation is integrated directly into the **Sprint Planning and Agile Delivery Lifecycle**.

---

## 1. Technical Debt Inventory Matrix

All modular debt is tracked, assigned to clear domain owners, and bound to target completion sprints with concrete thresholds.

| Target File / Module | Current Size | Category | Debt Description & Action Plan | Owner | Target Deadline | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| `src/components/SaaSLicensingConsole.tsx` | ~1,550 lines | UI / Monolith | Combined licensing, migration console, and SRE audit tab states. Extract panels into modular views inside `src/components/licensing/tabs/`. | **Lead UI Architect** | Sprint 7 (End of Q3) | High |
| `src/components/BusinessIntelligence.tsx` | ~1,900 lines | UI / Analytics | Dense analytics dashboard containing inline D3 logic. Extract KPI panels and D3 charting into `src/domains/analytics/components/`. | **Principal Analytics Eng** | Sprint 8 (Mid Q4) | High |
| `src/components/DashboardShell.tsx` | ~1,100 lines | UI / Layout | Embedded navigation, header widgets, and responsive drawer states. Modularize core layouts and extract navigation into sub-menus. | **Senior Frontend Dev** | Sprint 9 (End of Q4) | Medium |
| `src/components/ledger/DoubleEntryTable.tsx` | ~600 lines | UI / Component | Extract virtualized ledger row items and filtering modal components into isolated, reusable sub-components. | **Senior Ledger Engineer** | Sprint 7 (End of Q3) | Low |

---

## 2. Sprint Planning Integration: The "Debt Budget"

To guarantee that technical debt is addressed consistently without stalling business feature delivery, FINOPS ERP establishes a strict **Debt Budget Rule**:

* **Bandwidth Allocation**: Exactly **15% to 20% of total engineering story points** per sprint is reserved exclusively for technical debt remediation.
* **Sprint Commitment Rule**: Any sprint planning session must include at least one ticket from the Technical Debt Inventory Matrix above, estimated and assigned to the registered owner.
* **Refactoring Gates**: Refactoring tickets cannot be closed unless they satisfy the Quality Gates outlined in [`docs/refactoring.md`](/docs/refactoring.md) (Zero regressions, 100% type-safety, and green compilation builds).

---

## 3. Automated Dead Code & Dependency Analysis

To prevent dead code accumulation (unused exports, orphaned files, redundant modules), FINOPS ERP employs automated linting and scanning:

### 3.1 Static Analysis Tooling: Knip & TS-Prune

* **Tool of Choice**: **`knip`** is configured at the project root to detect unused files, unused exports, class/enum orphans, and unreferenced packages.
* **Automated CI Check**: A knip verification check runs as part of the pre-commit and CI/CD validation pipelines:
  ```bash
  npm run knip
  ```
* **Enforcement Threshold**: Any unused export or orphaned module detected inside the `/src` directory must be pruned or documented with an explicit bypass directive before a branch is permitted to merge into `main`.

---

## 4. Remediation Guidelines

1. **Rule of 400**: Any file exceeding 400 lines of code should be split into smaller, modular modules (UI, Hooks, Services, or Repositories) following the domain division of FINOPS ERP.
2. **Incremental Remediation**: Developers must clean adjacent small debt when performing features within that module (the "Boy Scout Rule").
3. **Traceability**: All technical debt tickets must refer to a specific entry in this living inventory file for legal and audit traceability.
