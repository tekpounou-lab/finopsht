import { Employee, AttendanceRecord, PayrollRecord, EmployeeBadge } from "../types";
import { calculateAttendanceVariance, formatAttendanceVariance } from "../lib/attendanceSSOT";
import { MockServiceManager } from "./mock";

// Register Kiosk & QR Attendance Simulation Service only in development
if ((typeof process !== "undefined" && process.env.NODE_ENV === "development") || Boolean(import.meta.env.DEV)) {
  MockServiceManager.registerService(
    "QRAttendanceSimulator",
    "Simulates contactless QR identity badge clock-in/out and variance calculations"
  );
}

const logger = MockServiceManager.getLogger("QRAttendanceSimulator");

/**
 * QR Attendance Simulation & Payroll Integration Service
 */

export interface QRScanResult {
  status: "success" | "error" | "fraud" | "breach" | "already_clocked";
  message: string;
  record?: AttendanceRecord;
  employeeName?: string;
  isCheckIn?: boolean;
}

/**
 * 1. Simulates generating a secure crypto-signed QR Code badge payload for an employee
 */
export function generateMockBadgePayload(employee: Employee, customSignature?: string): string {
  const signature = customSignature || "mock_sig_" + Math.random().toString(36).substring(2, 10);
  const payload = JSON.stringify({
    employee_id: employee.id,
    business_id: employee.business_id,
    branch_id: employee.branchId,
    role: employee.role,
    signature: signature,
  });
  logger.debug("Generated mock badge payload for employee:", employee.id);
  return payload;
}

/**
 * 2. Simulates scanning a QR payload and processes the AttendanceRecord entry.
 * It determines if the operation is a Check-In or a Check-Out, and calculates
 * the real hours worked and variance from planned hours upon check-out.
 */
export function processQRScanSimulation(params: {
  qrPayload: string;
  currentBusinessId: string;
  employees: Employee[];
  badges: EmployeeBadge[];
  existingRecords: AttendanceRecord[];
  now?: Date;
}): QRScanResult {
  const { qrPayload, currentBusinessId, employees, badges, existingRecords, now = new Date() } = params;

  try {
    const payloadObj = JSON.parse(qrPayload);
    const { employee_id, business_id, branch_id, signature, role } = payloadObj;

    if (!employee_id || !business_id || !signature) {
      return {
        status: "error",
        message: "Décodage échoué : Jeton QR corrompu ou illisible.",
      };
    }

    // Tenant Isolation Check (Cross-tenant breach)
    if (business_id !== currentBusinessId) {
      return {
        status: "breach",
        message: "ALERTE SÉCURITÉ : Ce badge QR appartient à une autre organisation tenant !",
      };
    }

    // Find the employee in active list
    const employee = employees.find((e) => e.id === employee_id);
    if (!employee) {
      return {
        status: "error",
        message: "Identité de l'agent introuvable dans l'effectif actuel.",
      };
    }

    // Fraud check: Badge signature verification
    const employeeBadge = badges.find((b) => b.employeeId === employee_id);
    if (employeeBadge && employeeBadge.signature !== signature) {
      return {
        status: "fraud",
        message: "ALERTE FRAUDE : Ce badge QR a été révoqué ou désactivé.",
      };
    }

    // Fraud check: Role/Branch mismatch verification
    if (employee.role !== role || employee.branchId !== branch_id) {
      return {
        status: "fraud",
        message: "ALERTE FRAUDE : Les habilitations ou l'affectation de succursale sont incorrectes.",
      };
    }

    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toTimeString().split(" ")[0];

    // Find if employee already clocked in today
    const existingRecord = existingRecords.find(
      (r) => r.employeeId === employee_id && r.date === dateStr
    );

    if (existingRecord) {
      if (existingRecord.checkOut) {
        return {
          status: "already_clocked",
          message: `Pointage complet déjà enregistré pour ${employee.name} aujourd'hui.`,
          record: existingRecord,
        };
      }

      // Check-Out Processing
      const checkInParts = existingRecord.checkIn.split(":").map(Number);
      const checkOutParts = timeStr.split(":").map(Number);
      
      const checkInMinutes = checkInParts[0] * 60 + checkInParts[1];
      const checkOutMinutes = checkOutParts[0] * 60 + checkOutParts[1];
      
      let realHours = Math.max(0.5, Number(((checkOutMinutes - checkInMinutes) / 60).toFixed(2)));
      
      // Allow simulation variance randomly or use accurate math
      if (realHours <= 0) realHours = 8.0; // Fail-safe fallback for same-minute scans

      const plannedHours = existingRecord.plannedHours || 8.0;
      const variance = calculateAttendanceVariance(realHours, plannedHours);
      
      let status: AttendanceRecord["status"] = "NORMAL";
      if (variance < -0.5) {
        status = "LATE"; // Left early or started late
      } else if (variance > 1.0) {
        status = "OVERTIME";
      }

      const updatedRecord: AttendanceRecord = {
        ...existingRecord,
        checkOut: timeStr,
        realHours,
        variance,
        status,
      };

      return {
        status: "success",
        message: `SORTIE ACCEPTEE ✓ Bon repos, ${employee.name}. Départ enregistré à ${timeStr}. (Heures: ${realHours}h, Écart: ${formatAttendanceVariance(variance)})`,
        record: updatedRecord,
        employeeName: employee.name,
        isCheckIn: false,
      };
    }

    // Check-In Processing
    const plannedHours = 8.0;
    const checkInRecord: AttendanceRecord = {
      id: "att_" + Math.random().toString(36).substring(2, 9),
      employeeId: employee.id,
      employeeName: employee.name,
      business_id: currentBusinessId,
      branchId: employee.branchId,
      date: dateStr,
      checkIn: timeStr,
      checkOut: null,
      plannedHours,
      realHours: 0,
      variance: -plannedHours, // Full negative variance until check-out
      status: "NORMAL",
    };

    return {
      status: "success",
      message: `ARRIVEE VALIDEE ✓ Bienvenue, ${employee.name}. Entrée enregistrée à ${timeStr}.`,
      record: checkInRecord,
      employeeName: employee.name,
      isCheckIn: true,
    };
  } catch (err) {
    return {
      status: "error",
      message: "Erreur technique de décodage durant la numérisation du QR.",
    };
  }
}

