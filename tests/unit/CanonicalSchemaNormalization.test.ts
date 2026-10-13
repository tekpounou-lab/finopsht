import { describe, it, expect } from "vitest";
import {
  toCamelCase,
  toSnakeCase,
  mapBranch,
  mapDepartment,
  mapEmployee,
  mapPayrollCycle,
  mapLedgerTransaction,
} from "../../src/utils/caseConverter";
import { SchemaMigrationDryRunEngine } from "../../scripts/audits/schema-migration-dry-run";

describe("FINOPS ERP — Canonical Schema Normalization Unit Tests", () => {
  describe("Group 1: Tenant Bivalence (business_id / businessId)", () => {
    it("should bidirectionally synchronize business_id and businessId without losing data", () => {
      const raw = {
        business_id: "biz_vo5k8jqo33cZoYzZdbzu4MmA0A7x1",
        name: "Finans Ayiti",
      };
      const mapped = mapBranch(raw);
      expect(mapped.businessId).toBe("biz_vo5k8jqo33cZoYzZdbzu4MmA0A7x1");
      expect(mapped.business_id).toBe("biz_vo5k8jqo33cZoYzZdbzu4MmA0A7x1");

      const dryRun = SchemaMigrationDryRunEngine.evaluateTenantGroup("doc_01", "branches", raw);
      expect(dryRun.category).toBe("SAFE_TRANSFORMATION_SIMULATED");
      expect(dryRun.hasConflict).toBe(false);
    });

    it("should flag contradictory tenant IDs as TENANT_CONFLICT", () => {
      const raw = {
        business_id: "biz_tenant_A",
        businessId: "biz_tenant_B",
      };
      const dryRun = SchemaMigrationDryRunEngine.evaluateTenantGroup("doc_02", "branches", raw);
      expect(dryRun.category).toBe("TENANT_CONFLICT");
      expect(dryRun.hasConflict).toBe(true);
    });
  });

  describe("Group 2: Payroll Cycle Linkage (cycleId / payroll_cycle_id)", () => {
    it("should map cycleId and generate payroll_cycle_id compatibility key", () => {
      const raw = {
        id: "cyc_2026_08",
        business_id: "biz_vo5k8jqo",
        startDate: "2026-08-01",
        endDate: "2026-08-15",
      };
      const mapped = mapPayrollCycle(raw);
      expect(mapped.cycleId).toBe("cyc_2026_08");
      expect(mapped.payroll_cycle_id).toBe("cyc_2026_08");

      const dryRun = SchemaMigrationDryRunEngine.evaluatePayrollCycleGroup("cyc_2026_08", {
        cycleId: "cyc_2026_08",
      });
      expect(dryRun.category).toBe("LEGACY_COMPATIBILITY_REQUIRED");
      expect(dryRun.simulatedCanonicalPayload.payroll_cycle_id).toBe("cyc_2026_08");
    });
  });

  describe("Group 3: Salary Fields & Zero Salary Preservation", () => {
    it("should preserve baseSalary = 0 for non-salaried founder (emp_owner_vo5k8jqo)", () => {
      const rawFounder = {
        id: "emp_owner_vo5k8jqo",
        business_id: "biz_vo5k8jqo",
        role: "OWNER",
        baseSalary: 0,
        salary_base_htg: 0,
        base_salary_cents: 0,
      };
      const mapped = mapEmployee(rawFounder);
      expect(mapped.baseSalary).toBe(0);
      expect(mapped.salaryBaseHtg).toBe(0);
      expect(mapped.base_salary_cents).toBe(0);

      const dryRun = SchemaMigrationDryRunEngine.evaluateSalaryGroup("emp_owner_vo5k8jqo", rawFounder);
      expect(dryRun.simulatedCanonicalPayload.baseSalary).toBe(0);
      expect(dryRun.simulatedCanonicalPayload.base_salary_cents).toBe(0);
    });

    it("should convert HTG base salary to integer cents (factor 100)", () => {
      const rawEmployee = {
        id: "emp_mgr_01",
        business_id: "biz_vo5k8jqo",
        baseSalary: 250000,
      };
      const mapped = mapEmployee(rawEmployee);
      expect(mapped.baseSalary).toBe(250000);
      expect(mapped.base_salary_cents).toBe(25000000);
    });
  });

  describe("Group 4: Period Dates", () => {
    it("should normalize start_date / end_date to ISO YYYY-MM-DD", () => {
      const raw = {
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
      };
      const dryRun = SchemaMigrationDryRunEngine.evaluatePeriodGroup("cyc_01", raw);
      expect(dryRun.category).toBe("SAFE_TRANSFORMATION_SIMULATED");
      expect(dryRun.simulatedCanonicalPayload.startDate).toBe("2026-06-01");
      expect(dryRun.simulatedCanonicalPayload.endDate).toBe("2026-06-30");
    });
  });

  describe("Group 5: Ledger Amounts & Currency", () => {
    it("should map ledger transactions and convert amount to integer amount_cents", () => {
      const raw = {
        amount: 15000,
        currency: "HTG",
        debit_account: "641100",
        credit_account: "512100",
      };
      const mapped = mapLedgerTransaction(raw);
      expect(mapped.amount).toBe(15000);
      expect(mapped.amount_cents).toBe(1500000);
      expect(mapped.debitAccount).toBe("641100");
      expect(mapped.creditAccount).toBe("512100");
      expect(mapped.currency).toBe("HTG");
    });

    it("should flag missing currency as MISSING_REQUIRED_FIELD", () => {
      const raw = {
        amount: 12000,
        amount_cents: 1200000,
      };
      const dryRun = SchemaMigrationDryRunEngine.evaluateAccountingAmountGroup("tx_legacy_01", raw);
      expect(dryRun.category).toBe("MISSING_REQUIRED_FIELD");
      expect(dryRun.hasConflict).toBe(true);
    });
  });

  describe("Group 6: PCG Accounts", () => {
    it("should maintain dual-key mapping for PCG debit/credit accounts", () => {
      const raw = {
        debit_account: "641100",
        credit_account: "512100",
      };
      const dryRun = SchemaMigrationDryRunEngine.evaluateAccountsGroup("tx_acc_01", raw);
      expect(dryRun.category).toBe("SAFE_TRANSFORMATION_SIMULATED");
      expect(dryRun.simulatedCanonicalPayload.debitAccount).toBe("641100");
      expect(dryRun.simulatedCanonicalPayload.creditAccount).toBe("512100");
    });
  });

  describe("Group 7: Identity Unification (uid / firebase_uid)", () => {
    it("should unify uid and firebase_uid when matching", () => {
      const raw = {
        uid: "usr_vo5k8jqo",
        firebase_uid: "usr_vo5k8jqo",
      };
      const dryRun = SchemaMigrationDryRunEngine.evaluateIdentityGroup("usr_01", raw);
      expect(dryRun.category).toBe("SAFE_TRANSFORMATION_SIMULATED");
      expect(dryRun.hasConflict).toBe(false);
    });

    it("should flag mismatch between uid and firebase_uid as CONFLICT_REQUIRES_REVIEW", () => {
      const raw = {
        uid: "usr_mismatch_001",
        firebase_uid: "usr_mismatch_002",
      };
      const dryRun = SchemaMigrationDryRunEngine.evaluateIdentityGroup("usr_mismatch", raw);
      expect(dryRun.category).toBe("CONFLICT_REQUIRES_REVIEW");
      expect(dryRun.hasConflict).toBe(true);
    });
  });
});
