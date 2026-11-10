import { describe, it, expect, beforeEach } from "vitest";
import { PayrollService } from "../../services/payroll/PayrollService";
import { EmployeeReceivableService } from "../../services/payroll/EmployeeReceivableService";
import { AccountingEngine } from "../../services/AccountingEngine";
import { PayrollCycle, PayrollRecord, LedgerTransaction, User, EmployeeReceivable } from "../../types";

describe("POST-ENG-05: Employee Recovery, Accounting Integrity, Atomic Idempotency & Reporting Consistency Suite", () => {
  const businessId = "tenant_post_eng05";
  const crossTenantId = "tenant_attacker_x";
  const now = new Date().toISOString();

  const userOwner: User = {
    id: "usr_owner_01",
    email: "owner@finops.test",
    name: "Owner User",
    role: "OWNER",
    business_id: businessId,
  };

  const userCreator: User = {
    id: "usr_creator_01",
    email: "creator@finops.test",
    name: "Creator Teller",
    role: "SENIOR_TELLER",
    business_id: businessId,
  };

  const userTellerUnauthorized: User = {
    id: "usr_teller_bad",
    email: "badteller@finops.test",
    name: "Bad Teller",
    role: "JUNIOR_TELLER",
    business_id: businessId,
  };

  const sampleCyclePaid: PayrollCycle = {
    id: "cyc_paid_001",
    business_id: businessId,
    cycleName: "Paie Septembre 2026",
    label: "Paie Septembre 2026",
    startDate: "2026-09-01",
    endDate: "2026-09-15",
    status: "PAID",
    currency: "HTG",
    recordsCount: 1,
    generated_by: "usr_creator_01",
    created_at: now,
    updated_at: now,
  };

  const sampleRecordsPaid: PayrollRecord[] = [
    {
      id: "rec_paid_emp1",
      cycleId: "cyc_paid_001",
      payroll_cycle_id: "cyc_paid_001",
      business_id: businessId,
      employeeId: "emp_overpaid_01",
      employeeName: "Michel Pierre",
      branch_id: "MAIN",
      department_id: "OPS",
      pay_profile: "FIXED",
      baseSalary: 30000,
      base_salary_cents: 3000000,
      grossSalary: 30000,
      gross_salary_cents: 3000000,
      cnssDeduction: 1800,
      cnss_employee_cents: 180000,
      cnsDeduction: 600,
      cns_employee_cents: 60000,
      taxDeduction: 1500,
      tax_employee_cents: 150000,
      onaEmployer: 1800,
      cnss_employer_cents: 180000,
      ofatmaEmployer: 900,
      cns_employer_cents: 90000,
      advancesTreated: 0,
      commissions: 0,
      netPaid: 26100,
      net_salary_cents: 2610000,
      status: "SEALED",
      hashSignature: "sig_paid_01",
    },
  ];

  // Bank disbursement transaction representing Case B
  const sampleBankDisbursementTx: LedgerTransaction = {
    id: "tx_settle_cyc_paid_001",
    business_id: businessId,
    businessId,
    branchId: "MAIN",
    type: "PAYROLL",
    amount: 26100,
    amount_cents: 2610000,
    date: "2026-09-15",
    description: "Règlement Salaires Nets en Banque - Septembre 2026",
    category: "SETTLEMENT",
    signerId: "usr_owner_01",
    currency: "HTG",
    source: "PAYROLL_ENGINE",
    status: "POSTED",
    isImmutable: true,
    debit_account: "2100_PAYROLL_CLEARING",
    credit_account: "1010_BANK",
    debit: 26100,
    credit: 26100,
    debit_cents: 2610000,
    credit_cents: 2610000,
    metadata: {
      cycleId: "cyc_paid_001",
      component: "SALARY_SETTLEMENT",
    },
  };

  describe("1. Already-Paid Payroll Reversal & Proposal Generation (Case B)", () => {
    it("1.1 Case B reversal preserves bank disbursement and generates a recovery proposal in PENDING_HUMAN_APPROVAL status", async () => {
      const { reversalCycle, recoveryProposals } = await PayrollService.reversePayrollCycle(
        { ...sampleCyclePaid, status: "SEALED" },
        sampleRecordsPaid,
        businessId,
        {
          currentUser: userOwner,
          reason: "Trop-perçu constaté après virement",
          ledgerTransactions: [sampleBankDisbursementTx],
        }
      );

      expect(reversalCycle.status).toBe("DRAFT");
      expect(recoveryProposals).toBeDefined();
      expect(recoveryProposals.length).toBe(1);

      const prop = recoveryProposals[0];
      expect(prop.status).toBe("PENDING_HUMAN_APPROVAL");
      expect(prop.approvedRecoverableAmount).toBe(26100);
      expect(prop.approvedRecoverableCents).toBe(2610000);
      expect(prop.outstandingCents).toBe(2610000);
      expect(prop.recoveredCents).toBe(0);
      expect(prop.employeeId).toBe("emp_overpaid_01");
      expect(prop.receivableAccount).toBe("1310_EMPLOYEE_RECEIVABLES");
    });

    it("1.2 Proposal cannot execute or affect cash balance automatically without human approval", () => {
      const prop = EmployeeReceivableService.createProposal({
        businessId,
        originalPayrollCycleId: "cyc_paid_001",
        originalPayrollRecordId: "rec_paid_emp1",
        employeeId: "emp_overpaid_01",
        recoverableAmount: 26100,
        creator: { id: "usr_creator_01", role: "SENIOR_TELLER" },
      });

      expect(prop.status).toBe("PENDING_HUMAN_APPROVAL");
      expect(prop.approverId).toBeUndefined();
      expect(prop.recoveredCents).toBe(0);

      // Attempting to record a repayment on an unapproved proposal fails
      expect(() =>
        EmployeeReceivableService.recordRepayment(prop, {
          businessId,
          amount: 5000,
          paymentMethod: "CASH",
          recordedBy: { id: "usr_owner_01" },
        })
      ).toThrow("StatusViolation");
    });
  });

  describe("2. Human Authorization, Segregation of Duties & Account Validation", () => {
    let pendingProposal: EmployeeReceivable;

    beforeEach(() => {
      pendingProposal = EmployeeReceivableService.createProposal({
        businessId,
        originalPayrollCycleId: "cyc_paid_001",
        originalPayrollRecordId: "rec_paid_emp1",
        employeeId: "emp_overpaid_01",
        recoverableAmount: 26100,
        creator: { id: "usr_creator_01", role: "SENIOR_TELLER" },
      });
    });

    it("2.1 Rejects approval attempt by the proposal creator (Maker-Checker violation)", () => {
      expect(() =>
        EmployeeReceivableService.approveProposal(pendingProposal, {
          businessId,
          approver: { id: "usr_creator_01", role: "SENIOR_TELLER" },
        })
      ).toThrow("SegregationOfDutiesViolation");
    });

    it("2.2 Rejects approval attempt by an unauthorized role (e.g. Junior Teller)", () => {
      expect(() =>
        EmployeeReceivableService.approveProposal(pendingProposal, {
          businessId,
          approver: { id: "usr_teller_bad", role: "JUNIOR_TELLER" },
        })
      ).toThrow("AuthorizationViolation");
    });

    it("2.3 Rejects cross-tenant approval attempt", () => {
      expect(() =>
        EmployeeReceivableService.approveProposal(pendingProposal, {
          businessId: crossTenantId,
          approver: { id: "usr_owner_cross", role: "OWNER" },
        })
      ).toThrow("MultiTenancyViolation");
    });

    it("2.4 Rejects invalid or non-asset account code mapping", () => {
      expect(() =>
        EmployeeReceivableService.approveProposal(pendingProposal, {
          businessId,
          approver: { id: "usr_owner_01", role: "OWNER" },
          receivableAccount: "5100_EXPENSE_INVALID",
        })
      ).toThrow("AccountingViolation");
    });

    it("2.5 Approved recovery posts balanced GL entry (Dr 1310_EMPLOYEE_RECEIVABLES, Cr 2100_PAYROLL_CLEARING) and transitions status to APPROVED_PENDING_RECOVERY", () => {
      const { approvedReceivable, journalEntry, ledgerTransactions } = EmployeeReceivableService.approveProposal(
        pendingProposal,
        {
          businessId,
          approver: { id: "usr_owner_01", role: "OWNER" },
          approvalReason: "Trop-perçu validé par la direction",
        }
      );

      expect(approvedReceivable.status).toBe("APPROVED_PENDING_RECOVERY");
      expect(approvedReceivable.approverId).toBe("usr_owner_01");

      // Verify mechanical balance
      expect(journalEntry.isBalanced).toBe(true);
      expect(journalEntry.totalDebitCents).toBe(2610000);
      expect(journalEntry.totalCreditCents).toBe(2610000);

      // Verify economic account mapping
      const tx = ledgerTransactions[0];
      expect(tx.debit_account).toBe("1310_EMPLOYEE_RECEIVABLES");
      expect(tx.credit_account).toBe("2100_PAYROLL_CLEARING");
      expect(tx.amount_cents).toBe(2610000);
    });
  });

  describe("3. Partial Repayment Reconciliation & Outstanding Balance Tracking", () => {
    let approvedReceivable: EmployeeReceivable;

    beforeEach(() => {
      const proposal = EmployeeReceivableService.createProposal({
        businessId,
        originalPayrollCycleId: "cyc_paid_001",
        originalPayrollRecordId: "rec_paid_emp1",
        employeeId: "emp_overpaid_01",
        recoverableAmount: 26100,
        creator: { id: "usr_creator_01", role: "SENIOR_TELLER" },
      });

      const { approvedReceivable: res } = EmployeeReceivableService.approveProposal(proposal, {
        businessId,
        approver: { id: "usr_owner_01", role: "OWNER" },
      });
      approvedReceivable = res;
    });

    it("3.1 First partial repayment (10,000 HTG) updates outstanding balance in minor cents to 16,100 HTG and sets status to PARTIALLY_RECOVERED", () => {
      const { updatedReceivable, repayment, journalEntry } = EmployeeReceivableService.recordRepayment(
        approvedReceivable,
        {
          businessId,
          amount: 10000,
          paymentMethod: "CASH",
          treasuryAccount: "1000_CASH",
          recordedBy: { id: "usr_owner_01" },
        }
      );

      expect(updatedReceivable.status).toBe("PARTIALLY_RECOVERED");
      expect(updatedReceivable.recoveredCents).toBe(1000000);
      expect(updatedReceivable.recoveredAmount).toBe(10000);
      expect(updatedReceivable.outstandingCents).toBe(1610000);
      expect(updatedReceivable.outstandingAmount).toBe(16100);

      expect(repayment.status).toBe("CONFIRMED");
      expect(journalEntry.lines[0].accountId).toBe("1000_CASH");
      expect(journalEntry.lines[0].debitCents).toBe(1000000);
      expect(journalEntry.lines[1].accountId).toBe("1310_EMPLOYEE_RECEIVABLES");
      expect(journalEntry.lines[1].creditCents).toBe(1000000);
    });

    it("3.2 Second partial repayment (16,100 HTG) brings outstanding balance to 0 and transitions status to RECOVERED", () => {
      const { updatedReceivable: step1 } = EmployeeReceivableService.recordRepayment(approvedReceivable, {
        businessId,
        amount: 10000,
        paymentMethod: "BANK",
        recordedBy: { id: "usr_owner_01" },
      });

      const { updatedReceivable: step2 } = EmployeeReceivableService.recordRepayment(step1, {
        businessId,
        amount: 16100,
        paymentMethod: "BANK",
        recordedBy: { id: "usr_owner_01" },
      });

      expect(step2.status).toBe("RECOVERED");
      expect(step2.recoveredCents).toBe(2610000);
      expect(step2.outstandingCents).toBe(0);
      expect(step2.repayments.length).toBe(2);
    });

    it("3.3 Over-repayment attempt exceeding remaining balance is strictly rejected", () => {
      const { updatedReceivable: step1 } = EmployeeReceivableService.recordRepayment(approvedReceivable, {
        businessId,
        amount: 20000,
        paymentMethod: "CASH",
        recordedBy: { id: "usr_owner_01" },
      });

      // Remaining is 6,100 HTG. Attempting to record 7,000 HTG must fail
      expect(() =>
        EmployeeReceivableService.recordRepayment(step1, {
          businessId,
          amount: 7000,
          paymentMethod: "CASH",
          recordedBy: { id: "usr_owner_01" },
        })
      ).toThrow("ValidationViolation");
    });

    it("3.4 Reversing a confirmed repayment restores the outstanding balance accurately", () => {
      const { updatedReceivable: step1, repayment } = EmployeeReceivableService.recordRepayment(
        approvedReceivable,
        {
          businessId,
          amount: 10000,
          paymentMethod: "CASH",
          recordedBy: { id: "usr_owner_01" },
        }
      );

      expect(step1.outstandingCents).toBe(1610000);

      const { updatedReceivable: step2, correctionTx } = EmployeeReceivableService.reverseRepayment(
        step1,
        repayment.id,
        { id: "usr_owner_01" },
        "Chèque sans provision"
      );

      expect(step2.recoveredCents).toBe(0);
      expect(step2.outstandingCents).toBe(2610000);
      expect(step2.status).toBe("APPROVED_PENDING_RECOVERY");
      expect(correctionTx.debit_account).toBe("1310_EMPLOYEE_RECEIVABLES");
      expect(correctionTx.credit_account).toBe("1010_BANK");
    });
  });
});
