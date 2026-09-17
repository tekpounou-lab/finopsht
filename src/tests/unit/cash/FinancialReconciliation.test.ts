/**
 * FINOPS ERP — Phase 5 Financial Reconciliation Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { CashBasisEngine } from '../../../domains/cash/engine/CashBasisEngine';
import { buildCashBasisViewModel } from '../../../domains/cash/viewmodel/cashViewModel.builder';
import { FinancialReconciliationEngine } from '../../../domains/cash/reconciliation/FinancialReconciliationEngine';
import type { Invoice, PayrollRecord, LedgerTransaction } from '../../../types';

describe('Phase 5 — Financial Reconciliation & Dual-Basis Bridge', () => {
  const BIZ_ID = 'biz_phase5_test';

  const sampleInvoice: Invoice = {
    id: 'inv_501',
    businessId: BIZ_ID,
    invoiceNumber: 'INV-501',
    clientName: 'Beta Corp',
    totalAmount: 780000,
    amountPaid: 780000,
    amount_cents: 78000000,
    status: 'PAID',
    paymentStatus: 'PAID',
    isPaid: true,
    paidAt: '2026-08-15T10:00:00.000Z',
    createdAt: '2026-08-01T08:00:00.000Z',
    currency: 'HTG',
  } as unknown as Invoice;

  const samplePayroll: PayrollRecord = {
    id: 'pay_501',
    business_id: BIZ_ID,
    employeeId: 'emp_02',
    employeeName: 'Marie Curie',
    netPaid: 482500,
    net_salary_cents: 48250000,
    grossSalary: 515000,
    status: 'PAID',
    paidAt: '2026-08-31',
    cycleId: 'cycle_2026_08',
    department_id: 'dept_dev',
    cnssDeduction: 0,
    cnsDeduction: 0,
    commissions: 0,
    advancesTreated: 0,
    hashSignature: 'sig_501',
  } as unknown as PayrollRecord;

  const sampleLedgerRent: LedgerTransaction = {
    id: 'tx_rent_501',
    business_id: BIZ_ID,
    branchId: 'branch_main',
    description: 'Loyer août',
    category: 'RENT',
    signerId: 'user_admin',
    date: '2026-08-05',
    amount: 210000,
    amount_cents: 21000000,
    type: 'EXPENSE',
    status: 'POSTED',
    debit_account: '6000_RENT',
    credit_account: '1010_BANK',
    source: 'SYSTEM',
    isImmutable: true,
    currency: 'HTG',
  };

  it('1. Test 1 — Identical metrics when cash and accrual match exactly', () => {
    const statement = CashBasisEngine.executePipeline(
      { invoices: [sampleInvoice], payrollRecords: [samplePayroll], ledgerTransactions: [sampleLedgerRent] },
      { businessId: BIZ_ID, startDate: '2026-08-01', endDate: '2026-08-31', currency: 'HTG' }
    );
    const vm = buildCashBasisViewModel(statement);

    const rec = FinancialReconciliationEngine.reconcile(vm, {
      revenue: 780000,
      personnelCost: 482500,
      operatingExpenses: 210000,
      netResult: 87500,
    });

    expect(rec.variance.revenue).toBe(0);
    expect(rec.variance.personnelCost).toBe(0);
    expect(rec.variance.operatingExpenses).toBe(0);
    expect(rec.variance.netResult).toBe(0);
  });

  it('2. Test 2 — Unpaid Revenue Variance (Accrual > Cash)', () => {
    // Cash received: 600,000, Accrual revenue: 780,000 => Variance = +180,000
    const partialInvoice: Invoice = {
      ...sampleInvoice,
      totalAmount: 600000,
      amountPaid: 600000,
      amount_cents: 60000000,
    } as unknown as Invoice;

    const statement = CashBasisEngine.executePipeline(
      { invoices: [partialInvoice], payrollRecords: [], ledgerTransactions: [] },
      { businessId: BIZ_ID, startDate: '2026-08-01', endDate: '2026-08-31', currency: 'HTG' }
    );
    const vm = buildCashBasisViewModel(statement);

    const rec = FinancialReconciliationEngine.reconcile(vm, {
      revenue: 780000,
      personnelCost: 0,
      operatingExpenses: 0,
      netResult: 780000,
      uncollectedInvoices: [
        { id: 'inv_502', invoiceNumber: 'INV-502', clientName: 'Gamma LLC', amount: 180000, economicDate: '2026-08-20' },
      ],
    });

    expect(rec.cash.revenue).toBe(600000);
    expect(rec.accrual.revenue).toBe(780000);
    expect(rec.variance.revenue).toBe(180000);
    expect(rec.items.length).toBe(1);
    expect(rec.items[0].category).toBe('UNPAID_REVENUE');
    expect(rec.explanations.length).toBeGreaterThan(0);
  });

  it('3. Test 4 — Unpaid Payroll Variance (Accrual > Cash)', () => {
    // Cash paid for payroll: 482,500, Accrual cost: 515,000 => Variance = +32,500
    const statement = CashBasisEngine.executePipeline(
      { invoices: [], payrollRecords: [samplePayroll], ledgerTransactions: [] },
      { businessId: BIZ_ID, startDate: '2026-08-01', endDate: '2026-08-31', currency: 'HTG' }
    );
    const vm = buildCashBasisViewModel(statement);

    const rec = FinancialReconciliationEngine.reconcile(vm, {
      revenue: 0,
      personnelCost: 515000,
      operatingExpenses: 0,
      netResult: -515000,
      unpaidPayrolls: [
        { id: 'pay_502', employeeName: 'Albert Einstein', grossSalary: 32500, netSalary: 32500, economicDate: '2026-08-31' },
      ],
    });

    expect(rec.cash.personnelCost).toBe(482500);
    expect(rec.accrual.personnelCost).toBe(515000);
    expect(rec.variance.personnelCost).toBe(32500);
    expect(rec.items[0].category).toBe('UNPAID_PAYROLL');
  });

  it('4. Test 13 — Tenant Isolation Rule', () => {
    const invoiceBizA: Invoice = {
      ...sampleInvoice,
      businessId: 'biz_A',
    } as unknown as Invoice;

    const statementBizA = CashBasisEngine.executePipeline(
      { invoices: [invoiceBizA], payrollRecords: [], ledgerTransactions: [] },
      { businessId: 'biz_A', startDate: '2026-08-01', endDate: '2026-08-31', currency: 'HTG' }
    );
    const vmBizA = buildCashBasisViewModel(statementBizA);

    const recBizA = FinancialReconciliationEngine.reconcile(vmBizA, {
      revenue: 780000,
      personnelCost: 0,
      operatingExpenses: 0,
      netResult: 780000,
    });

    expect(recBizA.businessId).toBe('biz_A');
    expect(recBizA.cash.revenue).toBe(780000);
  });
});
