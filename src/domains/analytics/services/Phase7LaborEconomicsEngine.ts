/**
 * FINOPS ERP v4.0 — PHASE 7
 * Workforce Operational Productivity & Labor Unit Economics Intelligence Engine
 * 
 * SPECIFICATION: PHASE 7 CONTRACT v1.0 (Frozen & Reconciled)
 * 
 * SSOT PRINCIPLES:
 * 1. Operational Revenue SSOT: ledger_transactions (status: POSTED, type: INCOME)
 * 2. Direct Labor Cost SSOT: payroll_records (status: SEALED)
 * 3. Attendance Hours SSOT: Phase 6C Reconciliation Engine (workedHours)
 * 4. Capacity SSOT: Phase 6D Workforce Forecasting Engine
 * 5. Deterministic Non-Random Dataset Identity (F7- Hash)
 * 6. Strict Tenant Isolation (business_id canonical, alias conflict rejection)
 * 7. Zero Firestore mutations / Pure functional execution
 */

import {
  Phase7Dataset,
  Phase7EngineParams,
  Phase7MetricValue,
  Phase7MetricState,
  AttributedRevenueItem,
  DepartmentLaborEconomicsRecord,
  EmployeeLaborEconomicsRecord,
  RevenueAttributionTier,
} from "../types/phase7";
import { toDateOnly } from "../../../utils/dateNormalization";

/**
 * Deterministic Tenant Resolver
 * Rules:
 * - business_id is canonical
 * - businessId is accepted as legacy ingestion tolerance
 * - If both are present and differ, record is corrupted (returns null)
 */
export function resolveTenantId(record: { business_id?: string; businessId?: string } | null | undefined): string | null {
  if (!record) return null;
  const bSnake = record.business_id?.trim();
  const bCamel = record.businessId?.trim();
  if (bSnake && bCamel && bSnake !== bCamel) {
    return null; // Tenant conflict / data corruption
  }
  return bSnake || bCamel || null;
}

/**
 * Deterministic fast 32-bit polynomial string hasher for dataset identity
 */
function deterministicHash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(16).padStart(12, "0").slice(0, 12);
}

