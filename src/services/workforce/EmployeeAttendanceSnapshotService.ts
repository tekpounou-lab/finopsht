import { db } from "../../lib/firebase";
import { doc, getDoc, setDoc, getDocs, collection, query, where } from "firebase/firestore";
import { Employee, PayrollCycle, EmployeeAttendanceSnapshot, AttendanceRecord } from "../../types";
import { OvertimeRequest } from "./OvertimeService";
import { AbsenceEvent } from "./AttendanceIntegrationService";

export const EmployeeAttendanceSnapshotService = {
  /**
   * Generates or fetches an EmployeeAttendanceSnapshot for a specific employee & payroll cycle.
   * If an existing frozen snapshot exists in Firestore, returns the frozen state to preserve SSOT.
   */
  async generateOrFetchSnapshot(params: {
    businessId: string;
    cycle: PayrollCycle;
    employee: Employee;
    attendanceRecords?: AttendanceRecord[];
    overtimeRequests?: OvertimeRequest[];
    absenceEvents?: AbsenceEvent[];
    contract?: any;
  }): Promise<EmployeeAttendanceSnapshot> {
    const {
      businessId,
      cycle,
      employee,
      attendanceRecords = [],
      overtimeRequests = [],
      absenceEvents = [],
      contract
    } = params;

    const snapshotId = `att_snap_${businessId}_${cycle.id}_${employee.id}`;

    // 1. Check if frozen snapshot already exists in Firestore
    try {
      const snapRef = doc(db, "employee_attendance_snapshots", snapshotId);
      const snap = await getDoc(snapRef);
      if (snap.exists()) {
        const existing = snap.data() as EmployeeAttendanceSnapshot;
        if (existing.is_frozen) {
          return existing;
        }
      }
    } catch (e) {
      console.warn("Could not check employee_attendance_snapshots from Firestore, computing dynamically:", e);
    }

    // Date formatting helper
    const toDateKey = (rawDate: any): string => {
      if (!rawDate) return "";
      if (typeof rawDate === "string") {
        if (rawDate.includes("T")) return rawDate.split("T")[0];
        if (rawDate.includes(" ")) return rawDate.split(" ")[0];
        return rawDate.trim();
      }
      try {
        return new Date(rawDate).toISOString().split("T")[0];
      } catch {
        return String(rawDate).substring(0, 10);
      }
    };

    const startDate = cycle.startDate || cycle.start_date || "2000-01-01";
    const endDate = cycle.endDate || cycle.end_date || "3000-12-31";
    const startKey = toDateKey(startDate);
    const endKey = toDateKey(endDate);

    const matchesEmp = (obj: any) => {
      const oid = obj.employeeId || obj.employee_id || obj.userId || obj.user_id;
      return oid === employee.id || (employee as any).employee_id === oid;
    };

    // 2. Filter biometric attendance records for employee & date window
    const cycleAttendance = attendanceRecords.filter(a => {
      const dk = toDateKey(a.date);
      return matchesEmp(a) && dk >= startKey && dk <= endKey;
    });

    const getRealHours = (a: any): number => {
      if (a.status === "ABSENT") return 0;
      if (typeof a.realHours === "number" && !isNaN(a.realHours)) return a.realHours;
      if (typeof a.workedHours === "number" && !isNaN(a.workedHours)) return a.workedHours;
      if (typeof a.hours === "number" && !isNaN(a.hours)) return a.hours;
      if (typeof a.totalMinutes === "number" && a.totalMinutes > 0) return a.totalMinutes / 60;
      if (a.checkIn && a.checkOut) {
        try {
          const partsIn = String(a.checkIn).split(":");
          const partsOut = String(a.checkOut).split(":");
          const m1 = parseInt(partsIn[0], 10) * 60 + parseInt(partsIn[1], 10);
          const m2 = parseInt(partsOut[0], 10) * 60 + parseInt(partsOut[1], 10);
          if (m2 > m1) return (m2 - m1) / 60;
        } catch {
          // ignore
        }
      }
      return 0;
    };

    const getPlannedHours = (a: any): number => {
      if (typeof a.plannedHours === "number" && a.plannedHours > 0) return a.plannedHours;
      if (typeof a.scheduledHours === "number" && a.scheduledHours > 0) return a.scheduledHours;
      return 8;
    };

    // Calculate expected hours based on cycle working days (Monday-Friday) * 8
    let calculatedExpectedHours = 96;
    try {
      const s = new Date(startKey);
      const e = new Date(endKey);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        let workingDays = 0;
        const cur = new Date(s);
        let guard = 0;
        while (cur <= e && guard < 1000) {
          guard++;
          const dayOfWeek = cur.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            workingDays++;
          }
          cur.setDate(cur.getDate() + 1);
        }
        if (workingDays > 0) {
          calculatedExpectedHours = workingDays * 8;
        }
      }
    } catch (err) {
      console.warn("Failed to calculate cycle expected hours, using fallback 96:", err);
    }

    let expectedHours = calculatedExpectedHours;
    let workedHours = 0;
    let dailyExtraHours = 0;
    let totalRealHours = 0;

    if (cycleAttendance.length > 0) {
      cycleAttendance.forEach(a => {
        const real = getRealHours(a);
        const planned = getPlannedHours(a);
        totalRealHours += real;
        if (real > planned) {
          dailyExtraHours += (real - planned);
        }
      });
      workedHours = totalRealHours;
    } else {
      workedHours = 0;
    }

    let extraHours = dailyExtraHours;
    let missingHours = Math.max(0, expectedHours - workedHours);

    // Add approved Overtime Requests
    const approvedOt = overtimeRequests.filter(r => {
      const dk = toDateKey(r.date);
      return matchesEmp(r) && r.status === "APPROVED" && dk >= startKey && dk <= endKey;
    });
    const otHours = approvedOt.reduce((sum, r) => sum + (r.totalHours || 0), 0);
    extraHours += otHours;

    // Add unexcused Absences
    const unexcusedAbs = absenceEvents.filter(a => {
      const dk = toDateKey(a.date);
      return matchesEmp(a) && (a.status === "REJECTED_JUSTIFICATION" || a.type === "UNEXCUSED_ABSENCE") && dk >= startKey && dk <= endKey;
    });
    const unexcusedMinutes = unexcusedAbs.reduce((sum, a) => sum + (a.minutes || 480), 0);
    missingHours += unexcusedMinutes / 60;

    // 3. Hourly Rate calculation
    // Monthly Base Salary (or reference 10,000 HTG if base is 0 e.g. for pure commission role)
    const baseSalary = contract?.salaryBaseHtg || employee.baseSalary || (employee as any).salaryBaseHtg || (employee as any).salary || 0;
    const monthlySalaryRef = baseSalary > 0 ? baseSalary : 10000;
    const hourlyRate = Number((monthlySalaryRef / expectedHours).toFixed(2));

    // 4. Prime and Penalty amounts
    const primeAmount = Number((extraHours * hourlyRate).toFixed(2));
    const penalityAmount = Number((missingHours * hourlyRate).toFixed(2));

    const attendanceScore = expectedHours > 0
      ? Math.min(100, Math.round((workedHours / expectedHours) * 100))
      : 100;

    const snapshot: EmployeeAttendanceSnapshot = {
      id: snapshotId,
      business_id: businessId,
      payroll_cycle_id: cycle.id,
      employee_id: employee.id,
      employee_email: employee.email,
      expected_hours: Number(expectedHours.toFixed(2)),
      worked_hours: Number(workedHours.toFixed(2)),
      missing_hours: Number(missingHours.toFixed(2)),
      extra_hours: Number(extraHours.toFixed(2)),
      hourly_rate: hourlyRate,
      prime_amount: primeAmount,
      penality_amount: penalityAmount,
      attendance_score: attendanceScore,
      status: "VALIDATED",
      generated_at: new Date().toISOString(),
      is_frozen: cycle.status === "LOCKED" || cycle.status === "PAID"
    };

    // Save snapshot asynchronously to Firestore
    try {
      await setDoc(doc(db, "employee_attendance_snapshots", snapshotId), snapshot);
    } catch (e) {
      console.warn("Failed saving employee_attendance_snapshot to Firestore:", e);
    }

    return snapshot;
  },

  /**
   * Batch fetches attendance snapshots for a given payroll cycle
   */
  async getCycleAttendanceSnapshots(businessId: string, cycleId: string): Promise<EmployeeAttendanceSnapshot[]> {
    try {
      const q = query(
        collection(db, "employee_attendance_snapshots"),
        where("business_id", "==", businessId),
        where("payroll_cycle_id", "==", cycleId)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as EmployeeAttendanceSnapshot);
    } catch {
      return [];
    }
  }
};
