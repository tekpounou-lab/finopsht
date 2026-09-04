import { CommissionPlan, CommissionRule, Employee, LedgerTransaction } from "../types";
import { DepartmentSalesSummary } from "./workforce/SalesAggregator";

export interface CommissionCalculationResult {
  commissionAmount: number;
  planIdApplied?: string;
  ruleIdApplied?: string;
  effectiveRate: number;
}

export class CommissionEngine {
  /**
   * Deterministically calculates commission for a transaction based on:
   * 1. Employee-specific active plan override
   * 2. Category x Operational Department rule matching (STRICT ID MATCHING)
   * 3. Department default commission rate
   * 4. Enterprise baseline rate
   */
  static calculateTransactionCommission(
    transactionAmount: number,
    category: string,
    operationalDepartmentId: string,
    activePlans: CommissionPlan[] = [],
    employeeCommissionPlanId?: string,
    defaultCommissionRate: number = 0.05
  ): CommissionCalculationResult {
    if (transactionAmount <= 0) {
      return { commissionAmount: 0, effectiveRate: 0 };
    }

    // 1. Check ONLY for explicit plan assigned specifically to this employee
    if (employeeCommissionPlanId) {
      const matchedPlan = activePlans.find(
        (p) => p.id === employeeCommissionPlanId && p.status === "ACTIVE"
      );

      if (matchedPlan && matchedPlan.rules && matchedPlan.rules.length > 0) {
        // Find matching rule strictly by Operational Dept ID & Category
        const matchingRule = matchedPlan.rules.find((r) => {
          const matchesDept =
            !r.operational_department_id ||
            r.operational_department_id === operationalDepartmentId;
          const matchesCategory =
            !r.product_category ||
            r.product_category.toLowerCase() === category.toLowerCase();
          const matchesMinAmount =
            !r.min_sale_amount || transactionAmount >= r.min_sale_amount;
          return matchesDept && matchesCategory && matchesMinAmount;
        });

        if (matchingRule) {
          let rate = matchingRule.rate_value;

          // Tiered logic check
          if (matchingRule.commission_type === "TIERED" && matchingRule.tiers) {
            const matchedTier = matchingRule.tiers
              .slice()
              .sort((a, b) => b.min_threshold - a.min_threshold)
              .find((t) => transactionAmount >= t.min_threshold);
            if (matchedTier) {
              rate = matchedTier.rate;
            }
          }

          const effectiveDecimal = rate > 1 ? rate / 100 : rate;
          const commissionAmount =
            matchingRule.commission_type === "FLAT_FEE"
              ? matchingRule.rate_value
              : Number((transactionAmount * effectiveDecimal).toFixed(2));

          return {
            commissionAmount,
            planIdApplied: matchedPlan.id,
            ruleIdApplied: matchingRule.rule_id,
            effectiveRate: effectiveDecimal,
          };
        }

        // Plan default rate
        if (matchedPlan.default_rate !== undefined) {
          const rateDecimal =
            matchedPlan.default_rate > 1
              ? matchedPlan.default_rate / 100
              : matchedPlan.default_rate;
          return {
            commissionAmount: Number((transactionAmount * rateDecimal).toFixed(2)),
            planIdApplied: matchedPlan.id,
            effectiveRate: rateDecimal,
          };
        }
      }
    }

    // Primary & Fallback: Direct multiplication by Employee Commission Rate (never use default/global multipliers)
    const fallbackRateDecimal =
      defaultCommissionRate > 1
        ? defaultCommissionRate / 100
        : defaultCommissionRate;
    return {
      commissionAmount: Number((transactionAmount * fallbackRateDecimal).toFixed(2)),
      effectiveRate: fallbackRateDecimal,
    };
  }

  /**
   * Formats a raw commission rate for UI display as a percentage string (e.g. 0.45 -> "45%", 0.05 -> "5%", 0.17 -> "17%").
   */
  static formatCommissionRateDisplay(rawRate: number | string | undefined | null): string {
    if (rawRate === undefined || rawRate === null || isNaN(Number(rawRate))) return "0%";
    const num = Number(rawRate);
    if (num === 0) return "0%";
    const percent = num <= 1 ? Math.round(num * 100 * 100) / 100 : num;
    return `${percent}%`;
  }

  /**
   * Resolves commission rate with strict priority:
   * Contract commissionRate > Employee commissionRate / commission_rate > Model Defaults
   */
  static resolveCommissionRate(employee: any, contract?: any, saleDate?: string): number {
    // 1. Check for temporal/historical rates in contract
    if (contract?.historical_commission_rates && Array.isArray(contract.historical_commission_rates) && saleDate) {
      const historicalMatch = contract.historical_commission_rates.find((hr: any) => {
        const from = hr.effective_from || '1970-01-01';
        const to = hr.effective_to || '2099-12-31';
        return saleDate >= from && saleDate <= to;
      });
      if (historicalMatch && historicalMatch.rate !== undefined) {
        const numRate = Number(historicalMatch.rate);
        return numRate > 1 ? numRate / 100 : numRate;
      }
    }

    let rawRate: any =
      employee?.commission_rate ??
      (employee as any)?.commission_rate ??
      employee?.commissionRate ??
      (employee as any)?.commissionRate ??
      contract?.commissionRate ??
      (contract as any)?.commission_rate;

    if (rawRate !== undefined && rawRate !== null) {
      if (typeof rawRate === "string") {
        rawRate = rawRate.replace("%", "").trim();
      }
      const numRate = Number(rawRate);
      if (!isNaN(numRate) && numRate > 0) {
        return numRate > 1 ? numRate / 100 : numRate;
      }
    }

    // Default fallback rate (5%) if employee is on COMMISSION or HYBRID pay profile but no rate set
    const model = (employee?.paymentModel || employee?.payRegime || employee?.pay_profile || "").toString().toUpperCase();
    if (model === "COMMISSION" || model === "HYBRID") {
      return 0.05;
    }

    return 0;
  }

  /**
   * Calculates total employee commission from aggregated sales grouped strictly by department_id.
   * Pipeline: Employee -> employee_id -> GL Transactions -> department_id -> Sales Aggregator -> Commission
   * STRICTLY ID-BASED. No department text or string matching.
   */
  static calculateEmployeeCommissionsFromSales(
    employee: Employee,
    salesByDept: Record<string, DepartmentSalesSummary>,
    activePlans: CommissionPlan[] = [],
    defaultCommissionRate?: number,
    contract?: any
  ): {
    totalCommission: number;
    departmentCommissions: Record<string, number>;
  } {
    let totalCommission = 0;
    const departmentCommissions: Record<string, number> = {};

    const resolvedRate = CommissionEngine.resolveCommissionRate(employee, contract);
    const effectiveRate = defaultCommissionRate !== undefined
      ? (defaultCommissionRate > 1 ? defaultCommissionRate / 100 : defaultCommissionRate)
      : resolvedRate;

    Object.entries(salesByDept).forEach(([deptId, data]) => {
      if (data.salesAmount <= 0) {
        departmentCommissions[deptId] = 0;
        return;
      }

      const res = this.calculateTransactionCommission(
        data.salesAmount,
        "REVENUE",
        deptId, // operational department_id ONLY
        activePlans,
        (employee as any).commissionPlanId || (employee as any).commission_plan_id,
        effectiveRate
      );

      departmentCommissions[deptId] = res.commissionAmount;
      totalCommission += res.commissionAmount;
    });

    return {
      totalCommission: Number(totalCommission.toFixed(2)),
      departmentCommissions,
    };
  }
}

