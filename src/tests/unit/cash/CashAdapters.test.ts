import { describe, it, expect } from "vitest";
import {
  PayrollCashAdapter,
  InvoiceCashAdapter,
  LedgerCashAdapter,
  getCashFlowImpact,
} from "../../../domains/cash";
import type { PayrollRecord, PayrollCycle, LedgerTransaction } from "../../../types";
import type { Invoice, InvoicePayment } from "../../../types/crm";

interface TestPayrollRecord extends PayrollRecord {
  paidAt?: string;
}

describe("Cash Basis Adapters — Phase 2 Test Suite", () => {
  const BIZ_ID = "biz_enterprise_01";

  // =========================================================================
  // 1. PayrollCashAdapter Tests
  // =========================================================================
  describe("1. PayrollCashAdapter", () => {
    const baseRecord: TestPayrollRecord = {
      id: "pr_rec_101",
      cycleId: "cycle_2026_08",
      business_id: BIZ_ID,
      employeeId: "emp_501",
      employeeName: "Jean Dupont",
      department_id: "dept_engineering",
      branch_id: "branch_delmas",
      grossSalary: 60000,
      netPaid: 48000,
      net_salary_cents: 4800000,
      cnssDeduction: 3600,
      cnsDeduction: 1200,
      commissions: 0,
      advancesTreated: 0,
      hashSignature: "sig_abc123",
      status: "PAID",
      paidAt: "2026-08-31T14:30:00.000Z",
    };

    const baseCycle: PayrollCycle = {
      id: "cycle_2026_08",
      business_id: BIZ_ID,
      label: "Cycle Août 2026",
      cycleName: "Août 2026",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      status: "PAID",
      disbursedAt: "2026-08-31T15:00:00.000Z",
      recordsCount: 1,
      total_gross_cents: 6000000,
      total_net_cents: 4800000,
      total_deductions_cents: 1200000,
    };

    it("1.1. transforms a disbursed payroll record into a valid OUTFLOW movement", () => {
      const result = PayrollCashAdapter.adaptRecord(baseRecord, { cycle: baseCycle });

      expect(result.status).toBe("VALID");
      expect(result.movement).toBeDefined();

      const m = result.movement!;
      expect(m.direction).toBe("OUTFLOW");
      expect(m.movementType).toBe("PAYROLL");
      expect(m.sourceModule).toBe("PAYROLL");
      expect(m.sourceId).toBe("pr_rec_101");
      expect(m.businessId).toBe(BIZ_ID);
      expect(m.amount).toBe(48000);
      expect(m.amountCents).toBe(4800000);
      expect(m.currency).toBe("HTG");
      expect(m.movementDate).toBe("2026-08-31");
      expect(m.status).toBe("PAID");
      expect(getCashFlowImpact(m)).toBe(-48000);
      expect(m.id).toBe(`cm_${BIZ_ID}_PAYROLL_pr_rec_101_2026-08-31_OUTFLOW`);
    });

    it("1.2. uses cycle.disbursedAt when record lacks paidAt", () => {
      const recordNoPaidAt: TestPayrollRecord = {
        ...baseRecord,
        paidAt: undefined,
      };

      const result = PayrollCashAdapter.adaptRecord(recordNoPaidAt, { cycle: baseCycle });

      expect(result.status).toBe("VALID");
      expect(result.movement?.movementDate).toBe("2026-08-31");
    });

    it("1.3. IGNORES unpaid or draft payroll cycles (accrual payroll is not cash)", () => {
      const draftRecord: TestPayrollRecord = {
        ...baseRecord,
        status: "DRAFT",
        paidAt: undefined,
      };
      const draftCycle: PayrollCycle = {
        ...baseCycle,
        status: "DRAFT",
        disbursedAt: undefined,
      };

      const result = PayrollCashAdapter.adaptRecord(draftRecord, { cycle: draftCycle });

      expect(result.status).toBe("IGNORED");
      expect(result.movement).toBeUndefined();
      expect(result.rejectionReason).toContain("Payroll record not disbursed");
    });

    it("1.4. returns INCOMPLETE when paid payroll lacks settlement date (NEVER fallback to period endDate)", () => {
      const paidRecordNoDate: TestPayrollRecord = {
        ...baseRecord,
        status: "PAID",
        paidAt: undefined,
      };
      const cycleNoDisbursedDate: PayrollCycle = {
        ...baseCycle,
        status: "PAID",
        disbursedAt: undefined,
        effectiveAccountingDate: undefined,
      };

      const result = PayrollCashAdapter.adaptRecord(paidRecordNoDate, { cycle: cycleNoDisbursedDate });

      expect(result.status).toBe("INCOMPLETE");
      expect(result.movement).toBeUndefined();
      expect(result.rejectionReason).toContain("Missing actual disbursement date");
    });

    it("1.5. returns INVALID for corrupted financial amounts (NaN or negative)", () => {
      const corruptedRecord: TestPayrollRecord = {
        ...baseRecord,
        netPaid: -15000,
        net_salary_cents: -1500000,
      };

      const result = PayrollCashAdapter.adaptRecord(corruptedRecord, { cycle: baseCycle });

      expect(result.status).toBe("INVALID");
      expect(result.movement).toBeUndefined();
    });

    it("1.6. IGNORES zero net payout", () => {
      const zeroRecord: TestPayrollRecord = {
        ...baseRecord,
        netPaid: 0,
        net_salary_cents: 0,
      };

      const result = PayrollCashAdapter.adaptRecord(zeroRecord, { cycle: baseCycle });

      expect(result.status).toBe("IGNORED");
      expect(result.rejectionReason).toContain("zero");
    });

    it("1.7. handles reversed payroll cycles with status REVERSED and reversalOf", () => {
      const reversedCycle: PayrollCycle = {
        ...baseCycle,
        isReversed: true,
        reversalOfCycleId: "cycle_orig_99",
      };

      const result = PayrollCashAdapter.adaptRecord(baseRecord, { cycle: reversedCycle });

      expect(result.status).toBe("VALID");
      expect(result.movement?.status).toBe("REVERSED");
      expect(result.movement?.reversalOf).toBeDefined();
    });

    it("1.8. adapts an entire batch of records with adaptCycle", () => {
      const rec2: TestPayrollRecord = {
        ...baseRecord,
        id: "pr_rec_102",
        employeeId: "emp_502",
        netPaid: 32000,
        net_salary_cents: 3200000,
      };

      const batch = PayrollCashAdapter.adaptCycle(baseCycle, [baseRecord, rec2]);

      expect(batch.movements).toHaveLength(2);
      expect(batch.summary.validCount).toBe(2);
      expect(batch.summary.totalInput).toBe(2);
    });
  });

  // =========================================================================
  // 2. InvoiceCashAdapter Tests
  // =========================================================================
  describe("2. InvoiceCashAdapter", () => {
    const baseInvoice: Invoice = {
      id: "inv_2026_001",
      businessId: BIZ_ID,
      invoiceNumber: "INV-2026-001",
      clientNif: "000-111-222-3",
      clientName: "ACME Corp",
      clientEmail: "billing@acme.com",
      status: "PAID",
      issueDate: "2026-05-01",
      dueDate: "2026-05-31",
      paidAt: "2026-05-15T10:00:00.000Z",
      items: [],
      subtotal: 100000,
      totalDiscount: 0,
      taxAmount: 0,
      totalAmount: 100000,
      amountPaid: 100000,
      isPaid: true,
      currency: "HTG",
      paymentMethod: "BANK_TRANSFER",
      createdAt: "2026-05-01T08:00:00.000Z",
      updatedAt: "2026-05-15T10:00:00.000Z",
    };

    it("2.1. transforms a paid invoice into a valid INFLOW movement", () => {
      const result = InvoiceCashAdapter.adaptInvoice(baseInvoice);

      expect(result.status).toBe("VALID");
      expect(result.movement).toBeDefined();

      const m = result.movement!;
      expect(m.direction).toBe("INFLOW");
      expect(m.movementType).toBe("INVOICE_COLLECTION");
      expect(m.sourceModule).toBe("INVOICE");
      expect(m.sourceId).toBe("inv_2026_001");
      expect(m.businessId).toBe(BIZ_ID);
      expect(m.amount).toBe(100000);
      expect(m.amountCents).toBe(10000000);
      expect(m.currency).toBe("HTG");
      expect(m.movementDate).toBe("2026-05-15");
      expect(getCashFlowImpact(m)).toBe(100000);
      expect(m.id).toBe(`cm_${BIZ_ID}_INVOICE_inv_2026_001_2026-05-15_INFLOW`);
    });

    it("2.2. IGNORES unpaid invoices (issued, sent, draft, overdue) without cash received", () => {
      const unpaidInvoice: Invoice = {
        ...baseInvoice,
        status: "ISSUED",
        isPaid: false,
        amountPaid: 0,
        paidAt: undefined,
      };

      const result = InvoiceCashAdapter.adaptInvoice(unpaidInvoice);

      expect(result.status).toBe("IGNORED");
      expect(result.movement).toBeUndefined();
      expect(result.rejectionReason).toContain("Accrual receivable is not cash");
    });

    it("2.3. returns INCOMPLETE when paid invoice lacks paidAt timestamp (NEVER fallback to issueDate/dueDate)", () => {
      const invoiceNoPaidAt: Invoice = {
        ...baseInvoice,
        status: "PAID",
        isPaid: true,
        paidAt: undefined,
      };

      const result = InvoiceCashAdapter.adaptInvoice(invoiceNoPaidAt);

      expect(result.status).toBe("INCOMPLETE");
      expect(result.rejectionReason).toContain("Issue/Due date cannot be silently substituted");
    });

    it("2.4. handles partial and multi-payments by generating distinct movements for each payment event", () => {
      const payments: InvoicePayment[] = [
        {
          id: "pmt_01",
          invoiceId: "inv_2026_001",
          amount: 60000,
          paymentDate: "2026-05-10T09:00:00.000Z",
          paymentMethod: "BANK_TRANSFER",
          transactionId: "tx_bank_60k",
          reference: "VIR-001",
          createdAt: "2026-05-10T09:00:00.000Z",
        },
        {
          id: "pmt_02",
          invoiceId: "inv_2026_001",
          amount: 40000,
          paymentDate: "2026-05-25T11:30:00.000Z",
          paymentMethod: "CHECK",
          transactionId: "tx_check_40k",
          reference: "CHK-7741",
          createdAt: "2026-05-25T11:30:00.000Z",
        },
      ];

      const multiPayInvoice: Invoice = {
        ...baseInvoice,
        amountPaid: 100000,
        payments,
      };

      const result = InvoiceCashAdapter.adaptInvoice(multiPayInvoice);

      expect(result.status).toBe("VALID");
      expect(result.movements).toHaveLength(2);

      const [m1, m2] = result.movements!;
      expect(m1.amount).toBe(60000);
      expect(m1.movementDate).toBe("2026-05-10");
      expect(m1.paymentEventId).toBe("pmt_01");
      expect(m1.id).toBe(`cm_${BIZ_ID}_INVOICE_inv_2026_001_evt_pmt_01_2026-05-10_INFLOW`);

      expect(m2.amount).toBe(40000);
      expect(m2.movementDate).toBe("2026-05-25");
      expect(m2.paymentEventId).toBe("pmt_02");
      expect(m2.id).toBe(`cm_${BIZ_ID}_INVOICE_inv_2026_001_evt_pmt_02_2026-05-25_INFLOW`);
    });

    it("2.5. IGNORES CANCELLED invoices", () => {
      const cancelled: Invoice = {
        ...baseInvoice,
        status: "CANCELLED",
      };

      const result = InvoiceCashAdapter.adaptInvoice(cancelled);
      expect(result.status).toBe("IGNORED");
    });
  });

  // =========================================================================
  // 3. LedgerCashAdapter Tests
  // =========================================================================
  describe("3. LedgerCashAdapter", () => {
    const baseTxProps = {
      business_id: BIZ_ID,
      branchId: "branch_main",
      signerId: "user_finance_01",
      source: "MANUAL" as const,
      isImmutable: true,
      currency: "HTG" as const,
    };

    it("3.1. IGNORES accrual-only transactions with no treasury accounts (Expense <-> Payable)", () => {
      const accrualTx: LedgerTransaction = {
        ...baseTxProps,
        id: "tx_accrual_001",
        type: "EXPENSE",
        amount: 25000,
        amount_cents: 2500000,
        description: "Charge patronale ONA due",
        date: "2026-08-31",
        category: "TAXES",
        status: "POSTED",
        debit_account: "5100_PAYROLL_EXPENSE",
        credit_account: "2100_ONA_TAXES_PAYABLE",
      };

      const result = LedgerCashAdapter.adaptTransaction(accrualTx);

      expect(result.status).toBe("IGNORED");
      expect(result.movement).toBeUndefined();
      expect(result.rejectionReason).toContain("Neither debit account");
    });

    it("3.2. transforms cash inflow (Debit Treasury, Credit Non-Treasury) into INFLOW movement", () => {
      const saleCashTx: LedgerTransaction = {
        ...baseTxProps,
        id: "tx_sale_cash_001",
        type: "INCOME",
        amount: 15000,
        amount_cents: 1500000,
        description: "Vente au comptant en magasin",
        date: "2026-08-10",
        category: "SALES",
        status: "POSTED",
        debit_account: "1000_CASH",
        credit_account: "4000_REVENUE",
      };

      const result = LedgerCashAdapter.adaptTransaction(saleCashTx);

      expect(result.status).toBe("VALID");
      expect(result.movement).toBeDefined();

      const m = result.movement!;
      expect(m.direction).toBe("INFLOW");
      expect(m.cashAccountId).toBe("1000_CASH");
      expect(m.amount).toBe(15000);
      expect(m.movementDate).toBe("2026-08-10");
      expect(getCashFlowImpact(m)).toBe(15000);
      expect(m.id).toBe(`cm_${BIZ_ID}_LEDGER_tx_sale_cash_001_2026-08-10_INFLOW`);
    });

    it("3.3. transforms cash outflow (Credit Treasury, Debit Non-Treasury) into OUTFLOW movement", () => {
      const rentTx: LedgerTransaction = {
        ...baseTxProps,
        id: "tx_rent_001",
        type: "EXPENSE",
        amount: 35000,
        amount_cents: 3500000,
        description: "Loyer bureau Delmas",
        date: "2026-08-01",
        category: "OPERATING_EXPENSES",
        status: "POSTED",
        debit_account: "5200_RENT",
        credit_account: "1010_BANK",
      };

      const result = LedgerCashAdapter.adaptTransaction(rentTx);

      expect(result.status).toBe("VALID");
      expect(result.movement).toBeDefined();

      const m = result.movement!;
      expect(m.direction).toBe("OUTFLOW");
      expect(m.cashAccountId).toBe("1010_BANK");
      expect(m.amount).toBe(35000);
      expect(m.movementDate).toBe("2026-08-01");
      expect(getCashFlowImpact(m)).toBe(-35000);
      expect(m.id).toBe(`cm_${BIZ_ID}_LEDGER_tx_rent_001_2026-08-01_OUTFLOW`);
    });

    it("3.4. handles Internal Transfer (Treasury <-> Treasury) as single consolidated movement with net 0 impact", () => {
      const transferTx: LedgerTransaction = {
        ...baseTxProps,
        id: "tx_transfer_001",
        type: "TRANSFER",
        amount: 50000,
        amount_cents: 5000000,
        description: "Dépôt Caisse vers Banque",
        date: "2026-08-20",
        category: "TREASURY_TRANSFER",
        status: "POSTED",
        debit_account: "1010_BANK",
        credit_account: "1000_CASH",
      };

      const result = LedgerCashAdapter.adaptTransaction(transferTx);

      expect(result.status).toBe("VALID");
      expect(result.movement).toBeDefined();

      const m = result.movement!;
      expect(m.direction).toBe("TRANSFER");
      expect(m.movementType).toBe("TRANSFER");
      expect(m.sourceCashAccountId).toBe("1000_CASH");
      expect(m.destinationCashAccountId).toBe("1010_BANK");
      expect(getCashFlowImpact(m)).toBe(0);
      expect(m.id).toBe(`cm_${BIZ_ID}_LEDGER_tx_transfer_001_2026-08-20_TRANSFER`);
    });

    it("3.5. splits Internal Transfer into two discrete legs when splitTransfers is enabled", () => {
      const transferTx: LedgerTransaction = {
        ...baseTxProps,
        id: "tx_transfer_split_002",
        type: "TRANSFER",
        amount: 20000,
        amount_cents: 2000000,
        description: "Alimentation Caisse depuis Banque",
        date: "2026-08-22",
        category: "TREASURY_TRANSFER",
        status: "POSTED",
        debit_account: "1000_CASH",
        credit_account: "1010_BANK",
      };

      const result = LedgerCashAdapter.adaptTransaction(transferTx, { splitTransfers: true });

      expect(result.status).toBe("VALID");
      expect(result.movements).toHaveLength(2);

      const [outflowLeg, inflowLeg] = result.movements!;
      expect(outflowLeg.direction).toBe("OUTFLOW");
      expect(outflowLeg.cashAccountId).toBe("1010_BANK");
      expect(outflowLeg.destinationCashAccountId).toBe("1000_CASH");
      expect(outflowLeg.id).toBe(`cm_${BIZ_ID}_LEDGER_tx_transfer_split_002_2026-08-22_OUTFLOW`);

      expect(inflowLeg.direction).toBe("INFLOW");
      expect(inflowLeg.cashAccountId).toBe("1000_CASH");
      expect(inflowLeg.sourceCashAccountId).toBe("1010_BANK");
      expect(inflowLeg.id).toBe(`cm_${BIZ_ID}_LEDGER_tx_transfer_split_002_2026-08-22_INFLOW`);

      const netSum = getCashFlowImpact(outflowLeg) + getCashFlowImpact(inflowLeg);
      expect(netSum).toBe(0);
    });

    it("3.6. IGNORES PENDING (unposted draft) transactions", () => {
      const pendingTx: LedgerTransaction = {
        ...baseTxProps,
        id: "tx_pending_001",
        type: "EXPENSE",
        amount: 1000,
        amount_cents: 100000,
        description: "Brouillon non validé",
        date: "2026-08-25",
        category: "OFFICE",
        status: "PENDING",
        debit_account: "5200_RENT",
        credit_account: "1000_CASH",
      };

      const result = LedgerCashAdapter.adaptTransaction(pendingTx);

      expect(result.status).toBe("IGNORED");
      expect(result.rejectionReason).toContain("PENDING");
    });

    it("3.7. handles REVERSED transactions preserving reversal references", () => {
      const reversedTx: LedgerTransaction = {
        ...baseTxProps,
        id: "tx_rev_001",
        type: "REVERSAL",
        amount: 5000,
        amount_cents: 500000,
        description: "Annulation paiement",
        date: "2026-08-28",
        category: "CORRECTION",
        status: "REVERSED",
        debit_account: "1000_CASH",
        credit_account: "5200_RENT",
        referenceTransactionId: "tx_orig_rent_001",
      };

      const result = LedgerCashAdapter.adaptTransaction(reversedTx);

      expect(result.status).toBe("VALID");
      expect(result.movement?.status).toBe("REVERSED");
      expect(result.movement?.reversalOf).toBe("tx_orig_rent_001");
      expect(getCashFlowImpact(result.movement!)).toBe(0);
    });

    it("3.8. extracts deduplication metadata linking to payroll cycles or CRM invoices", () => {
      const payrollLedgerTx: LedgerTransaction = {
        ...baseTxProps,
        id: "tx_gl_payroll_01",
        type: "PAYROLL",
        amount: 120000,
        amount_cents: 12000000,
        description: "Écriture générale Paie Août 2026",
        date: "2026-08-31",
        category: "PAYROLL",
        status: "POSTED",
        debit_account: "5100_PAYROLL_EXPENSE",
        credit_account: "1010_BANK",
        source: "PAYROLL_ENGINE",
        metadata: {
          payrollCycleId: "cycle_2026_08",
        },
      };

      const result = LedgerCashAdapter.adaptTransaction(payrollLedgerTx);

      expect(result.status).toBe("VALID");
      expect(result.metadata?.isPayrollEngine).toBe(true);
      expect(result.metadata?.linkedCycleId).toBe("cycle_2026_08");
    });
  });
});
