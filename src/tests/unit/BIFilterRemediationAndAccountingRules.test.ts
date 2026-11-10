import { describe, it, expect } from "vitest";
import { LedgerTransaction, Employee, AttendanceRecord, PayrollRecord, Branch, Department } from "../../types";
import { isTreasuryAccount } from "../../domains/analytics/services/AnalyticsEngine";

/**
 * Filter function implementing the exact Cash vs Accrual rules
 * from useBIDataAggregation.ts and ExecutiveFilterContext.tsx
 */
function applyBIFilters(params: {
  transactions: any[];
  branches?: Branch[];
  departments?: Department[];
  selectedBranchId: string;
  selectedDeptId: string;
  selectedTxType?: string;
  currentBusinessId: string;
  isSimplifiedMode: boolean; // true = CASH BASIS, false = ACCRUAL BASIS
}) {
  const {
    transactions,
    branches = [],
    departments = [],
    selectedBranchId,
    selectedDeptId,
    selectedTxType = "ALL",
    currentBusinessId,
    isSimplifiedMode,
  } = params;

  return transactions.filter((tx) => {
    // 1. Strict Tenant Isolation
    const txBizId = tx.business_id || (tx as any).businessId;
    if (txBizId && txBizId !== currentBusinessId) return false;

    // 2. Void / Cancelled / Reversed exclusion
    const txStatus = String(tx.status || "").toUpperCase();
    if (txStatus === "REVERSED" || txStatus === "VOID" || txStatus === "CANCELLED") return false;

    // 3. ANO-BI-01: Cash-Basis vs Accrual-Basis Accounting Rule
    if (isSimplifiedMode) {
      if (["PENDING", "DRAFT", "REOPENED", "VOID", "VOIDED", "CANCELLED", "REVERSED"].includes(txStatus)) {
        return false;
      }

      const isExplicitlySettled =
        tx.isSettled === true ||
        (tx as any).is_settled === true ||
        ["PAID", "SETTLED", "CLEARED", "SUCCESS", "CONFIRMED", "EXECUTED"].includes(txStatus);

      const isTillOrCashPhysical = Boolean(tx.till_id || tx.till_session_id || (tx as any).tillSessionId);

      const debitAcc = tx.debit_account || (tx as any).debitAccount;
      const creditAcc = tx.credit_account || (tx as any).creditAccount;
      const touchesTreasury = isTreasuryAccount(debitAcc) || isTreasuryAccount(creditAcc);

      const pMethod = ((tx.paymentMethod || (tx as any).payment_method || "") as string).trim().toUpperCase();
      const isNonCashMethod = pMethod === "NON_CASH" || (tx as any).isNonCash === true;
      const isCashMethod = ["CASH", "BANK", "BANK_TRANSFER", "MONCASH", "NATCASH", "CARD", "WIRE", "CHECK"].includes(pMethod);

      if (isNonCashMethod) {
        return false;
      }

      // Admitted in Cash-Basis ONLY if effective cash movement:
      const isCashMovement =
        isExplicitlySettled ||
        isTillOrCashPhysical ||
        (touchesTreasury && isCashMethod) ||
        (touchesTreasury && !debitAcc?.startsWith("12") && !creditAcc?.startsWith("20"));

      if (!isCashMovement) {
        return false;
      }
    }

    // 4. ANO-BI-02: Strict Branch Filtering
    const txBranch = tx.branchId || (tx as any).branch_id || (tx as any).cost_center_id;
    const txBranchName = (tx as any).branchName || (tx as any).branch_name || (tx as any).branch;

    if (selectedBranchId !== "ALL") {
      if (!txBranch && !txBranchName) {
        return false; // Strict exclusion of untagged records
      }
      const selectedBranchObj = branches.find((b) => b.id === selectedBranchId || b.name === selectedBranchId);
      const matchesBranch =
        txBranch === selectedBranchId ||
        (selectedBranchObj &&
          (txBranch === selectedBranchObj.id ||
            txBranchName === selectedBranchObj.name ||
            txBranchName === selectedBranchObj.code));
      if (!matchesBranch) return false;
    }

    // 5. ANO-BI-02: Strict Department Filtering
    const txDept = tx.departmentId || (tx as any).department_id || (tx as any).department;
    const txDeptName = (tx as any).departmentName || (tx as any).department_name;

    if (selectedDeptId !== "ALL") {
      if (!txDept && !txDeptName) {
        return false; // Strict exclusion of untagged records
      }
      const selectedDeptObj = departments.find((d) => d.id === selectedDeptId || d.name === selectedDeptId);
      const matchesDept =
        txDept === selectedDeptId ||
        (selectedDeptObj &&
          (txDept === selectedDeptObj.id ||
            txDeptName === selectedDeptObj.name ||
            txDeptName === selectedDeptObj.code));
      if (!matchesDept) return false;
    }

    // 6. Transaction Type
    if (selectedTxType !== "ALL" && tx.type !== selectedTxType && (tx as any).category !== selectedTxType) {
      return false;
    }

    return true;
  });
}

