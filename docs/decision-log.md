# FINOPS ERP — Architecture Decision Records (ADR)

## ADR-001: Encapsulation of Firestore Access in Repository Pattern
- **Date**: 2026-07-21
- **Status**: Accepted
- **Context**: Direct Firestore calls inside React components led to duplicate code, missing error handling, and broken multi-tenant scoping.
- **Decision**: Ban direct Firestore SDK calls in React components/hooks. All persistence operations must go through `src/repositories/`.
- **Consequences**: Improved testability, centralized error handling via `handleFirestoreError`, enforced multi-tenancy.

---

## ADR-002: Survival Floor Protection in Payroll Engine
- **Date**: 2026-07-24
- **Status**: Accepted
- **Context**: Statutory labor laws require a minimum net living wage (15,000 HTG floor) after taxes and salary advances.
- **Decision**: Implemented automatic survival floor calculation inside `PayrollCalculationEngine.ts`.
- **Consequences**: Net payouts below 15,000 HTG are flagged and adjusted if gross pay satisfies eligibility rules.

---

## ADR-003: Cryptographic SHA-256 Audit Seals on Financial Transactions
- **Date**: 2026-07-26
- **Status**: Accepted
- **Context**: Financial audits require immutable proof against database record tampering.
- **Decision**: Every posted ledger entry and sealed payroll cycle calculates a SHA-256 signature combining record attributes and timestamps.
- **Consequences**: Forensics console can detect database modification anomalies instantly.

---

## ADR-004: In-Flight Request Deduplication in Resilient Firestore Layer
- **Date**: 2026-08-27
- **Status**: Accepted
- **Context**: Simultaneous component mounts and identity resolution cycles triggered duplicate network reads for identical document paths and queries.
- **Decision**: Integrated in-flight promise maps (`inFlightDocPromises`, `inFlightQueryPromises`) and 20s memory caching into `resilientFirestore.ts`.
- **Consequences**: Eliminated network thundering herd problem; concurrent identical reads share a single promise and cached result.

---

## ADR-005: Deterministic Local Heuristic Fallback for AI CFO Engine
- **Date**: 2026-08-27
- **Status**: Accepted
- **Context**: When cloud AI API quotas (429) or monthly spend caps are reached, executive users experienced service disruption.
- **Decision**: Implemented automatic fallback routing in `server.ts` to `FinancialRatioEngine.ts` whenever the Gemini API returns quota or spending cap warnings.
- **Consequences**: Zero downtime for financial analytics; users receive accurate deterministic ratios and financial health indicators offline.

---

## ADR-006: Direct Manual Employee Registration & Waiting Room State Machine
- **Date**: 2026-08-27
- **Status**: Accepted
- **Context**: Employees without Google accounts (e.g. iCloud users) needed a straightforward sign-up path, while preventing uninvited users from accessing sensitive tenant data.
- **Decision**: Added direct email/password sign-up in `UnifiedAuthPortal`. If an active invitation is detected, it is accepted automatically; otherwise, users are placed into `/waiting-room` with real-time Firestore listeners for owner approval.
- **Consequences**: Seamless employee onboarding without mandatory third-party OAuth, while preserving strict multi-tenant isolation.

---

## ADR-007: Device Hardware Time Synchronization for Kiosk QR Attendance
- **Date**: 2026-08-27
- **Status**: Accepted
- **Context**: Cloud server latency and regional time drift caused discrepancy in employee clock-in records on physical kiosk terminals.
- **Decision**: Embedded local device machine timestamping and timezone anchoring (`America/Port-au-Prince`) in `qrAttendanceService.ts` and `KioskAttendance.tsx`.
- **Consequences**: Accurate, dispute-free punch logs with offline-tolerant queuing.
