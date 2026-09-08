/**
 * Universal CSV Date Normalizer for FINOPS ERP
 * Normalizes any CSV date string into a clean "YYYY-MM-DD" string.
 * Supports:
 * - US standard CSV format M/D/YYYY or MM/DD/YYYY (e.g. 7/15/2026, 7/5/2026, 07/15/2026)
 * - European format DD/MM/YYYY or D/M/YYYY (e.g. 15/07/2026, 15/7/2026)
 * - ISO format YYYY-MM-DD or YYYY/MM/DD or ISO timestamp (e.g. 2026-07-15, 2026-07-15T00:00:00Z)
 * - Fallback date if string is missing or unparseable
 */
export function normalizeCsvDate(rawDateStr: any, fallbackDate?: string, preferDayFirst?: boolean): string {
  if (rawDateStr === null || rawDateStr === undefined) {
    return getFallback(fallbackDate);
  }

  const str = String(rawDateStr).trim().replace(/^["']|["']$/g, '');
  if (!str) {
    return getFallback(fallbackDate);
  }

  // 1. Check if already ISO format YYYY-MM-DD or ISO timestamp (e.g. 2026-07-15 or 2026-07-15T00:00:00.000Z)
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
    const day = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;
    if (isValidDate(isoDate)) {
      console.debug(`[normalizeCsvDate] ISO format matched: "${str}" -> "${isoDate}"`);
      return isoDate;
    }
  }

  // 2. Check for M/D/YYYY or D/M/YYYY separated by / or - or .
  const parts = str.split(/[/-]/);
  if (parts.length === 3) {
    let p1 = parseInt(parts[0].trim(), 10);
    let p2 = parseInt(parts[1].trim(), 10);
    let p3 = parseInt(parts[2].trim(), 10);

    if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
      let year = p3;
      if (year < 100) {
        year += 2000; // 2-digit year "26" -> 2026
      }

      let month: number;
      let day: number;

      // If first part > 12, it MUST be DD/MM/YYYY (European, e.g. 15/07/2026)
      if (p1 > 12 && p2 <= 12) {
        day = p1;
        month = p2;
      }
      // If second part > 12, it MUST be MM/DD/YYYY (US format, e.g. 7/15/2026)
      else if (p2 > 12 && p1 <= 12) {
        month = p1;
        day = p2;
      }
      // If both p1 <= 12 and p2 <= 12 (e.g. 7/5/2026):
      else if (preferDayFirst) {
        day = p1;
        month = p2;
      } else {
        month = p1;
        day = p2;
      }

      const formattedMonth = String(month).padStart(2, '0');
      const formattedDay = String(day).padStart(2, '0');
      const resultDate = `${year}-${formattedMonth}-${formattedDay}`;

      if (isValidDate(resultDate)) {
        console.debug(`[normalizeCsvDate] Parsed M/D/YYYY or D/M/YYYY: "${str}" -> "${resultDate}"`);
        return resultDate;
      }
    }
  }

  // 3. Fallback to native JS Date parsing
  const jsParsed = new Date(str);
  if (!isNaN(jsParsed.getTime())) {
    const isoResult = jsParsed.toISOString().substring(0, 10);
    console.debug(`[normalizeCsvDate] JS Date parse fallback: "${str}" -> "${isoResult}"`);
    return isoResult;
  }

  const finalFallback = getFallback(fallbackDate);
  console.warn(`[normalizeCsvDate] Failed to parse date "${rawDateStr}". Using fallback: "${finalFallback}"`);
  return finalFallback;
}

function isValidDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) && dateStr === d.toISOString().substring(0, 10);
}

function getFallback(fallbackDate?: string): string {
  if (fallbackDate) {
    if (fallbackDate.includes('T')) return fallbackDate.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(fallbackDate)) return fallbackDate;
    const d = new Date(fallbackDate);
    if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  }
  return new Date().toISOString().substring(0, 10);
}

const FRENCH_MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

/**
 * Standardized automatic generator for payroll cycle names based on period dates.
 * Examples:
 * - Full month (e.g. 2026-07-01 to 2026-07-31): "Paie de Juillet 2026"
 * - Bi-weekly / Quinzaine (e.g. 2026-07-01 to 2026-07-15): "Quinzaine du 01/07/2026 au 15/07/2026"
 * - General period: "Cycle du 05/07/2026 au 20/07/2026"
 */
export function formatPayrollCycleName(startDate?: string, endDate?: string, cycleType?: string): string {
  if (!startDate && !endDate) {
    return "Nouveau Cycle de Paie";
  }

  const formatDateFr = (isoStr: string): string => {
    if (!isoStr) return "";
    const cleanStr = isoStr.split("T")[0];
    const parts = cleanStr.split("-");
    if (parts.length === 3) {
      return `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[0]}`;
    }
    return isoStr;
  };

  if (startDate && !endDate) {
    const sParts = startDate.split("T")[0].split("-");
    if (sParts.length === 3) {
      const year = sParts[0];
      const mIdx = parseInt(sParts[1], 10) - 1;
      const monthName = FRENCH_MONTHS[mIdx] || sParts[1];
      return `Paie de ${monthName} ${year}`;
    }
    return `Cycle à partir du ${formatDateFr(startDate)}`;
  }

  if (startDate && endDate) {
    const sClean = startDate.split("T")[0];
    const eClean = endDate.split("T")[0];
    const sParts = sClean.split("-");
    const eParts = eClean.split("-");

    if (sParts.length === 3 && eParts.length === 3) {
      const sYear = parseInt(sParts[0], 10);
      const sMonth = parseInt(sParts[1], 10);
      const sDay = parseInt(sParts[2], 10);

      const eYear = parseInt(eParts[0], 10);
      const eMonth = parseInt(eParts[1], 10);
      const eDay = parseInt(eParts[2], 10);

      const monthName = FRENCH_MONTHS[sMonth - 1] || sParts[1];

      // Check for full month
      const lastDayOfMonth = new Date(sYear, sMonth, 0).getDate();
      if (sDay === 1 && eDay >= (lastDayOfMonth - 1) && sMonth === eMonth && sYear === eYear) {
        return `Paie de ${monthName} ${sYear}`;
      }

      // Check for 1st half of month (Quinzaine 1: 1 to 15)
      if (sDay === 1 && eDay === 15 && sMonth === eMonth && sYear === eYear) {
        return `Quinzaine du ${formatDateFr(startDate)} au ${formatDateFr(endDate)}`;
      }

      // Check for 2nd half of month (Quinzaine 2: 16 to end)
      if (sDay === 16 && sMonth === eMonth && sYear === eYear) {
        return `Quinzaine du ${formatDateFr(startDate)} au ${formatDateFr(endDate)}`;
      }

      // Default quinzaine/period
      return `Quinzaine du ${formatDateFr(startDate)} au ${formatDateFr(endDate)}`;
    }

    return `Cycle du ${formatDateFr(startDate)} au ${formatDateFr(endDate)}`;
  }

  return "Nouveau Cycle de Paie";
}
