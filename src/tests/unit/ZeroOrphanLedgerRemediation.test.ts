import { describe, it, expect } from "vitest";
import { 
  isOrphanTransaction, 
  sanitizeAndEnrichLedgerTransaction, 
  detectOrphanTransactions,
  TransactionSanitizationContext 
} from "../../services/AccountingEngine";
import { LedgerOrphanRemediationService } from "../../services/accounting/LedgerOrphanRemediationService";
import { LedgerTransaction, Branch, Department, Employee } from "../../types";

describe("Zero-Orphan Ledger Remediation & Relational Attribution Suite", () => {
  const mockBranches: Branch[] = [
    { id: "br_siege", name: "Siège Principal", code: "MAIN", business_id: "biz_test" } as any,
    { id: "br_delmas", name: "Succursale Delmas", code: "DLM", business_id: "biz_test" } as any
  ];

  const mockDepartments: Department[] = [
    { id: "dept_ops", name: "Opérations", code: "OPS", business_id: "biz_test" } as any,
    { id: "dept_fin", name: "Finances", code: "FIN", business_id: "biz_test" } as any
  ];

  const mockEmployees: Employee[] = [
    { 
      id: "emp_001", 
      name: "Jean Dupont", 
      email: "jean.dupont@finops.com", 
      branchId: "br_siege", 
      departmentId: "dept_ops",
      business_id: "biz_test"
    } as any,
    { 
      id: "emp_002", 
      name: "Marie Claire", 
      email: "marie.claire@finops.com", 
      branchId: "br_delmas", 
      departmentId: "dept_fin",
      business_id: "biz_test"
    } as any
  ];

  const context: TransactionSanitizationContext = {
    branches: mockBranches,
    departments: mockDepartments,
    employees: mockEmployees,
    defaultBranchId: "br_siege",
    defaultDepartmentId: "dept_ops",
    defaultCostCenter: "br_siege"
  };

  it("1. Identifies transactions lacking branch, department, cost center or debit/credit accounts as orphans", () => {
    // Missing branch
    const txNoBranch: Partial<LedgerTransaction> = {
      business_id: "biz_test",
      departmentId: "dept_ops",
      debit_account: "1010",
      credit_account: "7010"
    };
    expect(isOrphanTransaction(txNoBranch)).toBe(true);

    // Missing department
    const txNoDept: Partial<LedgerTransaction> = {
      business_id: "biz_test",
      branchId: "br_siege",
      debit_account: "1010",
      credit_account: "7010"
    };
    expect(isOrphanTransaction(txNoDept)).toBe(true);

    // Identical or empty accounts
    const txBadAccounts: Partial<LedgerTransaction> = {
      business_id: "biz_test",
      branchId: "br_siege",
      departmentId: "dept_ops",
      debit_account: "1010",
      credit_account: "1010"
    };
    expect(isOrphanTransaction(txBadAccounts)).toBe(true);

    // Completely populated transaction is NOT an orphan
    const validTx: Partial<LedgerTransaction> = {
      business_id: "biz_test",
      branchId: "br_siege",
      branch_id: "br_siege",
      departmentId: "dept_ops",
      department_id: "dept_ops",
      cost_center_id: "br_siege",
      costCenterId: "br_siege",
      debit_account: "1010",
      credit_account: "7010"
    };
    expect(isOrphanTransaction(validTx)).toBe(false);
  });

  it("2. Resolves dual-key consistency and links employee attribution in sanitizeAndEnrichLedgerTransaction", () => {
    const rawTx: Partial<LedgerTransaction> = {
      amount: 1500,
      employeeId: "emp_001",
      type: "INCOME"
    };

    const enriched = sanitizeAndEnrichLedgerTransaction(rawTx, "biz_test", context);

    // Validates that employee was resolved and branch/department inherited
    expect(enriched.employeeId).toBe("emp_001");
    expect(enriched.employee_id).toBe("emp_001");
    expect(enriched.employeeName).toBe("Jean Dupont");
    expect(enriched.branchId).toBe("br_siege");
    expect(enriched.branch_id).toBe("br_siege");
    expect(enriched.departmentId).toBe("dept_ops");
    expect(enriched.department_id).toBe("dept_ops");
    expect(enriched.cost_center_id).toBe("br_siege");
    expect(enriched.costCenterId).toBe("br_siege");
    expect(enriched.business_id).toBe("biz_test");
    expect(enriched.businessId).toBe("biz_test");
    expect(enriched.amount_cents).toBe(150000);
    expect(enriched.debit_account).toBeTruthy();
    expect(enriched.credit_account).toBeTruthy();
    expect(enriched.debit_account).not.toBe(enriched.credit_account);

    // Enriched transaction is no longer an orphan
    expect(isOrphanTransaction(enriched)).toBe(false);
  });

  it("3. LedgerOrphanRemediationService remediates in-memory orphans and produces forensic details", async () => {
    const rawOrphans: LedgerTransaction[] = [
      {
        id: "orphan_tx_1",
        business_id: "biz_test",
        type: "INCOME",
        amount: 2500,
        amount_cents: 250000,
        description: "Vente sans succursale",
        date: "2026-10-15",
        category: "Sales",
        signerId: "user",
        currency: "HTG",
        status: "POSTED",
        source: "MANUAL",
        isImmutable: true
      } as LedgerTransaction,
      {
        id: "orphan_tx_2",
        business_id: "biz_test",
        branchId: "br_delmas",
        // missing dept and accounts
        type: "EXPENSE",
        amount: 800,
        amount_cents: 80000,
        description: "Dépense sans département ni compte",
        date: "2026-10-16",
        category: "Office",
        signerId: "user",
        currency: "HTG",
        status: "POSTED",
        source: "MANUAL",
        isImmutable: true
      } as LedgerTransaction
    ];

    expect(LedgerOrphanRemediationService.isOrphan(rawOrphans[0])).toBe(true);
    expect(LedgerOrphanRemediationService.isOrphan(rawOrphans[1])).toBe(true);

    const report = await LedgerOrphanRemediationService.remediateOrphans({
      businessId: "biz_test",
      customTransactions: rawOrphans,
      context,
      persistToDb: false
    });

    expect(report.orphanCount).toBe(2);
    expect(report.correctedCount).toBe(2);
    expect(report.fixedTransactionIds).toEqual(["orphan_tx_1", "orphan_tx_2"]);

    // After remediation, all transactions have valid relations and dual keys
    expect(isOrphanTransaction(rawOrphans[0])).toBe(false);
    expect(isOrphanTransaction(rawOrphans[1])).toBe(false);
    expect(rawOrphans[0].branchId).toBe("br_siege");
    expect(rawOrphans[0].departmentId).toBe("dept_ops");
    expect(rawOrphans[1].branchId).toBe("br_delmas");
    expect(rawOrphans[1].departmentId).toBe("dept_ops");
    expect(rawOrphans[0].debit_account).toBeTruthy();
    expect(rawOrphans[0].credit_account).toBeTruthy();
  });
});
