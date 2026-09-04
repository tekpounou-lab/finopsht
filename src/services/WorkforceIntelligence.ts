import { AttendanceRecord, PayrollRecord, LedgerTransaction, Employee, Branch } from "../types";
import { filterOperationalEmployees } from "./workforce/EmployeeEligibilityService";

export interface WorkforceMetrics {
  employeeId: string;
  attendanceConsistencyScore: number; 
  latenessScore: number; 
  productivityIndex: number; 
  overtimeDetection: boolean;
  underperformanceSignal: boolean;
}

export interface BranchEfficiency {
  branchId: string;
  avgProductivityIndex: number;
  overallAttendanceRate: number;
}

export const generateWorkforceIntelligence = (
  employees: Employee[],
  attendanceLogs: AttendanceRecord[],
  payrollRecords: PayrollRecord[],
  transactions: LedgerTransaction[],
  business_id: string
): WorkforceMetrics[] => {
  const operationalEmps = filterOperationalEmployees(employees);
  const businessEmployees = operationalEmps.filter(e => e.business_id === business_id);
  const businessAttendance = attendanceLogs.filter(a => a.business_id === business_id);
  
  return businessEmployees.map(emp => {
    const empAttendance = businessAttendance.filter(a => a.employeeId === emp.id);
    const empTx = transactions.filter(t => t.business_id === business_id && t.employeeId === emp.id);
    
    // Attendance & Lateness Scoring
    const totalDays = empAttendance.length;
    const lates = empAttendance.filter(a => a.status === "LATE").length;
    const absents = empAttendance.filter(a => a.status === "ABSENT").length;
    const overtime = empAttendance.filter(a => a.status === "OVERTIME").length;
    
    const totalHours = empAttendance.reduce((sum, a) => sum + (a.realHours || 0), 0);
    const mustWorkHours = empAttendance.reduce((sum, a) => sum + (a.plannedHours || 8), 0);

    const latenessScore = totalDays > 0 ? (lates / totalDays) * 100 : 0;
    const attendanceConsistencyScore = mustWorkHours > 0 ? Math.min(100, (totalHours / mustWorkHours) * 100) : 0;
    const hourRatio = mustWorkHours > 0 ? (totalHours / mustWorkHours) * 100 : 0;
    
    // Productivity Index incorporates commissions/performance and attendance reliability
    const totalCommissions = payrollRecords
      .filter(pr => pr.employeeId === emp.id)
      .reduce((sum, pr) => sum + pr.commissions, 0);
      
    // Bonus productivity for generating commissions
    const commissionBonus = Math.min(20, (totalCommissions / (emp.baseSalary || 1)) * 100);
    const hasWorked = totalDays > 0 || totalCommissions > 0;
    const productivityIndex = hasWorked
      ? Math.max(0, Math.min(100, hourRatio - (latenessScore * 0.5) + commissionBonus))
      : 0;
    
    // Signals
    const overtimeDetection = overtime > 3; // Arbitrary threshold for pattern
    const underperformanceSignal = hasWorked && (latenessScore > 20 || attendanceConsistencyScore < 80);

    return {
      employeeId: emp.id,
      attendanceConsistencyScore,
      latenessScore,
      productivityIndex,
      overtimeDetection,
      underperformanceSignal
    };
  });
};

export const generateBranchEfficiency = (
  workforceMetrics: WorkforceMetrics[],
  employees: Employee[],
  branches: Branch[],
  business_id: string
): BranchEfficiency[] => {
  return branches.filter(b => b.business_id === business_id).map(branch => {
    const branchEmployees = employees.filter(e => e.branchId === branch.id);
    const branchEmpIds = new Set(branchEmployees.map(e => e.id));
    
    const branchMetrics = workforceMetrics.filter(m => branchEmpIds.has(m.employeeId));
    
    const avgProductivityIndex = branchMetrics.length > 0 
      ? branchMetrics.reduce((sum, m) => sum + m.productivityIndex, 0) / branchMetrics.length
      : 0;
      
    const overallAttendanceRate = branchMetrics.length > 0
      ? branchMetrics.reduce((sum, m) => sum + m.attendanceConsistencyScore, 0) / branchMetrics.length
      : 0;

    return {
      branchId: branch.id,
      avgProductivityIndex,
      overallAttendanceRate
    };
  });
};
