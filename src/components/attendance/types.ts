export interface AttendanceFilterParams {
  branchId: string;
  departmentId: string;
  employeeId: string;
  date: string;
  endDate?: string;
  status: string;
  search: string;
}

export type AttendanceStatus = 'SCHEDULED' | 'CHECKED_IN' | 'LATE' | 'ACTIVE' | 'CHECKED_OUT' | 'COMPLETED' | 'CORRECTED' | 'FLAGGED' | 'PRESENT' | 'ABSENT' | 'OVERTIME' | 'MANUAL_OVERRIDE' | 'FRAUD_RISK';
