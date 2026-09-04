import { describe, it, expect, vi } from 'vitest';
import { EmployeeSalesSummaryService } from '../EmployeeSalesSummaryService';
import { SalesAggregator } from '../SalesAggregator';
import { CommissionEngine } from '../../CommissionEngine';

// Mock firestore setDoc at top level
vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(() => ({ app: { options: { projectId: 'mocked' } } })),
  memoryLocalCache: vi.fn(() => ({})),
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
  setDoc: vi.fn()
}));

describe('EmployeeSalesSummaryService', () => {
  it('should calculate commission using the historical rate based on sale date', async () => {
    const employee = {
      id: 'emp1',
      email: 'emp@test.com',
    };
    
    const contract = {
      historical_commission_rates: [
        { rate: 0.05, effective_from: '2026-07-01', effective_to: '2026-07-15' },
        { rate: 0.10, effective_from: '2026-07-16', effective_to: '2026-07-31' }
      ]
    };

    const transactions = [
      { id: 'tx1', amount: 1000, date: '2026-07-10', type: 'INCOME', status: 'POSTED', employeeId: 'emp1' }, // Gets 5% = 50
      { id: 'tx2', amount: 1000, date: '2026-07-20', type: 'INCOME', status: 'POSTED', employeeId: 'emp1' }  // Gets 10% = 100
    ];

    const cycle = { id: 'cycle1', status: 'DRAFT', startDate: '2026-07-01', endDate: '2026-07-31' };

    const summary = await EmployeeSalesSummaryService.generateOrFetchSummary({
      businessId: 'biz1',
      cycle: cycle as any,
      employee: employee as any,
      transactions: transactions as any,
      contract
    });

    expect(summary.calculated_commission).toBe(150); // 50 + 100
    expect(summary.included_transaction_ids).toContain('tx1');
    expect(summary.included_transaction_ids).toContain('tx2');
  });

  it('prevents double-counting when draft is regenerated', () => {
    const transactions = [
      { id: 'tx1', amount: 1000, date: '2026-07-10', type: 'INCOME', status: 'POSTED', employeeId: 'emp1', commission_claimed: true, commission_summary_id: 'OTHER_SUMMARY' },
      { id: 'tx2', amount: 1000, date: '2026-07-10', type: 'INCOME', status: 'POSTED', employeeId: 'emp1', commission_claimed: true, commission_summary_id: 'ess_biz1_cycle1_emp1' },
      { id: 'tx3', amount: 1000, date: '2026-07-10', type: 'INCOME', status: 'POSTED', employeeId: 'emp1' },
    ];
    
    // The aggregator should reject tx1 (claimed by other), accept tx2 (claimed by this draft), accept tx3 (unclaimed)
    const eligibleTxs = SalesAggregator.getEligibleTransactions('emp1', transactions as any, '2026-07-01', '2026-07-31', 'emp@test.com', 'ess_biz1_cycle1_emp1');
    
    expect(eligibleTxs.length).toBe(2);
    expect(eligibleTxs.map(t => t.id)).toEqual(['tx2', 'tx3']);
  });

  it('freezes the summary when the cycle is LOCKED', async () => {
    const cycle = { id: 'cycle2', status: 'LOCKED', startDate: '2026-07-01', endDate: '2026-07-31' };
    
    const summary = await EmployeeSalesSummaryService.generateOrFetchSummary({
      businessId: 'biz1',
      cycle: cycle as any,
      employee: { id: 'emp1' } as any,
      transactions: []
    });

    expect(summary.is_frozen).toBe(true);
  });
});
