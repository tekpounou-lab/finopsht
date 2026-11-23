/**
 * Canonical Haiti (America/Port-au-Prince) business date helpers.
 * Pure runtime-agnostic utility safe for both browser and Node.js server bundles.
 */

import { normalizeCsvDate } from "./dateNormalization";

export { normalizeCsvDate };

const FRENCH_MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre"
];

/**
 * Returns YYYY-MM-DD in America/Port-au-Prince business timezone.
 */
export function getHaitiDateString(d: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Port-au-Prince",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(d);
  } catch {
    return d.toISOString().split("T")[0];
  }
}

/**
 * Returns YYYY-MM-DD string for the day prior to targetDateStr in America/Port-au-Prince.
 */
export function getPreviousHaitiDateString(targetDateStr?: string): string {
  const baseDateStr = targetDateStr || getHaitiDateString();
  const dt = new Date(baseDateStr + "T12:00:00.000Z");
  dt.setUTCDate(dt.getUTCDate() - 1);
  return getHaitiDateString(dt);
}

function formatDmy(iso: string): string {
  const m = String(iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Formats standardized payroll cycle names from YYYY-MM-DD start and end dates.
 */
export function formatPayrollCycleName(
  startDate: string,
  endDate: string,
  cycleType?: string
): string {
  const sMatch = String(startDate || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  const eMatch = String(endDate || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!sMatch || !eMatch) {
    return startDate && endDate ? `Cycle du ${startDate} au ${endDate}` : "";
  }

  const sYear = Number(sMatch[1]);
  const sMonth = Number(sMatch[2]);
  const sDay = Number(sMatch[3]);
  const eYear = Number(eMatch[1]);
  const eMonth = Number(eMatch[2]);
  const eDay = Number(eMatch[3]);

  const lastDayOfMonth = new Date(Date.UTC(sYear, sMonth, 0)).getUTCDate();
  const sameMonthYear = sYear === eYear && sMonth === eMonth;

  if (sameMonthYear && sDay === 1 && eDay === lastDayOfMonth) {
    const monthName = FRENCH_MONTHS[sMonth - 1] || String(sMonth);
    return `Paie de ${monthName} ${sYear}`;
  }

  if (
    cycleType === "QUINZAINE" ||
    (sameMonthYear && ((sDay === 1 && eDay === 15) || (sDay === 16 && eDay === lastDayOfMonth)))
  ) {
    return `Quinzaine du ${formatDmy(startDate)} au ${formatDmy(endDate)}`;
  }

  if (cycleType === "MONTHLY") {
    const monthName = FRENCH_MONTHS[sMonth - 1] || String(sMonth);
    return `Paie de ${monthName} ${sYear}`;
  }

  return `Cycle du ${formatDmy(startDate)} au ${formatDmy(endDate)}`;
}
