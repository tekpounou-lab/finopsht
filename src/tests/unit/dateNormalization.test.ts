import { describe, it, expect } from 'vitest';
import {
  toDateOnly,
  safeToDateOnly,
  normalizeDatesInObject,
  isDateInRange,
  areDatesEqual,
  normalizeDateFilter,
  normalizeCsvDate,
  normalizeAttendanceStatus,
} from '../../utils/dateNormalization';


describe('src/utils/dateNormalization.ts Unit Tests', () => {
  describe('safeToDateOnly', () => {
    it('returns normalized YYYY-MM-DD for valid dates', () => {
      expect(safeToDateOnly('2026-07-15')).toBe('2026-07-15');
      expect(safeToDateOnly('15/07/2026')).toBe('2026-07-15');
      expect(safeToDateOnly('07/15/2026')).toBe('2026-07-15');
    });

    it('returns fallback or null for null/undefined/invalid values', () => {
      expect(safeToDateOnly(null)).toBeNull();
      expect(safeToDateOnly(undefined, '2026-01-01')).toBe('2026-01-01');
      expect(safeToDateOnly('invalid-date', '2026-01-01')).toBe('2026-01-01');
    });
  });

  describe('normalizeDatesInObject', () => {
    it('normalizes top-level date properties in an object', () => {
      const input = {
        id: 'rec_123',
        transactionDate: '15/07/2026',
        effectiveDate: '2026-07-20T14:00:00Z',
        createdAt: '2026-07-15T10:00:00Z', // Should be excluded by default
        amount: 5000,
      };

      const result = normalizeDatesInObject(input);

      expect(result.id).toBe('rec_123');
      expect(result.transactionDate).toBe('2026-07-15');
      expect(result.effectiveDate).toBe('2026-07-20');
      expect(result.createdAt).toBe('2026-07-15T10:00:00Z'); // Unchanged
      expect(result.amount).toBe(5000);
    });

    it('normalizes nested structures and arrays', () => {
      const input = [
        {
          id: '1',
          startDate: '15/07/2026',
          endDate: '31/07/2026',
          details: {
            issueDate: '2026-06-30T00:00:00',
          },
        },
      ];

      const result = normalizeDatesInObject(input);

      expect(result[0].startDate).toBe('2026-07-15');
      expect(result[0].endDate).toBe('2026-07-31');
      expect(result[0].details.issueDate).toBe('2026-06-30');
    });
  });

  describe('toDateOnly & normalizeCsvDate Edge Cases', () => {
    it('parses timestamps in seconds and milliseconds', () => {
      const secTimestamp = 1784073600; // ~2026-07-15
      expect(toDateOnly(secTimestamp)).not.toBe('');

      const msTimestamp = new Date(2026, 6, 15).getTime();
      expect(toDateOnly(msTimestamp)).toBe('2026-07-15');
    });

    it('parses Excel serial numbers accurately', () => {
      expect(toDateOnly(45500)).toBe('2024-07-27');
      expect(toDateOnly('45500')).toBe('2024-07-27');
      expect(toDateOnly('45500.5')).toBe('2024-07-27');
    });

    it('parses dot-separated date strings', () => {
      expect(toDateOnly('2026.07.15')).toBe('2026-07-15');
      expect(toDateOnly('15.07.2026')).toBe('2026-07-15');
    });

    it('parses single digit months and days', () => {
      expect(toDateOnly('2026/7/5')).toBe('2026-07-05');
      expect(toDateOnly('7/5/2026')).toBe('2026-07-05');
      expect(normalizeCsvDate('5/7/2026', undefined, true)).toBe('2026-07-05');
    });

    it('parses text month names in English, French, and Haitian Creole', () => {
      expect(toDateOnly('15 Juillet 2026')).toBe('2026-07-15');
      expect(toDateOnly('July 15, 2026')).toBe('2026-07-15');
      expect(toDateOnly('15-Jul-2026')).toBe('2026-07-15');
      expect(toDateOnly('3 out 2026')).toBe('2026-08-03'); // Creole 'out' = August
      expect(toDateOnly('15 juil. 2026')).toBe('2026-07-15');
    });

    it('rejects invalid calendar dates', () => {
      expect(toDateOnly('31/02/2026')).toBe(''); // Feb 31 does not exist
      expect(toDateOnly('2026-13-01')).toBe(''); // Month 13
      expect(toDateOnly('2026-00-15')).toBe(''); // Month 0
      expect(toDateOnly('2026-05-32')).toBe(''); // Day 32
    });

    it('handles preferDayFirst in CSV date parser', () => {
      expect(normalizeCsvDate('05/06/2026', undefined, true)).toBe('2026-06-05'); // Day first
    });
  });

  describe('normalizeAttendanceStatus', () => {
    it('normalizes various raw status strings to canonical AttendanceStatus', () => {
      expect(normalizeAttendanceStatus('absent')).toBe('ABSENT');
      expect(normalizeAttendanceStatus('ABSENCE')).toBe('ABSENT');
      expect(normalizeAttendanceStatus('abs')).toBe('ABSENT');
      expect(normalizeAttendanceStatus('A')).toBe('ABSENT');

      expect(normalizeAttendanceStatus('congé')).toBe('CONGE');
      expect(normalizeAttendanceStatus('LEAVE')).toBe('CONGE');
      expect(normalizeAttendanceStatus('vacation')).toBe('CONGE');
      expect(normalizeAttendanceStatus('C')).toBe('CONGE');

      expect(normalizeAttendanceStatus('retard')).toBe('RETARD');
      expect(normalizeAttendanceStatus('LATE')).toBe('RETARD');

      expect(normalizeAttendanceStatus('partiel')).toBe('PARTIEL');
      expect(normalizeAttendanceStatus('half_day')).toBe('PARTIEL');

      expect(normalizeAttendanceStatus('overtime')).toBe('OVERTIME');
      expect(normalizeAttendanceStatus('supplementaire')).toBe('OVERTIME');

      expect(normalizeAttendanceStatus('present')).toBe('NORMAL');
      expect(normalizeAttendanceStatus('NORMAL')).toBe('NORMAL');
      expect(normalizeAttendanceStatus('P')).toBe('NORMAL');
    });
  });

  describe('isDateInRange & areDatesEqual', () => {
    it('compares dates accurately regardless of input format', () => {
      expect(areDatesEqual('15/07/2026', '2026-07-15T00:00:00Z')).toBe(true);
      expect(isDateInRange('2026-07-15', '2026-07-01', '2026-07-31')).toBe(true);
      expect(isDateInRange('2026-08-01', '2026-07-01', '2026-07-31')).toBe(false);
    });
  });
});

