# FINOPS ERP — Performance, Virtualization & Caching Specification

## Overview

FINOPS ERP maintains desktop-class UI performance (> 60 FPS) and low latency even under heavy multi-thousand row datasets.

---

## 1. Key Performance Rules

1. **Component File Boundaries**: Keep components modular (< 400 lines) to minimize unnecessary component re-renders.
2. **Virtualization**: Multi-row datasets (Ledger transaction streams, attendance logs, employee rosters) use virtualized list rendering or paginated slices.
3. **Memoization & Selectors**: Complex analytical calculations use `useMemo` and pure selectors (`src/domains/analytics/selectors/`).
4. **Lazy Loading**: Route-level and heavy feature-level components (e.g. `SaaSLicensingConsole`, `PredictiveIntelligenceCenter`) are dynamically imported via `React.lazy` and `Suspense`.

---

## 2. Memory & Network Optimization

- **Firestore Query Bounds**: Queries enforce `.limit(N)` clauses on real-time collection listeners to bound memory usage.
- **Snapshot Compression**: Snapshot engines collapse thousands of granular ledger lines into a single compressed `BusinessSnapshot` document.
- **Image Optimization**: Avatars and badges use scaled WebP or optimized vector assets.

---

## 3. SynchronizationEngine & Listener Rate-Limiting

- **Conditional Listener Startup (`isBizActive`)**: Real-time Firestore subscriptions via `SynchronizationEngine.startSync(business_id)` are executed ONLY when `isBizActive` resolves to `true` (`identityStatus === "ACTIVE"`, `business.status === "ACTIVE" | "APPROVED"`, `onboardingStatus === "COMPLETED"`, or `role === "SUPER_ADMIN"`).
- **Subscription Rate-Limiter**: High-volume Firestore streams (`branches`, `departments`, `employees`, `ledger_transactions`, `payroll_records`, `attendance_logs`) are governed by a token-bucket `RateLimiter` and capped listener budget (`MAX_ACTIVE_LISTENERS = 60`) to prevent stream saturation and rate-limit warnings.
- **Resilient Fallback Render**: Smart wrappers (`ConnectedFinanceLedger`, `ConnectedBusinessIntelligence`, `PayrollEngine`) utilize fallback contexts from `useBusinessContext()` and local draft states to ensure sub-second UI rendering with Skeletons/Spinners without blocking component layouts during initial sync setup.