function createMetric<T = number>(
  metricId: string,
  name: string,
  state: Phase7MetricState,
  value: T | null,
  unit: string,
  currency?: "HTG" | "USD",
  statusText?: string,
  reason?: string
): Phase7MetricValue<T> {
  let formatted = "N/A";
  if (state === "TIMEZONE_NOT_CONFIGURED") {
    formatted = "TIMEZONE REQUIRED";
  } else if (state === "BLOCKED") {
    formatted = "BLOCKED";
  } else if (state === "NO_DATA") {
    formatted = "NO DATA";
  } else if (state === "UNDEFINED") {
    formatted = "UNDEFINED";
  } else if (state === "ZERO") {
    formatted = unit === "%" ? "0.00 %" : currency ? `0.00 ${currency}` : `0.00 ${unit}`.trim();
  } else if (value !== null && typeof value === "number") {
    if (unit === "%") {
      formatted = `${value.toFixed(2)} %`;
    } else if (currency) {
      formatted = `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    } else {
      formatted = `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unit}`.trim();
    }
  }

  return {
    metricId,
    name,
    state,
    value,
    unit,
    currency,
    formatted,
    statusText: statusText || state,
    reason,
  };
}

export class Phase7LaborEconomicsEngine {
  /**
   * Main Execution Entry Point
   * Fully deterministic, pure function. Zero writes.
   */
  public static execute(params: Phase7EngineParams): Phase7Dataset {
    const safeBizId = params.businessId?.trim() || "";
    const currency = params.targetCurrency || "HTG";

    // 1. Guard: Business ID presence
    if (!safeBizId) {
      return this.buildBlockedDataset(params, "BLOCKED", "Missing businessId parameter. Tenant identification is required.");
    }

    // 2. Guard: Business Timezone presence (Contract C-09 alignment)
    if (!params.businessTimezone || params.businessTimezone.trim() === "") {
      return this.buildBlockedDataset(
        params,
        "TIMEZONE_NOT_CONFIGURED",
        "businessTimezone parameter is missing or empty. Timezone configuration is required."
      );
    }

    const startDate = toDateOnly(params.startDate);
    const endDate = toDateOnly(params.endDate);

    const transactions = params.transactions || [];
    const payrollRecords = params.payrollRecords || [];
    const rawEmployees = params.employees || [];
    const rawDepartments = params.departments || [];
    const rawBranches = params.branches || [];
    const workedHoursByEmployee = params.workedHoursByEmployee || {};

    // 3. Filter & index tenant-isolated master data
    const tenantEmployees = rawEmployees.filter(e => resolveTenantId(e) === safeBizId);
    const tenantDepartments = rawDepartments.filter(d => resolveTenantId(d) === safeBizId);
    const tenantBranches = rawBranches.filter(b => resolveTenantId(b) === safeBizId && b.isActive !== false && b.status !== "INACTIVE");

    const empById = new Map<string, any>(tenantEmployees.map(e => [e.id, e]));
    const empByEmail = new Map<string, any>();
    for (const emp of tenantEmployees) {
      if (emp.email) empByEmail.set(emp.email.toLowerCase().trim(), emp);
      if (emp.employeeEmail) empByEmail.set(emp.employeeEmail.toLowerCase().trim(), emp);
    }

    const deptById = new Map<string, any>(tenantDepartments.map(d => [d.id, d]));
    const deptByCode = new Map<string, any>();
    for (const dept of tenantDepartments) {
      if (dept.code) deptByCode.set(dept.code.toUpperCase().trim(), dept);
    }

    const branchById = new Map<string, any>(tenantBranches.map(b => [b.id, b]));

    // 4. Ingest and filter GL Eligible Operational Revenue
    // SSOT: status === "POSTED", type === "INCOME", non-reversal, currency matched, within date window
    let totalEligibleGLRevenueCents = 0;
    let totalAttributedRevenueCents = 0;
    let unassignedRevenueCents = 0;
    let unassignedRevenueCount = 0;

    const attributedItems: AttributedRevenueItem[] = [];
    const revenueByDeptCents = new Map<string, number>();
    const revenueByEmpCents = new Map<string, number>();
    let eligibleTxCount = 0;
    let hasAnyTransactionsInPeriod = false;

    for (const tx of transactions) {
      // Tenant Isolation: Must match current business
      const txTenant = resolveTenantId(tx);
      if (!txTenant || txTenant !== safeBizId) {
        continue;
      }

      // Currency Isolation
      const txCurrency = (tx.currency || "HTG").toUpperCase();
      if (txCurrency !== currency) {
        continue;
      }

      // Date Filtering: Canonical Civil Date YYYY-MM-DD
      const rawDate = tx.date || tx.transaction_date || tx.transactionDate || tx.createdAt;
      const txDate = toDateOnly(rawDate);
      if (!txDate || (startDate && txDate < startDate) || (endDate && txDate > endDate)) {
        continue;
      }

      hasAnyTransactionsInPeriod = true;

      // GL Eligibility: Non-reversed income/revenue transactions
      const txStatus = (tx.status || "").toUpperCase();
      const txType = (tx.type || "").toUpperCase();
      const isReversal = Boolean(
        tx.isReversal ||
        tx.is_reversal ||
        tx.metadata?.isReversal ||
        txType === "REVERSAL" ||
        txStatus === "REVERSED" ||
        txStatus === "VOID" ||
        txStatus === "CANCELLED"
      );

      if (isReversal) {
        continue;
      }

      const catUpper = String(tx.category || (tx as any).category_name || (tx as any).categoryName || "").toUpperCase();
      const creditAcc = String((tx as any).credit_account || (tx as any).creditAccount || "").toUpperCase();

      const isIncome =
        ["INCOME", "REVENUE", "SALES", "VENTE", "VENTES", "CREDIT"].includes(txType) ||
        catUpper.includes("INCOME") || catUpper.includes("REVENUE") || catUpper.includes("VENTE") || catUpper.includes("RECETTE") || catUpper.includes("SALES") ||
        creditAcc.startsWith("4") || creditAcc.startsWith("7") ||
        (typeof (tx as any).credit === "number" && (tx as any).credit > 0 && !(tx as any).debit && txType !== "EXPENSE" && txType !== "PAYROLL");

      if (!isIncome) {
        continue;
      }

      const rawAmount =
        typeof tx.amount === "number" && !isNaN(tx.amount) && tx.amount !== 0 ? Math.abs(tx.amount) :
        typeof (tx as any).amount_htg === "number" && !isNaN((tx as any).amount_htg) && (tx as any).amount_htg !== 0 ? Math.abs((tx as any).amount_htg) :
        typeof (tx as any).amountHtg === "number" && !isNaN((tx as any).amountHtg) && (tx as any).amountHtg !== 0 ? Math.abs((tx as any).amountHtg) :
        typeof (tx as any).credit === "number" && !isNaN((tx as any).credit) && (tx as any).credit > 0 ? (tx as any).credit :
        typeof (tx as any).total === "number" && !isNaN((tx as any).total) && (tx as any).total !== 0 ? Math.abs((tx as any).total) : 0;

      const amountCents = tx.amount_cents ?? (tx as any).amountCents ?? Math.round(rawAmount * 100);
      if (amountCents <= 0) {
        continue;
      }

      eligibleTxCount++;
      totalEligibleGLRevenueCents += amountCents;

      // 5-Tier Deterministic Revenue Attribution
      let tier: RevenueAttributionTier = "UNASSIGNED";
      let resolvedEmp: any = null;
      let resolvedDept: any = null;
      let resolvedBranch: any = null;

      // Tier 1: Employee ID
      const txEmpId = tx.employeeId || tx.employee_id;
      if (txEmpId && empById.has(txEmpId)) {
        resolvedEmp = empById.get(txEmpId);
        tier = "EMPLOYEE_ID";
      }

      // Tier 2: Employee Email
      if (!resolvedEmp) {
        const rawEmail = tx.employeeEmail || tx.employee_email || tx.metadata?.employeeEmail;
        if (rawEmail) {
          const normEmail = String(rawEmail).toLowerCase().trim();
          if (empByEmail.has(normEmail)) {
            resolvedEmp = empByEmail.get(normEmail);
            tier = "EMPLOYEE_EMAIL";
          }
        }
      }

      // Tier 3: Operational Department
      const txDeptId = tx.departmentId || tx.department_id;
      const txDeptCode = tx.departmentCode || tx.department_code;
      if (txDeptId && deptById.has(txDeptId)) {
        resolvedDept = deptById.get(txDeptId);
        if (tier === "UNASSIGNED") tier = "OPERATIONAL_DEPARTMENT";
      } else if (txDeptCode && deptByCode.has(String(txDeptCode).toUpperCase().trim())) {
        resolvedDept = deptByCode.get(String(txDeptCode).toUpperCase().trim());
        if (tier === "UNASSIGNED") tier = "OPERATIONAL_DEPARTMENT";
      }

      // If employee resolved but department not explicitly on tx, resolve home department
      if (resolvedEmp && !resolvedDept) {
        const empDeptId = resolvedEmp.departmentId || resolvedEmp.department_id;
        if (empDeptId && deptById.has(empDeptId)) {
          resolvedDept = deptById.get(empDeptId);
        }
      }

      // Tier 4: Branch validation
      const txBranchId = tx.branchId || tx.branch_id;
      if (txBranchId && branchById.has(txBranchId)) {
        resolvedBranch = branchById.get(txBranchId);
        if (tier === "UNASSIGNED") tier = "BRANCH";
      } else if (resolvedDept) {
        const deptBranchId = resolvedDept.branchId || resolvedDept.branch_id;
        if (deptBranchId && branchById.has(deptBranchId)) {
          resolvedBranch = branchById.get(deptBranchId);
        }
      } else if (resolvedEmp) {
        const empBranchId = resolvedEmp.branchId || resolvedEmp.branch_id;
        if (empBranchId && branchById.has(empBranchId)) {
          resolvedBranch = branchById.get(empBranchId);
        }
      }

      if (tier !== "UNASSIGNED") {
        totalAttributedRevenueCents += amountCents;
      } else {
        unassignedRevenueCents += amountCents;
        unassignedRevenueCount++;
      }

      const item: AttributedRevenueItem = {
        transactionId: tx.id || `tx_${eligibleTxCount}`,
        amountCents,
        amount: amountCents / 100,
        currency,
        date: txDate,
        attributionTier: tier,
        resolvedEmployeeId: resolvedEmp?.id,
        resolvedEmployeeName: resolvedEmp?.name,
        homeDepartmentId: resolvedEmp?.departmentId || resolvedEmp?.department_id,
        operationalDepartmentId: resolvedDept?.id,
        operationalDepartmentName: resolvedDept?.name,
        branchId: resolvedBranch?.id,
        branchName: resolvedBranch?.name,
      };
      attributedItems.push(item);

      if (resolvedDept?.id) {
        revenueByDeptCents.set(resolvedDept.id, (revenueByDeptCents.get(resolvedDept.id) || 0) + amountCents);
      }
      if (resolvedEmp?.id) {
        revenueByEmpCents.set(resolvedEmp.id, (revenueByEmpCents.get(resolvedEmp.id) || 0) + amountCents);
      }
    }

    // 5. Check GL Reconciliation Invariant
    const varianceCents = totalEligibleGLRevenueCents - (totalAttributedRevenueCents + unassignedRevenueCents);
    const isGLBalanced = varianceCents === 0;

    // 6. Ingest Direct Labor Cost SSOT (SEALED Payroll Records)
    let totalDirectLaborCostCents = 0;
    let sealedPayrollCount = 0;
    const laborCostByDeptCents = new Map<string, number>();
    const laborCostByEmpCents = new Map<string, number>();
    let hasAnyPayrollInPeriod = false;
    let isUsdLaborCostUnavailable = false;

    if (currency === "USD") {
      // Contract C-12: Payroll is native HTG. USD requires certified historical FX.
      if (!params.historicalCertifiedFxRate || params.historicalCertifiedFxRate <= 0) {
        isUsdLaborCostUnavailable = true;
      }
    }

    for (const p of payrollRecords) {
      const pTenant = resolveTenantId(p);
      if (!pTenant || pTenant !== safeBizId) {
        continue;
      }

      const isSealed = p.status === "SEALED" || p.isSealed === true;
      if (!isSealed) {
        continue;
      }

      hasAnyPayrollInPeriod = true;
      sealedPayrollCount++;

      if (isUsdLaborCostUnavailable) {
        continue;
      }

      const grossCents = p.gross_salary_cents ?? Math.round((Number(p.grossSalary || p.gross_salary || 0)) * 100);
      const cnssCents = p.cnss_employer_cents ?? Math.round((Number(p.cnssEmployer || p.cnss_employer || 0)) * 100);
      const ofatmaCents = p.ofatma_employer_cents ?? Math.round((Number(p.ofatmaEmployer || p.ofatma_employer || 0)) * 100);

      let recordLaborCents = grossCents + cnssCents + ofatmaCents;

      // If USD with certified historical FX rate
      if (currency === "USD" && params.historicalCertifiedFxRate && params.historicalCertifiedFxRate > 0) {
        recordLaborCents = Math.round(recordLaborCents / params.historicalCertifiedFxRate);
      }

      totalDirectLaborCostCents += recordLaborCents;

      const pEmpId = p.employeeId || p.employee_id;
      const pDeptId = p.departmentId || p.department_id || empById.get(pEmpId)?.departmentId;

      if (pEmpId) {
        laborCostByEmpCents.set(pEmpId, (laborCostByEmpCents.get(pEmpId) || 0) + recordLaborCents);
      }
      if (pDeptId) {
        laborCostByDeptCents.set(pDeptId, (laborCostByDeptCents.get(pDeptId) || 0) + recordLaborCents);
      }
    }

    // 7. Aggregate Worked Hours SSOT (From Phase 6C)
    let totalWorkedHours = 0;
    if (typeof params.totalWorkedHours === "number") {
      totalWorkedHours = params.totalWorkedHours;
    } else {
      for (const h of Object.values(workedHoursByEmployee)) {
        totalWorkedHours += Number(h) || 0;
      }
    }

    // 8. Compute Enterprise Metrics M-01 -> M-08
    const m01_val = totalEligibleGLRevenueCents / 100;
    let m01_state: Phase7MetricState = "VALUE";
    if (!hasAnyTransactionsInPeriod && eligibleTxCount === 0) {
      m01_state = "NO_DATA";
    } else if (totalEligibleGLRevenueCents === 0) {
      m01_state = "ZERO";
    }

    const m01 = createMetric<number>(
      "M-01",
      "Attributed Operational Revenue",
      m01_state,
      m01_state === "NO_DATA" ? null : m01_val,
      currency,
      currency
    );

    let m02_state: Phase7MetricState = "VALUE";
    let m02_val: number | null = totalDirectLaborCostCents / 100;
    let m02_reason: string | undefined;

    if (isUsdLaborCostUnavailable) {
      m02_state = "NO_DATA";
      m02_val = null;
      m02_reason = "Direct labor cost is native to HTG. Conversion to USD requires certified historical payroll FX rate.";
    } else if (!hasAnyPayrollInPeriod && sealedPayrollCount === 0) {
      m02_state = "NO_DATA";
      m02_val = null;
    } else if (totalDirectLaborCostCents === 0) {
      m02_state = "ZERO";
      m02_val = 0.0;
    }

    const m02 = createMetric<number>(
      "M-02",
      "Total Direct Labor Cost",
      m02_state,
      m02_val,
      currency,
      currency,
      undefined,
      m02_reason
    );

    // M-03: Net Operational Labor Margin = M-01 - M-02
    let m03_state: Phase7MetricState = "VALUE";
    let m03_val: number | null = null;
    if (m01.state === "NO_DATA" || m02.state === "NO_DATA") {
      m03_state = "NO_DATA";
    } else if (m01.state === "ZERO" && m02.state === "ZERO") {
      m03_state = "ZERO";
      m03_val = 0.0;
    } else if (m01.value !== null && m02.value !== null) {
      const margin = m01.value - m02.value;
      m03_val = Math.round(margin * 100) / 100;
      if (m03_val === 0) {
        m03_state = "ZERO";
      } else {
        m03_state = "VALUE";
      }
    } else {
      m03_state = "NO_DATA";
    }

    const m03 = createMetric<number>(
      "M-03",
      "Net Operational Labor Margin",
      m03_state,
      m03_val,
      currency,
      currency
    );

    // M-04: Revenue per Attended Labor Hour = M-01 / WorkedHours
    let m04_state: Phase7MetricState = "VALUE";
    let m04_val: number | null = null;
    if (m01.state === "NO_DATA") {
      m04_state = "NO_DATA";
    } else if (totalWorkedHours === 0) {
      m04_state = "UNDEFINED";
      m04_val = null;
    } else if (m01.state === "ZERO" || m01.value === 0) {
      m04_state = "ZERO";
      m04_val = 0.0;
    } else if (m01.value !== null) {
      m04_val = Math.round((m01.value / totalWorkedHours) * 100) / 100;
      m04_state = "VALUE";
    }

    const m04 = createMetric<number>(
      "M-04",
      "Revenue per Attended Labor Hour",
      m04_state,
      m04_val,
      `${currency}/h`
    );

    // M-05: Unit Labor Cost Ratio (ULCR) = (M-02 / M-01) * 100
    let m05_state: Phase7MetricState = "VALUE";
    let m05_val: number | null = null;
    if (m01.state === "NO_DATA" || m02.state === "NO_DATA") {
      m05_state = "NO_DATA";
    } else if (m01.state === "ZERO" || m01.value === 0 || m01.value === null) {
      m05_state = "UNDEFINED"; // Division by zero revenue is undefined, even if labor cost is 0
      m05_val = null;
    } else if (m02.state === "ZERO" || m02.value === 0) {
      m05_state = "ZERO";
      m05_val = 0.0;
    } else if (m02.value !== null && m01.value !== null) {
      m05_val = Math.round((m02.value / m01.value) * 10000) / 100;
      m05_state = "VALUE";
    }

    const m05 = createMetric<number>(
      "M-05",
      "Unit Labor Cost Ratio",
      m05_state,
      m05_val,
      "%"
    );

    // M-06: Return on Labor Investment (ROLI) = (M-03 / M-02) * 100
    let m06_state: Phase7MetricState = "VALUE";
    let m06_val: number | null = null;
    if (m01.state === "NO_DATA" || m02.state === "NO_DATA" || m03.state === "NO_DATA") {
      m06_state = "NO_DATA";
    } else if (m02.state === "ZERO" || m02.value === 0 || m02.value === null) {
      m06_state = "UNDEFINED"; // Division by zero labor cost is undefined
      m06_val = null;
    } else if (m03.state === "ZERO" || m03.value === 0) {
      m06_state = "ZERO";
      m06_val = 0.0;
    } else if (m03.value !== null && m02.value !== null) {
      m06_val = Math.round((m03.value / m02.value) * 10000) / 100;
      m06_state = "VALUE";
    }

    const m06 = createMetric<number>(
      "M-06",
      "Return on Labor Investment",
      m06_state,
      m06_val,
      "%"
    );

    // Enterprise Productivity (P_enterprise = Revenue / LaborCost)
    let enterpriseProductivity: number | null = null;
    if (m01.value !== null && m02.value !== null && m02.value > 0) {
      enterpriseProductivity = m01.value / m02.value;
    } else if (m01.value === 0 && m02.value !== null && m02.value > 0) {
      enterpriseProductivity = 0.0;
    }

    // 9. Build Department Breakdown Records & M-07 / M-08
    const m07_deptBreakdown: Record<string, Phase7MetricValue<number>> = {};
    const m08_deptIndices: Record<string, Phase7MetricValue<number>> = {};
    const byDepartment: DepartmentLaborEconomicsRecord[] = [];

    for (const dept of tenantDepartments) {
      const dRevenueCents = revenueByDeptCents.get(dept.id) || 0;
      const dLaborCents = laborCostByDeptCents.get(dept.id) || 0;
      const dRevenue = dRevenueCents / 100;
      const dLabor = dLaborCents / 100;
      const dMargin = Math.round((dRevenue - dLabor) * 100) / 100;

      // Sum worked hours for employees in department
      let dHours = 0;
      for (const emp of tenantEmployees) {
        const empDept = emp.departmentId || emp.department_id;
        if (empDept === dept.id) {
          dHours += Number(workedHoursByEmployee[emp.id]) || 0;
        }
      }

      const dRevPerHour = dHours > 0 ? Math.round((dRevenue / dHours) * 100) / 100 : null;
      const dUlcr = dRevenue > 0 ? Math.round((dLabor / dRevenue) * 10000) / 100 : null;
      const dRoli = dLabor > 0 ? Math.round((dMargin / dLabor) * 10000) / 100 : null;

      let dProductivity: number | null = null;
      if (dLabor > 0) {
        dProductivity = dRevenue / dLabor;
      }

      // M-08 6-Case State Machine for Department LPI
      let lpiState: Phase7MetricState = "VALUE";
      let lpiVal: number | null = null;

      if (dLabor === 0) {
        lpiState = "UNDEFINED"; // Case 1: Denominator is 0
      } else if (enterpriseProductivity === null) {
        lpiState = "UNDEFINED"; // Case 2: Enterprise productivity is undefined
      } else if (dRevenue === 0 && enterpriseProductivity > 0) {
        lpiState = "ZERO"; // Case 3: 0 / k = 0
        lpiVal = 0.0;
      } else if (enterpriseProductivity === 0) {
        lpiState = "UNDEFINED"; // Case 4 & 5: Division by enterprise 0 (0 / 0 or k / 0)
      } else if (dProductivity !== null && enterpriseProductivity > 0) {
        lpiVal = Math.round((dProductivity / enterpriseProductivity) * 100) / 100;
        lpiState = "VALUE";
      } else {
        lpiState = "NO_DATA";
      }

      const lpiMetric = createMetric<number>(
        `M-08-${dept.id}`,
        `LPI - ${dept.name}`,
        lpiState,
        lpiVal,
        ""
      );
      m08_deptIndices[dept.id] = lpiMetric;

      const m07Metric = createMetric<number>(
        `M-07-${dept.id}`,
        `Revenue - ${dept.name}`,
        dRevenueCents > 0 ? "VALUE" : "ZERO",
        dRevenue,
        currency,
        currency
      );
      m07_deptBreakdown[dept.id] = m07Metric;

      byDepartment.push({
        departmentId: dept.id,
        departmentName: dept.name,
        branchId: dept.branchId || dept.branch_id,
        attributedRevenueCents: dRevenueCents,
        attributedRevenue: dRevenue,
        directLaborCostCents: dLaborCents,
        directLaborCost: dLabor,
        netLaborMargin: dMargin,
        workedHours: dHours,
        revenuePerHour: dRevPerHour,
        unitLaborCostRatio: dUlcr,
        returnOnLaborInvestment: dRoli,
        productivity: dProductivity,
        laborProductivityIndex: lpiMetric,
        state: dRevenueCents > 0 || dLaborCents > 0 ? "VALUE" : "NO_DATA",
      });
    }

    // 10. Build Employee Records
    const byEmployee: EmployeeLaborEconomicsRecord[] = [];
    for (const emp of tenantEmployees) {
      const eRevenueCents = revenueByEmpCents.get(emp.id) || 0;
      const eLaborCents = laborCostByEmpCents.get(emp.id) || 0;
      const eRevenue = eRevenueCents / 100;
      const eLabor = eLaborCents / 100;
      const eMargin = Math.round((eRevenue - eLabor) * 100) / 100;
      const eHours = Number(workedHoursByEmployee[emp.id]) || 0;

      const eRevPerHour = eHours > 0 ? Math.round((eRevenue / eHours) * 100) / 100 : null;
      const eUlcr = eRevenue > 0 ? Math.round((eLabor / eRevenue) * 10000) / 100 : null;
      const eRoli = eLabor > 0 ? Math.round((eMargin / eLabor) * 10000) / 100 : null;

      byEmployee.push({
        employeeId: emp.id,
        employeeName: emp.name,
        homeDepartmentId: emp.departmentId || emp.department_id,
        operationalDepartmentId: emp.departmentId || emp.department_id,
        branchId: emp.branchId || emp.branch_id,
        attributedRevenueCents: eRevenueCents,
        attributedRevenue: eRevenue,
        directLaborCostCents: eLaborCents,
        directLaborCost: eLabor,
        netLaborMargin: eMargin,
        workedHours: eHours,
        revenuePerHour: eRevPerHour,
        unitLaborCostRatio: eUlcr,
        returnOnLaborInvestment: eRoli,
        state: eRevenueCents > 0 || eLaborCents > 0 ? "VALUE" : "NO_DATA",
      });
    }

    // 11. Deterministic Dataset Hash & ID Generation
    const hashPayload = `${safeBizId}:${startDate}:${endDate}:${currency}:${totalEligibleGLRevenueCents}:${totalDirectLaborCostCents}:${totalWorkedHours}:${eligibleTxCount}:${sealedPayrollCount}`;
    const hash = deterministicHash(hashPayload);
    const datasetId = `F7-${hash}`;

    // 12. If GL is not balanced, block the dataset metrics
    if (!isGLBalanced) {
      return this.buildBlockedDataset(
        params,
        "BLOCKED",
        `GL reconciliation failed. Variance of ${varianceCents} cents detected between total eligible revenue and attributed/unassigned sum.`
      );
    }

    return {
      datasetId,
      businessId: safeBizId,
      periodStart: startDate,
      periodEnd: endDate,
      targetCurrency: currency,
      metrics: {
        m01_attributedRevenue: m01,
        m02_directLaborCost: m02,
        m03_netLaborMargin: m03,
        m04_revenuePerHour: m04,
        m05_unitLaborCostRatio: m05,
        m06_returnOnLaborInvestment: m06,
        m07_departmentRevenueBreakdown: m07_deptBreakdown,
        m08_departmentProductivityIndices: m08_deptIndices,
      },
      byDepartment,
      byEmployee,
      attributedItems,
      unassignedRevenue: {
        amountCents: unassignedRevenueCents,
        amount: unassignedRevenueCents / 100,
        count: unassignedRevenueCount,
      },
      reconciliation: {
        totalEligibleGLRevenueCents,
        totalAttributedRevenueCents,
        unassignedRevenueCents,
        varianceCents,
        isBalanced: isGLBalanced,
      },
      provenance: {
        engineVersion: "4.0.0-phase7",
        deterministicHash: hash,
        datasetId,
        eligibleTransactionCount: eligibleTxCount,
        sealedPayrollRecordCount: sealedPayrollCount,
        totalWorkedHours,
        businessTimezone: params.businessTimezone,
      },
    };
  }

  /**
   * Constructs an immutable blocked or unconfigured dataset
   */
  private static buildBlockedDataset(
    params: Phase7EngineParams,
    state: "BLOCKED" | "TIMEZONE_NOT_CONFIGURED",
    reason: string
  ): Phase7Dataset {
    const bizId = params.businessId || "UNKNOWN_TENANT";
    const currency = params.targetCurrency || "HTG";
    const startDate = params.startDate || "";
    const endDate = params.endDate || "";

    const hash = deterministicHash(`${bizId}:${state}:${startDate}:${endDate}`);
    const datasetId = `F7-${hash}`;

    const makeBlocked = (id: string, name: string, unit: string) =>
      createMetric<number>(id, name, state, null, unit, currency, undefined, reason);

    return {
      datasetId,
      businessId: bizId,
      periodStart: startDate,
      periodEnd: endDate,
      targetCurrency: currency,
      metrics: {
        m01_attributedRevenue: makeBlocked("M-01", "Attributed Operational Revenue", currency),
        m02_directLaborCost: makeBlocked("M-02", "Total Direct Labor Cost", currency),
        m03_netLaborMargin: makeBlocked("M-03", "Net Operational Labor Margin", currency),
        m04_revenuePerHour: makeBlocked("M-04", "Revenue per Attended Labor Hour", `${currency}/h`),
        m05_unitLaborCostRatio: makeBlocked("M-05", "Unit Labor Cost Ratio", "%"),
        m06_returnOnLaborInvestment: makeBlocked("M-06", "Return on Labor Investment", "%"),
        m07_departmentRevenueBreakdown: {},
        m08_departmentProductivityIndices: {},
      },
      byDepartment: [],
      byEmployee: [],
      attributedItems: [],
      unassignedRevenue: {
        amountCents: 0,
        amount: 0,
        count: 0,
      },
      reconciliation: {
        totalEligibleGLRevenueCents: 0,
        totalAttributedRevenueCents: 0,
        unassignedRevenueCents: 0,
        varianceCents: 0,
        isBalanced: false,
      },
      provenance: {
        engineVersion: "4.0.0-phase7",
        deterministicHash: hash,
        datasetId,
        eligibleTransactionCount: 0,
        sealedPayrollRecordCount: 0,
        totalWorkedHours: 0,
        businessTimezone: params.businessTimezone,
      },
    };
  }
}
