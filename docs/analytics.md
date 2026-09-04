# FINOPS ERP — Business Intelligence & Analytics Engine Specification

## Overview

The Analytics Engine in `src/domains/analytics/` computes real-time performance metrics, trend analysis, predictive forecasting, and executive health indicators across workforce and payroll operations.

---

## 1. Metric Registry

- **Gross Payroll Mass**: Sum of base, overtime, and bonus pay across active contracts.
- **Deduction Compliance Index**: Ratio of calculated vs paid ONA/OFATMA social contributions.
- **Workforce Turnover Rate**: Ratio of employee exits to average active headcount.
- **Overtime Intensity Ratio**: Overtime pay as a percentage of gross base payroll.
- **Predictive Payroll Runway**: Projected 3-month payroll cash drain based on active structures.

---

## 2. Architecture & Data Pipeline

```
[ Snapshot Engine ] ────► [ Pure Selectors (src/domains/analytics/selectors) ]
                                      │
                                      ▼
                      [ AnalyticsComparisonEngine ]
                                      │
                                      ▼
                      [ PredictiveIntelligenceCenter UI ]
```

---

## 3. Selector & Computation Rules

- **Pure Functions**: Analytics selectors accept immutable snapshot datasets and return derived metrics without mutating input state.
- **Memoization**: Heavy aggregations are wrapped in `useMemo` hooks or memoized domain selectors to prevent unnecessary re-computations during layout updates.
