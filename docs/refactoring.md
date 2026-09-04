# FINOPS ERP — Refactoring & Technical Debt Strategy

> **Detailed Execution Reports**: For comprehensive dependency graphs, audit logs, and priority matrices, consult:
> - [`docs/refactoring/EXECUTION_STRATEGY.md`](/docs/refactoring/EXECUTION_STRATEGY.md)
> - [`docs/refactoring/AUDIT_REPORT.md`](/docs/refactoring/AUDIT_REPORT.md)
> - [`docs/refactoring/DEPENDENCY_MAP.md`](/docs/refactoring/DEPENDENCY_MAP.md)
> - [`docs/refactoring/PRIORITY_MATRIX.md`](/docs/refactoring/PRIORITY_MATRIX.md)
> - [`docs/refactoring/REFACTORING_ROADMAP.md`](/docs/refactoring/REFACTORING_ROADMAP.md)

## Overview

The Refactoring Strategy outlines the systematic decomposition of legacy monolithic components into modular UI widgets, custom hooks, business services, and encapsulated repositories.

---

## 1. Refactoring Methodology (Phased Approach)

1. **Phase 1 — UI Component Extraction**: Isolate layout views and sub-components into `src/components/` and `src/components/ui/`.
2. **Phase 2 — Hook Extraction**: Move state management, filters, and pagination into custom hooks in `src/hooks/`.
3. **Phase 3 — Service Extraction**: Move pure domain calculations (Tax, Payroll, Double-entry logic) into `src/services/`.
4. **Phase 4 — Repository Isolation**: Encapsulate all Firestore calls into `src/repositories/`.
5. **Phase 5 — Performance & Verification**: Apply lazy loading, virtualization, memoization, and dry-run validation.
6. **Phase 6 — Dead Code Elimination**: Remove legacy stubs and verify TypeScript compilation.

---

## 2. Refactoring Quality Gates

- **Zero Regression**: Functional business behavior and visual layouts must remain identical before and after refactoring.
- **Type Safety**: `npm run lint` (`tsc --noEmit`) must pass with 0 errors after every phase pass.
- **Build Verification**: `compile_applet` must build green before completing refactoring turns.
