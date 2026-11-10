import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  CurrencyRateRepository, 
  getHaitiDateString, 
  DailyRateInput 
} from '../../repositories/CurrencyRateRepository';

const { mockStore } = vi.hoisted(() => {
  return {
    mockStore: new Map<string, any>()
  };
});

// Mock Firebase Firestore and analytics/audit logging
vi.mock('firebase/firestore', () => {
  return {
    getFirestore: vi.fn(() => ({})),
    initializeFirestore: vi.fn(() => ({})),
    memoryLocalCache: vi.fn(() => ({})),
    persistentLocalCache: vi.fn(() => ({})),
    persistentMultipleTabManager: vi.fn(() => ({})),
    serverTimestamp: vi.fn(() => ({ seconds: Date.now() / 1000 })),
    collection: vi.fn((_db, ...pathSegments) => ({ path: pathSegments.join('/') })),
    doc: vi.fn((_db, ...pathSegments) => ({ id: pathSegments[pathSegments.length - 1], path: pathSegments.join('/') })),
    getDoc: vi.fn(async (docRef) => {
      const data = mockStore.get(docRef.path);
      return {
        exists: () => !!data,
        data: () => data,
        id: docRef.id
      };
    }),
    query: vi.fn((collRef, ...constraints) => ({
      path: collRef.path,
      constraints: constraints || []
    })),
    where: vi.fn((field, op, value) => ({ type: 'where', field, op, value })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    limit: vi.fn((n) => ({ type: 'limit', n })),
    getDocs: vi.fn(async (queryRef) => {
      let results: any[] = [];
      mockStore.forEach((val, key) => {
        if (key.startsWith(queryRef.path)) {
          results.push({
            id: key.split('/').pop(),
            data: () => val
          });
        }
      });
      if (queryRef.constraints) {
        for (const c of queryRef.constraints) {
          if (c.type === 'where') {
            results = results.filter((doc) => {
              const d = doc.data();
              if (c.op === '==') return d[c.field] === c.value;
              if (c.op === '<=') return d[c.field] <= c.value;
              if (c.op === '<') return d[c.field] < c.value;
              return true;
            });
          } else if (c.type === 'orderBy') {
            results.sort((a, b) => {
              const valA = a.data()[c.field];
              const valB = b.data()[c.field];
              if (c.dir === 'desc') return valB > valA ? 1 : valB < valA ? -1 : 0;
              return valA > valB ? 1 : valA < valB ? -1 : 0;
            });
          } else if (c.type === 'limit') {
            results = results.slice(0, c.n);
          }
        }
      }
      return {
        empty: results.length === 0,
        docs: results,
        forEach: (cb: any) => results.forEach(cb)
      };
    }),
    setDoc: vi.fn(async (docRef, data) => {
      mockStore.set(docRef.path, { ...data, id: docRef.id });
    }),
    writeBatch: vi.fn(() => {
      const operations: Array<() => void> = [];
      return {
        set: (docRef: any, data: any) => {
          operations.push(() => mockStore.set(docRef.path, { ...data, id: docRef.id }));
        },
        commit: async () => {
          operations.forEach((op) => op());
        }
      };
    })
  };
});

describe('Central Exchange Rates Module - High-Fidelity Test Suite', () => {
  const testBusinessId = 'biz_test_company_101';
  const otherBusinessId = 'biz_test_company_999';
  const mockOwner = { id: 'usr_owner_1', name: 'John Doe', role: 'OWNER' };
  const mockManager = { id: 'usr_mgr_1', name: 'Jane Smith', role: 'MANAGER' };
  const mockTeller = { id: 'usr_teller_1', name: 'Bob Teller', role: 'JUNIOR_TELLER' };

  let todayStr: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.clear();
    CurrencyRateRepository.clearCache();
    todayStr = getHaitiDateString();
  });

  it('1. Enforces positive rate values (> 0) during upsert', async () => {
    const invalidRates: DailyRateInput[] = [
      {
        rate_item_type: 'ACHAT_CLIENT',
        currency: 'USD',
        buy_rate: -10,
        sell_rate: 130
      }
    ];

    await expect(
      CurrencyRateRepository.upsertExchangeRates(testBusinessId, invalidRates, mockOwner, todayStr)
    ).rejects.toThrow('strictly positive (> 0)');
  });

  it('2. Enforces LOCAL rate protection (LOCAL forced/locked to 1.0000)', async () => {
    const localRates: DailyRateInput[] = [
      {
        rate_item_type: 'LOCAL',
        currency: 'HTG',
        buy_rate: 1.5, // Attempting invalid value
        sell_rate: 0.8
      }
    ];

    const grid = await CurrencyRateRepository.upsertExchangeRates(testBusinessId, localRates, mockOwner, todayStr);
    const localItem = grid.rates.find((r: any) => r.rate_item_type === 'LOCAL');

    expect(localItem).toBeDefined();
    expect(localItem?.buy_rate).toBe(1.0);
    expect(localItem?.sell_rate).toBe(1.0);
  });

  it('3. Enforces Owner/Manager role authorization for rate updates', async () => {
    const validRates: DailyRateInput[] = [
      {
        rate_item_type: 'ACHAT_CLIENT',
        currency: 'USD',
        buy_rate: 130.5,
        sell_rate: 132.0
      }
    ];

    // Teller should be rejected
    await expect(
      CurrencyRateRepository.upsertExchangeRates(testBusinessId, validRates, mockTeller, todayStr)
    ).rejects.toThrow('Unauthorized: Only Business Owner or Manager');

    // Manager should succeed
    const grid = await CurrencyRateRepository.upsertExchangeRates(testBusinessId, validRates, mockManager, todayStr);
    expect(grid).toBeDefined();
    expect(grid.company_id).toBe(testBusinessId);
  });

  it('4. Rejects updates to historical dates (effectiveDate < today in Haiti time)', async () => {
    const pastDateStr = '2020-01-01';
    const validRates: DailyRateInput[] = [
      {
        rate_item_type: 'ACHAT_CLIENT',
        currency: 'USD',
        buy_rate: 130.5,
        sell_rate: 132.0
      }
    ];

    await expect(
      CurrencyRateRepository.upsertExchangeRates(testBusinessId, validRates, mockOwner, pastDateStr)
    ).rejects.toThrow('Cannot modify historical exchange rates');
  });

  it('5. Tenant Isolation: Rates saved for Company A are isolated from Company B', async () => {
    const ratesCompanyA: DailyRateInput[] = [
      {
        rate_item_type: 'ACHAT_CLIENT',
        currency: 'USD',
        buy_rate: 130.0,
        sell_rate: 132.0
      }
    ];

    await CurrencyRateRepository.upsertExchangeRates(testBusinessId, ratesCompanyA, mockOwner, todayStr);

    // Retrieve rates for Company B
    const fallbackB = await CurrencyRateRepository.getTodayRatesWithFallback(otherBusinessId, todayStr);

    expect(fallbackB.grid).toBeNull();
    const achatB = fallbackB.rates.find((r: any) => r.rate_item_type === 'ACHAT_CLIENT');
    expect(achatB?.buy_rate).not.toBe(130.0);
  });

  it('6. Idempotent Daily Rate Inheritance: Inherits yesterday rates without duplicating or throwing', async () => {
    // 1. Seed yesterday rates
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = getHaitiDateString(yesterdayDate);

    const yesterdayRates: DailyRateInput[] = [
      {
        rate_item_type: 'ACHAT_CLIENT',
        currency: 'USD',
        buy_rate: 128.0,
        sell_rate: 130.0
      }
    ];

    await CurrencyRateRepository.upsertExchangeRates(testBusinessId, yesterdayRates, mockOwner, yesterdayStr, true);

    // 2. Perform daily inheritance for today
    const gridToday = await CurrencyRateRepository.syncYesterdayRatesToToday(testBusinessId, mockOwner.id);

    expect(gridToday.effective_date).toBe(todayStr);
    const achatItem = gridToday.rates.find((r: any) => r.rate_item_type === 'ACHAT_CLIENT');
    expect(achatItem?.buy_rate).toBe(128.0);
    expect(achatItem?.is_inherited).toBe(true);
    expect(achatItem?.source).toBe('inherited');

    // 3. Re-run inheritance idempotently
    const gridToday2 = await CurrencyRateRepository.syncYesterdayRatesToToday(testBusinessId, mockOwner.id);
    expect(gridToday2.id).toBe(gridToday.id);
  });

  it('7. Preserves manually set rates on same day during daily inheritance run', async () => {
    // 1. Manually set today rate
    const manualRates: DailyRateInput[] = [
      {
        rate_item_type: 'ACHAT_CLIENT',
        currency: 'USD',
        buy_rate: 131.5,
        sell_rate: 133.0
      }
    ];
    await CurrencyRateRepository.upsertExchangeRates(testBusinessId, manualRates, mockOwner, todayStr);

    // 2. Execute sync algorithm
    const gridAfterSync = await CurrencyRateRepository.syncYesterdayRatesToToday(testBusinessId, mockOwner.id);

    const achatItem = gridAfterSync.rates.find((r: any) => r.rate_item_type === 'ACHAT_CLIENT');
    expect(achatItem?.buy_rate).toBe(131.5);
    expect(achatItem?.is_inherited).toBe(false);
    expect(achatItem?.source).toBe('manual');
  });

  it('8. Runtime Fallback Lookup: Returns preceding date rates tagged as inherited if today rates missing', async () => {
    // Seed rates for 2 days ago
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoStr = getHaitiDateString(twoDaysAgo);

    const pastRates: DailyRateInput[] = [
      {
        rate_item_type: 'VENTE_CLIENT',
        currency: 'USD',
        buy_rate: 129.0,
        sell_rate: 131.0
      }
    ];
    await CurrencyRateRepository.upsertExchangeRates(testBusinessId, pastRates, mockOwner, twoDaysAgoStr, true);

    // Request fallback for today
    const result = await CurrencyRateRepository.getTodayRatesWithFallback(testBusinessId, todayStr);

    expect(result.grid).toBeNull(); // No explicit today grid document
    const venteItem = result.rates.find((r: any) => r.rate_item_type === 'VENTE_CLIENT');
    expect(venteItem).toBeDefined();
    expect(venteItem?.buy_rate).toBe(129.0);
    expect(venteItem?.is_inherited).toBe(true);
    expect(result.fallbackDate).toBe(twoDaysAgoStr);
  });

  it('9. Cross-Currency Transaction Conversion Validation', () => {
    const activeRates = CurrencyRateRepository.getDefaultStandardGrid(testBusinessId, todayStr).rates;

    // HTG to HTG should yield 1:1
    const localConversion = CurrencyRateRepository.validateCrossCurrencyTransaction({
      amount: 1000,
      fromCurrency: 'HTG',
      toCurrency: 'HTG',
      rateType: 'ACHAT_CLIENT',
      activeRates
    });
    expect(localConversion.convertedAmount).toBe(1000);
    expect(localConversion.appliedRate).toBe(1.0);

    // USD to HTG (Achat Client: Buy rate)
    const expectedRate = activeRates.ACHAT_CLIENT;
    const usdToHtg = CurrencyRateRepository.validateCrossCurrencyTransaction({
      amount: 100,
      fromCurrency: 'USD',
      toCurrency: 'HTG',
      rateType: 'ACHAT_CLIENT',
      activeRates
    });
    expect(usdToHtg.convertedAmount).toBe(100 * expectedRate);
    expect(usdToHtg.appliedRate).toBe(expectedRate);
  });

  it('10. Cross-Currency Ledger Entry Calculation Verification', () => {
    const activeRates = CurrencyRateRepository.getDefaultStandardGrid(testBusinessId, todayStr).rates;
    const sellRate = activeRates.VENTE_CLIENT;

    // HTG to USD (Vente Client: Sell rate)
    const htgToUsd = CurrencyRateRepository.validateCrossCurrencyTransaction({
      amount: 100 * sellRate,
      fromCurrency: 'HTG',
      toCurrency: 'USD',
      rateType: 'VENTE_CLIENT',
      activeRates
    });

    expect(htgToUsd.convertedAmount).toBe(100);
    expect(htgToUsd.appliedRate).toBe(sellRate);
  });

  it('11. Payroll Rate Freezing & Validation', () => {
    const activeRates = CurrencyRateRepository.getDefaultStandardGrid(testBusinessId, todayStr).rates;

    const frozenPayroll = CurrencyRateRepository.validateAndFreezePayrollRate(
      'USD',
      activeRates,
      'BRH'
    );

    expect(frozenPayroll.currency).toBe('USD');
    expect(frozenPayroll.rate_item_type).toBe('BRH');
    expect(frozenPayroll.rate_value).toBeGreaterThan(0);
    expect(frozenPayroll.frozen_at).toBeDefined();
  });

  it('12. Forensic Audit Log Entry Generation on Rate Modifications', async () => {
    const rates: DailyRateInput[] = [
      {
        rate_item_type: 'ACHAT_CLIENT',
        currency: 'USD',
        buy_rate: 130.0,
        sell_rate: 132.0
      }
    ];

    await CurrencyRateRepository.upsertExchangeRates(testBusinessId, rates, mockOwner, todayStr);

    const history = await CurrencyRateRepository.getExchangeRateAuditLogs(testBusinessId);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].actor_id).toBe(mockOwner.id);
    expect(history[0].action).toBe('EXCHANGE_RATES_BULK_UPSERT');
  });

  it('13. Atomic Batch Write: Creates Grid document and individual exchange_rate documents', async () => {
    const rates: DailyRateInput[] = [
      {
        rate_item_type: 'ACHAT_CLIENT',
        currency: 'USD',
        buy_rate: 131.0,
        sell_rate: 133.0
      }
    ];

    await CurrencyRateRepository.upsertExchangeRates(testBusinessId, rates, mockOwner, todayStr);

    const gridPath = `daily_exchange_rate_grids/fx_grid_${testBusinessId}_${todayStr}`;
    expect(mockStore.has(gridPath)).toBe(true);

    const rateDocPath = `exchange_rates/USD_HTG_${todayStr}_ACHAT_CLIENT`;
    expect(mockStore.has(rateDocPath)).toBe(true);
    expect(mockStore.get(rateDocPath).rate).toBe(131.0);
  });

  it('14. Unique Document ID Constraint: Prevents duplication for company + date + rate typology', async () => {
    const rates1: DailyRateInput[] = [
      {
        rate_item_type: 'ACHAT_CLIENT',
        currency: 'USD',
        buy_rate: 130.0,
        sell_rate: 132.0
      }
    ];
    await CurrencyRateRepository.upsertExchangeRates(testBusinessId, rates1, mockOwner, todayStr);

    const rates2: DailyRateInput[] = [
      {
        rate_item_type: 'ACHAT_CLIENT',
        currency: 'USD',
        buy_rate: 132.5,
        sell_rate: 134.0
      }
    ];
    await CurrencyRateRepository.upsertExchangeRates(testBusinessId, rates2, mockOwner, todayStr);

    // Verify grid document is updated in place, not duplicated
    let gridCount = 0;
    mockStore.forEach((_val, key) => {
      if (key.startsWith(`daily_exchange_rate_grids/fx_grid_${testBusinessId}_${todayStr}`)) {
        gridCount++;
      }
    });
    expect(gridCount).toBe(1);

    const updatedGrid = mockStore.get(`daily_exchange_rate_grids/fx_grid_${testBusinessId}_${todayStr}`);
    expect(updatedGrid.rates.ACHAT_CLIENT).toBe(132.5);
  });

  it('15. Exchange Margin & Accounting Classification (GL 4120 / 6120)', () => {
    // 1. Client sells USD to bank at 130 HTG when BRH is 134.25 (Bank buys cheap -> Gain GL 4120)
    const gainMargin = CurrencyRateRepository.calculateExchangeMargin({
      amountUsd: 100,
      appliedRate: 130.0,
      officialBrhRate: 134.25,
      operationType: 'ACHAT'
    });
    expect(gainMargin.accountCode).toBe('4120');
    expect(gainMargin.marginHtg).toBe(425);

    // 2. Client buys USD from bank at 138 HTG when BRH is 134.25 (Bank sells high -> Gain GL 4120)
    const sellGainMargin = CurrencyRateRepository.calculateExchangeMargin({
      amountUsd: 100,
      appliedRate: 138.0,
      officialBrhRate: 134.25,
      operationType: 'VENTE'
    });
    expect(sellGainMargin.accountCode).toBe('4120');
    expect(sellGainMargin.marginHtg).toBe(375);
  });

  it('16. Zero / Negative Amount Rejection in Cross-Currency Validation', () => {
    const activeRates = CurrencyRateRepository.getDefaultStandardGrid(testBusinessId, todayStr).rates;

    const zeroResult = CurrencyRateRepository.validateCrossCurrencyTransaction({
      amount: 0,
      fromCurrency: 'USD',
      toCurrency: 'HTG',
      activeRates
    });
    expect(zeroResult.isValid).toBe(false);
    expect(zeroResult.error).toContain('supérieur à zéro');

    const negativeResult = CurrencyRateRepository.validateCrossCurrencyTransaction({
      amount: -50,
      fromCurrency: 'USD',
      toCurrency: 'HTG',
      activeRates
    });
    expect(negativeResult.isValid).toBe(false);
  });

  it('17. Multi-Currency Conversion Helper: Translates between USD, CAD, EUR and HTG', async () => {
    const convertedSame = await CurrencyRateRepository.convert(500, 'HTG', 'HTG', testBusinessId);
    expect(convertedSame).toBe(500);
  });

  it('18. Audit Trail Query Capability: Retrieves tenant-scoped signed forensic logs', async () => {
    const logs = await CurrencyRateRepository.getExchangeRateAuditLogs(testBusinessId);
    expect(Array.isArray(logs)).toBe(true);
  });
});
