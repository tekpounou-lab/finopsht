export type ShiftStatus = 'SCHEDULED' | 'COMPLETED' | 'ABSENT' | 'LATE' | 'CONFLICT';

export interface Shift {
  id: string;
  business_id: string;
  employeeId: string;
  branchId: string;
  departmentId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: ShiftStatus;
  plannedHours: number;
  workedHours?: number;
  notes?: string;
  isOvertime?: boolean;
  recurringRule?: string;
  templateId?: string; // Reference to template if any
}

export interface ShiftTemplate {
  id: string;
  businessId: string;
  branchId: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  breakDuration: number; // in minutes
  workingDays: string[]; // ["Lundi", "Mardi", ...] or ["Monday", ...]
  gracePeriodMinutes: number;
  overtimeThreshold: number; // in hours
  status: 'ACTIVE' | 'INACTIVE';
}

export interface EmployeeAssignment {
  id: string;
  businessId: string;
  branchId: string;
  employeeId: string;
  templateId: string;
  type: 'permanent' | 'temporary' | 'rotation';
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  workingDays: string[]; // ["Lundi", "Mardi", ...]
  rotationCycleWeeks?: number; // 1, 2, 3
  rotationTemplates?: string[]; // Array of templateIds for weekly rotation cycles
  status: 'ACTIVE' | 'EXPIRED' | 'PAUSED';
}

export interface ShiftFilters {
  branchId: string;
  departmentId: string;
  status: string;
  search: string;
  dateRange: { start: string; end: string } | null;
}
