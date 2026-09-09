import { describe, it, expect } from 'vitest';
import {
  toDateOnly,
  areDatesEqual,
  isDateInRange,
  normalizeDateFilter,
  normalizeCsvDate,
  extractTxDateString,
  normalizeDateStr,
} from '../../utils/dateNormalization';
import { filterLedgerTransactions } from '../../services/cfo/LedgerFilterEngine';
import { LedgerTransaction } from '../../types';

describe('Date Normalization SSOT Engine', () => {
  describe('toDateOnly', () => {
    it('normalizes ISO 8601 strings with T and Z', () => {
      expect(toDateOnly('2026-07-15T14:30:00Z')).toBe('2026-07-15');
      expect(toDateOnly('2026-07-15T00:00:00')).toBe('2026-07-15');
    });

    it('normalizes canonical YYYY-MM-DD strings', () => {
      expect(toDateOnly('2026-07-15')).toBe('2026-07-15');
      expect(toDateOnly('2026/07/15')).toBe('2026-07-15');
    });

    it('normalizes US formatted date strings (MM/DD/YYYY)', () => {
      expect(toDateOnly('07/15/2026')).toBe('2026-07-15');
      expect(toDateOnly('7/5/2026')).toBe('2026-07-05');
      expect(toDateOnly('07-15-2026')).toBe('2026-07-15');
    });

    it('normalizes EU formatted date strings (DD/MM/YYYY)', () => {
      expect(toDateOnly('15/07/2026')).toBe('2026-07-15');
      expect(toDateOnly('25/12/2026')).toBe('2026-12-25');
      expect(toDateOnly('15-07-2026')).toBe('2026-07-15');
    });

    it('normalizes 2-digit years (DD/MM/YY or MM/DD/YY)', () => {
      expect(toDateOnly('15/07/26')).toBe('2026-07-15');
    });

    it('normalizes JS Date objects', () => {
      const d = new Date(2026, 6, 15); // Note: month index 6 is July
      expect(toDateOnly(d)).toBe('2026-07-15');
    });

    it('normalizes Firestore Timestamps', () => {
      const mockTimestamp = {
        toDate: () => new Date(2026, 6, 15),
      };
      expect(toDateOnly(mockTimestamp)).toBe('2026-07-15');

      const mockSecondsTimestamp = {
        seconds: 1784073600, // 2026-07-15T00:00:00Z approx
      };
      expect(toDateOnly(mockSecondsTimestamp)).not.toBe('');
    });

    it('normalizes numeric millisecond timestamps', () => {
      const ms = new Date(2026, 6, 15).getTime();
      expect(toDateOnly(ms)).toBe('2026-07-15');
    });

    it('handles null, undefined, and empty string with fallbacks', () => {
      expect(toDateOnly(null)).toBe('');
      expect(toDateOnly(undefined)).toBe('');
      expect(toDateOnly('')).toBe('');
      expect(toDateOnly(null, '2026-07-15')).toBe('2026-07-15');
    });
  });

  describe('areDatesEqual', () => {
    it('returns true for equivalent dates in different formats', () => {
      expect(areDatesEqual('2026-07-15', '15/07/2026')).toBe(true);
      expect(areDatesEqual('07/15/2026', '2026-07-15T14:30:00Z')).toBe(true);
      expect(areDatesEqual('2026-07-15', new Date(2026, 6, 15))).toBe(true);
    });

    it('returns false for different dates', () => {
      expect(areDatesEqual('2026-07-15', '2026-07-16')).toBe(false);
    });
  });

  describe('isDateInRange', () => {
    it('correctly validates if a date falls within bounds', () => {
      expect(isDateInRange('15/07/2026', '2026-07-01', '2026-07-31')).toBe(true);
      expect(isDateInRange('01/08/2026', '2026-07-01', '2026-07-31')).toBe(false);
      expect(isDateInRange('30/06/2026', '2026-07-01', '2026-07-31')).toBe(false);
    });
  });

  describe('normalizeDateFilter', () => {
    it('normalizes filter bounds into YYYY-MM-DD', () => {
      const bounds = normalizeDateFilter('15/07/2026', '31/07/2026');
      expect(bounds.startDate).toBe('2026-07-15');
      expect(bounds.endDate).toBe('2026-07-31');
    });
  });

  describe('normalizeCsvDate', () => {
    it('parses US, EU, and ISO CSV strings accurately', () => {
      expect(normalizeCsvDate('7/15/2026')).toBe('2026-07-15');
      expect(normalizeCsvDate('15/7/2026', undefined, true)).toBe('2026-07-15');
      expect(normalizeCsvDate('2026-07-15')).toBe('2026-07-15');
    });
  });

  describe('Mode Simplifié vs Mode Expert Date Concordance', () => {
    it('filters transactions identically regardless of input date format', () => {
      const txs: LedgerTransaction[] = [
        {
          id: 'tx1',
          date: '15/07/2026', // EU format
          type: 'INCOME',
          amount: 1000,
          amount_cents: 100000,
          description: 'Sales Income 1',
          status: 'POSTED',
          currency: 'HTG',
          business_id: 'biz1',
          branchId: 'b1',
          category: 'Sales',
          isImmutable: true,
          signerId: 'user1',
          source: 'MANUAL',
        },
        {
          id: 'tx2',
          date: '2026-07-20T10:00:00Z', // ISO format
          type: 'INCOME',
          amount: 2000,
          amount_cents: 200000,
          description: 'Sales Income 2',
          status: 'POSTED',
          currency: 'HTG',
          business_id: 'biz1',
          branchId: 'b1',
          category: 'Sales',
          isImmutable: true,
          signerId: 'user1',
          source: 'MANUAL',
        },
        {
          id: 'tx3',
          date: '08/05/2026', // Out of range (August)
          type: 'INCOME',
          amount: 1500,
          amount_cents: 150000,
          description: 'Sales Income 3',
          status: 'POSTED',
          currency: 'HTG',
          business_id: 'biz1',
          branchId: 'b1',
          category: 'Sales',
          isImmutable: true,
          signerId: 'user1',
          source: 'MANUAL',
        },
      ];

      const filters = {
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        period: 'ALL',
        type: ['ALL'],
        category: 'ALL',
        branchId: ['ALL'],
        departmentId: ['ALL'],
        employeeId: ['ALL'],
        status: 'ALL',
        search: '',
      };

      const filtered = filterLedgerTransactions(txs, filters, { businessId: 'biz1' });

      expect(filtered.length).toBe(2);
      expect(filtered.map((t) => t.id)).toEqual(['tx1', 'tx2']);
    });
  });
});
