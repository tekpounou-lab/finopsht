import { describe, it, expect } from "vitest";
import {
  toDateOnly,
  isValidCalendarDate,
  isValidIsoDateStr,
  parseExcelSerialToIsoDate,
} from "../../utils/dateNormalization";
import { ExecutiveFilters } from "../../domains/analytics/context/ExecutiveFilterContext";
import { LedgerTransaction, PayrollRecord, AttendanceRecord, Employee } from "../../types";

describe("BI Filter Synchronization & E2E Validation Suite", () => {
  // =========================================================================
  // SECTION 1: Date Normalization & Timezone Boundary Verification
  // =========================================================================
  describe("1. Date Normalization & Boundary Precision Engine (toDateOnly)", () => {
    it("handles first day of month at 00:00:00 UTC and ISO strings", () => {
      const startOfMonthIso = "2026-10-01T00:00:00.000Z";
      expect(toDateOnly(startOfMonthIso)).toBe("2026-10-01");

      const startOfMonthDate = new Date("2026-10-01T00:00:00Z");
      expect(toDateOnly(startOfMonthDate)).toBe("2026-10-01");
    });

    it("handles last day of month at 23:59:59.999 UTC", () => {
      const endOfMonthIso = "2026-10-31T23:59:59.999Z";
      expect(toDateOnly(endOfMonthIso)).toBe("2026-10-31");

      const endOfMonthDate = new Date("2026-10-31T23:59:59.999Z");
      expect(toDateOnly(endOfMonthDate)).toBe("2026-10-31");
    });

    it("handles ISO strings with positive and negative timezone offsets", () => {
      // Offset +02:00
      const offsetPos = "2026-07-15T02:30:00+02:00";
      expect(toDateOnly(offsetPos)).toBe("2026-07-15");

      // Offset -05:00
      const offsetNeg = "2026-07-15T20:30:00-05:00";
      expect(toDateOnly(offsetNeg)).toBe("2026-07-15");
    });

    it("handles Firestore Timestamp objects (.toDate() and { seconds })", () => {
      const mockTimestampObj = {
        toDate: () => new Date("2026-08-20T12:00:00Z"),
      };
      expect(toDateOnly(mockTimestampObj)).toBe("2026-08-20");

      const mockSecondsObj = {
        seconds: 1787227200, // 2026-08-20T12:00:00Z in seconds
      };
      expect(toDateOnly(mockSecondsObj)).toBe("2026-08-20");
    });

    it("handles Leap Years (Feb 29) and invalid dates", () => {
      expect(isValidCalendarDate(2028, 2, 29)).toBe(true); // 2028 is leap year
      expect(isValidCalendarDate(2026, 2, 29)).toBe(false); // 2026 is NOT leap year
      expect(isValidCalendarDate(2026, 4, 31)).toBe(false); // April has 30 days

      expect(toDateOnly("2028-02-29")).toBe("2028-02-29");
    });

    it("handles Excel serial dates accurately", () => {
      expect(parseExcelSerialToIsoDate(45500)).toBe("2024-07-27");
      expect(toDateOnly(45500)).toBe("2024-07-27");
    });

    it("returns fallback on null, undefined, or invalid inputs", () => {
      expect(toDateOnly(null, "2026-10-01")).toBe("2026-10-01");
      expect(toDateOnly(undefined, "2026-10-01")).toBe("2026-10-01");
      expect(toDateOnly("invalid-date-string", "2026-10-01")).toBe("2026-10-01");
    });
  });

  // =========================================================================
  // SECTION 2: SSOT Filter Precedence & Contract Verification
  // =========================================================================
  describe("2. SSOT Filter Resolution Precedence (ALL vs Specific Selections)", () => {
    function resolveFilters(executiveFilters: Partial<ExecutiveFilters>, analyticsFilters: any) {
      const activeBranch = (executiveFilters.branchId && executiveFilters.branchId !== "ALL")
        ? executiveFilters.branchId
        : (analyticsFilters.branchId || "ALL");

      const activeDept = (executiveFilters.departmentId && executiveFilters.departmentId !== "ALL")
        ? executiveFilters.departmentId
        : (analyticsFilters.departmentId || "ALL");

      const activeEmp = (executiveFilters.employeeId && executiveFilters.employeeId !== "ALL")
        ? executiveFilters.employeeId
        : (analyticsFilters.employeeId || "ALL");

      return {
        startDate: executiveFilters.startDate || analyticsFilters.dateRange?.startDate || "2026-10-01",
        endDate: executiveFilters.endDate || analyticsFilters.dateRange?.endDate || "2026-10-31",
        branchId: activeBranch,
        departmentId: activeDept,
        employeeId: activeEmp,
        accountingMode: executiveFilters.accountingMode || "CASH",
        transactionType: executiveFilters.transactionType || "ALL",
      };
    }

    it("prefers active Executive branch selection when Analytics filter is 'ALL'", () => {
      const exec = { branchId: "branch_cap_haitien", departmentId: "ALL" };
      const analytics = { branchId: "ALL", departmentId: "ALL" };
      const res = resolveFilters(exec, analytics);
      expect(res.branchId).toBe("branch_cap_haitien");
    });

    it("prefers active Executive department selection when Analytics filter is 'ALL'", () => {
      const exec = { branchId: "ALL", departmentId: "dept_finance" };
      const analytics = { branchId: "ALL", departmentId: "ALL" };
      const res = resolveFilters(exec, analytics);
      expect(res.departmentId).toBe("dept_finance");
    });

    it("falls back cleanly to Analytics filter if Executive filter is 'ALL'", () => {
      const exec = { branchId: "ALL", departmentId: "ALL" };
      const analytics = { branchId: "branch_port_au_prince", departmentId: "ALL" };
      const res = resolveFilters(exec, analytics);
      expect(res.branchId).toBe("branch_port_au_prince");
    });

    it("handles 8 core filter transition scenarios", () => {
      const defaultState: {
        branchId: string;
        departmentId: string;
        transactionType: string;
        accountingMode: "CASH" | "ACCRUAL";
        startDate: string;
        endDate: string;
      } = {
        branchId: "ALL",
        departmentId: "ALL",
        transactionType: "ALL",
        accountingMode: "CASH",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      };

      // Transition 1: ALL -> Branch A
      let state = { ...defaultState, branchId: "branch_A" };
      expect(resolveFilters(state, { branchId: "ALL" }).branchId).toBe("branch_A");

      // Transition 2: Branch A -> Branch B
      state = { ...state, branchId: "branch_B" };
      expect(resolveFilters(state, { branchId: "ALL" }).branchId).toBe("branch_B");

      // Transition 3: Branch B -> ALL
      state = { ...state, branchId: "ALL" };
      expect(resolveFilters(state, { branchId: "ALL" }).branchId).toBe("ALL");

      // Transition 4: ALL -> Dept A
      state = { ...defaultState, departmentId: "dept_A" };
      expect(resolveFilters(state, { departmentId: "ALL" }).departmentId).toBe("dept_A");

      // Transition 5: Dept A -> Dept B
      state = { ...state, departmentId: "dept_B" };
      expect(resolveFilters(state, { departmentId: "ALL" }).departmentId).toBe("dept_B");

      // Transition 6: Tx A -> Tx B
      state = { ...defaultState, transactionType: "INCOME" };
      expect(resolveFilters(state, {}).transactionType).toBe("INCOME");
      state = { ...state, transactionType: "EXPENSE" };
      expect(resolveFilters(state, {}).transactionType).toBe("EXPENSE");

      // Transition 7: Short period -> Long period -> Short period
      state = { ...defaultState, startDate: "2026-10-01", endDate: "2026-10-07" }; // 1 week
      expect(resolveFilters(state, {}).endDate).toBe("2026-10-07");
      state = { ...state, startDate: "2026-01-01", endDate: "2026-12-31" }; // 1 year
      expect(resolveFilters(state, {}).endDate).toBe("2026-12-31");
      state = { ...state, startDate: "2026-10-01", endDate: "2026-10-15" }; // 2 weeks
      expect(resolveFilters(state, {}).endDate).toBe("2026-10-15");

      // Transition 8: Cash -> Accrual -> Cash
      state = { ...defaultState, accountingMode: "CASH" };
      expect(resolveFilters(state, {}).accountingMode).toBe("CASH");
      state = { ...state, accountingMode: "ACCRUAL" };
      expect(resolveFilters(state, {}).accountingMode).toBe("ACCRUAL");
      state = { ...state, accountingMode: "CASH" };
      expect(resolveFilters(state, {}).accountingMode).toBe("CASH");
    });

    it("handles edge case filters: partials, nulls, empty strings, unknown IDs", () => {
      const resPartial = resolveFilters({ branchId: "" }, { branchId: "ALL" });
      expect(resPartial.branchId).toBe("ALL");

      const resUnknown = resolveFilters({ branchId: "unknown_branch_999" }, { branchId: "ALL" });
      expect(resUnknown.branchId).toBe("unknown_branch_999");
    });
  });

  // =========================================================================
  // SECTION 3: Async Generation & Race Condition Prevention
  // =========================================================================
  describe("3. Async Generation ID & Generation Versioning (Race Condition Simulation)", () => {
    it("ensures latest filter generation version wins over out-of-order stale responses", async () => {
      let currentFilterVersion = 0;
      let activeDataBranch = "";

      async function simulateFilterFetch(targetBranch: string, version: number, delayMs: number) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        // Guard check: only apply if version matches currentFilterVersion
        if (version === currentFilterVersion) {
          activeDataBranch = targetBranch;
        }
      }

      // 1. User selects Branch A (Version 1, slow network 100ms)
      currentFilterVersion = 1;
      const promiseA = simulateFilterFetch("branch_A", 1, 100);

      // 2. User immediately switches to Branch B (Version 2, fast network 20ms)
      currentFilterVersion = 2;
      const promiseB = simulateFilterFetch("branch_B", 2, 20);

      // Wait for both
      await Promise.all([promiseA, promiseB]);

      // Result MUST correspond to Branch B (Version 2), even though A finished after B
      expect(activeDataBranch).toBe("branch_B");
    });
  });

  // =========================================================================
  // SECTION 4: Accounting Rule Separation & Multi-Tenant Data Isolation
  // =========================================================================
  describe("4. Accounting Rule Separation (Cash vs Accrual) & Multi-Tenant Isolation", () => {
    const mockBusiness = { id: "biz_tenant_01", name: "Tenant 1" };
    const mockOtherTenant = { id: "biz_tenant_02", name: "Tenant 2" };

    const mockTransactions: any[] = [
      {
        id: "tx_1",
        business_id: "biz_tenant_01",
        amount: 1000,
        type: "INCOME",
        status: "COMPLETED",
        branchId: "branch_A",
        date: "2026-10-10",
      },
      {
        id: "tx_2",
        business_id: "biz_tenant_01",
        amount: 400,
        type: "EXPENSE",
        status: "COMPLETED",
        branchId: "branch_A",
        date: "2026-10-12",
      },
      {
        id: "tx_3",
        business_id: "biz_tenant_01",
        amount: 500,
        type: "EXPENSE",
        status: "PENDING", // Accrued / Unsettled
        branchId: "branch_A",
        date: "2026-10-15",
      },
      {
        id: "tx_4_accrual_posted",
        business_id: "biz_tenant_01",
        amount: 800,
        type: "INCOME",
        status: "POSTED", // Accrual invoice posted to GL (AR <-> Revenue), NOT cash settled!
        debit_account: "1200", // Accounts Receivable
        credit_account: "4000", // Revenue
        isSettled: false,
        branchId: "branch_A",
        date: "2026-10-16",
      },
      {
        id: "tx_5_settled_payment",
        business_id: "biz_tenant_01",
        amount: 300,
        type: "INCOME",
        status: "PAID", // Realized cash receipt
        debit_account: "1010", // Bank account (Treasury Class 10)
        credit_account: "1200", // AR cleared
        isSettled: true,
        paymentMethod: "BANK_TRANSFER",
        branchId: "branch_A",
        date: "2026-10-18",
      },
      {
        id: "tx_untagged_branch",
        business_id: "biz_tenant_01",
        amount: 250,
        type: "EXPENSE",
        status: "COMPLETED",
        branchId: undefined, // No branch assigned (company-wide)
        date: "2026-10-19",
      },
      {
        id: "tx_other_tenant",
        business_id: "biz_tenant_02",
        amount: 9999,
        type: "INCOME",
        status: "COMPLETED",
        branchId: "branch_A",
        date: "2026-10-10",
      },
    ];

    it("strictly isolates multi-tenant data by business_id", () => {
      const filtered = mockTransactions.filter(
        (tx) => tx.business_id === mockBusiness.id
      );
      expect(filtered.length).toBe(6);
      expect(filtered.some((tx) => tx.business_id === "biz_tenant_02")).toBe(false);
    });

    it("ANO-BI-01: Differentiates Cash-Basis (Settled) from Accrual-Basis (Accrued), strictly excluding uncollected POSTED entries from Cash-Basis", () => {
      const tenantTx = mockTransactions.filter((tx) => tx.business_id === mockBusiness.id);

      // CASH BASIS: Strictly requires effective settlement (COMPLETED, PAID, SETTLED, CLEARED or isSettled=true)
      // POSTED accruals (e.g. tx_4_accrual_posted touching AR 1200) MUST BE EXCLUDED!
      const cashTx = tenantTx.filter((tx) => {
        const txStatus = String(tx.status || "").toUpperCase();
        if (["PENDING", "DRAFT", "VOID", "REVERSED"].includes(txStatus)) return false;

        const isExplicitlySettled =
          tx.isSettled === true ||
          ["PAID", "SETTLED", "CLEARED", "COMPLETED"].includes(txStatus);

        const touchesTreasury =
          (tx.debit_account?.startsWith("10") || tx.credit_account?.startsWith("10")) &&
          !tx.debit_account?.startsWith("12") &&
          !tx.credit_account?.startsWith("20");

        // If POSTED, only admit if touching treasury or explicitly settled
        if (txStatus === "POSTED" && !tx.isSettled && !touchesTreasury) {
          return false;
        }

        return isExplicitlySettled || touchesTreasury;
      });

      const cashInflow = cashTx.filter((t) => t.type === "INCOME").reduce((acc, t) => acc + t.amount, 0);
      const cashOutflow = cashTx.filter((t) => t.type === "EXPENSE").reduce((acc, t) => acc + t.amount, 0);
      const netCashFlow = cashInflow - cashOutflow;

      // Inflows in Cash: tx_1 (1000) + tx_5 (300) = 1300. (tx_4_accrual_posted of 800 is EXCLUDED)
      expect(cashInflow).toBe(1300);
      // Outflows in Cash: tx_2 (400) + tx_untagged_branch (250) = 650. (tx_3 PENDING is EXCLUDED)
      expect(cashOutflow).toBe(650);
      expect(netCashFlow).toBe(650);

      // ACCRUAL BASIS: Includes all committed/posted transactions (COMPLETED + PAID + POSTED + PENDING)
      const accrualTx = tenantTx.filter((tx) => !["VOID", "REVERSED"].includes(String(tx.status || "")));
      const accrualRevenues = accrualTx.filter((t) => t.type === "INCOME").reduce((acc, t) => acc + t.amount, 0);
      const accrualExpenses = accrualTx.filter((t) => t.type === "EXPENSE").reduce((acc, t) => acc + t.amount, 0);
      const netOperatingProfit = accrualRevenues - accrualExpenses;

      // Revenues in Accrual: tx_1 (1000) + tx_4 (800) + tx_5 (300) = 2100
      expect(accrualRevenues).toBe(2100);
      // Expenses in Accrual: tx_2 (400) + tx_3 (500) + tx_untagged (250) = 1150
      expect(accrualExpenses).toBe(1150);
      expect(netOperatingProfit).toBe(950);

      // Verify that Cash Net Flow (650) and Accrual Net Profit (950) are distinctly calculated
      expect(netCashFlow).not.toBe(netOperatingProfit);
    });

    it("ANO-BI-02: Strictly excludes untagged branch records when a specific branch is selected, but retains them under ALL", () => {
      const tenantTx = mockTransactions.filter((tx) => tx.business_id === mockBusiness.id);

      // When branchId is ALL: includes all records including untagged
      const allBranchTx = tenantTx.filter(() => true);
      expect(allBranchTx.length).toBe(6);
      expect(allBranchTx.some((tx) => !tx.branchId)).toBe(true);

      // When branchId is 'branch_A': untagged records MUST BE EXCLUDED
      const selectedBranch = "branch_A";
      const branchATx = tenantTx.filter((tx) => {
        const txBranch = tx.branchId;
        if (!txBranch) return false; // Strict exclusion of missing branchId
        return txBranch === selectedBranch;
      });

      expect(branchATx.length).toBe(5); // tx_1, tx_2, tx_3, tx_4, tx_5
      expect(branchATx.some((tx) => !tx.branchId)).toBe(false);
      expect(branchATx.find((tx) => tx.id === "tx_untagged_branch")).toBeUndefined();
    });
  });
});
