# ANALYTICS & EXECUTIVE INTELLIGENCE ARCHITECTURE

## Single Source of Truth (SSOT) Snapshot Pattern

All executive intelligence modules, dashboard components, and reporting cards in the **FINOPS ERP** platform MUST share a single, unified analytical snapshot (`AnalyticsSnapshot`) generated asynchronously by the `AnalyticsEngine` and distributed via `AnalyticsContext`.

### Core Architectural Rules

1. **Unified Filter Synchronization**:
   - Every executive card (`ExecutiveActionsChecklist`, `ExecutiveAlertCenter`, `ExecutiveAIAdvisor`, `ExecutiveHealthGauge`, `ExecutiveTreasury`, `ExecutiveAttendance`, `ExecutivePayroll`, `ExecutiveStaffLeaderboard`, `ExecutiveBranchRevenue`, `ExecutiveDepartmentExpenses`) MUST consume the active filtered `snapshot` provided by `useAnalytics()`.
   - Components are strictly forbidden from performing independent, unnormalized Firestore reads or applying ad-hoc date string filtering that conflicts with the central filter context (`startDate`, `endDate`, `branchId`, `departmentId`, `currency`).

2. **Standardized Date Normalization (SSOT)**:
   - All dates (ISO strings, `DD/MM/YYYY`, `MM/DD/YYYY`, Firestore Timestamps, JS Dates, epoch numbers) MUST be normalized to standard `YYYY-MM-DD` strings via `toDateOnly` from `src/utils/dateNormalization.ts` before filtering, calculation, or period comparison.

3. **Current vs. Previous Period Comparison & Proration Rules**:
   - `AnalyticsEngine.generateSnapshot` receives scoped collections that retain full date context to compute current period metrics and historical comparison trends.
   - **Payroll Cycle Proration**: For custom sub-periods (e.g., fortnight 01/07 to 15/07), payroll cycle costs are prorated based on the exact overlap ratio of the cycle days within the filter range.
   - **Social Tax Enforcement**: Employer and employee social taxes (CNSS, CNS, OFATMA) are strictly set to 0 HTG when `enableTaxes` / `enable_social_taxes` is disabled in `business_settings`.
   - **Attendance Rate Formula**: Attendance rate is calculated strictly from actual worked hours recorded in `attendance_records` over expected working hours (`staff_count * expected_working_hours`), based on 96 hours per fortnight / 192 hours per month.
   - **Unified SSOT Presentation**: Both "Mode Simplifié" and "Mode Expert" consume the exact same `AnalyticsSnapshot` produced by `AnalyticsEngine`, guaranteeing zero discrepancies between executive views.

4. **Executive Components Structure**:
   - Location: `src/components/executive/`
   - Orchestrator: `src/components/executive/ExecutiveIntelligenceCenter.tsx`
   - Modularized Sub-components:
     - `ExecutiveActionsChecklist.tsx`
     - `ExecutiveAlertCenter.tsx`
     - `ExecutiveAIAdvisor.tsx`
     - `ExecutiveHealthGauge.tsx`
     - `ExecutiveTreasury.tsx`
     - `ExecutiveAttendance.tsx`
     - `ExecutivePayroll.tsx`
     - `ExecutiveStaffLeaderboard.tsx`
     - `ExecutiveBranchRevenue.tsx`
     - `ExecutiveDepartmentExpenses.tsx`
