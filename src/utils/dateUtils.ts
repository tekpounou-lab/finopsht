/**
 * FINOPS ERP - Legacy Date Utility Re-exports & Helpers
 * Delegated to SSOT Module: src/utils/dateNormalization.ts
 */

export {
  toDateOnly,
  areDatesEqual,
  isDateInRange,
  normalizeDateFilter,
  extractTxDateString,
  normalizeDateStr,
  normalizeCsvDate
} from "./dateNormalization";

const FRENCH_MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

/**
 * Standardized automatic generator for payroll cycle names based on period dates.
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

      const lastDayOfMonth = new Date(sYear, sMonth, 0).getDate();
      if (sDay === 1 && eDay >= (lastDayOfMonth - 1) && sMonth === eMonth && sYear === eYear) {
        return `Paie de ${monthName} ${sYear}`;
      }

      if (sDay === 1 && eDay === 15 && sMonth === eMonth && sYear === eYear) {
        return `Quinzaine du ${formatDateFr(startDate)} au ${formatDateFr(endDate)}`;
      }

      if (sDay === 16 && sMonth === eMonth && sYear === eYear) {
        return `Quinzaine du ${formatDateFr(startDate)} au ${formatDateFr(endDate)}`;
      }

      return `Quinzaine du ${formatDateFr(startDate)} au ${formatDateFr(endDate)}`;
    }

    return `Cycle du ${formatDateFr(startDate)} au ${formatDateFr(endDate)}`;
  }

  return "Nouveau Cycle de Paie";
}
