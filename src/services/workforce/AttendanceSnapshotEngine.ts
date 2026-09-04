import { AttendanceRecord, LeaveRecord } from "../../types";
import { Shift } from "../../components/planning/types";

export interface AttendanceRules {
  business_id: string;
  timezone: string;
  workingDays: number[];
  standardHoursPerDay: number;
  lateToleranceMinutes: number;
  criticalLateMinutes: number;
  nightShiftStart: string;
  nightShiftEnd: string;
  overtimeRate: number;
  updatedAt: string;
}

export interface AttendanceSnapshot {
  snapshotId: string;
  businessId: string;
  generatedAt: string;
  schemaVersion: string;
  attendanceLogs: AttendanceRecord[];
  shifts: any[];
  leaves: any[];
  rules: AttendanceRules;
  metrics: {
    punctualityRate: number;
    presenceRate: number;
    averageHoursWorked: number;
    activeSessionsCount: number;
    totalOvertimeHours: number;
    conflictCount: number;
  };
}

export class AttendanceSnapshotEngine {
  private static currentState: string = 'EMPTY';
  private static lastSnapshot: AttendanceSnapshot | null = null;

  static build(params: {
    businessId: string;
    attendanceLogs: AttendanceRecord[];
    shifts: any[];
    leaves: any[];
    rules: AttendanceRules | null;
  }): AttendanceSnapshot {
    this.currentState = 'BUILDING';
    const { businessId, attendanceLogs, shifts, leaves, rules } = params;

    const activeRules: AttendanceRules = rules || {
      business_id: businessId,
      timezone: "America/Port-au-Prince",
      workingDays: [1, 2, 3, 4, 5],
      standardHoursPerDay: 8,
      lateToleranceMinutes: 15,
      criticalLateMinutes: 60,
      nightShiftStart: "18:00",
      nightShiftEnd: "06:00",
      overtimeRate: 1.5,
      updatedAt: new Date().toISOString()
    };

    // Calculate metrics
    const totalCheckIns = attendanceLogs.length;
    const lateCount = attendanceLogs.filter(log => log.status === "LATE").length;
    const punctualityRate = totalCheckIns > 0 
      ? Math.round(((totalCheckIns - lateCount) / totalCheckIns) * 100) 
      : 100;

    const totalScheduledShifts = shifts.length;
    const totalPresentDays = attendanceLogs.filter(log => log.status !== "ABSENT").length;
    const presenceRate = totalScheduledShifts > 0 
      ? Math.round((totalPresentDays / totalScheduledShifts) * 100) 
      : 100;

    const totalHoursWorked = attendanceLogs.reduce((sum, log) => sum + (log.realHours || 0), 0);
    const averageHoursWorked = totalCheckIns > 0 
      ? Number((totalHoursWorked / totalCheckIns).toFixed(2)) 
      : 0;

    const activeSessionsCount = attendanceLogs.filter(log => log.checkOut === null).length;

    const totalOvertimeHours = attendanceLogs
      .filter(log => log.status === "OVERTIME" || log.variance > 0)
      .reduce((sum, log) => sum + Math.max(0, (log.realHours || 0) - (log.plannedHours || 8)), 0);

    // Conflict detection for shifts
    let conflictCount = 0;
    const groupedShifts: Record<string, any[]> = {};
    shifts.forEach(s => {
      const key = `${s.employeeId}_${s.date}`;
      if (!groupedShifts[key]) groupedShifts[key] = [];
      groupedShifts[key].push(s);
    });

    Object.values(groupedShifts).forEach(dayShifts => {
      if (dayShifts.length > 1) {
        for (let i = 0; i < dayShifts.length; i++) {
          for (let j = i + 1; j < dayShifts.length; j++) {
            const s1 = dayShifts[i];
            const s2 = dayShifts[j];
            if (s1.branchId !== s2.branchId) {
              const start1 = parseFloat(s1.startTime?.replace(':', '.') || '0');
              const end1 = parseFloat(s1.endTime?.replace(':', '.') || '0');
              const start2 = parseFloat(s2.startTime?.replace(':', '.') || '0');
              const end2 = parseFloat(s2.endTime?.replace(':', '.') || '0');
              if (Math.max(start1, start2) < Math.min(end1, end2)) {
                conflictCount++;
              }
            }
          }
        }
      }
    });

    const snapshot: AttendanceSnapshot = {
      snapshotId: `att_snap_${businessId}_${Date.now()}`,
      businessId,
      generatedAt: new Date().toISOString(),
      schemaVersion: "1.0.0",
      attendanceLogs,
      shifts,
      leaves,
      rules: activeRules,
      metrics: {
        punctualityRate,
        presenceRate,
        averageHoursWorked,
        activeSessionsCount,
        totalOvertimeHours,
        conflictCount
      }
    };

    this.lastSnapshot = snapshot;
    this.currentState = 'READY';

    return snapshot;
  }

  static getState(): string {
    return this.currentState;
  }

  static getLastSnapshot(): AttendanceSnapshot | null {
    return this.lastSnapshot;
  }
}
