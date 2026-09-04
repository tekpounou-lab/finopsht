# FINOPS ERP — Enterprise Workforce Performance Architecture

**Version**: 2.0.0  
**Status**: Approved Permanent Architecture  
**Domain**: HR, Payroll, Finance, Accounting & Workforce Analytics  
**Alignment**: SAP S/4HANA (HCM/CO-PA) | Microsoft Dynamics 365 Human Resources | Oracle Fusion HCM & ERP  

---

## Executive Summary & Architectural Constitution

The **Enterprise Workforce Performance Architecture** establishes the single source of truth (SSOT) for evaluating workforce productivity, operational profitability, commission execution, and organizational health across multi-tenant enterprise operations.

### Core Architectural Mandate
> **Separation of HR Organization from Operational Performance**:  
> An employee belongs to **ONE Home Department** (HR Master Entity for contract, base salary, reporting hierarchy, leave, and statutory payroll allocation).  
> An employee may generate revenue and perform work across **MANY Operational Departments** (Transaction-level attribution for revenue, direct commission, department profitability, and sales performance).  
> **HR Organization and Operational Revenue Attribution must NEVER be mixed.**

---

## 1. Enterprise Architecture Framework

FINOPS ERP separates concerns into three distinct primary domain boundaries connected by event streams and snapshot aggregation pipelines:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                    HR DOMAIN                                           │
│  (Employees, Home Departments, Branches, Contracts, Positions, Payroll, Attendance)    │
└───────────────────────────┬────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  FINANCE DOMAIN                                        │
│  (Transactions, Ledger Entries, General Ledger, COA, Revenue & Cost Centers)            │
└───────────────────────────┬────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 ANALYTICS DOMAIN                                       │
│  (Metric Registry, Performance Snapshots, Cross-Dept Attribution, AI CFO Engine)       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Architectural Pipeline
```
[ Sales Transactions / Pointage / Ledger ]
                  │
                  ▼
         [ Repositories ]
                  │
                  ▼
        [ Domain Services ] ───► (CommissionEngine / RevenueAttributionService)
                  │
                  ▼
       [ Analytics Engine ]
                  │
                  ▼
       [ Metric Registry ]
                  │
                  ▼
      [ Snapshot Builder ]
                  │
                  ▼
  [ Analytics Snapshots ] ───► [ Business Context ] ───► [ React Dashboards ]
```

---

## 2. Collection Design & Purpose

| Collection Name | Scope & Tenant Isolation | Primary Purpose |
| :--- | :--- | :--- |
| `employees` | Scoped by `business_id` | HR Master SSOT. Holds immutable identity, compensation model, current home department, and contract state. |
| `employee_department_history` | Scoped by `business_id` | Append-only historical log of department transfers, position updates, manager changes, and branch reassignments with effective start/end dates. |
| `departments` | Scoped by `business_id` | Organizational structure (Home & Operational units), cost centers, and manager assignments. |
| `branches` | Scoped by `business_id` | Physical or logical business locations with geographic and fiscal scoping. |
| `commission_plans` | Scoped by `business_id` | Enterprise commission rules, tier structures, effective dates, and approval status. |
| `commission_rules` | Scoped by `business_id` | Granular rule criteria matching product category, operational department, and employee roles. |
| `transactions` | Scoped by `business_id` | Sales and service transactions recording operational department, selling employee, amount, and line items. |
| `ledger_entries` | Scoped by `business_id` | Immutable double-entry financial ledger recording revenue, labor cost, and expense postings. |
| `employee_performance_snapshots` | Scoped by `business_id` | Pre-computed time-bucketed (Daily/Monthly) employee performance metrics. |
| `department_performance_snapshots` | Scoped by `business_id` | Pre-computed department P&L, contribution margins, and cross-department revenue splits. |
| `branch_performance_snapshots` | Scoped by `business_id` | Consolidated branch-level financial and operational KPI snapshots. |
| `business_performance_snapshots` | Scoped by `business_id` | Enterprise-wide executive balance sheet, cash runway, and workforce productivity metrics. |
| `metric_registry` | Scoped by `business_id` | Central dictionary defining calculation rules, bounds, and units for all system metrics. |
| `analytics_snapshots` | Scoped by `business_id` | High-level aggregated analytical data points for fast dashboard consumption. |
| `executive_snapshots` | Scoped by `business_id` | C-Suite board-ready summaries, variance narratives, and predictive AI forecasts. |

