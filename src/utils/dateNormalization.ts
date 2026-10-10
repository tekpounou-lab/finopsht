/**
 * FINOPS ERP - Date Normalization Engine (Single Source of Truth - SSOT)
 * Canonical Date Format across all domains: "YYYY-MM-DD"
 */

export type DateInput = string | number | Date | { seconds?: number; nanoseconds?: number; toDate?: () => Date } | null | undefined;

/**
 * Validates whether year, month (1-12), day (1-31) form a valid Gregorian calendar date.
 */
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
  if (year < 1000 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  if (isLeapYear) daysInMonth[2] = 29;

  return day <= daysInMonth[month];
}

/**
 * Validates whether a date string is a valid date and matches "YYYY-MM-DD" exactly.
 */
export function isValidIsoDateStr(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parts = dateStr.split('-').map(Number);
  return isValidCalendarDate(parts[0], parts[1], parts[2]);
}

/**
 * Returns fallback date formatted as "YYYY-MM-DD"
 */
function resolveFallback(fallbackDate?: string): string {
  if (fallbackDate) {
    if (fallbackDate.includes('T')) return fallbackDate.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(fallbackDate)) return fallbackDate;
    const d = new Date(fallbackDate);
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  return '';
}

/**
 * Converts Excel Serial Number (e.g., 45500 or "45500.5") into canonical "YYYY-MM-DD".
 * Standard Excel 1900 date system (Jan 1, 1900 = serial 1).
 */
