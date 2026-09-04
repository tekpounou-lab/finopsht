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