---

## 3. Production Firestore Schemas

### 3.1 `employees` Collection
```typescript
export interface Employee {
  id: string; // Document ID (immutable)
  business_id: string;
  branchId: string;
  departmentId: string; // Current Home Department ID
  name: string;
  email: string;
  normalizedEmail: string;
  phone?: string;
  position: string;
  role: "OWNER" | "MANAGER" | "SUPERVISOR" | "EMPLOYEE" | "SUPER_ADMIN";
  baseSalary: number; // Monthly base salary in Gourdes (HTG)
  paymentModel: "FIXED" | "COMMISSION" | "HYBRID";
  commissionPlanId?: string; // Direct override plan or default
  contractType: "cdi" | "cdd" | "freelance";
  status: "ACTIVE" | "SUSPENDED" | "TERMINATED" | "ON_LEAVE";
  hireDate: string; // YYYY-MM-DD
  terminationDate?: string;
  badgeId?: string;
  managerId?: string;
  createdAt: any;
  updatedAt: any;
}
```

### 3.2 `employee_department_history` Collection
```typescript
export interface EmployeeDepartmentHistory {
  id: string;
  business_id: string;
  employee_id: string;
  home_department_id: string;
  branch_id: string;
  manager_id?: string;
  position: string;
  commission_plan_id?: string;
  base_salary: number;
  effective_start_date: string; // YYYY-MM-DD
  effective_end_date?: string | null; // null if current
  change_reason: "PROMOTION" | "TRANSFER" | "RESTRUCTURING" | "RE-HIRE";
  approved_by: string;
  created_at: any;
}
```

### 3.3 `transactions` Collection (Operational Transaction Level)
```typescript
export interface Transaction {
  id: string;
  business_id: string;
  branch_id: string;
  operational_department_id: string; // Operational Dept where sale occurred
  employee_id: string; // Selling employee
  employee_email: string;
  customer_id?: string;
  amount: number; // Gross amount
  currency: "HTG" | "USD";
  category: string; // e.g., "Salon", "Boissons", "Retail"
  line_items: Array<{
    item_id: string;
    category: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
  commission_calculated?: number;
  commission_plan_applied_id?: string;
  date: string; // YYYY-MM-DD
  timestamp: any;
}
```

### 3.4 `employee_performance_snapshots` Collection
```typescript
export interface EmployeePerformanceSnapshot {
  id: string; // {business_id}_{employee_id}_{period_type}_{period_key}
  business_id: string;
  employee_id: string;
  employee_name: string;
  home_department_id: string;
  home_branch_id: string;
  period_type: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  period_key: string; // e.g., "2026-08" or "2026-Q3"
  
  // Financial Attribution
  total_revenue_generated: number;
  total_gross_margin: number;
  total_units_sold: number;
  transaction_count: number;
  average_ticket: number;
  
  // Cross-Department Sales Breakdown
  operational_department_distribution: Record<string, {
    department_name: string;
    revenue: number;
    percentage: number;
  }>;
  
  // Labor & Commission Cost
  allocated_base_payroll: number;
  total_commission_earned: number;
  total_labor_cost: number; // Payroll + Commission
  labor_cost_percentage: number; // (Labor Cost / Revenue Generated) * 100
  profit_generated: number; // Revenue - Direct Labor - Direct Expenses
  
  // Operational Metrics
  days_worked: number;
  total_hours_real: number;
  attendance_score: number; // 0 - 100%
  productivity_index: number; // Revenue per worked hour
  
  // Enterprise Rankings
  department_rank: number;
  branch_rank: number;
  business_rank: number;
  
  // Intelligence
  trend_vs_prior_period: number; // percentage change
  ai_recommendation?: string;
  created_at: any;
}
```

