import { describe, it, expect } from 'vitest';
import {
  CashBasisEngine,
  CrossSourceCashReconciliationEngine,
  calculateBeginningCash,
  NormalizedCashMovement,
} from '../../../domains/cash';
import type { PayrollRecord, PayrollCycle, LedgerTransaction } from '../../../types';
import type { Invoice, InvoicePayment } from '../../../types/crm';

describe('Cash Basis Engine & Reconciliation — Phase 3 Test Suite', () => {
  const BIZ_ID = 'biz_enterprise_99';

  // Sample data setup
  const basePayrollCycle: PayrollCycle = {
    id: 'cycle_2026_08',
    business_id: BIZ_ID,
    label: 'Août 2026',
    cycleName: 'Août 2026',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: 'PAID',
    disbursedAt: '2026-08-31T15:00:00.000Z',
    recordsCount: 1,
    total_gross_cents: 10000000,
    total_net_cents: 8000000,
    total_deductions_cents: 2000000,
  };

  const basePayrollRecord: PayrollRecord = {
    id: 'pr_rec_801',
    cycleId: 'cycle_2026_08',
    business_id: BIZ_ID,
    employeeId: 'emp_001',
    employeeName: 'Marie Curie',
    department_id: 'dept_research',
    branch_id: 'branch_main',
    grossSalary: 100000,
    netPaid: 80000,
    net_salary_cents: 8000000,
    status: 'PAID',
    cnssDeduction: 0,
    cnsDeduction: 0,
    commissions: 0,
    advancesTreated: 0,
    hashSignature: 'sig_801',
  };

  const baseInvoice: Invoice = {
    id: 'inv_2026_555',
    businessId: BIZ_ID,
    invoiceNumber: 'INV-2026-555',
    clientNif: '000-000-000-1',
    clientName: 'Global Tech',
    clientEmail: 'billing@global.com',
    status: 'PAID',
    issueDate: '2026-08-01',
    dueDate: '2026-08-15',
    paidAt: '2026-08-10T09:00:00.000Z',
    items: [],
    subtotal: 150000,
    totalDiscount: 0,
    taxAmount: 0,
    totalAmount: 150000,
    amountPaid: 150000,
    isPaid: true,
    currency: 'HTG',
    paymentMethod: 'BANK_TRANSFER',
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-10T09:00:00.000Z',
  };

  const matchingPayrollLedgerTx: LedgerTransaction = {
    id: 'tx_gl_payroll_801',
    business_id: BIZ_ID,
    branchId: 'branch_main',
    signerId: 'user_admin',
    type: 'PAYROLL',
    amount: 80000,
    amount_cents: 8000000,
    description: 'Comptabilisation écriture paie',
    date: '2026-08-31',
    category: 'PAYROLL',
    status: 'POSTED',
    debit_account: '5100_PAYROLL_EXPENSE',
    credit_account: '1010_BANK',
    source: 'PAYROLL_ENGINE',
    isImmutable: true,
    currency: 'HTG',
    metadata: {
      payrollCycleId: 'cycle_2026_08',
      isPayrollEngine: true,
    },
  };

  const matchingInvoiceLedgerTx: LedgerTransaction = {
    id: 'tx_gl_inv_555',
    business_id: BIZ_ID,
    branchId: 'branch_main',
    signerId: 'user_admin',
    type: 'INCOME',
    amount: 150000,
    amount_cents: 15000000,
    description: 'Comptabilisation encaissement facture INV-2026-555',
    date: '2026-08-10',
    category: 'SALES',
    status: 'POSTED',
    debit_account: '1010_BANK',
    credit_account: '4000_REVENUE',
    source: 'SYSTEM',
    isImmutable: true,
    currency: 'HTG',
    metadata: {
      crmInvoiceId: 'inv_2026_555',
      isInvoicePayment: true,
    },
  };

  const directExpenseLedgerTx: LedgerTransaction = {
    id: 'tx_gl_rent_101',
    business_id: BIZ_ID,
    branchId: 'branch_main',
    signerId: 'user_admin',
    type: 'EXPENSE',
    amount: 25000,
    amount_cents: 2500000,
    description: 'Paiement Loyer bureau',
    date: '2026-08-05',
    category: 'OPERATING_EXPENSES',
    status: 'POSTED',
    debit_account: '5200_RENT',
    credit_account: '1010_BANK',
    source: 'MANUAL',
    isImmutable: true,
    currency: 'HTG',
  };

  // =========================================================================
  // 1. CrossSourceCashReconciliationEngine Tests
  // =========================================================================
  describe('1. CrossSourceCashReconciliationEngine', () => {
    it('1.1. suppresses Ledger GL payroll movement when matching Operational Payroll is present', () => {
      const statement = CashBasisEngine.executePipeline(
        {
          payrollRecords: [basePayrollRecord],
          payrollCycles: [basePayrollCycle],
          ledgerTransactions: [matchingPayrollLedgerTx],
        },
        {
          businessId: BIZ_ID,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        }
      );

      expect(statement.periodMovements).toHaveLength(1);
      expect(statement.periodMovements[0].sourceModule).toBe('PAYROLL');
      expect(statement.reconciliationAudit.suppressedCount).toBe(1);
      expect(statement.suppressedMovements[0].reason).toContain('Payroll');
      expect(statement.totalOutflow).toBe(80000);
    });

    it('1.2. suppresses Ledger GL invoice movement when matching Operational Invoice is present', () => {
      const statement = CashBasisEngine.executePipeline(
        {
          invoices: [baseInvoice],
          ledgerTransactions: [matchingInvoiceLedgerTx],
        },
        {
          businessId: BIZ_ID,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        }
      );

      expect(statement.periodMovements).toHaveLength(1);
      expect(statement.periodMovements[0].sourceModule).toBe('INVOICE');
      expect(statement.reconciliationAudit.suppressedCount).toBe(1);
      expect(statement.totalInflow).toBe(150000);
    });

    it('1.3. retains unlinked direct Ledger expenses alongside operational sources', () => {
      const statement = CashBasisEngine.executePipeline(
        {
          invoices: [baseInvoice],
          payrollRecords: [basePayrollRecord],
          payrollCycles: [basePayrollCycle],
          ledgerTransactions: [
            matchingPayrollLedgerTx,
            matchingInvoiceLedgerTx,
            directExpenseLedgerTx,
          ],
        },
        {
          businessId: BIZ_ID,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        }
      );

      expect(statement.periodMovements).toHaveLength(3); // Invoice (150k), Payroll (80k), Rent GL (25k)
      expect(statement.totalInflow).toBe(150000);
      expect(statement.totalOutflow).toBe(105000); // 80k + 25k
      expect(statement.netCashFlow).toBe(45000);
      expect(statement.reconciliationAudit.suppressedCount).toBe(2);
    });
  });

  // =========================================================================
  // 2. Beginning Cash & Period Boundary Tests
  // =========================================================================
  describe('2. Beginning Cash & Period Calculations', () => {
    const julyIncomeTx: LedgerTransaction = {
      ...directExpenseLedgerTx,
      id: 'tx_july_income',
      type: 'INCOME',
      amount: 200000,
      amount_cents: 20000000,
      description: 'Encaissement Juillet',
      date: '2026-07-20',
      debit_account: '1010_BANK',
      credit_account: '4000_REVENUE',
    };

    const julyExpenseTx: LedgerTransaction = {
      ...directExpenseLedgerTx,
      id: 'tx_july_expense',
      type: 'EXPENSE',
      amount: 50000,
      amount_cents: 5000000,
      description: 'Loyer Juillet',
      date: '2026-07-05',
      debit_account: '5200_RENT',
      credit_account: '1010_BANK',
    };

    it('2.1. calculates beginningCash accurately from prior cash movements and opening balance', () => {
      const statement = CashBasisEngine.executePipeline(
        {
          invoices: [baseInvoice], // August 10
          ledgerTransactions: [julyIncomeTx, julyExpenseTx, directExpenseLedgerTx],
        },
        {
          businessId: BIZ_ID,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          openingBalance: 10000, // Initial configured balance = 10k
        }
      );

      // July Net: +200k - 50k = +150k
      // Beginning Cash = 10k (opening) + 150k (July net) = 160k
      expect(statement.beginningCash).toBe(160000);

      // August Net: +150k (Invoice) - 25k (Rent) = +125k
      expect(statement.totalInflow).toBe(150000);
      expect(statement.totalOutflow).toBe(25000);
      expect(statement.netCashFlow).toBe(125000);

      // Ending Cash = 160k + 125k = 285k
      expect(statement.endingCash).toBe(285000);
    });
  });

  // =========================================================================
  // 3. Internal Transfer Neutrality Tests
  // =========================================================================
  describe('3. Internal Transfer Neutrality', () => {
    const transferTx: LedgerTransaction = {
      ...directExpenseLedgerTx,
      id: 'tx_transfer_50k',
      type: 'TRANSFER',
      amount: 50000,
      amount_cents: 5000000,
      description: 'Virement Caisse vers Banque',
      date: '2026-08-12',
      category: 'TREASURY_TRANSFER',
      debit_account: '1010_BANK',
      credit_account: '1000_CASH',
    };

    it('3.1. preserves 0 net consolidated cash flow impact for internal treasury transfers', () => {
      const statement = CashBasisEngine.executePipeline(
        {
          ledgerTransactions: [transferTx],
        },
        {
          businessId: BIZ_ID,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        }
      );

      expect(statement.periodMovements).toHaveLength(1);
      expect(statement.totalInflow).toBe(0);
      expect(statement.totalOutflow).toBe(0);
      expect(statement.netCashFlow).toBe(0);
    });
  });

  // =========================================================================
  // 4. Multi-Currency & Tenant Isolation Tests
  // =========================================================================
  describe('4. Multi-Currency & Tenant Isolation', () => {
    const usdInvoice: Invoice = {
      ...baseInvoice,
      id: 'inv_usd_001',
      currency: 'USD',
      totalAmount: 1000,
      amountPaid: 1000,
    };

    const otherBizInvoice: Invoice = {
      ...baseInvoice,
      id: 'inv_other_biz',
      businessId: 'biz_other_corp',
      totalAmount: 900000,
      amountPaid: 900000,
    };

    it('4.1. filters strictly by currency and excludes cross-currency mixing', () => {
      const htgStatement = CashBasisEngine.executePipeline(
        {
          invoices: [baseInvoice, usdInvoice],
        },
        {
          businessId: BIZ_ID,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          currency: 'HTG',
        }
      );

      expect(htgStatement.periodMovements).toHaveLength(1);
      expect(htgStatement.totalInflow).toBe(150000);

      const usdStatement = CashBasisEngine.executePipeline(
        {
          invoices: [baseInvoice, usdInvoice],
        },
        {
          businessId: BIZ_ID,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          currency: 'USD',
        }
      );

      expect(usdStatement.periodMovements).toHaveLength(1);
      expect(usdStatement.totalInflow).toBe(1000);
    });

    it('4.2. enforces strict tenant isolation and ignores movements for other business IDs', () => {
      const statement = CashBasisEngine.executePipeline(
        {
          invoices: [baseInvoice, otherBizInvoice],
        },
        {
          businessId: BIZ_ID,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        }
      );

      expect(statement.periodMovements).toHaveLength(1);
      expect(statement.totalInflow).toBe(150000); // Only BIZ_ID invoice
    });
  });

  // =========================================================================
  // 5. Idempotence & Rerun Safety Tests
  // =========================================================================
  describe('5. Idempotence & Rerun Safety', () => {
    it('5.1. produces identical results when executed multiple times', () => {
      const run1 = CashBasisEngine.executePipeline(
        {
          invoices: [baseInvoice],
          payrollRecords: [basePayrollRecord],
          payrollCycles: [basePayrollCycle],
          ledgerTransactions: [matchingPayrollLedgerTx, directExpenseLedgerTx],
        },
        {
          businessId: BIZ_ID,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        }
      );

      const run2 = CashBasisEngine.executePipeline(
        {
          invoices: [baseInvoice],
          payrollRecords: [basePayrollRecord],
          payrollCycles: [basePayrollCycle],
          ledgerTransactions: [matchingPayrollLedgerTx, directExpenseLedgerTx],
        },
        {
          businessId: BIZ_ID,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        }
      );

      expect(run1.beginningCash).toBe(run2.beginningCash);
      expect(run1.endingCash).toBe(run2.endingCash);
      expect(run1.netCashFlow).toBe(run2.netCashFlow);
      expect(run1.periodMovements).toHaveLength(run2.periodMovements.length);
      expect(run1.periodMovements.map((m) => m.id)).toEqual(
        run2.periodMovements.map((m) => m.id)
      );
    });
  });
});
