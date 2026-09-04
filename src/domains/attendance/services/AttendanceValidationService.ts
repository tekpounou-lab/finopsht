import { ValidationResult, OperationResult } from "../../payroll/types/payrollDomain";

export interface AttendanceScanInput {
  employeeId: string;
  timestamp: string;
  scanMode: "IN" | "OUT" | "AUTO";
  lastAttendanceRecord?: {
    type: "IN" | "OUT";
    timestamp: string;
  } | null;
}

export class AttendanceValidationService {
  /**
   * Validates attendance scan timing and determines effective scan mode (IN vs OUT).
   */
  public static validateScan(input: AttendanceScanInput): OperationResult<{ effectiveType: "IN" | "OUT" }> {
    if (!input.employeeId) {
      return {
        success: false,
        message: "Identifiant employé absent.",
        data: undefined
      };
    }

    let effectiveType: "IN" | "OUT" = "IN";

    if (input.scanMode === "AUTO") {
      if (input.lastAttendanceRecord && input.lastAttendanceRecord.type === "IN") {
        effectiveType = "OUT";
      } else {
        effectiveType = "IN";
      }
    } else {
      effectiveType = input.scanMode;
    }

    // Cooldown check (prevent duplicate scans within 1 minute = 60000 ms)
    if (input.lastAttendanceRecord?.timestamp) {
      const lastTime = new Date(input.lastAttendanceRecord.timestamp).getTime();
      const currentTime = new Date(input.timestamp).getTime();
      if (!isNaN(lastTime) && !isNaN(currentTime)) {
        const diffMs = currentTime - lastTime;
        if (diffMs < 60000) {
          return {
            success: false,
            message: "Pointage trop rapproché. Veuillez patienter au moins 1 minute entre deux scannages.",
            data: undefined
          };
        }
      }
    }

    return {
      success: true,
      message: `Pointage ${effectiveType === "IN" ? "Entrée" : "Sortie"} validé.`,
      data: { effectiveType }
    };
  }
}