### 3.5 `department_performance_snapshots` Collection
```typescript
export interface DepartmentPerformanceSnapshot {
  id: string; // {business_id}_{department_id}_{period_type}_{period_key}
  business_id: string;
  department_id: string;
  department_name: string;
  branch_id: string;
  period_type: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  period_key: string;
  
  // Financial P&L Breakdown
  operational_revenue: number; // Revenue credited to this dept as Operational Dept
  direct_expenses: number;
  indirect_expenses_allocated: number;
  
  // Workforce Payroll Allocation
  home_employee_payroll_cost: number; // Base salary of employees whose Home Dept is this
  commission_payout_cost: number; // Commissions paid to sales in this Operational Dept
  total_direct_labor_cost: number;
  
  // Profitability Metrics
  gross_margin: number;
  gross_margin_percentage: number;
  contribution_margin: number; // Operational Revenue - Total Direct Labor - Direct Expenses
  operating_margin: number;
  operating_margin_percentage: number;
  
  // Workforce Productivity
  headcount_home: number; // Home department active headcount
  active_selling_employees: number; // Distinct employees generating revenue in this dept
  
  // Intelligence & Trends
  revenue_trend: number;
  margin_trend: number;
  forecasted_next_period_revenue?: number;
  ai_performance_narrative?: string;
  created_at: any;
}
```

---

## 4. Domain Relationships & Data Attribution

```
  +-------------------+
  |    EMPLOYEE       | (Home Dept: Salon)
  +-------------------+
            |
            |--- Generates Sale ---> +------------------------+
            |                        |  SALES TRANSACTION     |
            |                        |  Operational Dept:     |
            |                        |  Boissons (20%)        |
            |                        +------------------------+
            |
            v
  +-----------------------------------------------------------+
  |                   SNAPSHOT BUILDER                        |
  |  - Home Dept P&L receives Payroll Allocation (Salon)      |
  |  - Operational Dept P&L receives Revenue Credit (Boissons) |
  |  - Employee Performance records Cross-Dept Distribution   |
  +-----------------------------------------------------------+
```

---

## 5. Enterprise Commission Engine Architecture

The Commission Engine follows a deterministic rules matrix evaluated at transaction execution time or during retroactive snapshot compilation:

### Resolution Hierarchy (First Match Strategy):
1. **Employee-Specific Rule Override**: Tailored incentive plan attached to `Employee.commissionPlanId`.
2. **Product Category x Operational Department Rule**: Category commission rates configured inside `commission_rules`.
3. **Department General Plan**: Default operational department commission rate.
4. **Business Fallback Standard Plan**: Baseline enterprise rule.

```typescript
export interface CommissionPlan {
  id: string;
  business_id: string;
  name: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  effective_start_date: string;
  effective_end_date?: string;
  rules: Array<{
    rule_id: string;
    product_category?: string;
    operational_department_id?: string;
    min_sale_amount?: number;
    commission_type: "PERCENTAGE" | "FLAT_FEE" | "TIERED";
    rate_value: number; // e.g. 5.5 for 5.5%
    tiers?: Array<{ min_threshold: number; rate: number }>;
  }>;
  approved_by: string;
  approved_at: any;
}
```

---

## 6. Revenue Attribution Strategy

1. Revenue is attributed exclusively to the **Operational Department** specified on the transaction line item.
2. If an employee from the "Salon" home department sells a product in "Retail", the "Retail" operational department receives 100% of the revenue, gross margin, and sales volume credit.
3. The selling employee receives individual performance credit (Sales Volume, Commission Earned).
4. The employee's Home Department ("Salon") carries the base salary expense.
5. The ratio `Revenue Generated in Dept / Base Salary Cost` provides precise labor efficiency diagnostics without distorting department profitability.

---

## 7. Department Profitability P&L Model

For any department $D$ over period $T$:

$$\text{Operational Revenue}_D = \sum \text{Transactions where } \text{OperationalDept} = D$$

$$\text{Direct Labor Cost}_D = \sum \text{Base Salary of Home Employees}_D + \sum \text{Commissions Earned in } D$$

$$\text{Contribution Margin}_D = \text{Operational Revenue}_D - \text{Direct Labor Cost}_D - \text{Direct Dept Expenses}_D$$

$$\text{Operating Margin \%}_D = \left( \frac{\text{Contribution Margin}_D}{\text{Operational Revenue}_D} \right) \times 100$$

---

## 8. Snapshot Architecture & TTL Strategy

To ensure sub-500ms dashboard response times across 100,000 employees and 100 million transactions:

