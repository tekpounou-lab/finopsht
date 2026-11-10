# FINOPS — BI-P1.7.2.2
# FILTER AND TRANSACTION SCOPE MATRIX

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.2  
**Date:** 2026-11-08  
**Mode:** STRICT READ-ONLY — SOURCE-TO-UI FORENSIC VERIFICATION  

---

## 1. FILTER PROPAGATION & SCOPE EVALUATION

| Filter Dimension | Source Component | Data Hook Propagation | SSOT Evaluation Location | Scope Invariants & Anti-Leakage Rules |
| :--- | :--- | :--- | :--- | :--- |
| **Business Scope (`businessId`)** | `BusinessContext` / `AuthContext` | `useBIDataAggregation` | `AnalyticsEngine.generateSnapshot` | Strictly filters all records by `business_id`. Cross-tenant data leakage impossible |
| **Branch Scope (`selectedBranchId`)** | `BIFiltersHeader` | `useBIDataAggregation` (`scopedTx`, `scopedPayrolls`) | `AnalyticsEngine.generateSnapshot` | When a specific branch is selected, untagged records are strictly excluded |
| **Department Scope (`selectedDeptId`)** | `BIFiltersHeader` | `useBIDataAggregation` (`scopedTx`, `scopedPayrolls`) | `AnalyticsEngine.generateSnapshot` | When a specific department is selected, untagged records are strictly excluded |
| **Date Scope (`startDate` / `endDate`)** | `BIFiltersHeader` | `useBIDataAggregation` (`filteredTx`, `filteredPayrolls`) | `AnalyticsEngine.generateSnapshot` | Dates normalized to `YYYY-MM-DD` in `America/Port-au-Prince` business timezone |
| **Accounting Mode (`isSimplifiedMode`)** | `BIFiltersHeader` toggle | `useBIDataAggregation` | `AnalyticsEngine` & `CanonicalCashEngine` | Mode `"CASH"` evaluates cash movements; Mode `"ACCRUAL"` evaluates P&L GL accruals |
| **Currency Context (`selectedCurrency`)** | `BusinessContext` | `useBIDataAggregation` | `NormalizedAmountResolver` | Normalizes all multi-currency amounts (USD, CAD, EUR, DOP) to HTG base rate |

---

## 2. TRANSACTION CLASSIFICATION & GUARDRAILS MATRIX

| Transaction Category / Pattern | Debit / Credit Account Class | Included in Revenue? | Included in Expenses? | Exclusion Rationale / Accounting Guardrail |
| :--- | :--- | :--- | :--- | :--- |
| **Sales / Service Income** | Credit Class 7 / Income | **YES** | **NO** | Core P&L Revenue |
| **Operational Expense** | Debit Class 6 / Expense | **NO** | **YES** | Core P&L Expense |
| **Sealed Payroll Run** | Debit 641000 / Credit 2100 | **NO** | **YES** | Prorated Gross + Social Taxes in ACCRUAL mode |
| **Liability Settlement** | Debit Class 2 (e.g. 2100) | **NO** | **NO** | Balance sheet liability clearance (e.g. tax remittance, vendor payout); zero P&L expense |
| **Internal Treasury Transfer** | Debit Class 10 / Credit Class 10 | **NO** | **NO** | Internal cash desk / bank transfer; zero net asset or P&L change |
| **Till Shortage Discrepancy** | Debit 5900_TILL_SHORTAGE | **NO** | **NO** | Operational risk discrepancy; excluded from operational P&L by design |
| **Reversed / Voided Transaction** | `status === "REVERSED" \| "VOID"` | **NO** | **NO** | Canceled entries strictly filtered out before aggregation |
