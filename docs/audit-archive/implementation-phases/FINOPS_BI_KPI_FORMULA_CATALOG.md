# FINOPS ERP / FINAYITI FUSION
# BI & PIC KPI FORMULA CATALOG & DATA LINEAGE
## DOCUMENT ID: FINOPS_BI_KPI_FORMULA_CATALOG.md
**Phase:** BI-AUDIT-01  
**Classification:** TECHNICAL REFERENCE SPECIFICATION  
**Scope:** Canonical Financial & Operational Formulas across Executive Dashboard & PIC

---

## 1. PURPOSE & TAXONOMY

This catalog provides an authoritative reference of all mathematical formulas, data sources, exclusions, aggregation steps, and edge-case handling governing KPIs displayed across:
- Executive Overview (`/dashboard` / `BIExecutiveKpis.tsx`)
- Performance Intelligence Center (`/performance` / `PICSimplifiedView.tsx` & `PICExpertView.tsx`)
- Tabbed Analytical Modules (`BIPayrollTab.tsx`, `BICostCenterTab.tsx`, etc.)

---

## 2. CANONICAL KPI DEFINITIONS

### 2.1 Total Revenue (`totalRevenue`)

* **Primary Code Source:** `src/domains/analytics/services/AnalyticsEngine.ts:1210-1250`
* **Alternate/Cash Pipeline:** `src/domains/cash/services/CanonicalCashEngine.ts`

#### Formula:
- **Accrual Basis (`ACCRUAL`):**
  $$\text{Revenue}_{\text{Accrual}} = \sum_{t \in T_{\text{Income}}} t.\text{amount}$$
  Where:
  $$T_{\text{Income}} = \{ t \in \text{Transactions} \mid \text{isIncomeTx}(t) \land t.\text{status} \notin \{\text{REVERSED}, \text{VOID}, \text{CANCELLED}\} \land t.\text{date} \in [\text{start}, \text{end}] \land t.\text{business\_id} = \text{current\_tenant} \}$$
  *Transaction Type Classification (`isIncomeTx`):*
  - `type` is `"income"` OR
  - `category` in `["sales", "revenue", "service", "consulting"]` OR
  - Ledger account code starts with `"7"` (French / Syscohada revenue class) or `"4"` (US GAAP revenue class).

- **Cash Basis (`CASH`):**
  $$\text{Revenue}_{\text{Cash}} = \text{CanonicalCashEngine.executePipeline}().totalInflow$$
  Strictly reflects confirmed cash collections deposited into cash registers (Tills) or branch vaults (Safes). Uncollected receivables are excluded.

#### Edge Cases & Defensive Rules:
- If no transactions exist in the period, returns `0`.
- Reversed transactions (`status === "REVERSED"`) and reversals (`type === "REVERSAL"`) are excluded to prevent double counting.

---

### 2.2 Total Operating Expenses (`totalExpenses`)

* **Primary Code Source:** `src/domains/analytics/services/AnalyticsEngine.ts:1255-1310`

#### Formula:
- **Accrual Basis (`ACCRUAL`):**
  $$\text{Total Expenses} = \text{Non-Payroll GL Expenses} + \max(\text{GL Payroll Expenses}, \text{Calculated Payroll Employment Cost})$$
  $$\text{Non-Payroll GL Expenses} = \sum_{t \in T_{\text{Expense}} \setminus T_{\text{PayrollGL}}} t.\text{amount}$$
  Where:
  - $T_{\text{Expense}} = \{ t \mid \text{isExpenseTx}(t) \land t.\text{status} \notin \{\text{REVERSED}, \text{VOID}, \text{CANCELLED}\} \}$
  - $T_{\text{PayrollGL}} = \{ t \in T_{\text{Expense}} \mid t.\text{category} \in \{\text{"payroll"}, \text{"salaries"}, \text{"wages"}, \text{"social\_charges"}\} \}$
  - If GL payroll entries exist ($\text{GL Payroll Expenses} > 0$), GL is authoritative. If unposted, fallback to prorated payroll cycles from subledger.

- **Cash Basis (`CASH`):**
  $$\text{Total Expenses}_{\text{Cash}} = \text{CanonicalCashEngine.executePipeline}().totalOutflow$$
  Strictly sums physical cash disbursements (vendor payouts, expense vouchers, cash payroll withdrawals).

---

### 2.3 Total Employment Cost (`totalPayroll` / `totalEmploymentCost`)

* **Primary Code Source:** `src/domains/analytics/services/AnalyticsEngine.ts:1280-1305`
* **Subledger Source:** `src/domains/payroll/services/` & `payrolls` collection

#### Formula:
$$\text{Employment Cost} = \sum_{p \in P_{\text{Active}}} (\text{Prorated Gross}(p) + \text{Employer Taxes}(p) + \text{Commissions}(p))$$
Where:
- $\text{Proration Factor} = \frac{\text{Days of cycle overlapping filter window}}{\text{Total cycle days}}$ (if cycle crosses boundary).
- Employer Taxes include statutory deductions: ONA (6%), OFATMA (2-6%), FDU (1%), Health Insurance.

