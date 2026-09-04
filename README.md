# FINOPS ERP — Payroll Engine Refactoring & Compensation Model Alignment

## 1. Updates to Sales Tracking
- **Sales Data Propagated**: The exact total sales calculated from the General Ledger are now propagated throughout the pipeline via a newly added `sales_cents` and `salesHtg` property on the `PayrollRecord` and `PayrollInputSnapshot`.
- **Accurate Display**: The dashboard grid now renders the precise GL sales volume rather than reverse-engineering an approximation from the `commission / rate`.
- **SSOT Integrity**: The GL remains the sole authoritative source of truth for all revenue metrics displayed on the payroll.

