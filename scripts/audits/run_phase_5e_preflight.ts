import { SchemaMigrationDryRunEngine, DryRunResult } from "./schema-migration-dry-run";

// Target tenant
const TARGET_TENANT = "biz_vo5k8jqo33cZoYzZdbzu4MmA0A7x1";
const PROJECT_ID = "ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a";

interface PreflightDocDef {
  path: string;
  collection: string;
  group: string;
  payload: Record<string, any>;
}

// Batch 1: 50 target documents representing tenant biz_vo5k8jqo33cZoYzZdbzu4MmA0A7x1 across the 7 groups
export const BATCH_1_DOCS: PreflightDocDef[] = [
  // Group 1: Tenant Identity (10 docs)
  { path: `businesses/${TARGET_TENANT}`, collection: "businesses", group: "GROUP_1_TENANT", payload: { business_id: TARGET_TENANT, businessId: TARGET_TENANT, name: "Finans Ayiti", status: "ACTIVE" } },
  { path: `business_settings/${TARGET_TENANT}_settings`, collection: "business_settings", group: "GROUP_1_TENANT", payload: { business_id: TARGET_TENANT, businessId: TARGET_TENANT, currency: "HTG" } },
  { path: `branches/br_headquarters_${TARGET_TENANT.substring(4, 12)}`, collection: "branches", group: "GROUP_1_TENANT", payload: { business_id: TARGET_TENANT, businessId: TARGET_TENANT, name: "Siège Principal" } },
  { path: `branches/br_cap_haitien_${TARGET_TENANT.substring(4, 12)}`, collection: "branches", group: "GROUP_1_TENANT", payload: { business_id: TARGET_TENANT, businessId: TARGET_TENANT, name: "Succursale Cap-Haïtien" } },
  { path: `departments/dept_finance_${TARGET_TENANT.substring(4, 12)}`, collection: "departments", group: "GROUP_1_TENANT", payload: { business_id: TARGET_TENANT, businessId: TARGET_TENANT, name: "Finance & Comptabilité" } },
  { path: `departments/dept_hr_${TARGET_TENANT.substring(4, 12)}`, collection: "departments", group: "GROUP_1_TENANT", payload: { business_id: TARGET_TENANT, businessId: TARGET_TENANT, name: "Ressources Humaines" } },
  { path: `departments/dept_ops_${TARGET_TENANT.substring(4, 12)}`, collection: "departments", group: "GROUP_1_TENANT", payload: { business_id: TARGET_TENANT, businessId: TARGET_TENANT, name: "Opérations" } },
  { path: `subscription_plans/sub_${TARGET_TENANT}`, collection: "subscription_plans", group: "GROUP_1_TENANT", payload: { business_id: TARGET_TENANT, businessId: TARGET_TENANT, plan: "PRO", status: "ACTIVE" } },
  { path: `roles/role_admin_${TARGET_TENANT.substring(4, 12)}`, collection: "roles", group: "GROUP_1_TENANT", payload: { business_id: TARGET_TENANT, businessId: TARGET_TENANT, roleName: "ADMIN" } },
  { path: `roles/role_teller_${TARGET_TENANT.substring(4, 12)}`, collection: "roles", group: "GROUP_1_TENANT", payload: { business_id: TARGET_TENANT, businessId: TARGET_TENANT, roleName: "SENIOR_TELLER" } },

  // Group 2: Payroll Cycles (8 docs)
  { path: `payroll_cycles/cyc_2026_01_${TARGET_TENANT.substring(4, 8)}`, collection: "payroll_cycles", group: "GROUP_2_PAYROLL_CYCLES", payload: { cycleId: "cyc_2026_01", payroll_cycle_id: "cyc_2026_01", business_id: TARGET_TENANT, status: "CLOSED" } },
  { path: `payroll_cycles/cyc_2026_02_${TARGET_TENANT.substring(4, 8)}`, collection: "payroll_cycles", group: "GROUP_2_PAYROLL_CYCLES", payload: { cycleId: "cyc_2026_02", payroll_cycle_id: "cyc_2026_02", business_id: TARGET_TENANT, status: "CLOSED" } },
  { path: `payroll_cycles/cyc_2026_03_${TARGET_TENANT.substring(4, 8)}`, collection: "payroll_cycles", group: "GROUP_2_PAYROLL_CYCLES", payload: { cycleId: "cyc_2026_03", payroll_cycle_id: "cyc_2026_03", business_id: TARGET_TENANT, status: "CLOSED" } },
  { path: `payroll_cycles/cyc_2026_04_${TARGET_TENANT.substring(4, 8)}`, collection: "payroll_cycles", group: "GROUP_2_PAYROLL_CYCLES", payload: { cycleId: "cyc_2026_04", payroll_cycle_id: "cyc_2026_04", business_id: TARGET_TENANT, status: "CLOSED" } },
  { path: `payroll_cycles/cyc_2026_05_${TARGET_TENANT.substring(4, 8)}`, collection: "payroll_cycles", group: "GROUP_2_PAYROLL_CYCLES", payload: { cycleId: "cyc_2026_05", payroll_cycle_id: "cyc_2026_05", business_id: TARGET_TENANT, status: "CLOSED" } },
  { path: `payroll_cycles/cyc_2026_06_${TARGET_TENANT.substring(4, 8)}`, collection: "payroll_cycles", group: "GROUP_2_PAYROLL_CYCLES", payload: { cycleId: "cyc_2026_06", payroll_cycle_id: "cyc_2026_06", business_id: TARGET_TENANT, status: "CLOSED" } },
  { path: `payroll_cycles/cyc_2026_07_${TARGET_TENANT.substring(4, 8)}`, collection: "payroll_cycles", group: "GROUP_2_PAYROLL_CYCLES", payload: { cycleId: "cyc_2026_07", payroll_cycle_id: "cyc_2026_07", business_id: TARGET_TENANT, status: "APPROVED" } },
  { path: `payroll_cycles/cyc_2026_08_${TARGET_TENANT.substring(4, 8)}`, collection: "payroll_cycles", group: "GROUP_2_PAYROLL_CYCLES", payload: { cycleId: "cyc_2026_08", payroll_cycle_id: undefined, business_id: TARGET_TENANT, status: "DRAFT" } },

  // Group 3: Salaries & Contracts (8 docs)
  { path: `employees/emp_owner_${TARGET_TENANT.substring(4, 10)}`, collection: "employees", group: "GROUP_3_SALARIES", payload: { business_id: TARGET_TENANT, baseSalary: 0, salaryBaseHtg: 0, base_salary_cents: 0 } },
  { path: `employees/emp_mgr_01_${TARGET_TENANT.substring(4, 10)}`, collection: "employees", group: "GROUP_3_SALARIES", payload: { business_id: TARGET_TENANT, baseSalary: 250000, salaryBaseHtg: 250000, base_salary_cents: 25000000 } },
  { path: `employees/emp_teller_01_${TARGET_TENANT.substring(4, 10)}`, collection: "employees", group: "GROUP_3_SALARIES", payload: { business_id: TARGET_TENANT, baseSalary: 120000, salaryBaseHtg: 120000, base_salary_cents: 12000000 } },
  { path: `employees/emp_teller_02_${TARGET_TENANT.substring(4, 10)}`, collection: "employees", group: "GROUP_3_SALARIES", payload: { business_id: TARGET_TENANT, baseSalary: 120000, salaryBaseHtg: 120000, base_salary_cents: 12000000 } },
  { path: `employee_contracts/ct_mgr_01`, collection: "employee_contracts", group: "GROUP_3_SALARIES", payload: { business_id: TARGET_TENANT, contract: { baseSalary: 250000 }, base_salary_cents: 25000000 } },
  { path: `employee_contracts/ct_teller_01`, collection: "employee_contracts", group: "GROUP_3_SALARIES", payload: { business_id: TARGET_TENANT, contract: { baseSalary: 120000 }, base_salary_cents: 12000000 } },
  { path: `employee_contracts/ct_teller_02`, collection: "employee_contracts", group: "GROUP_3_SALARIES", payload: { business_id: TARGET_TENANT, contract: { baseSalary: 120000 }, base_salary_cents: 12000000 } },
  { path: `payroll_profiles/prof_mgr_01`, collection: "payroll_profiles", group: "GROUP_3_SALARIES", payload: { business_id: TARGET_TENANT, baseSalary: 250000, base_salary_cents: 25000000 } },

  // Group 4: Periods & Dates (6 docs)
  { path: `payroll_cycles/cyc_p_2026_01`, collection: "payroll_cycles", group: "GROUP_4_DATES", payload: { startDate: "2026-01-01", endDate: "2026-01-31" } },
  { path: `payroll_cycles/cyc_p_2026_02`, collection: "payroll_cycles", group: "GROUP_4_DATES", payload: { startDate: "2026-02-01", endDate: "2026-02-28" } },
  { path: `payroll_cycles/cyc_p_2026_03`, collection: "payroll_cycles", group: "GROUP_4_DATES", payload: { startDate: "2026-03-01", endDate: "2026-03-31" } },
  { path: `payroll_cycles/cyc_p_2026_04`, collection: "payroll_cycles", group: "GROUP_4_DATES", payload: { startDate: "2026-04-01", endDate: "2026-04-30" } },
  { path: `payroll_cycles/cyc_p_2026_05`, collection: "payroll_cycles", group: "GROUP_4_DATES", payload: { startDate: "2026-05-01", endDate: "2026-05-31" } },
  { path: `payroll_cycles/cyc_p_2026_06`, collection: "payroll_cycles", group: "GROUP_4_DATES", payload: { periodStart: "2026-06-01", periodEnd: "2026-06-30" } },

  // Group 5: Accounting Amounts & Currencies (6 docs)
  { path: `ledger_transactions/tx_pay_2026_01_001`, collection: "ledger_transactions", group: "GROUP_5_ACCOUNTING", payload: { amount: 1500000, amount_cents: 150000000, currency: "HTG" } },
  { path: `ledger_transactions/tx_pay_2026_02_001`, collection: "ledger_transactions", group: "GROUP_5_ACCOUNTING", payload: { amount: 1500000, amount_cents: 150000000, currency: "HTG" } },
  { path: `ledger_transactions/tx_pay_2026_03_001`, collection: "ledger_transactions", group: "GROUP_5_ACCOUNTING", payload: { amount: 1500000, amount_cents: 150000000, currency: "HTG" } },
  { path: `ledger_transactions/tx_till_fx_2026_01`, collection: "ledger_transactions", group: "GROUP_5_ACCOUNTING", payload: { amount: 5000, amount_cents: 500000, currency: "USD" } },
  { path: `ledger_transactions/tx_till_fx_2026_02`, collection: "ledger_transactions", group: "GROUP_5_ACCOUNTING", payload: { amount: 7500, amount_cents: 750000, currency: "USD" } },
  { path: `ledger_transactions/tx_legacy_2026_01`, collection: "ledger_transactions", group: "GROUP_5_ACCOUNTING", payload: { amount: 12000, amountCents: 1200000, currency: undefined } }, // missing currency

  // Group 6: PCG Accounts (6 docs)
  { path: `ledger_transactions/tx_acc_001`, collection: "ledger_transactions", group: "GROUP_6_ACCOUNTS", payload: { debit_account: "641100", credit_account: "512100", debitAccount: "641100", creditAccount: "512100" } },
  { path: `ledger_transactions/tx_acc_002`, collection: "ledger_transactions", group: "GROUP_6_ACCOUNTS", payload: { debit_account: "641100", credit_account: "431000", debitAccount: "641100", creditAccount: "431000" } },
  { path: `ledger_transactions/tx_acc_003`, collection: "ledger_transactions", group: "GROUP_6_ACCOUNTS", payload: { debit_account: "431000", credit_account: "512100", debitAccount: "431000", creditAccount: "512100" } },
  { path: `ledger_transactions/tx_acc_004`, collection: "ledger_transactions", group: "GROUP_6_ACCOUNTS", payload: { debit_account: "512100", credit_account: "701000", debitAccount: "512100", creditAccount: "701000" } },
  { path: `ledger_transactions/tx_acc_005`, collection: "ledger_transactions", group: "GROUP_6_ACCOUNTS", payload: { debit_account: "101000", credit_account: "512100", debitAccount: "101000", creditAccount: "512100" } },
  { path: `ledger_transactions/tx_acc_006`, collection: "ledger_transactions", group: "GROUP_6_ACCOUNTS", payload: { debit_account: "512100", credit_account: "511100" } },

  // Group 7: Auth Identity (6 docs)
  { path: `users/usr_owner_${TARGET_TENANT.substring(4, 10)}`, collection: "users", group: "GROUP_7_IDENTITY", payload: { uid: "vo5k8jqo33cZoYzZdbzu4MmA0A7x1", firebase_uid: "vo5k8jqo33cZoYzZdbzu4MmA0A7x1", role: "OWNER" } },
  { path: `users/usr_mgr_01_${TARGET_TENANT.substring(4, 10)}`, collection: "users", group: "GROUP_7_IDENTITY", payload: { uid: "usr_mgr_uid_001", firebase_uid: "usr_mgr_uid_001", role: "MANAGER" } },
  { path: `users/usr_teller_01_${TARGET_TENANT.substring(4, 10)}`, collection: "users", group: "GROUP_7_IDENTITY", payload: { uid: "usr_teller_uid_001", firebase_uid: "usr_teller_uid_001", role: "SENIOR_TELLER" } },
  { path: `users/usr_teller_02_${TARGET_TENANT.substring(4, 10)}`, collection: "users", group: "GROUP_7_IDENTITY", payload: { uid: "usr_teller_uid_002", firebase_uid: "usr_teller_uid_002", role: "JUNIOR_TELLER" } },
  { path: `employees/emp_legacy_001`, collection: "employees", group: "GROUP_7_IDENTITY", payload: { uid: "usr_legacy_001", firebaseUid: "usr_legacy_001" } },
  { path: `employees/emp_legacy_002`, collection: "employees", group: "GROUP_7_IDENTITY", payload: { uid: "usr_mismatch_001", firebase_uid: "usr_mismatch_002" } } // Mismatch
];

