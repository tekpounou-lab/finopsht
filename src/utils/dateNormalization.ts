/**
 * FINOPS ERP - Date Normalization Engine (Single Source of Truth - SSOT)
 * Canonical Date Format across all domains: "YYYY-MM-DD"
 */

export type DateInput = string | number | Date | { seconds?: number; nanoseconds?: number; toDate?: () => Date } | null | undefined;

/**
 * Validates whether a date string is a valid date and matches "YYYY-MM-DD"
 */
function isValidIsoDateStr(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return false;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}` === dateStr;
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
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  return '';
}

/**
 * Universal Date Normalizer: Converts any Date input (Timestamp, Date, ISO, US MM/DD/YYYY, EU DD/MM/YYYY, Number)
 * into a strict, canonical "YYYY-MM-DD" date string.
 */
export function toDateOnly(input: DateInput, fallbackDate?: string): string {
  if (input === null || input === undefined || input === '') {
    return resolveFallback(fallbackDate);
  }

  // 1. Firestore Timestamp or object with .toDate()
  if (typeof input === 'object' && input !== null) {
    if ('toDate' in input && typeof input.toDate === 'function') {
      try {
        const d = input.toDate();
        if (d && !isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      } catch (e) {
        // Fall through
      }
    }
    if ('seconds' in input && typeof input.seconds === 'number') {
      const d = new Date(input.seconds * 1000);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
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

  // 2. Numeric timestamp (milliseconds or seconds)
  if (typeof input === 'number') {
    if (isNaN(input)) return resolveFallback(fallbackDate);
    // If timestamp in seconds (< 1e11), convert to ms
    const ms = input < 1e11 ? input * 1000 : input;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  // 3. String representation parsing
  const str = String(input).trim().replace(/^["']|["']$/g, '');
  if (!str) return resolveFallback(fallbackDate);

  // 3a. ISO format with 'T' (e.g. 2026-07-15T14:30:00Z or 2026-07-15T00:00:00)
  if (str.includes('T')) {
    const datePart = str.split('T')[0].replace(/\//g, '-');
    if (isValidIsoDateStr(datePart)) return datePart;
  }

  // 3b. Already YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
    const day = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
    const formatted = `${year}-${month}-${day}`;
    if (isValidIsoDateStr(formatted)) return formatted;
  }

  // 3c. Slash or Dash separated parts (MM/DD/YYYY or DD/MM/YYYY or DD-MM-YYYY)
  const parts = str.split(/[/-]/);
  if (parts.length === 3) {
    let p1 = parseInt(parts[0].trim(), 10);
    let p2 = parseInt(parts[1].trim(), 10);
    let p3 = parseInt(parts[2].trim(), 10);

    if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
      // Check if p3 is Year (4 digits or 2 digits)
      if (p3 >= 100 || parts[2].trim().length === 4 || parts[2].trim().length === 2) {
        let year = p3;
        if (year < 100) year += 2000;

        let month: number;
        let day: number;

        if (p1 > 12 && p2 <= 12) {
          // DD/MM/YYYY (EU)
          day = p1;
          month = p2;
        } else if (p2 > 12 && p1 <= 12) {
          // MM/DD/YYYY (US)
          month = p1;
          day = p2;
        } else {
          // Both <= 12, default to US MM/DD/YYYY unless specified
          month = p1;
          day = p2;
        }

        const formatted = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (isValidIsoDateStr(formatted)) return formatted;
      }
      // Check if p1 is Year (e.g. 2026/7/15)
      else if (p1 >= 1000) {
        const year = p1;
        const month = p2;
        const day = p3;
        const formatted = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (isValidIsoDateStr(formatted)) return formatted;
      }
    }
  }

  // 3d. Fallback JS Date parse
  const jsParsed = new Date(str);
  if (!isNaN(jsParsed.getTime())) {
    const year = jsParsed.getFullYear();
    const month = String(jsParsed.getMonth() + 1).padStart(2, '0');
    const day = String(jsParsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return resolveFallback(fallbackDate);
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
export function normalizeCsvDate(rawDateStr: DateInput, fallbackDate?: string, preferDayFirst?: boolean): string {
  if (rawDateStr === null || rawDateStr === undefined || rawDateStr === '') {
    const fb = resolveFallback(fallbackDate);
    console.debug(`[normalizeCsvDate] Empty input. Using fallback: "${fb}"`);
    return fb;
  }

  const str = String(rawDateStr).trim().replace(/^["']|["']$/g, '');
  if (!str) {
    const fb = resolveFallback(fallbackDate);
    console.debug(`[normalizeCsvDate] Empty string. Using fallback: "${fb}"`);
    return fb;
  }

  // 1. Check ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
    const day = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;
    if (isValidIsoDateStr(isoDate)) {
      console.debug(`[normalizeCsvDate] ISO format matched: "${str}" -> "${isoDate}"`);
      return isoDate;
    }
  }

  // 2. Check M/D/YYYY or D/M/YYYY
  const parts = str.split(/[/-]/);
  if (parts.length === 3) {
    let p1 = parseInt(parts[0].trim(), 10);
    let p2 = parseInt(parts[1].trim(), 10);
    let p3 = parseInt(parts[2].trim(), 10);

    if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
      let year = p3;
      if (year < 100) year += 2000;

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

      const resultDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (isValidIsoDateStr(resultDate)) {
        console.debug(`[normalizeCsvDate] Parsed M/D/YYYY or D/M/YYYY: "${str}" -> "${resultDate}"`);
        return resultDate;
      }
    }
  }

  const normalized = toDateOnly(str, fallbackDate);
  if (normalized) {
    console.debug(`[normalizeCsvDate] Universal parse matched: "${str}" -> "${normalized}"`);
    return normalized;
  }

  const fb = resolveFallback(fallbackDate) || new Date().toISOString().substring(0, 10);
  console.warn(`[normalizeCsvDate] Failed to parse date "${rawDateStr}". Using fallback: "${fb}"`);
  return fb;
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
        if (typeof val === 'object' && ('seconds' in val || 'toDate' in val)) {
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