```
[ Raw Events ] ──► [ Daily Worker ] ──► [ Daily Snapshots ] (30 days TTL)
                           │
                           ▼
                   [ Monthly Worker ] ──► [ Monthly Snapshots ] (Permanent Archive)
```

| Snapshot Tier | Regeneration Frequency | Storage Retention (TTL) | Primary Use Case |
| :--- | :--- | :--- | :--- |
| **Daily** | Nightly Batch (01:00 UTC) | 90 Days | Operational Kiosks & Supervisor Monitoring |
| **Weekly** | Every Sunday | 1 Year | Department Manager Weekly Reviews |
| **Monthly** | End of Fiscal Period | Permanent | Executive Financials, Board Reports, Payroll Audit |
| **Quarterly** | End of Quarter | Permanent | Investor & Strategic Growth Analytics |
| **Yearly** | Annual Close | Permanent | Tax Filing & Long-Term Trend Diagnostics |

---

## 9. Dashboard Strategy (Zero-Compute Architecture)

All UI views read strictly from pre-computed snapshots via `src/repositories/`:

- **Owner / Executive Dashboard**: Consumes `executive_snapshots` & `business_performance_snapshots`. Zero client aggregation.
- **Manager / Branch Dashboard**: Consumes `branch_performance_snapshots` filtered by `branch_id`.
- **Department Manager Dashboard**: Consumes `department_performance_snapshots` for assigned department.
- **Employee Portal**: Consumes `employee_performance_snapshots` matching current authenticated user ID.

---

## 10. Multi-Tenant Security & Composite Index Strategy

Every Firestore query mandates explicit tenant filter: `where("business_id", "==", currentBusiness.id)`.

### Required Firestore Composite Indexes:
```json
{
  "indexes": [
    {
      "collectionGroup": "employee_performance_snapshots",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "business_id", "order": "ASCENDING" },
        { "fieldPath": "period_type", "order": "ASCENDING" },
        { "fieldPath": "period_key", "order": "DESCENDING" },
        { "fieldPath": "total_revenue_generated", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "department_performance_snapshots",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "business_id", "order": "ASCENDING" },
        { "fieldPath": "department_id", "order": "ASCENDING" },
        { "fieldPath": "period_key", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "employee_department_history",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "business_id", "order": "ASCENDING" },
        { "fieldPath": "employee_id", "order": "ASCENDING" },
        { "fieldPath": "effective_start_date", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## 11. ETL & Background Synchronization Strategy

1. **Transactional Outbox Pattern**: Raw sales transactions write an event entry to an outbox buffer in Firestore.
2. **Cloud Functions Event Orchestrator**: `finopsEventOrchestrator` triggers asynchronously on new transactions to increment incremental accumulators.
3. **Deterministic Rebuild Pipeline**: A dedicated administrative RPC trigger allows complete recalculation of snapshots for any historical period without altering underlying raw ledger rows.

---

## 12. Phased Migration Plan

1. **Phase 1 (Schema Augmentation)**: Deploy `employee_department_history` and add `primaryDepartmentId` / `departmentAssignments` to `Employee` types.
2. **Phase 2 (Transaction Disambiguation)**: Update transaction creation points to log `operational_department_id` explicitly.
3. **Phase 3 (Commission Engine Deployment)**: Initialize `commission_plans` and replace inline commission logic.
4. **Phase 4 (Snapshot Pipeline Activation)**: Deploy daily snapshot builders and verify historical accuracy against General Ledger postings.
5. **Phase 5 (Dashboard Transition)**: Redirect React analytics components to consume pre-computed performance snapshots.

---

## 13. System Trade-offs & Engineering Decisions

| Architectural Choice | Benefit | Trade-off / Mitigation |
| :--- | :--- | :--- |
| **Pre-computed Snapshots vs Real-time Compute** | Instant dashboard renders (<100ms) with zero query cost explosion | Near real-time latency (5 min sync lag); mitigated by immediate local UI optimistic updates |
| **Dual Department Attribution (Home vs Operational)** | Pristine P&L accuracy matching enterprise ERPs (SAP/Dynamics) | Requires strict transaction categorization in UI; mitigated by smart default presets |
| **Firestore Subcollection Isolation vs Flat Collections** | Perfect multi-tenant security and simplified rules | Requires composite indexing for cross-subcollection reporting; mitigated by pre-computed root snapshots |