export function runPreflightBatch1Simulation() {
  const results: DryRunResult[] = [];

  for (const docDef of BATCH_1_DOCS) {
    let res: DryRunResult;
    switch (docDef.group) {
      case "GROUP_1_TENANT":
        res = SchemaMigrationDryRunEngine.evaluateTenantGroup(docDef.path, docDef.collection, docDef.payload);
        break;
      case "GROUP_2_PAYROLL_CYCLES":
        res = SchemaMigrationDryRunEngine.evaluatePayrollCycleGroup(docDef.path, docDef.payload);
        break;
      case "GROUP_3_SALARIES":
        res = SchemaMigrationDryRunEngine.evaluateSalaryGroup(docDef.path, docDef.payload);
        break;
      case "GROUP_4_DATES":
        res = SchemaMigrationDryRunEngine.evaluatePeriodGroup(docDef.path, docDef.payload);
        break;
      case "GROUP_5_ACCOUNTING":
        res = SchemaMigrationDryRunEngine.evaluateAccountingAmountGroup(docDef.path, docDef.payload);
        break;
      case "GROUP_6_ACCOUNTS":
        res = SchemaMigrationDryRunEngine.evaluateAccountsGroup(docDef.path, docDef.payload);
        break;
      case "GROUP_7_IDENTITY":
        res = SchemaMigrationDryRunEngine.evaluateIdentityGroup(docDef.path, docDef.payload);
        break;
      default:
        res = {
          docId: docDef.path,
          collection: docDef.collection,
          group: docDef.group,
          category: "NOT_VERIFIABLE",
          originalPayload: docDef.payload,
          simulatedCanonicalPayload: {},
          hasConflict: true,
          requiresHumanReview: true,
          reason: "Unknown group classification"
        };
    }
    results.push(res);
  }

  return results;
}

const res = runPreflightBatch1Simulation();
console.log(`Evaluated ${res.length} docs.`);
const categoriesCount = res.reduce((acc, r) => {
  acc[r.category] = (acc[r.category] || 0) + 1;
  return acc;
}, {} as Record<string, number>);
console.log("Categories:", JSON.stringify(categoriesCount, null, 2));

