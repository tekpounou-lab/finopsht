/**
 * FINOPS ERP — Phase 4 Cash Basis ViewModel & Selectors Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { CashBasisEngine } from '../../../domains/cash/engine/CashBasisEngine';
import { buildCashBasisViewModel } from '../../../domains/cash/viewmodel/cashViewModel.builder';
import {
  selectExecutiveSummary,
  selectWorkforceSummary,
  selectPayrollSummary,
  selectDepartmentSummary,
  selectReportsSummary,
  selectPredictiveSummary,
} from '../../../domains/cash/viewmodel/cashSelectors';
import type { LedgerTransaction, PayrollRecord, Invoice } from '../../../types';

describe('Phase 4 — Cash Basis ViewModel & Selectors', () => {
  const BIZ_ID = 'biz_test_phase4';

  const sampleInvoice: Invoice = {
    id: 'inv_401',
    businessId: BIZ_ID,
    invoiceNumber: 'INV-401',
    clientName: 'Client Alpha',
    amount: 200000,
    totalAmount: 200000,
    amount_cents: 20000000,
    total_cents: 20000000,
    status: 'PAID',
    paymentStatus: 'PAID',
    paidAt: '2026-08-15',
    createdAt: '2026-08-01T08:00:00.000Z',
    currency: 'HTG',
  } as unknown as Invoice;



  const samplePayroll: PayrollRecord = {
    id: 'pay_401',
    business_id: BIZ_ID,
    employeeId: 'emp_01',
    employeeName: 'Jean Baptiste',
    netPaid: 90000,
    net_salary_cents: 9000000,
    grossSalary: 110000,
    status: 'PAID',
    paidAt: '2026-08-31',
    cycleId: 'cycle_2026_08',
    department_id: 'dept_dev',
    cnssDeduction: 0,
    cnsDeduction: 0,
    commissions: 0,
    advancesTreated: 0,
    hashSignature: 'sig_401',
  } as unknown as PayrollRecord;



  const sampleLedgerRent: LedgerTransaction = {
    id: 'tx_rent_401',
    business_id: BIZ_ID,
    branchId: 'branch_main',
    description: 'Loyer Mensuel',
    category: 'RENT',
    signerId: 'user_admin',
    date: '2026-08-05',
    amount: 30000,
    amount_cents: 3000000,
    type: 'EXPENSE',
    status: 'POSTED',
    debit_account: '6000_RENT',
    credit_account: '1010_BANK',
    source: 'SYSTEM',
    isImmutable: true,
    currency: 'HTG',
    departmentId: 'dept_admin',
  };



  it('1. builds a canonical CashBasisViewModel directly from CashBasisEngine output', () => {
    const statement = CashBasisEngine.executePipeline(
      {
        invoices: [sampleInvoice],
        payrollRecords: [samplePayroll],
        ledgerTransactions: [sampleLedgerRent],
      },
      {
        businessId: BIZ_ID,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        currency: 'HTG',
      }
    );

    const vm = buildCashBasisViewModel(statement, {
      employeeCount: 5,
      departmentNames: { dept_dev: 'Développement', dept_admin: 'Administration' },
    });

    expect(vm.businessId).toBe(BIZ_ID);
    expect(vm.executive.totalCashIn).toBe(200000);
    expect(vm.executive.totalCashOut).toBe(120000); // 90,000 payroll + 30,000 rent
    expect(vm.executive.netCashFlow).toBe(80000);
    expect(vm.executive.endingCash).toBe(vm.executive.beginningCash + 80000);
  });

  it('2. selectors extract exact data without financial recalculation', () => {
    const statement = CashBasisEngine.executePipeline(
      {
        invoices: [sampleInvoice],
        payrollRecords: [samplePayroll],
        ledgerTransactions: [sampleLedgerRent],
      },
      {
        businessId: BIZ_ID,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        currency: 'HTG',
      }
    );

    const vm = buildCashBasisViewModel(statement);

    const exec = selectExecutiveSummary(vm);
    expect(exec.totalCashIn).toBe(200000);
    expect(exec.totalCashOut).toBe(120000);

    const wf = selectWorkforceSummary(vm);
    expect(wf.totalPersonnelCashPaid).toBe(90000);

    const pay = selectPayrollSummary(vm);
    expect(pay.salariesPaid).toBe(90000);

    const dept = selectDepartmentSummary(vm);
    expect(dept.departments.length).toBeGreaterThan(0);

    const rep = selectReportsSummary(vm);
    expect(rep.summaryParagraph).toContain('200,000');


    const pred = selectPredictiveSummary(vm);
    expect(pred.liquidityRiskLevel).toBe('LOW');
  });

  it('3. guarantees zero double counting when matching Ledger transactions exist', () => {
    const matchingLedgerInvoice: LedgerTransaction = {
      id: 'tx_gl_inv_401',
      business_id: BIZ_ID,
      branchId: 'branch_main',
      description: 'Facture Client Alpha',
      category: 'REVENUE',
      signerId: 'user_admin',
      date: '2026-08-15',
      amount: 200000,
      amount_cents: 20000000,
      type: 'INCOME',
      status: 'POSTED',
      debit_account: '1010_BANK',
      credit_account: '4000_REVENUE',
      source: 'SYSTEM',
      isImmutable: true,
      currency: 'HTG',
      metadata: { crmInvoiceId: 'inv_401' },
    };



    const statement = CashBasisEngine.executePipeline(
      {
        invoices: [sampleInvoice],
        payrollRecords: [samplePayroll],
        ledgerTransactions: [sampleLedgerRent, matchingLedgerInvoice],
      },
      {
        businessId: BIZ_ID,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        currency: 'HTG',
      }
    );

    const vm = buildCashBasisViewModel(statement);

    // Matching GL Invoice was suppressed, so totalCashIn remains exactly 200,000 (NOT 400,000)
    expect(vm.executive.totalCashIn).toBe(200000);
    expect(vm.suppressedMovements.length).toBe(1);
  });
});
