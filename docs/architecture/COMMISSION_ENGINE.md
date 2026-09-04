# Commission Engine Architecture

**Status**: Active
**Version**: 1.0
**Domain**: Workforce Performance & Payroll

## Overview
The FINOPS ERP Commission Engine is designed to securely and accurately calculate sales commissions and integrate them directly into the standard payroll cycle. It bridges the `LedgerTransaction` records (sales imported from QuickBooks, etc.) with the `PayrollEngine`.

## Data Flow
1. **Sales Import**: Ledger transactions are imported (e.g. from QuickBooks). If they are `REVENUE` or `SALES` and linked to an `employee_email`, they are eligible for commission.
2. **Cycle Trigger**: When a payroll cycle is calculated, the `PayrollEngine` requests a summary from `EmployeeSalesSummaryService`.
3. **Aggregation**: The engine filters eligible transactions that fall within the cycle dates (or are older and `commissionClaimed = false`).
4. **Rate Resolution**: For each transaction, the engine applies the effective commission rate based on the employee's contract and active `CommissionPlan` on the exact date of the transaction.
5. **Snapshot**: The result is saved as an `EmployeeSalesSummary` document in Firestore.
6. **Payslip Integration**: The `PayrollInputSnapshotBuilder` injects the `calculated_commission` into the employee's gross pay.

## Temporal Rate Resolution
The engine calculates commissions transaction-by-transaction to support mid-cycle rate changes.
*Example*: If an employee's rate changes from 5% to 10% on the 15th of the month, transactions before the 15th use 5%, and from the 15th onward use 10%. This prevents overpaying or underpaying when promotions occur mid-cycle.

## Idempotency and Locking
- **Idempotent Reads**: Fetching a summary for an open (DRAFT) cycle recalculates dynamically based on the current state of transactions.
- **Cycle Freezing**: When a payroll cycle transitions to `LOCKED` or `PAID`, the `EmployeeSalesSummary` is marked `is_frozen: true`.
- **Protection**: Once frozen, the `EmployeeSalesSummaryService` will return the frozen snapshot from Firestore and completely bypass recalculation. This ensures that historical payslips remain mathematically identical to what was paid, even if old transactions are modified later.

## UI Capabilities
The `PerformanceAndCommissionsTab` provides managers with:
- A cycle selector to view historical performance.
- Gross sales and calculated commissions per employee.
- Warnings for late imports (unclaimed transactions prior to the current cycle).
- A drill-down modal showing department breakdowns and transaction counts.

