# FINOPS ERP — Business Intelligence & Analytics Engine Specification

## Overview

The Analytics Engine in `src/domains/analytics/` computes real-time performance metrics, trend analysis, predictive forecasting, and executive health indicators across workforce and payroll operations.

---

## 1. Metric Registry & Single Source of Truth (SSOT)

- **Payroll Cost (Masse Salariale)**: Sum of all `PayrollRecord` gross salaries executed within the selected period range (indexed by `PayrollCycle` dates: `startDate`, `endDate`, `effectiveAccountingDate` or cycle ID).
- **Executive Gross & Net Paid**: Accurately aggregates each employee's distinct payroll slips across multiple cycles within the chosen period.
- **Social Tax Compliance**: Evaluates CNSS (ONA) and CNS (OFATMA) contributions dynamically when social taxes are enabled in business settings.
- **Deduction Compliance Index**: Ratio of calculated vs paid ONA/OFATMA social contributions.
- **Workforce Turnover Rate**: Ratio of employee exits to average active headcount.
- **Overtime Intensity Ratio**: Overtime pay as a percentage of gross base payroll.
- **Predictive Payroll Runway**: Projected 3-month payroll cash drain based on active structures.

---

## 2. Architecture & Data Pipeline

```
[ Firestore (payroll_records, payroll_cycles, attendance_logs, ledger) ]
                              │
                              ▼
        [ useAnalyticsSubscriptions (Realtime Listeners) ]
                              │
                              ▼
            [ AnalyticsContext / ExecutiveFilterContext ]
                              │
                              ▼
     [ AnalyticsEngine.generateSnapshot (Deterministic Engine) ]
                              │
                              ▼
       [ useBIDataAggregation & Domain Executive Dashboards ]
```

---

## 3. Selector & Computation Rules

- **Cycle-Aware Filtering**: Every payroll record is matched to its corresponding `PayrollCycle` to determine true execution dates instead of relying on transient document write timestamps (`updated_at`).
- **HR as Primary SSOT**: `PayrollRecord` collections serve as the authoritative single source of truth for all compensation, deductions, and gross/net calculations. Ledger transactions are only used as fallback when no HR payroll records are found.
- **Multi-Cycle Aggregation**: Employee scorecards and departmental profitability engines aggregate across all cycles executed within the timeframe (e.g., 4 fortnightly cycles within a 2-month window) rather than taking only the first match.
- **Pure Functions**: Analytics selectors accept immutable snapshot datasets and return derived metrics without mutating input state.
- **Memoization**: Heavy aggregations are wrapped in `useMemo` hooks or memoized domain selectors to prevent unnecessary re-computations during layout updates.

