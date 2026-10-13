import { describe, it, expect } from "vitest";
import { SchemaMigrationDryRunEngine } from "../../../scripts/audits/schema-migration-dry-run";

describe("SchemaMigrationDryRunEngine (Phase 4E)", () => {
  it("evaluates Group 1 Tenant identity successfully", () => {
    // Normal dual key
    const res1 = SchemaMigrationDryRunEngine.evaluateTenantGroup("doc_1", "employees", {
      business_id: "biz_123",
      businessId: "biz_123"
    });
    expect(res1.category).toBe("NO_CHANGE_REQUIRED");
    expect(res1.hasConflict).toBe(false);

    // Mismatch
    const res2 = SchemaMigrationDryRunEngine.evaluateTenantGroup("doc_2", "employees", {
      business_id: "biz_123",
      businessId: "biz_999"
    });
    expect(res2.category).toBe("TENANT_CONFLICT");
    expect(res2.hasConflict).toBe(true);

    // Single key
    const res3 = SchemaMigrationDryRunEngine.evaluateTenantGroup("doc_3", "employees", {
      business_id: "biz_123"
    });
    expect(res3.category).toBe("SAFE_TRANSFORMATION_SIMULATED");
    expect(res3.simulatedCanonicalPayload).toEqual({ business_id: "biz_123", businessId: "biz_123" });
  });

  it("evaluates Group 2 Payroll Cycle references", () => {
    const res = SchemaMigrationDryRunEngine.evaluatePayrollCycleGroup("rec_1", {
      cycleId: "cyc_100",
      payroll_cycle_id: "cyc_100"
    });
    expect(res.category).toBe("NO_CHANGE_REQUIRED");

    const mismatch = SchemaMigrationDryRunEngine.evaluatePayrollCycleGroup("rec_2", {
      cycleId: "cyc_100",
      payroll_cycle_id: "cyc_200"
    });
    expect(mismatch.category).toBe("CONFLICT_REQUIRES_REVIEW");
  });

  it("evaluates Group 3 Salary representations and factor 100 risks", () => {
    // Normal
    const ok = SchemaMigrationDryRunEngine.evaluateSalaryGroup("emp_1", {
      baseSalary: 25000,
      base_salary_cents: 2500000
    });
    expect(ok.category).toBe("SAFE_TRANSFORMATION_SIMULATED");

    // Factor 100 Discrepancy
    const bad = SchemaMigrationDryRunEngine.evaluateSalaryGroup("emp_2", {
      baseSalary: 25000,
      base_salary_cents: 25000 // Error: 250 Gourdes instead of 2,500,000 cents
    });
    expect(bad.category).toBe("UNIT_UNKNOWN");
    expect(bad.hasConflict).toBe(true);

    // Uninitialized founder (salary 0)
    const zero = SchemaMigrationDryRunEngine.evaluateSalaryGroup("emp_3", {
      baseSalary: 0,
      base_salary_cents: 0
    });
    expect(zero.category).toBe("CONFLICT_REQUIRES_REVIEW");
    expect(zero.requiresHumanReview).toBe(true);
  });

  it("evaluates Group 4 Period dates", () => {
    const valid = SchemaMigrationDryRunEngine.evaluatePeriodGroup("cyc_1", {
      startDate: "2026-10-01",
      endDate: "2026-10-15"
    });
    expect(valid.category).toBe("NO_CHANGE_REQUIRED");

    const invalid = SchemaMigrationDryRunEngine.evaluatePeriodGroup("cyc_2", {
      startDate: "2026-10-20",
      endDate: "2026-10-10"
    });
    expect(invalid.category).toBe("CONFLICT_REQUIRES_REVIEW");
  });

  it("evaluates Group 5 Accounting Amounts and Currency", () => {
    const valid = SchemaMigrationDryRunEngine.evaluateAccountingAmountGroup("tx_1", {
      amount: 1250.50,
      amount_cents: 125050,
      currency: "HTG"
    });
    expect(valid.category).toBe("SAFE_TRANSFORMATION_SIMULATED");

    const missingCurrency = SchemaMigrationDryRunEngine.evaluateAccountingAmountGroup("tx_2", {
      amount: 1000,
      amount_cents: 100000
    });
    expect(missingCurrency.category).toBe("MISSING_REQUIRED_FIELD");
  });

  it("evaluates Provisioning Anomalies (Plan Mismatch)", () => {
    const mismatch = SchemaMigrationDryRunEngine.evaluateProvisioningAnomalies("biz_vo5k", {
      selectedPlan: "PROFESSIONAL"
    }, {
      plan: "FREE_TIER"
    });
    expect(mismatch.category).toBe("CONFLICT_REQUIRES_REVIEW");
    expect(mismatch.hasConflict).toBe(true);
  });
});