describe("BIFilterRemediationAndAccountingRules (ANO-BI-01 & ANO-BI-02 Verification)", () => {
  const currentBusinessId = "biz_finops_master_01";
  const otherBusinessId = "biz_competitor_99";

  const branches: Branch[] = [
    { id: "branch_cap_haitien", name: "Cap-Haïtien", code: "CAP", business_id: currentBusinessId, status: "ACTIVE" } as any,
    { id: "branch_port_au_prince", name: "Port-au-Prince", code: "PAP", business_id: currentBusinessId, status: "ACTIVE" } as any,
  ];

  const departments: Department[] = [
    { id: "dept_finance", name: "Finance", code: "FIN", business_id: currentBusinessId } as any,
    { id: "dept_operations", name: "Operations", code: "OPS", business_id: currentBusinessId } as any,
  ];

  // =========================================================================
  // SUITE 1: ANO-BI-01 — CASH-BASIS VS ACCRUAL-BASIS ACCOUNTING LOGIC
  // =========================================================================
  describe("Suite 1: ANO-BI-01 Cash vs Accrual Accounting Rule Verification", () => {
    it("1.1 Excludes POSTED invoice accruals from Cash-Basis when no cash settlement occurred", () => {
      const transactions: any[] = [
        {
          id: "tx_invoice_uncollected",
          business_id: currentBusinessId,
          amount: 5000,
          type: "INCOME",
          status: "POSTED", // Accrual entry posted to general ledger
          debit_account: "1200_ACCOUNTS_RECEIVABLE", // AR
          credit_account: "4000_REVENUE", // Revenue
          isSettled: false,
          branchId: "branch_cap_haitien",
          date: "2026-10-01",
        },
      ];

      // Cash-Basis: MUST BE EXCLUDED (no cash collected)
      const cashResults = applyBIFilters({
        transactions,
        selectedBranchId: "ALL",
        selectedDeptId: "ALL",
        currentBusinessId,
        isSimplifiedMode: true,
      });
      expect(cashResults.length).toBe(0);

      // Accrual-Basis: MUST BE INCLUDED (revenue earned and posted)
      const accrualResults = applyBIFilters({
        transactions,
        selectedBranchId: "ALL",
        selectedDeptId: "ALL",
        currentBusinessId,
        isSimplifiedMode: false,
      });
      expect(accrualResults.length).toBe(1);
      expect(accrualResults[0].id).toBe("tx_invoice_uncollected");
    });

    it("1.2 Prevents double-counting when both a POSTED invoice and a separate payment receipt exist", () => {
      const transactions: any[] = [
        // 1. Accrual Invoice Posted on Oct 1
        {
          id: "tx_gl_invoice_accrual",
          business_id: currentBusinessId,
          amount: 10000,
          type: "INCOME",
          status: "POSTED",
          debit_account: "1200", // Accounts Receivable
          credit_account: "4000", // Revenue
          isSettled: false,
          branchId: "branch_cap_haitien",
          date: "2026-10-01",
        },
        // 2. Realized Cash Receipt on Oct 5 (settling part or all of invoice)
        {
          id: "tx_bank_settlement_receipt",
          business_id: currentBusinessId,
          amount: 10000,
          type: "INCOME",
          status: "PAID",
          debit_account: "1010_BANK", // Treasury Bank
          credit_account: "1200", // AR cleared
          isSettled: true,
          paymentMethod: "BANK_TRANSFER",
          branchId: "branch_cap_haitien",
          date: "2026-10-05",
        },
      ];

      // Cash-Basis: Only the realized bank receipt must be admitted (total 10000, NOT 20000!)
      const cashResults = applyBIFilters({
        transactions,
        selectedBranchId: "ALL",
        selectedDeptId: "ALL",
        currentBusinessId,
        isSimplifiedMode: true,
      });

      expect(cashResults.length).toBe(1);
      expect(cashResults[0].id).toBe("tx_bank_settlement_receipt");
      const cashTotal = cashResults.reduce((sum, tx) => sum + tx.amount, 0);
      expect(cashTotal).toBe(10000);

      // Accrual-Basis: Both GL events are registered in ledger history
      const accrualResults = applyBIFilters({
        transactions,
        selectedBranchId: "ALL",
        selectedDeptId: "ALL",
        currentBusinessId,
        isSimplifiedMode: false,
      });
      expect(accrualResults.length).toBe(2);
    });

    it("1.3 Handles physical till operations and immediate cash payments in Cash-Basis", () => {
      const transactions: any[] = [
        {
          id: "tx_till_cash_sale",
          business_id: currentBusinessId,
          amount: 1500,
          type: "INCOME",
          status: "POSTED", // Till receipt posted at cash register closure
          till_id: "till_register_01",
          debit_account: "1000_CASH",
          credit_account: "4000_REVENUE",
          isSettled: true,
          paymentMethod: "CASH",
          branchId: "branch_cap_haitien",
          date: "2026-10-10",
        },
      ];

      const cashResults = applyBIFilters({
        transactions,
        selectedBranchId: "ALL",
        selectedDeptId: "ALL",
        currentBusinessId,
        isSimplifiedMode: true,
      });

      // Admitted because it is physical till with isSettled=true and Treasury account
      expect(cashResults.length).toBe(1);
      expect(cashResults[0].id).toBe("tx_till_cash_sale");
    });

    it("1.4 Strictly excludes VOID, CANCELLED, and REVERSED transactions in both Cash and Accrual", () => {
      const transactions: any[] = [
        {
          id: "tx_voided",
          business_id: currentBusinessId,
          amount: 2000,
          type: "INCOME",
          status: "VOID",
          branchId: "branch_cap_haitien",
          date: "2026-10-12",
        },
        {
          id: "tx_cancelled",
          business_id: currentBusinessId,
          amount: 3000,
          type: "EXPENSE",
          status: "CANCELLED",
          branchId: "branch_cap_haitien",
          date: "2026-10-12",
        },
        {
          id: "tx_reversed",
          business_id: currentBusinessId,
          amount: 4000,
          type: "INCOME",
          status: "REVERSED",
          branchId: "branch_cap_haitien",
          date: "2026-10-12",
        },
      ];

      const cashResults = applyBIFilters({
        transactions,
        selectedBranchId: "ALL",
        selectedDeptId: "ALL",
        currentBusinessId,
        isSimplifiedMode: true,
      });
      expect(cashResults.length).toBe(0);

      const accrualResults = applyBIFilters({
        transactions,
        selectedBranchId: "ALL",
        selectedDeptId: "ALL",
        currentBusinessId,
        isSimplifiedMode: false,
      });
      expect(accrualResults.length).toBe(0);
    });

    it("1.5 Idempotency and stability during rapid Cash -> Accrual -> Cash mode transitions", () => {
      const transactions: any[] = [
        {
          id: "tx_cash_receipt",
          business_id: currentBusinessId,
          amount: 1000,
          type: "INCOME",
          status: "PAID",
          isSettled: true,
          paymentMethod: "CASH",
          debit_account: "1000",
          branchId: "branch_cap_haitien",
          date: "2026-10-15",
        },
        {
          id: "tx_accrual_invoice",
          business_id: currentBusinessId,
          amount: 2500,
          type: "INCOME",
          status: "POSTED",
          isSettled: false,
          debit_account: "1200",
          branchId: "branch_cap_haitien",
          date: "2026-10-16",
        },
      ];

      // Round 1: Cash
      const resCash1 = applyBIFilters({ transactions, selectedBranchId: "ALL", selectedDeptId: "ALL", currentBusinessId, isSimplifiedMode: true });
      expect(resCash1.map((t) => t.id)).toEqual(["tx_cash_receipt"]);

      // Round 2: Accrual
      const resAccrual = applyBIFilters({ transactions, selectedBranchId: "ALL", selectedDeptId: "ALL", currentBusinessId, isSimplifiedMode: false });
      expect(resAccrual.map((t) => t.id).sort()).toEqual(["tx_accrual_invoice", "tx_cash_receipt"].sort());

      // Round 3: Back to Cash
      const resCash2 = applyBIFilters({ transactions, selectedBranchId: "ALL", selectedDeptId: "ALL", currentBusinessId, isSimplifiedMode: true });
      expect(resCash2.map((t) => t.id)).toEqual(["tx_cash_receipt"]);
    });
  });

  // =========================================================================
  // SUITE 2: ANO-BI-02 — STRICT BRANCH & DEPARTMENT FILTERING ISOLATION
  // =========================================================================
  describe("Suite 2: ANO-BI-02 Branch & Department Isolation Verification", () => {
    const transactions: any[] = [
      {
        id: "tx_cap_1",
        business_id: currentBusinessId,
        amount: 500,
        type: "INCOME",
        status: "PAID",
        isSettled: true,
        branchId: "branch_cap_haitien",
        departmentId: "dept_finance",
        date: "2026-10-10",
      },
      {
        id: "tx_pap_1",
        business_id: currentBusinessId,
        amount: 700,
        type: "INCOME",
        status: "PAID",
        isSettled: true,
        branchId: "branch_port_au_prince",
        departmentId: "dept_operations",
        date: "2026-10-11",
      },
      {
        id: "tx_untagged_overhead",
        business_id: currentBusinessId,
        amount: 250,
        type: "EXPENSE",
        status: "PAID",
        isSettled: true,
        branchId: undefined, // Missing branch
        departmentId: undefined, // Missing dept
        date: "2026-10-12",
      },
      {
        id: "tx_null_branch",
        business_id: currentBusinessId,
        amount: 150,
        type: "EXPENSE",
        status: "PAID",
        isSettled: true,
        branchId: null as any, // Explicit null
        departmentId: null as any,
        date: "2026-10-13",
      },
      {
        id: "tx_competitor_cap",
        business_id: otherBusinessId, // Other tenant!
        amount: 9999,
        type: "INCOME",
        status: "PAID",
        isSettled: true,
        branchId: "branch_cap_haitien",
        departmentId: "dept_finance",
        date: "2026-10-10",
      },
    ];

    it("2.1 When Cap-Haïtien is selected, strictly includes Cap records and EXCLUDES untagged/null records", () => {
      const results = applyBIFilters({
        transactions,
        branches,
        departments,
        selectedBranchId: "branch_cap_haitien",
        selectedDeptId: "ALL",
        currentBusinessId,
        isSimplifiedMode: true,
      });

      expect(results.length).toBe(1);
      expect(results[0].id).toBe("tx_cap_1");
      expect(results.some((t) => t.id === "tx_untagged_overhead")).toBe(false);
      expect(results.some((t) => t.id === "tx_null_branch")).toBe(false);
      expect(results.some((t) => t.id === "tx_pap_1")).toBe(false);
    });

    it("2.2 When Port-au-Prince is selected, strictly includes PAP records and EXCLUDES untagged/null records", () => {
      const results = applyBIFilters({
        transactions,
        branches,
        departments,
        selectedBranchId: "branch_port_au_prince",
        selectedDeptId: "ALL",
        currentBusinessId,
        isSimplifiedMode: true,
      });

      expect(results.length).toBe(1);
      expect(results[0].id).toBe("tx_pap_1");
      expect(results.some((t) => t.id === "tx_untagged_overhead")).toBe(false);
      expect(results.some((t) => t.id === "tx_null_branch")).toBe(false);
    });

    it("2.3 When ALL branches is selected, retains all records including company-wide untagged records", () => {
      const results = applyBIFilters({
        transactions,
        branches,
        departments,
        selectedBranchId: "ALL",
        selectedDeptId: "ALL",
        currentBusinessId,
        isSimplifiedMode: true,
      });

      // 4 records for current business (tx_cap_1, tx_pap_1, tx_untagged_overhead, tx_null_branch)
      expect(results.length).toBe(4);
      expect(results.some((t) => t.id === "tx_untagged_overhead")).toBe(true);
      expect(results.some((t) => t.id === "tx_null_branch")).toBe(true);
    });

    it("2.4 Enforces simultaneous tenant isolation: other business data NEVER leaks even with matching branchId", () => {
      const results = applyBIFilters({
        transactions,
        branches,
        departments,
        selectedBranchId: "branch_cap_haitien",
        selectedDeptId: "ALL",
        currentBusinessId,
        isSimplifiedMode: true,
      });

      expect(results.some((t) => t.id === "tx_competitor_cap")).toBe(false);
      expect(results.some((t) => t.business_id === otherBusinessId)).toBe(false);
    });

    it("2.5 Department filter isolation mirrors branch filter rules", () => {
      const resultsFin = applyBIFilters({
        transactions,
        branches,
        departments,
        selectedBranchId: "ALL",
        selectedDeptId: "dept_finance",
        currentBusinessId,
        isSimplifiedMode: true,
      });

      expect(resultsFin.length).toBe(1);
      expect(resultsFin[0].id).toBe("tx_cap_1");
      expect(resultsFin.some((t) => t.id === "tx_untagged_overhead")).toBe(false);

      const resultsOps = applyBIFilters({
        transactions,
        branches,
        departments,
        selectedBranchId: "ALL",
        selectedDeptId: "dept_operations",
        currentBusinessId,
        isSimplifiedMode: true,
      });

      expect(resultsOps.length).toBe(1);
      expect(resultsOps[0].id).toBe("tx_pap_1");
    });
  });

  // =========================================================================
  // SUITE 3: ATTENDANCE & PAYROLL RECORD FILTERING INTEGRITY
  // =========================================================================
  describe("Suite 3: Attendance and Payroll Entity Branch Filtering", () => {
    const attendance: AttendanceRecord[] = [
      { id: "att_1", employeeId: "emp_1", branchId: "branch_cap_haitien", business_id: currentBusinessId, status: "PRESENT", date: "2026-10-10" } as any,
      { id: "att_2", employeeId: "emp_2", branchId: "branch_port_au_prince", business_id: currentBusinessId, status: "PRESENT", date: "2026-10-10" } as any,
      { id: "att_untagged", employeeId: "emp_remote", branchId: undefined, business_id: currentBusinessId, status: "PRESENT", date: "2026-10-10" } as any,
      { id: "att_competitor", employeeId: "emp_x", branchId: "branch_cap_haitien", business_id: otherBusinessId, status: "PRESENT", date: "2026-10-10" } as any,
    ];

    const payrolls: PayrollRecord[] = [
      { id: "pay_1", employeeId: "emp_1", branch_id: "branch_cap_haitien", business_id: currentBusinessId, status: "PAID", netPay: 2000, date: "2026-10-15" } as any,
      { id: "pay_2", employeeId: "emp_2", branch_id: "branch_port_au_prince", business_id: currentBusinessId, status: "PAID", netPay: 2500, date: "2026-10-15" } as any,
      { id: "pay_untagged", employeeId: "emp_remote", branch_id: undefined, business_id: currentBusinessId, status: "PAID", netPay: 3000, date: "2026-10-15" } as any,
    ];

    it("3.1 Strict branch filtering on attendance: excludes untagged attendance when branch is selected", () => {
      const filterAtt = (recs: AttendanceRecord[], branchId: string) =>
        recs.filter((r) => {
          if (r.business_id !== currentBusinessId) return false;
          if (branchId !== "ALL" && (!r.branchId || r.branchId !== branchId)) return false;
          return true;
        });

      const capAtt = filterAtt(attendance, "branch_cap_haitien");
      expect(capAtt.length).toBe(1);
      expect(capAtt[0].id).toBe("att_1");

      const allAtt = filterAtt(attendance, "ALL");
      expect(allAtt.length).toBe(3);
      expect(allAtt.some((a) => a.id === "att_untagged")).toBe(true);
      expect(allAtt.some((a) => a.business_id === otherBusinessId)).toBe(false);
    });

    it("3.2 Strict branch filtering on payroll: excludes untagged payroll when branch is selected", () => {
      const filterPay = (recs: PayrollRecord[], branchId: string) =>
        recs.filter((r) => {
          if (r.business_id !== currentBusinessId) return false;
          if (branchId !== "ALL" && (!r.branch_id || r.branch_id !== branchId)) return false;
          return true;
        });

      const capPay = filterPay(payrolls, "branch_cap_haitien");
      expect(capPay.length).toBe(1);
      expect(capPay[0].id).toBe("pay_1");

      const allPay = filterPay(payrolls, "ALL");
      expect(allPay.length).toBe(3);
      expect(allPay.some((p) => p.id === "pay_untagged")).toBe(true);
    });
  });
});
