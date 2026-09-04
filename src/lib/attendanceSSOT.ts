/**
 * Single Source of Truth (SSOT) for Attendance Variance and Calculations
 * 
 * Formula: Variance = Real Hours Worked - Planned Hours Scheduled
 * - Positive variance (> 0): Additional hours / overtime worked (e.g., +1.5h in green)
 * - Zero variance (= 0): Exactly matched scheduled time (0h in slate/gray)
 * - Negative variance (< 0): Shortfall / missing hours worked (e.g., -1.5h in red)
 */

export interface AttendanceHours {
  plannedHours: number;
  realHours: number;
  variance: number;
}

export interface DeviceMetadata {
  deviceId: string;
  deviceTimezone: string;
  userAgent: string;
  platform: string;
  language: string;
  screenResolution: string;
  capturedAt: string;
}

/**
 * Returns the local date string formatted as YYYY-MM-DD based on the machine/device clock.
 * Prevents UTC day-shift errors for evening punches.
 */
export function getDeviceLocalDate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Standardizes any date representation (YYYY-MM-DD, DD/MM/YYYY, ISO strings, Timestamps, Date objects)
 * into a uniform YYYY-MM-DD string for safe equality and comparison checks.
 */
export function normalizeDateStr(dInput: any): string {
  if (!dInput) return "";
  let str = dInput;
  if (typeof dInput !== "string") {
    if (dInput.toDate && typeof dInput.toDate === "function") {
      str = getDeviceLocalDate(dInput.toDate());
    } else if (typeof dInput === "number") {
      str = getDeviceLocalDate(new Date(dInput));
    } else if (dInput instanceof Date) {
      str = getDeviceLocalDate(dInput);
    } else {
      str = String(dInput);
    }
  }
  const trimmed = String(str).trim();
  if (!trimmed) return "";
  
  if (trimmed.includes("T")) {
    return trimmed.split("T")[0];
  }
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(trimmed)) {
    const p = trimmed.split(/[-/]/);
    return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
  }
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(trimmed)) {
    const p = trimmed.split(/[-/]/);
    return `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`;
  }
  return trimmed;
}

/**
 * Returns the local time string formatted as HH:MM:SS based on the machine/device clock.
 */
export function getDeviceLocalTime(d: Date = new Date()): string {
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Returns comprehensive machine/device diagnostic and registration metadata.
 */
export function getDeviceMetadata(): DeviceMetadata {
  const tz = typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "Node/Server";
  const platform = typeof navigator !== "undefined" ? (navigator as any).userAgentData?.platform || navigator.platform || "Web Client" : "Server";
  const lang = typeof navigator !== "undefined" ? navigator.language : "fr";
  const screenRes = typeof window !== "undefined" && window.screen ? `${window.screen.width}x${window.screen.height}` : "Unknown";
  const host = typeof window !== "undefined" && window.location ? window.location.hostname : "localhost";

  return {
    deviceId: `kiosk_term_${host.replace(/[^a-zA-Z0-9]/g, "_")}`,
    deviceTimezone: tz,
    userAgent: ua,
    platform,
    language: lang,
    screenResolution: screenRes,
    capturedAt: new Date().toISOString()
  };
}

/**
 * Calculates attendance variance as (realHours - plannedHours).
 * Returns rounded number to specified precision (default 2 decimals).
 */
export function calculateAttendanceVariance(realHours: number, plannedHours: number = 8, precision: number = 2): number {
  const safeReal = Number(realHours) || 0;
  const safePlanned = Number(plannedHours) > 0 ? Number(plannedHours) : 8;
  const diff = safeReal - safePlanned;
  const factor = Math.pow(10, precision);
  return Math.round(diff * factor) / factor;
}

/**
 * Formats attendance variance string with sign (+) prefix for positive variance.
 * Examples: +1.5h, -2h, 0h
 */
export function formatAttendanceVariance(variance: number, precision: number = 1): string {
  const safeVariance = Number(variance) || 0;
  const formattedVal = Math.abs(safeVariance) % 1 === 0 
    ? safeVariance.toFixed(0) 
    : safeVariance.toFixed(precision);

  if (safeVariance > 0) {
    return `+${formattedVal}h`;
  }
  return `${formattedVal}h`;
}

/**
 * Returns Tailwind text color CSS class for attendance variance.
 */
export function getAttendanceVarianceColorClass(variance: number): string {
  const safeVariance = Number(variance) || 0;
  if (safeVariance > 0) {
    return "text-emerald-400";
  }
  if (safeVariance < 0) {
    return "text-rose-400";
  }
  return "text-slate-400";
}

/**
 * Robustly matches an employee against a QR payload ID/string.
 * Handles numeric vs string loose equality, badge numbers, codes, matricule, email, name, etc.
 */
export function findEmployeeByQrPayload(rawSearchId: string, employees: any[]): any | null {
  if (!rawSearchId || !employees || !Array.isArray(employees)) return null;
  const target = String(rawSearchId).trim().toLowerCase();
  if (!target) return null;

  return employees.find((e) => {
    if (!e) return false;
    const id = String(e.id || "").trim().toLowerCase();
    const badgeNumber = String(e.badgeNumber || e.badge_number || e.badgeId || e.badge_id || "").trim().toLowerCase();
    const code = String(e.code || e.employee_number || "").trim().toLowerCase();
    const registrationNumber = String(e.registrationNumber || e.registration_number || e.matricule || "").trim().toLowerCase();
    const nif = String(e.nif || "").trim().toLowerCase();
    const email = String(e.email || "").trim().toLowerCase();
    const name = String(e.name || "").trim().toLowerCase();

    return (
      id === target ||
      badgeNumber === target ||
      code === target ||
      registrationNumber === target ||
      nif === target ||
      email === target ||
      name === target
    );
  }) || null;
}

/**
 * Finds an attendance record matching an employee and target date string safely.
 */
export function findAttendanceRecordForEmployee(emp: any, records: any[], dateStr: string): any | null {
  if (!emp || !records || !Array.isArray(records)) return null;
  const targetDateNorm = normalizeDateStr(dateStr);
  
  const empId = String(emp.id || "").trim().toLowerCase();
  const badgeNumber = String(emp.badgeNumber || emp.badge_number || "").trim().toLowerCase();
  const code = String(emp.code || "").trim().toLowerCase();
  const name = String(emp.name || "").trim().toLowerCase();

  return records.find((r) => {
    if (!r) return false;
    const rDateNorm = normalizeDateStr(r.date);
    if (rDateNorm !== targetDateNorm) return false;

    const rEmpId = String(r.employeeId || "").trim().toLowerCase();
    const rEmpName = String(r.employeeName || r.name || "").trim().toLowerCase();

    return (
      rEmpId === empId ||
      (badgeNumber && rEmpId === badgeNumber) ||
      (code && rEmpId === code) ||
      (name && rEmpName === name)
    );
  }) || null;
}

