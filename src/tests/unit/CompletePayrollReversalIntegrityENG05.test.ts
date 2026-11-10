import { describe, it, expect, beforeEach } from "vitest";
import { PayrollService } from "../../services/payroll/PayrollService";
import { AccountingEngine, createPayrollJournalEntry, createPayrollSettlementEntry } from "../../services/AccountingEngine";
import { PayrollCycle, PayrollRecord, LedgerTransaction, User } from "../../types";

describe("ENG-05: Complete Payroll Reversal & Accounting Integrity Test Suite", () => {
  const businessId = "tenant_eng05_test";
  const now = new Date().toISOString();

  const mockUserAdmin: User = {
    id: "usr_admin_01",
    email: "admin@finops.test",
    name: "Admin Tester",
    role: "OWNER",
    business_id: businessId,
  };

  const mockUserTeller: User = {
    id: "usr_teller_01",
    email: "teller@finops.test",
    name: "Teller Tester",
    role: "SENIOR_TELLER",
    business_id: businessId,
  };

  const sampleCycle: PayrollCycle = {
    id: "cyc_eng05_001",
    business_id: businessId,
    cycleName: "Paie Quinzaine Octobre 2026",
    label: "Paie Quinzaine Octobre 2026",
    startDate: "2026-10-01",
    endDate: "2026-10-15",
    status: "SEALED",
    currency: "HTG",
    recordsCount: 2,
    generated_by: "usr_teller_01",
    created_at: now,
    updated_at: now,
  };

  beforeEach(() => {
    sampleCycle.isReversed = false;
    delete (sampleCycle as any).reversalCycleId;
    delete (sampleCycle as any).reversedAt;
    delete (sampleCycle as any).reversedBy;
    delete (sampleCycle as any).reversalReason;
  });

  const sampleRecords: PayrollRecord[] = [
    {
      id: "rec_eng05_emp1",
      cycleId: "cyc_eng05_001",
      payroll_cycle_id: "cyc_eng05_001",
      business_id: businessId,
      employeeId: "emp_001",
      employeeName: "Jean Baptiste",
      branch_id: "MAIN",
      department_id: "OPS",
      pay_profile: "HYBRID",
      baseSalary: 20000,
      base_salary_cents: 2000000,
      theoretical_quincena_base_cents: 2000000,
      workedHours: 80,
      worked_minutes: 4800,
      overtimeHours: 10,
      overtimePayout: 2500,
      overtime_cents: 250000,
      commissions: 1500,
      commission_cents: 150000,
      commission_rate_used: 0.05,
      salesHtg: 30000,
      sales_cents: 3000000,
      primes: 1000,
      bonuses: 1000,
      bonuses_cents: 100000,
      penalties: 500,
      penalties_cents: 50000,
      grossSalary: 24500,
      gross_salary_cents: 2450000,
      cnssDeduction: 1470,
      cnss_employee_cents: 147000,
      cnsDeduction: 490,
      cns_employee_cents: 49000,
      taxDeduction: 1200,
      tax_employee_cents: 120000,
      onaEmployer: 1470,
      cnss_employer_cents: 147000,
      ofatmaEmployer: 735,
      cns_employer_cents: 73500,
      employeeContributionsTotal: 3160,
      employerContributionsTotal: 2205,
      employerPayrollCostTotal: 26705,
      advancesTreated: 2000,
      advances: 2000,
      debts_deduction_cents: 200000,
      netPaid: 19340,
      net_salary_cents: 1934000,
      status: "SEALED",
      hashSignature: "sig_emp1_ok",
    },
    {
      id: "rec_eng05_emp2",
      cycleId: "cyc_eng05_001",
      payroll_cycle_id: "cyc_eng05_001",
      business_id: businessId,
      employeeId: "emp_002",
      employeeName: "Marie Clare",
      branch_id: "MAIN",
      department_id: "FIN",
      pay_profile: "FIXED",
      baseSalary: 15000,
      base_salary_cents: 1500000,
      theoretical_quincena_base_cents: 1500000,
      workedHours: 80,
      worked_minutes: 4800,
      overtimeHours: 0,
      overtimePayout: 0,
      overtime_cents: 0,
      commissions: 0,
      commission_cents: 0,
      primes: 0,
      bonuses_cents: 0,
      penalties: 0,
      penalties_cents: 0,
      grossSalary: 15000,
      gross_salary_cents: 1500000,
      cnssDeduction: 900,
      cnss_employee_cents: 90000,
      cnsDeduction: 300,
      cns_employee_cents: 30000,
      taxDeduction: 500,
      tax_employee_cents: 50000,
      onaEmployer: 900,
      cnss_employer_cents: 90000,
      ofatmaEmployer: 450,
      cns_employer_cents: 45000,
      employeeContributionsTotal: 1700,
      employerContributionsTotal: 1350,
      employerPayrollCostTotal: 16350,
      advancesTreated: 0,
      advances: 0,
      debts_deduction_cents: 0,
      netPaid: 13300,
      net_salary_cents: 1330000,
      status: "SEALED",
      hashSignature: "sig_emp2_ok",
    },
  ];

  describe("1. Complete Payroll Record Component Reversal Coverage", () => {
    it("1.1 Inverts every monetary component (gross, net, base, taxes, ONA/OFATMA, advances, primes, penalties, overtime)", async () => {
      const { reversalCycle, reversalRecords } = await PayrollService.reversePayrollCycle(
        sampleCycle,
        sampleRecords,
        businessId,
        { currentUser: mockUserAdmin, reason: "Correction de paie" }
      );

      expect(reversalRecords.length).toBe(2);

      const rec1 = reversalRecords.find((r) => r.employeeId === "emp_001")!;
      expect(rec1).toBeDefined();

      // Check negation of monetary fields
      expect(rec1.grossSalary).toBe(-24500);
      expect(rec1.gross_salary_cents).toBe(-2450000);
      expect(rec1.netPaid).toBe(-19340);
      expect(rec1.net_salary_cents).toBe(-1934000);
      expect(rec1.baseSalary).toBe(-20000);
      expect(rec1.base_salary_cents).toBe(-2000000);
      expect(rec1.cnssDeduction).toBe(-1470);
      expect(rec1.cnss_employee_cents).toBe(-147000);
      expect(rec1.cnsDeduction).toBe(-490);
      expect(rec1.cns_employee_cents).toBe(-49000);
      expect(rec1.taxDeduction).toBe(-1200);
      expect(rec1.tax_employee_cents).toBe(-120000);
      expect(rec1.onaEmployer).toBe(-1470);
      expect(rec1.cnss_employer_cents).toBe(-147000);
      expect(rec1.ofatmaEmployer).toBe(-735);
      expect(rec1.cns_employer_cents).toBe(-73500);
      expect(rec1.advancesTreated).toBe(-2000);
      expect(rec1.debts_deduction_cents).toBe(-200000);
      expect(rec1.penalties).toBe(-500);
      expect(rec1.penalties_cents).toBe(-50000);
      expect(rec1.primes).toBe(-1000);
      expect(rec1.bonuses_cents).toBe(-100000);
      expect(rec1.commissions).toBe(-1500);
      expect(rec1.commission_cents).toBe(-150000);
      expect(rec1.overtimePayout).toBe(-2500);
      expect(rec1.overtime_cents).toBe(-250000);

      // Check preservation of non-monetary quantities
      expect(rec1.workedHours).toBe(80);
      expect(rec1.worked_minutes).toBe(4800);
      expect(rec1.overtimeHours).toBe(10);
      expect(rec1.commission_rate_used).toBe(0.05);

      // Check trace relationship
      expect(rec1.reversalOfPayrollRecordId).toBe("rec_eng05_emp1");
      expect(rec1.isReversal).toBe(true);
    });

    it("1.2 Summing original and reversal records results in exactly 0 net impact", async () => {
      const { reversalRecords } = await PayrollService.reversePayrollCycle(
        sampleCycle,
        sampleRecords,
        businessId,
        { currentUser: mockUserAdmin }
      );

      const totalOrigGross = sampleRecords.reduce((acc, r) => acc + r.grossSalary, 0);
      const totalRevGross = reversalRecords.reduce((acc, r) => acc + r.grossSalary, 0);
      expect(totalOrigGross + totalRevGross).toBe(0);

      const totalOrigNet = sampleRecords.reduce((acc, r) => acc + r.netPaid, 0);
      const totalRevNet = reversalRecords.reduce((acc, r) => acc + r.netPaid, 0);
      expect(totalOrigNet + totalRevNet).toBe(0);

      const totalOrigTax = sampleRecords.reduce((acc, r) => acc + (r.taxDeduction || 0), 0);
      const totalRevTax = reversalRecords.reduce((acc, r) => acc + (r.taxDeduction || 0), 0);
      expect(totalOrigTax + totalRevTax).toBe(0);
    });
  });

  describe("2. Complete Accounting Journal Reversal & Double-Entry Integrity", () => {
    it("2.1 Case A (Accrued but not paid): Inverts debit and credit accounts and preserves double-entry balance", () => {
      const { transactions: origTxs } = AccountingEngine.createPayrollJournalEntry(
        sampleCycle,
        sampleRecords,
        businessId,
        { uid: "admin_01" },
        { isAccrualOnly: true }
      );

      const { transactions: revTxs, journalEntry: revJe } = AccountingEngine.createPayrollReversalJournalEntry(
        sampleCycle,
        sampleRecords,
        businessId,
        { uid: "admin_01" },
        "Correction de paie",
        origTxs
      );

      expect(revTxs.length).toBeGreaterThan(0);
      expect(revJe.isBalanced).toBe(true);
      expect(revJe.totalDebitCents).toBe(revJe.totalCreditCents);

      // Verify that every reversal leg inverts the original debit/credit
      origTxs.forEach((orig) => {
        const rev = revTxs.find((r) => r.metadata?.reversalOfTxId === orig.id);
        if (rev) {
          expect(rev.debit_account).toBe(orig.credit_account);
          expect(rev.credit_account).toBe(orig.debit_account);
          expect(rev.amount_cents).toBe(orig.amount_cents);
        }
      });
    });

    it("2.2 Case B (Already paid in bank): Reverses accruals/liabilities BUT PRESERVES bank disbursement", () => {
      // 1. Accrual posting
      const { transactions: accrualTxs } = AccountingEngine.createPayrollJournalEntry(
        sampleCycle,
        sampleRecords,
        businessId,
        { uid: "admin_01" },
        { isAccrualOnly: true }
      );

      // 2. Bank settlement posting (disbursement)
      const totalNetHtg = sampleRecords.reduce((acc, r) => acc + r.netPaid, 0);
      const { transactions: settleTxs } = AccountingEngine.createPayrollSettlementEntry(
        sampleCycle,
        totalNetHtg,
        businessId,
        "1010_BANK",
        "2100_PAYROLL_CLEARING",
        { uid: "admin_01" }
      );

      const allPostedTxs = [...accrualTxs, ...settleTxs];

      // 3. Reversal
      const paidCycle: PayrollCycle = { ...sampleCycle, status: "PAID" };
      const { transactions: revTxs, settlementStatus } = AccountingEngine.createPayrollReversalJournalEntry(
        paidCycle,
        sampleRecords,
        businessId,
        { uid: "admin_01" },
        "Contre-passation paie décaissée",
        allPostedTxs
      );

      expect(settlementStatus).toBe("SETTLEMENT_PRESERVED_PENDING_RECOVERY");

      // Verify that NO reversal transaction credits or debits 1010_BANK
      const bankReversals = revTxs.filter(
        (tx) => tx.debit_account === "1010_BANK" || tx.credit_account === "1010_BANK"
      );
      expect(bankReversals.length).toBe(0);

      // Verify metadata flags bank disbursement preservation
      revTxs.forEach((tx) => {
        expect(tx.metadata?.bankDisbursementPreserved).toBe(true);
        expect(tx.metadata?.settlementTreatment).toBe("BLOCKED_PENDING_OWNER_REFUND_WORKFLOW");
      });
    });
  });

  describe("3. Lifecycle, Idempotency and Segregation of Duties (Maker-Checker)", () => {
    it("3.1 Original sealed cycle remains SEALED with reversal metadata attached", async () => {
      let updatedCycleData: any = null;

      await PayrollService.reversePayrollCycle(
        sampleCycle,
        sampleRecords,
        businessId,
        {
          currentUser: mockUserAdmin,
          onUpdateCycle: (id, updates) => {
            updatedCycleData = updates;
          },
        }
      );

      expect(sampleCycle.status).toBe("SEALED"); // Original status intact
      expect(updatedCycleData).toBeDefined();
      expect(updatedCycleData.isReversed).toBe(true);
      expect(updatedCycleData.reversalCycleId).toBeDefined();
    });

    it("3.2 Re-running reversal on an already-reversed cycle throws IdempotencyViolation", async () => {
      const reversedCycle: PayrollCycle = {
        ...sampleCycle,
        isReversed: true,
        reversalCycleId: "cyc_rev_existing",
      };

      await expect(
        PayrollService.reversePayrollCycle(reversedCycle, sampleRecords, businessId, { currentUser: mockUserAdmin })
      ).rejects.toThrow("IdempotencyViolation");
    });

    it("3.3 Initiator attempting to reverse their own cycle fails Maker-Checker rule", async () => {
      // Cycle generated_by is "usr_teller_01"
      await expect(
        PayrollService.reversePayrollCycle(sampleCycle, sampleRecords, businessId, {
          currentUser: mockUserTeller, // usr_teller_01
          reason: "Attempting self-reversal",
        })
      ).rejects.toThrow("SegregationOfDutiesViolation");
    });
  });
});