/**
 * 3. Integrates the attendance records with the existing payroll data structure.
 * This recalculates worked hours, calculates attendance adjustments (cents),
 * and computes the overall attendance score (0-100) for a payroll cycle.
 */
export function recalculatePayrollAttendanceIntegration(params: {
  employee: Employee;
  cycleRecords: AttendanceRecord[];
  basePayrollRecord: PayrollRecord;
}): PayrollRecord {
  const { employee, cycleRecords, basePayrollRecord } = params;

  // Filter records belonging to this employee for the cycle period
  const empRecords = cycleRecords.filter((r) => r.employeeId === employee.id);

  if (empRecords.length === 0) {
    return basePayrollRecord;
  }

  // Calculate parameters
  let totalPlannedHours = 0;
  let totalRealHours = 0;
  let normalDays = 0;
  let overtimeDays = 0;
  let lateDays = 0;
  let totalDays = empRecords.length;

  empRecords.forEach((r) => {
    totalPlannedHours += r.plannedHours || 8;
    totalRealHours += r.realHours || 0;
    if (r.status === "NORMAL") normalDays++;
    else if (r.status === "OVERTIME") overtimeDays++;
    else if (r.status === "LATE") lateDays++;
  });

  // Calculate Attendance Score %
  const attendanceScore = Math.max(
    0,
    Math.min(100, Math.round(((normalDays + overtimeDays) / totalDays) * 100))
  );

  // Worked minutes representation
  const worked_minutes = Math.round(totalRealHours * 60);

  // Salary mapping & adjustments
  // Base daily rate simulation
  const employeesBaseHtg = employee.baseSalary || 25000; // default Gourdes per quinzaine
  const baseSalaryCents = employeesBaseHtg * 100; // raw cents
  
  // Calculate attendance deductions structure (e.g. deduction for missed/late hours)
  const missedHoursOfPlanned = Math.max(0, totalPlannedHours - totalRealHours);
  const hourlyRateCents = baseSalaryCents / (15 * 8); // approximate hourly rate for the 15-day period
  
  // Negative adjustment for missing hours, with absolute capping
  const attendance_adjustment_cents = Math.round(-1 * missedHoursOfPlanned * hourlyRateCents);

  // Overtime bonus calculation
  const extraHours = empRecords
    .filter((r) => r.realHours > r.plannedHours)
    .reduce((sum, r) => sum + (r.realHours - r.plannedHours), 0);
  const overtime_cents = Math.round(extraHours * hourlyRateCents * 1.5); // 1.5x Overtime premium rate

  // Deductions: CNSS (6%), CNS (2%)
  const grossSalaryCents = baseSalaryCents + overtime_cents + (attendance_adjustment_cents < 0 ? attendance_adjustment_cents : 0);
  const grossSalary = Math.round(grossSalaryCents / 100);

  const cnssDeduction = Math.round(grossSalary * 0.06);
  const cnsDeduction = Math.round(grossSalary * 0.02);

  const netPaid = Math.max(0, grossSalary - cnssDeduction - cnsDeduction);

  const updatedRecord: PayrollRecord = {
    ...basePayrollRecord,
    worked_minutes,
    attendanceScore,
    attendance_adjustment_cents,
    overtime_cents,
    grossSalary,
    cnssDeduction,
    cnsDeduction,
    netPaid,
    updated_at: new Date().toISOString(),
  };

  return updatedRecord;
}
