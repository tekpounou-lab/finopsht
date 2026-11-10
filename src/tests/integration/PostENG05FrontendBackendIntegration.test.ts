import { describe, it, expect, beforeEach } from "vitest";
import { PayrollService } from "../../services/payroll/PayrollService";
import { EmployeeReceivableService } from "../../services/payroll/EmployeeReceivableService";
import { EmployeeReceivableRepository } from "../../repositories/EmployeeReceivableRepository";
import { PayrollCycle, PayrollRecord, User, EmployeeReceivable, LedgerTransaction } from "../../types";

describe("POST-ENG-05 Frontend -> Backend -> Persistence -> Accounting Integration Suite", () => {
  const businessTenantA = "biz_tenant_alpha";
  const businessTenantB = "biz_tenant_beta";

  const userA_Creator: User = {
    id: "usr_alice_creator",
    email: "alice@tenant-alpha.com",
    name: "Alice Creator (RH)",
    role: "MANAGER",
    businessId: businessTenantA,
  };

  const userB_Approver: User = {
    id: "usr_bob_approver",
    email: "bob@tenant-alpha.com",
    name: "Bob Approver (Finance)",
    role: "OWNER",
    businessId: businessTenantA,
  };

  const userTenantB: User = {
    id: "usr_charlie_beta",
    email: "charlie@tenant-beta.com",
    name: "Charlie (Tenant Beta)",
    role: "OWNER",
    businessId: businessTenantB,
  };

  let sealedCycle: PayrollCycle;
  let sampleRecord: PayrollRecord;
  let historicalBankTx: LedgerTransaction;

  beforeEach(() => {
    sealedCycle = {
      id: "cycle_sealed_2026_10",
      business_id: businessTenantA,
      label: "Quinzaine Octobre 2026",
      cycleName: "Quinzaine Octobre 2026",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-15",
      type: "FORTNIGHTLY",
      status: "SEALED",
      isReversed: false,
      settlementStatus: "SETTLEMENT_PRESERVED_PENDING_RECOVERY",
      disbursementMethod: "BANK_TRANSFER",
      createdAt: "2026-10-15T10:00:00Z",
      updatedAt: "2026-10-15T10:00:00Z",
    } as any;

    sampleRecord = {
      id: "rec_emp_001_sealed",
      cycleId: sealedCycle.id,
      business_id: businessTenantA,
      employeeId: "emp_jean_valjean",
      employeeName: "Jean Valjean",
      baseSalary: 100000,
      baseSalaryHtg: 100000,
      grossSalary: 110000,
      netPaid: 95000,
      net_salary_cents: 9500000,
      gross_salary_cents: 11000000,
      isExcluded: false,
    } as any;

    // Historical bank disbursement transaction (1010_BANK)
    historicalBankTx = {
      id: "tx_bank_disbursement_orig",
      business_id: businessTenantA,
      businessId: businessTenantA,
      branchId: "MAIN",
      type: "PAYROLL",
      amount: 95000,
      amount_cents: 9500000,
      date: "2026-10-15",
      description: "Déboursement Effectif Paie Banque - Jean Valjean",
      category: "PAYROLL",
      debit_account: "2100_PAYROLL_CLEARING",
      credit_account: "1010_BANK",
      signerId: "usr_alice_creator",
      currency: "HTG",
      source: "PAYROLL_ENGINE",
      status: "POSTED",
      isImmutable: true,
      createdAt: "2026-10-15T10:00:00Z",
    };
  });

  // TEST CASE 1: Already-Paid Payroll Reversal
  it("TC1: Reversing an already-paid SEALED payroll preserves bank disbursement and creates a recovery proposal in PENDING_HUMAN_APPROVAL", async () => {
    const { reversalCycle, reversalRecords, recoveryProposals } =
      await PayrollService.reversePayrollCycle(
        sealedCycle,
        [sampleRecord],
        businessTenantA,
        {
          currentUser: userA_Creator,
          reason: "Erreur de surpaiement détectée après déboursement bancaire",
          settlementStatus: "SETTLEMENT_PRESERVED_PENDING_RECOVERY",
        } as any
      );

    // 1. Original payroll cycle status preserved
    expect(sealedCycle.status).toBe("SEALED");
    expect(sealedCycle.isReversed).toBe(true);
    expect(sealedCycle.reversalCycleId).toBe(reversalCycle.id);

    // 2. Recovery proposal generated
    expect(recoveryProposals).toBeDefined();
    expect(recoveryProposals!.length).toBe(1);

    const proposal = recoveryProposals![0];
    expect(proposal.status).toBe("PENDING_HUMAN_APPROVAL");
    expect(proposal.employeeId).toBe("emp_jean_valjean");
    expect(proposal.createdById).toBe(userA_Creator.id);

    // 3. Bank disbursement remains untouched (no fake bank refund created)
    expect(historicalBankTx.credit_account).toBe("1010_BANK");
    expect(historicalBankTx.amount).toBe(95000);
  });

  // TEST CASE 2: Maker-Checker Enforcement
  it("TC2: User A (creator) cannot approve their own proposal (Maker-Checker violation). User B approves successfully.", async () => {
    const proposal = EmployeeReceivableService.createProposal({
      businessId: businessTenantA,
      originalPayrollCycleId: sealedCycle.id,
      originalPayrollRecordId: sampleRecord.id,
      employeeId: sampleRecord.employeeId,
      employeeName: sampleRecord.employeeName,
      recoverableAmount: 10000,
      currency: "HTG",
      creator: { id: userA_Creator.id, name: userA_Creator.name, role: userA_Creator.role },
    });

    // User A attempts approval -> Throws SEGREGATION_OF_DUTIES_VIOLATION
    expect(() => {
      EmployeeReceivableService.approveProposal(proposal, {
        businessId: businessTenantA,
        approver: { id: userA_Creator.id, name: userA_Creator.name, role: userA_Creator.role },
        approvalReason: "Auto-approbation illégale",
      });
    }).toThrow(/SegregationOfDutiesViolation/);

    // User B (second authorized user) approves -> Succeeds
    const { approvedReceivable, journalEntry, ledgerTransactions } =
      EmployeeReceivableService.approveProposal(proposal, {
        businessId: businessTenantA,
        approver: { id: userB_Approver.id, name: userB_Approver.name, role: userB_Approver.role },
        approvalReason: "Approbation valide deuxième regard Finance",
      });

    expect(approvedReceivable.status).toBe("APPROVED_PENDING_RECOVERY");
    expect(approvedReceivable.approverId).toBe(userB_Approver.id);
    expect(approvedReceivable.receivableAccount).toBe("1310_EMPLOYEE_RECEIVABLES");

    // Double-entry GL validation: Dr 1310_EMPLOYEE_RECEIVABLES, Cr 2100_PAYROLL_CLEARING
    expect(ledgerTransactions[0].debit_account).toBe("1310_EMPLOYEE_RECEIVABLES");
    expect(ledgerTransactions[0].credit_account).toBe("2100_PAYROLL_CLEARING");
  });

  // TEST CASE 3: Receivable Creation & Model Alignment
  it("TC3: Approved proposal creates exactly one employee receivable in 1310_EMPLOYEE_RECEIVABLES with correct references", async () => {
    const proposal = EmployeeReceivableService.createProposal({
      businessId: businessTenantA,
      originalPayrollCycleId: sealedCycle.id,
      originalPayrollRecordId: sampleRecord.id,
      employeeId: sampleRecord.employeeId,
      employeeName: sampleRecord.employeeName,
      recoverableAmount: 10000,
      currency: "HTG",
      creator: { id: userA_Creator.id, name: userA_Creator.name, role: userA_Creator.role },
    });

    const { approvedReceivable } = EmployeeReceivableService.approveProposal(proposal, {
      businessId: businessTenantA,
      approver: { id: userB_Approver.id, name: userB_Approver.name, role: userB_Approver.role },
    });

    expect(approvedReceivable.approvedRecoverableAmount).toBe(10000);
    expect(approvedReceivable.approvedRecoverableCents).toBe(1000000);
    expect(approvedReceivable.recoveredAmount).toBe(0);
    expect(approvedReceivable.outstandingAmount).toBe(10000);
    expect(approvedReceivable.receivableAccount).toBe("1310_EMPLOYEE_RECEIVABLES");
  });

  // TEST CASE 4: Partial Repayment
  it("TC4: Partial repayment reduces outstanding balance and posts Dr 1010_BANK, Cr 1310_EMPLOYEE_RECEIVABLES", async () => {
    const proposal = EmployeeReceivableService.createProposal({
      businessId: businessTenantA,
      originalPayrollCycleId: sealedCycle.id,
      originalPayrollRecordId: sampleRecord.id,
      employeeId: sampleRecord.employeeId,
      employeeName: sampleRecord.employeeName,
      recoverableAmount: 10000,
      currency: "HTG",
      creator: { id: userA_Creator.id, name: userA_Creator.name, role: userA_Creator.role },
    });

    const { approvedReceivable } = EmployeeReceivableService.approveProposal(proposal, {
      businessId: businessTenantA,
      approver: { id: userB_Approver.id, name: userB_Approver.name, role: userB_Approver.role },
    });

    // Record partial repayment of 3,000 HTG
    const { updatedReceivable, repayment, journalEntry } =
      EmployeeReceivableService.recordRepayment(approvedReceivable, {
        businessId: businessTenantA,
        amount: 3000,
        paymentMethod: "BANK",
        treasuryAccount: "1010_BANK",
        recordedBy: { id: userB_Approver.id, name: userB_Approver.name, role: userB_Approver.role },
      });

    expect(updatedReceivable.recoveredAmount).toBe(3000);
    expect(updatedReceivable.outstandingAmount).toBe(7000);
    expect(updatedReceivable.status).toBe("PARTIALLY_RECOVERED");
    expect(updatedReceivable.repayments.length).toBe(1);

    // GL Accounting check: Debit 1010_BANK, Credit 1310_EMPLOYEE_RECEIVABLES
    expect(journalEntry.lines[0].accountId).toBe("1010_BANK");
    expect(journalEntry.lines[0].debitCents).toBe(300000);
    expect(journalEntry.lines[1].accountId).toBe("1310_EMPLOYEE_RECEIVABLES");
    expect(journalEntry.lines[1].creditCents).toBe(300000);
  });

  // TEST CASE 5: Full Repayment
  it("TC5: Second repayment of remaining balance fully recovers the receivable (status: RECOVERED)", async () => {
    const proposal = EmployeeReceivableService.createProposal({
      businessId: businessTenantA,
      originalPayrollCycleId: sealedCycle.id,
      originalPayrollRecordId: sampleRecord.id,
      employeeId: sampleRecord.employeeId,
      employeeName: sampleRecord.employeeName,
      recoverableAmount: 10000,
      currency: "HTG",
      creator: { id: userA_Creator.id, name: userA_Creator.name, role: userA_Creator.role },
    });

    const { approvedReceivable } = EmployeeReceivableService.approveProposal(proposal, {
      businessId: businessTenantA,
      approver: { id: userB_Approver.id, name: userB_Approver.name, role: userB_Approver.role },
    });

    // Step 1: 3,000 HTG
    const { updatedReceivable: step1 } = EmployeeReceivableService.recordRepayment(
      approvedReceivable,
      {
        businessId: businessTenantA,
        amount: 3000,
        paymentMethod: "BANK",
        recordedBy: { id: userB_Approver.id, name: userB_Approver.name, role: userB_Approver.role },
      }
    );

    // Step 2: 7,000 HTG
    const { updatedReceivable: step2 } = EmployeeReceivableService.recordRepayment(step1, {
      businessId: businessTenantA,
      amount: 7000,
      paymentMethod: "BANK",
      recordedBy: { id: userB_Approver.id, name: userB_Approver.name, role: userB_Approver.role },
    });

    expect(step2.recoveredAmount).toBe(10000);
    expect(step2.outstandingAmount).toBe(0);
    expect(step2.status).toBe("RECOVERED");
    expect(step2.repayments.length).toBe(2);
  });

  // TEST CASE 6: Overpayment Rejection
  it("TC6: Attempting a repayment exceeding the outstanding balance is rejected", async () => {
    const proposal = EmployeeReceivableService.createProposal({
      businessId: businessTenantA,
      originalPayrollCycleId: sealedCycle.id,
      originalPayrollRecordId: sampleRecord.id,
      employeeId: sampleRecord.employeeId,
      employeeName: sampleRecord.employeeName,
      recoverableAmount: 10000,
      currency: "HTG",
      creator: { id: userA_Creator.id, name: userA_Creator.name, role: userA_Creator.role },
    });

    const { approvedReceivable } = EmployeeReceivableService.approveProposal(proposal, {
      businessId: businessTenantA,
      approver: { id: userB_Approver.id, name: userB_Approver.name, role: userB_Approver.role },
    });

    // Attempting 11,000 HTG repayment on 10,000 HTG outstanding -> Throws ValidationViolation
    expect(() => {
      EmployeeReceivableService.recordRepayment(approvedReceivable, {
        businessId: businessTenantA,
        amount: 11000,
        paymentMethod: "BANK",
        recordedBy: { id: userB_Approver.id, name: userB_Approver.name, role: userB_Approver.role },
      });
    }).toThrow(/ValidationViolation/);
  });

  // TEST CASE 7: Double Submission / Idempotency
  it("TC7: Re-reversing an already-reversed cycle does not generate duplicate recovery proposals", async () => {
    const { reversalCycle, recoveryProposals: props1 } =
      await PayrollService.reversePayrollCycle(
        sealedCycle,
        [sampleRecord],
        businessTenantA,
        {
          currentUser: userA_Creator,
          reason: "First reversal request",
          settlementStatus: "SETTLEMENT_PRESERVED_PENDING_RECOVERY",
        } as any
      );

    expect(props1!.length).toBe(1);

    // Re-attempting reversal on already-reversed cycle -> Throws CYCLES_ALREADY_REVERSED
    await expect(
      PayrollService.reversePayrollCycle(sealedCycle, [sampleRecord], businessTenantA, {
        currentUser: userA_Creator,
        reason: "Duplicate reversal request",
      })
    ).rejects.toThrow(/contre-passation/);
  });

  // TEST CASE 8: Multi-Tenant Isolation
  it("TC8: Tenant B user cannot read, approve or record repayments against Tenant A receivable", async () => {
    const proposal = EmployeeReceivableService.createProposal({
      businessId: businessTenantA,
      originalPayrollCycleId: sealedCycle.id,
      originalPayrollRecordId: sampleRecord.id,
      employeeId: sampleRecord.employeeId,
      employeeName: sampleRecord.employeeName,
      recoverableAmount: 10000,
      currency: "HTG",
      creator: { id: userA_Creator.id, name: userA_Creator.name, role: userA_Creator.role },
    });

    // Tenant B attempts approval -> Throws TENANT_ISOLATION_VIOLATION
    expect(() => {
      EmployeeReceivableService.approveProposal(proposal, {
        businessId: businessTenantB,
        approver: { id: userTenantB.id, name: userTenantB.name, role: userTenantB.role },
      });
    }).toThrow(/MultiTenancyViolation/);
  });
});