---

### 2.4 Net Operating Profit (`netProfit` / `profitResult`)

* **Primary Code Source:** `src/domains/analytics/services/AnalyticsEngine.ts:1315-1325`

#### Formula:
$$\text{Net Profit} = \text{Total Revenue} - \text{Total Operating Expenses}$$

#### Rules:
- Can be negative (Net Loss).
- Must exactly equal Revenue minus Expenses in both Simplified and Expert modes when using the same accounting basis.

---

### 2.5 Net Profit Margin (`profitMargin`)

* **Primary Code Source:** `src/domains/analytics/services/AnalyticsEngine.ts:1330-1340`

#### Formula:
$$\text{Net Profit Margin (\%)} = \begin{cases} 
\left(\frac{\text{Net Profit}}{\text{Total Revenue}}\right) \times 100, & \text{if } \text{Total Revenue} > 0 \\
0, & \text{if } \text{Total Revenue} = 0
\end{cases}$$

#### Invariant:
- If Revenue is 0 and Expenses > 0, Margin is 0% (or negative undefined in strict math, clamped to 0 in UI to prevent division by zero or NaN).

---

### 2.6 Attendance Rate (`attendanceRate`)

* **Primary Code Source:** `src/domains/analytics/services/AnalyticsEngine.ts:1410-1455`

#### Formula:
$$\text{Attendance Rate (\%)} = \min\left(100, \left(\frac{\sum \text{Actual Worked Hours}}{\text{Expected Total Hours}}\right) \times 100\right)$$
Where:
- $\text{Expected Total Hours} = \text{Active Operational Employees} \times \text{Expected Hours Per Employee}$
- $\text{Expected Hours Per Employee} = \text{AnalyticsEngine.getExpectedWorkingHours}(\text{startDate}, \text{endDate}, 8, 96)$
  - Standard baseline: 96 hours per 15 calendar days (quinzaine) or ~192 hours for a 30-day month.
- $\sum \text{Actual Worked Hours} = \sum_{a \in A_{\text{Valid}}} a.\text{hoursWorked}$

#### Divergence Warning (Finding BI-04):
- In `AnalyticsEngine`: Missing records yield 0 worked hours.
- In `useBIDataAggregation.ts:310`: Missing hours in attendance logs fallback to an assumed 8 hours, inflating attendance rates on `/dashboard`.

---

### 2.7 Active Headcount (`activeHeadcount`)

* **Primary Code Source:** `src/domains/analytics/services/AnalyticsEngine.ts:1180-1205`

#### Formula:
$$\text{Active Headcount} = |\{ e \in \text{Employees} \mid e.\text{business\_id} = \text{tenant} \land e.\text{status} = \text{"ACTIVE"} \land e.\text{isOperational} = \text{true} \}|$$

#### Rules:
- Excludes employees with status `TERMINATED`, `RESIGNED`, `SUSPENDED`, or `ON_LEAVE` (if configured to exclude).
- Excludes test/system dummy profiles.

---

### 2.8 Turnover Rate (`turnoverRate`)

* **Primary Code Source:** `src/domains/analytics/services/AnalyticsEngine.ts:1380-1405`

#### Formula:
$$\text{Turnover Rate (\%)} = \left(\frac{\text{Terminations in Period}}{\text{Average Headcount}}\right) \times 100$$
Where:
- $\text{Average Headcount} = \frac{\text{Headcount at Start} + \text{Headcount at End}}{2}$

---

## 3. AUDIT SUMMARY TABLE OF KPI ALIGNMENT

| KPI Identifier | Accrual Implementation | Cash Implementation | Edge-Case Zero Handling | Consistency Status |
|---|---|---|---|---|
| `totalRevenue` | GL Revenue query filter | Cash register inflow | Safe `0` | **MATCHES SPEC** |
| `totalExpenses` | GL Expenses + Subledger Payroll | Cash disbursements | Safe `0` | **MATCHES SPEC** |
| `totalPayroll` | Prorated gross + taxes | Cash payroll vouchers | Safe `0` | **DUPLICATE LOGIC IN BI HOOK** |
| `netProfit` | Revenue - Expenses | Inflow - Outflow | Positive/Negative | **MATCHES SPEC** |
| `profitMargin` | (Profit / Revenue) * 100 | (Profit / Revenue) * 100 | Clamped to `0` if Rev = 0 | **MATCHES SPEC** |
| `attendanceRate` | Quinzaine norm (96h/15d) | N/A (operational) | 0% if no employees | **DIVERGENT ALGORITHM** |
| `activeHeadcount` | Active operational count | Active operational count | Safe integer count | **MATCHES SPEC** |
| `turnoverRate` | Terminations / Avg Headcount | Terminations / Avg Headcount | Clamped to `0` if Avg = 0 | **MATCHES SPEC** |
