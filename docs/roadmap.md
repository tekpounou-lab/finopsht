# FINOPS ERP — Product & Architecture Roadmap

## Overview

The FINOPS ERP roadmap details completed architectural milestones and upcoming development phases for enterprise expansion.

---

## Completed Milestones

- **Sprint 1 — UI Component Extraction**: Separated core layout and atomic design system primitives (`src/components/ui`).
- **Sprint 2 — Hooks & State Extraction**: Created reusable hooks (`usePayrollData`, `useAttendance`, `useLedger`).
- **Sprint 3 — Service Layer Extraction**: Built pure domain calculation engines (`PayrollCalculationEngine`, `SnapshotEngine`).
- **Sprint 4 — Repository Layer Isolation**: Encapsulated Firestore persistence across `src/repositories/`.
- **Sprint 5 — Forensic Vault & Pessimistic Lock**: Integrated SHA-256 integrity verification, Dry-Run simulation, and pessimistic timecard locking.
- **Sprint 6 — Enterprise Testing & Quality Assurance**: Established automated Vitest test suite (`src/tests/`), table virtualization (`VirtualizedTable`), and performance benchmarks (`docs/testing/`).
- **Sprint 7 — Architecture Hardening, Governance & AI Constitution**: Synchronized architecture maps, created dependency/performance/security reports, established development standards (`docs/development/`), and defined AI Development Constitution (`docs/AI_DEVELOPMENT_GUIDE.md`).
- **Sprint 8 — Enterprise Observability & System Health Center**: Built complete telemetry pipeline (`ObservabilityService`), Alert Engine, Recommendation Engine, and 8 domain observability centers in `src/components/observability/`.
- **Sprint 9 — Identity Lifecycle & Kiosk Hardware Resiliency**: Delivered direct manual employee registration (iCloud/email), real-time Waiting Room, hardware-synchronized Kiosk pointage terminal, in-flight Firestore request deduplication, and AI CFO deterministic fallback relais.

---

## Upcoming Enterprise Expansion Phases

- **Sprint 10 — Multi-Tenant Central Bank Multi-Currency FX Engine**: Automated central bank FX sync and currency hedging reporting.
- **Sprint 11 — Advanced Predictive Machine Learning Intelligence**: Predictive anomaly detection for attendance anomalies and budget leakage.