export function parseExcelSerialToIsoDate(serialInput: number | string): string | null {
  const numSerial = typeof serialInput === 'number' ? serialInput : parseFloat(String(serialInput).trim());
  // Excel serial numbers for dates between 1900 and 2100 fall roughly in 1 .. 73050
  if (isNaN(numSerial) || numSerial < 1 || numSerial > 100000) return null;

  // Whole days offset from Dec 30, 1899 (accounting for Excel 1900 leap year bug)
  let totalDays = Math.floor(numSerial);
  if (totalDays >= 60) {
    totalDays -= 1; // Correct for fictional Feb 29, 1900 in Excel
  }

  // Dec 31, 1899 is the zero point for totalDays offset
  const excelEpochUtc = Date.UTC(1899, 11, 31);
  const targetMs = excelEpochUtc + totalDays * 86400000;
  const d = new Date(targetMs);

  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();

  if (isValidCalendarDate(year, month, day)) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

/**
 * Maps multi-lingual textual month names (English, French, Haitian Creole) to 1-based month numbers.
 */

const MONTH_MAP: Record<string, number> = {
  // English, French, Haitian Creole
  jan: 1, january: 1, janv: 1, janvier: 1,
  feb: 2, february: 2, fev: 2, fév: 2, fevrier: 2, février: 2,
  mar: 3, march: 3, mars: 3, mas: 3,
  apr: 4, april: 4, avr: 4, avril: 4,
  may: 5, mai: 5,
  jun: 6, june: 6, juin: 6,
  jul: 7, july: 7, juil: 7, juillet: 7,
  aug: 8, august: 8, aout: 8, août: 8, out: 8,
  sep: 9, sept: 9, september: 9, septembre: 9,
  oct: 10, october: 10, octobre: 10, okt: 10,
  nov: 11, november: 11, novembre: 11,
  dec: 12, december: 12, déc: 12, decembre: 12, décembre: 12, des: 12
};


/**
 * Parses textual dates like "15 Juillet 2026", "July 15, 2026", "15-Jul-2026", "3 out 2026".
 */
export function parseTextDateToIsoDate(textStr: string): string | null {
  if (!textStr || typeof textStr !== 'string') return null;
  const cleaned = textStr.trim().toLowerCase().replace(/,/g, ' ').replace(/\./g, '').replace(/\s+/g, ' ');

  // Match e.g. "15 jul 2026" or "15-jul-2026" or "15 juillet 2026"
  const dayMonthYearMatch = cleaned.match(/^(\d{1,2})[\s\/-]+([a-zàâéèêîôûç]+)[\s\/-]+(\d{2,4})$/i);
  if (dayMonthYearMatch) {
    const day = parseInt(dayMonthYearMatch[1], 10);
    const monthKey = dayMonthYearMatch[2].toLowerCase();
    let year = parseInt(dayMonthYearMatch[3], 10);
    if (year < 100) year += 2000;

    const month = MONTH_MAP[monthKey];
    if (month && isValidCalendarDate(year, month, day)) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Match e.g. "july 15 2026" or "juillet 15 2026"
  const monthDayYearMatch = cleaned.match(/^([a-zàâéèêîôûç]+)[\s\/-]+(\d{1,2})[\s\/-]+(\d{2,4})$/i);
  if (monthDayYearMatch) {
    const monthKey = monthDayYearMatch[1].toLowerCase();
    const day = parseInt(monthDayYearMatch[2], 10);
    let year = parseInt(monthDayYearMatch[3], 10);
    if (year < 100) year += 2000;

    const month = MONTH_MAP[monthKey];
    if (month && isValidCalendarDate(year, month, day)) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Universal Date Normalizer: Converts any Date input (Timestamp, Date, ISO, US MM/DD/YYYY, EU DD/MM/YYYY, Dots, Text, Excel Serial)
 * into a strict, canonical "YYYY-MM-DD" date string.
 */
export function toDateOnly(input: DateInput, fallbackDate?: string): string {
  if (input === null || input === undefined || input === '') {
    return resolveFallback(fallbackDate);
  }

  // 1. Firestore Timestamp or object with .toDate()
  if (typeof input === 'object' && input !== null) {
    if ('toDate' in input && typeof (input as any).toDate === 'function') {
      try {
        const d = (input as any).toDate();
        if (d && !isNaN(d.getTime())) {
          const year = d.getUTCFullYear();
          const month = String(d.getUTCMonth() + 1).padStart(2, '0');
          const day = String(d.getUTCDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      } catch (e) {
        // Fall through
      }
    }
    if ('seconds' in input && typeof (input as any).seconds === 'number') {
      const d = new Date((input as any).seconds * 1000);
      if (!isNaN(d.getTime())) {
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }
    if (input instanceof Date) {
      if (!isNaN(input.getTime())) {
        const year = input.getFullYear();
        const month = String(input.getMonth() + 1).padStart(2, '0');
        const day = String(input.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }
  }

  // 2. Numeric input (Timestamp or Excel Serial)
  if (typeof input === 'number') {
    if (isNaN(input)) return resolveFallback(fallbackDate);

    // Check Excel serial range (e.g. 1 to 100000)
    if (input > 0 && input < 100000) {
      const excelParsed = parseExcelSerialToIsoDate(input);
      if (excelParsed) return excelParsed;
    }

    // Timestamp in seconds (< 1e11) vs milliseconds
    const ms = input < 1e11 ? input * 1000 : input;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  // 3. String representation parsing
  const str = String(input).trim().replace(/^["']|["']$/g, '');
  if (!str) return resolveFallback(fallbackDate);

  // 3a. Excel Serial String e.g. "45500" or "45500.5"
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const excelParsed = parseExcelSerialToIsoDate(str);
    if (excelParsed) return excelParsed;
  }

  // 3b. ISO format with 'T' (e.g. 2026-07-15T14:30:00Z or 2026-07-15T00:00:00)
  if (str.includes('T')) {
    const datePart = str.split('T')[0].replace(/\//g, '-').replace(/\./g, '-');
    if (isValidIsoDateStr(datePart)) return datePart;
  }

  // 3c. Already YYYY-MM-DD, YYYY/MM/DD, or YYYY.MM.DD
  const isoMatch = str.match(/^(\d{4})[-/\.](\d{1,2})[-/\.](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (isValidCalendarDate(year, month, day)) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 3d. Slash, Dash, or Dot separated parts (DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY, DD-MM-YYYY)
  const parts = str.split(/[\/\-\.]/).filter(Boolean);
  if (parts.length === 3) {
    let p1 = parseInt(parts[0].trim(), 10);
    let p2 = parseInt(parts[1].trim(), 10);
    let p3 = parseInt(parts[2].trim(), 10);

    if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
      // Check if p3 is Year (4 digits or 2 digits)
      if (p3 >= 100 || parts[2].trim().length === 4 || parts[2].trim().length === 2) {
        let year = p3;
        if (year < 100) {
          year += (year <= 50) ? 2000 : 1900;
        }

        let month: number;
        let day: number;

        if (p1 > 12 && p2 <= 12) {
          // DD/MM/YYYY (EU / Haiti standard)
          day = p1;
          month = p2;
        } else if (p2 > 12 && p1 <= 12) {
          // MM/DD/YYYY (US)
          month = p1;
          day = p2;
        } else {
          // Default to MM/DD/YYYY when ambiguous
          month = p1;
          day = p2;
        }

        if (isValidCalendarDate(year, month, day)) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
      // Check if p1 is Year (e.g. 2026.7.15)
      else if (p1 >= 1000) {
        const year = p1;
        const month = p2;
        const day = p3;
        if (isValidCalendarDate(year, month, day)) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    }
  }

  // 3e. Text month dates (e.g. "15 Juillet 2026", "July 15, 2026")
  const textParsed = parseTextDateToIsoDate(str);
  if (textParsed) return textParsed;

  // 3f. Fallback JS Date parse
  const jsParsed = new Date(str);
  if (!isNaN(jsParsed.getTime())) {
    const year = jsParsed.getUTCFullYear();
    const month = jsParsed.getUTCMonth() + 1;
    const day = jsParsed.getUTCDate();
    if (isValidCalendarDate(year, month, day)) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return resolveFallback(fallbackDate);
}

/**
 * Normalizes imported attendance status strings into canonical AttendanceStatus values.
 * Preserves all statuses (ABSENT, NORMAL, RETARD, CONGE, PARTIEL, OVERTIME).
 */
export function normalizeAttendanceStatus(inputStatus: string | null | undefined, defaultStatus: string = "NORMAL"): string {
  if (!inputStatus) return defaultStatus;
  const clean = String(inputStatus).trim().toUpperCase().replace(/[\s_]+/g, '_');

  if (/ABSENT|ABSENCE|ABS|MANQUANT|NON_PRESENT|^A$/.test(clean)) {
    return "ABSENT";
  }
  if (/CONGE|CONGÉ|LEAVE|HOLIDAY|VACATION|REST|CONGE_PAYE|^C$/.test(clean)) {
    return "CONGE";
  }
  if (/RETARD|LATE|^R$/.test(clean)) {
    return "RETARD";
  }
  if (/PARTIEL|HALF_DAY|DEMI_JOURNEE/.test(clean)) {
    return "PARTIEL";
  }
  if (/OVERTIME|SUPPLEMENTAIRE|HS/.test(clean)) {
    return "OVERTIME";
  }
  if (/NORMAL|PRESENT|PRÉSENT|OK|^P$/.test(clean)) {
    return "NORMAL";
  }

  return defaultStatus;
}

/**
 * Checks if two date inputs represent the exact same calendar date (YYYY-MM-DD).
 */
export function areDatesEqual(d1: DateInput, d2: DateInput): boolean {
  const norm1 = toDateOnly(d1);
  const norm2 = toDateOnly(d2);
  if (!norm1 || !norm2) return false;
  return norm1 === norm2;
}

/**
 * Checks if a date falls within a start date and end date range (inclusive).
 */
export function isDateInRange(date: DateInput, startDate?: DateInput, endDate?: DateInput): boolean {
  const target = toDateOnly(date);
  if (!target) return false;

  const start = startDate ? toDateOnly(startDate) : '';
  const end = endDate ? toDateOnly(endDate) : '';

  if (start && target < start) return false;
  if (end && target > end) return false;

  return true;
}

/**
 * Normalizes filter startDate and endDate to canonical "YYYY-MM-DD" or empty string.
 */
export function normalizeDateFilter(startDate?: DateInput, endDate?: DateInput): { startDate: string; endDate: string } {
  return {
    startDate: startDate ? toDateOnly(startDate) : '',
    endDate: endDate ? toDateOnly(endDate) : '',
  };
}

/**
 * Alias for extractTxDateString to ensure complete backward compatibility.
 */
export function extractTxDateString(rawDate: DateInput): string {
  return toDateOnly(rawDate);
}

/**
 * Alias for normalizeDateStr to ensure complete backward compatibility.
 */
export function normalizeDateStr(rawDate: DateInput): string {
  return toDateOnly(rawDate);
}

/**
 * Advanced CSV Date Normalizer with explicit EU/US format handling and console debug logging.
 */
export function normalizeCsvDate(rawDateStr: DateInput, fallbackDate?: string, preferDayFirst: boolean = true): string {
  if (rawDateStr === null || rawDateStr === undefined || rawDateStr === '') {
    const fb = resolveFallback(fallbackDate);
    return fb;
  }

  const str = String(rawDateStr).trim().replace(/^["']|["']$/g, '');
  if (!str) {
    return resolveFallback(fallbackDate);
  }

  // 1. Check Excel Serial
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const excelParsed = parseExcelSerialToIsoDate(str);
    if (excelParsed) return excelParsed;
  }

  // 2. Check ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
  const isoMatch = str.match(/^(\d{4})[-/\.](\d{1,2})[-/\.](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (isValidCalendarDate(year, month, day)) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 3. Check M/D/YYYY or D/M/YYYY
  const parts = str.split(/[/-/\.]/).filter(Boolean);
  if (parts.length === 3) {
    let p1 = parseInt(parts[0].trim(), 10);
    let p2 = parseInt(parts[1].trim(), 10);
    let p3 = parseInt(parts[2].trim(), 10);

    if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
      let year = p3;
      if (year < 100) year += (year <= 50) ? 2000 : 1900;

      let month: number;
      let day: number;

      if (p1 > 12 && p2 <= 12) {
        day = p1;
        month = p2;
      } else if (p2 > 12 && p1 <= 12) {
        month = p1;
        day = p2;
      } else if (preferDayFirst) {
        day = p1;
        month = p2;
      } else {
        month = p1;
        day = p2;
      }

      if (isValidCalendarDate(year, month, day)) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  const normalized = toDateOnly(str, fallbackDate);
  if (normalized) return normalized;

  return resolveFallback(fallbackDate) || new Date().toISOString().substring(0, 10);
}

/**
 * Safe version of toDateOnly that returns fallback or null on failure without throwing.
 */
export function safeToDateOnly(value: unknown, fallback: string | null = null): string | null {
  try {
    const res = toDateOnly(value as DateInput);
    if (res) return res;
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Recursively normalizes date fields in an object or array of objects.
 * Target fields matching 'date', 'Date', or 'timestamp' (except 'createdAt', 'updatedAt' by default).
 */
export function normalizeDatesInObject<T>(
  obj: T,
  options: { excludeFields?: string[] } = {}
): T {
  if (obj === null || obj === undefined) return obj;

  const excludeSet = new Set(options.excludeFields || ['createdAt', 'updatedAt', 'created_at', 'updated_at']);

  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeDatesInObject(item, options)) as unknown as T;
  }

  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const result: any = {};
    for (const key of Object.keys(obj as Record<string, any>)) {
      const val = (obj as Record<string, any>)[key];

      if (excludeSet.has(key)) {
        result[key] = val;
        continue;
      }

      const isDateKey = /date|timestamp/i.test(key);

      if (isDateKey && val !== null && val !== undefined) {
        if (typeof val === 'object' && val !== null && ('seconds' in val || 'toDate' in val)) {
          result[key] = toDateOnly(val as DateInput);
        } else if (typeof val !== 'object') {
          const normalized = toDateOnly(val as DateInput);
          result[key] = normalized || val;
        } else {
          result[key] = val;
        }
      } else if (typeof val === 'object' && val !== null) {
        result[key] = normalizeDatesInObject(val, options);
      } else {
        result[key] = val;
      }
    }
    return result as T;
  }

  return obj;
}

/**
 * Deterministic Filter Matching: Evaluates whether a date satisfies a [startDate, endDate] boundary.
 * In a date-filtered context (when startDate or endDate is set), UNRESOLVED / INVALID DATES RETURN FALSE.
 */
export function matchesDateFilter(date: DateInput, startDate?: DateInput, endDate?: DateInput): boolean {
  const start = startDate ? toDateOnly(startDate) : '';
  const end = endDate ? toDateOnly(endDate) : '';

  if (!start && !end) return true;

  const target = toDateOnly(date);
  if (!target) return false;

  if (start && target < start) return false;
  if (end && target > end) return false;

  return true;
}

/**
 * Resolves the canonical accounting/operational date for a transaction based on accounting mode.
 */
export function resolveAnalyticsTxDate(tx: any, isCashBasis: boolean = false): string {
  if (!tx) return '';

  let rawDate: any = null;
  if (isCashBasis) {
    rawDate =
      tx.paymentDate ||
      tx.paidAt ||
      tx.settlementDate ||
      tx.effectiveDate ||
      tx.effective_date ||
      tx.effectiveAccountingDate ||
      tx.date ||
      tx.transaction_date ||
      tx.transactionDate ||
      tx.date_str ||
      tx.dateStr ||
      tx.createdAt ||
      tx.created_at ||
      tx.timestamp;
  } else {
    rawDate =
      tx.accountingDate ||
      tx.accounting_date ||
      tx.effectiveAccountingDate ||
      tx.effective_date ||
      tx.effectiveDate ||
      tx.date ||
      tx.transaction_date ||
      tx.transactionDate ||
      tx.date_str ||
      tx.dateStr ||
      tx.paymentDate ||
      tx.createdAt ||
      tx.created_at ||
      tx.timestamp;
  }

  return toDateOnly(rawDate);
}

/**
 * Resolves the canonical work/presence date for an attendance record.
 */
export function resolveAnalyticsAttendanceDate(att: any): string {
  if (!att) return '';

  const rawDate =
    att.date ||
    att.work_date ||
    att.workDate ||
    att.date_presence ||
    att.date_pointage ||
    att.attendance_date ||
    att.effective_date ||
    att.checkInDate ||
    att.checkIn?.deviceDate ||
    att.timestamp ||
    att.checkIn?.timestamp ||
    att.checkIn ||
    att.check_in ||
    att.checkInTime ||
    att.check_in_time ||
    att.createdAt ||
    att.created_at;

  return toDateOnly(rawDate);
}

/**
 * Resolves the canonical accounting/settlement date for a payroll record.
 */
export function resolveAnalyticsPayrollDate(payroll: any, isCashBasis: boolean = false): string {
  if (!payroll) return '';

  const rawDate =
    (isCashBasis
      ? (payroll.paymentDate || payroll.paidAt || payroll.disbursementDate || payroll.effectiveAccountingDate)
      : null) ||
    payroll.period_end ||
    payroll.periodEnd ||
    payroll.periodEndDate ||
    payroll.endDate ||
    payroll.paymentDate ||
    payroll.paidAt ||
    payroll.disbursementDate ||
    payroll.effectiveAccountingDate ||
    payroll.period_start ||
    payroll.periodStart ||
    payroll.startDate ||
    payroll.generated_at ||
    payroll.createdAt ||
    payroll.created_at;

  return toDateOnly(rawDate);
}


