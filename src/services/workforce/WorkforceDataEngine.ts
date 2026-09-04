import { db } from "../../lib/firebase";
import { doc, setDoc, getDocs, collection, query, where, doc as firestoreDoc, getDoc } from "firebase/firestore";
import { 
  Employee, 
  AttendanceRecord, 
  EmployeeContract, 
  LeaveRecord, 
  LedgerTransaction, 
  PayrollCycle,
  PayrollRecord,
  PayrollInputSnapshot
} from "../../types";
import { OvertimeRequest } from "./OvertimeService";
import { AbsenceEvent } from "./AttendanceIntegrationService";
import { WorkforceAuditService } from "./WorkforceAuditService";
import { SalesAggregator } from "./SalesAggregator";
import { CommissionEngine } from "../CommissionEngine";

// Known Haitian Holidays (Format: MM-DD)
const HAITIAN_HOLIDAYS = [
  "01-01", // Independence Day
  "01-02", // Ancestors' Day
  "05-01", // Agriculture & Labor Day
  "05-18", // Flag Day
  "10-17", // Dessalines Day
  "11-18", // Battle of Vertières Day
  "12-25", // Christmas Day
];

function isHoliday(dateStr: string): boolean {
  try {
    const parts = dateStr.split("-");
    if (parts.length < 3) return false;
    const mmDd = `${parts[1]}-${parts[2]}`;
    return HAITIAN_HOLIDAYS.includes(mmDd);
  } catch {
    return false;
  }
}

function isWeekend(dateStr: string): boolean {
  try {
    const day = new Date(dateStr).getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  } catch {
    return false;
  }
}

export const WorkforceDataEngine = {
  /**
   * Automatically compute payroll inputs snapshot from Firestore collections in real-time
   */
    calculateSnapshot(params: {
    employee: Employee;
    contract?: EmployeeContract;
    attendanceRecords: AttendanceRecord[];
    shifts: any[];
    leaves: LeaveRecord[];
    transactions: LedgerTransaction[];
    overtimeRequests: OvertimeRequest[];
    absenceEvents: AbsenceEvent[];
    cycle: PayrollCycle;
    socialTaxEligible?: boolean;
  }): PayrollInputSnapshot {
    const { 
      employee, 
      contract, 
      attendanceRecords, 
      transactions, 
      overtimeRequests = [],
      absenceEvents = [],
      cycle,
      socialTaxEligible
    } = params;

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

    const isQuinzaine = cycle.label === "Q1" || cycle.label === "Q2" || cycle.cycleName?.toUpperCase().includes("Q") || true;

    // 1. Employee contract type
    const contractType = (employee.paymentModel || (employee as any).payRegime || contract?.payRegime || "FIXED").toUpperCase();

    // 2. Base salary
    let baseSalary = contract?.salaryBaseHtg || employee.baseSalary || (employee as any).salaryBaseHtg || (employee as any).salary || 0;
    let quincenaBase = isQuinzaine ? baseSalary / 2 : baseSalary;

    if (contractType === "COMMISSION") {
      quincenaBase = 0;
    }

    // 3. Attendance adjustment, Overtime (Prime), and Penalties
    let expectedHours = 96; // Default standard hours for quinzaine
    let workedHours = 0;
    let primeHoursAmount = 0;
    let penalityHoursAmount = 0;

    const matchesEmp = (obj: any) => {
      const oid = obj.employeeId || obj.employee_id || obj.userId || obj.user_id;
      return oid === employee.id || (employee as any).employee_id === oid;
    };

    const cycleAttendance = (attendanceRecords || []).filter(a => {
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

    let dailyExtraHours = 0;
    let dailyMissingHours = 0;
    let totalRealHours = 0;
    let totalPlannedHours = 0;

    if (cycleAttendance.length > 0) {
      cycleAttendance.forEach(a => {
        const real = getRealHours(a);
        const planned = getPlannedHours(a);
        totalRealHours += real;
        totalPlannedHours += planned;
        if (real > planned) {
          dailyExtraHours += (real - planned);
        } else if (real < planned) {
          dailyMissingHours += (planned - real);
        }
      });
      workedHours = totalRealHours;
      if (totalPlannedHours > 0) expectedHours = totalPlannedHours;
    } else {
      workedHours = 0;
    }

    let extraHours = dailyExtraHours;
    let missingHours = dailyMissingHours;

    // Process approved Overtime Requests for explicit Extra Hours
    const approvedOT = (overtimeRequests || []).filter(r => {
      const dk = toDateKey(r.date);
      return matchesEmp(r) && r.status === "APPROVED" && dk >= startKey && dk <= endKey;
    });
    const extraOtHours = approvedOT.reduce((sum, r) => sum + (r.totalHours || 0), 0);
    extraHours += extraOtHours;

    // Process Unexcused Absences for Missing Hours
    const unexcusedAbsences = (absenceEvents || []).filter(a => {
      const dk = toDateKey(a.date);
      return matchesEmp(a) && (a.status === "REJECTED_JUSTIFICATION" || a.type === "UNEXCUSED_ABSENCE") && dk >= startKey && dk <= endKey;
    });
    const unexcusedMinutes = unexcusedAbsences.reduce((sum, a) => sum + (a.minutes || 480), 0);
    missingHours += unexcusedMinutes / 60;

    // Hourly Rate = Base Salary / Expected Hours (10,000 / 96 = 104.17 HTG)
    // For COMMISSION employees with 0 base salary, use standard reference salary of 10,000 HTG
    const monthlySalaryRef = baseSalary > 0 ? baseSalary : 10000;
    const hourlyRate = expectedHours > 0 ? Number((monthlySalaryRef / expectedHours).toFixed(2)) : 0;

    primeHoursAmount = Number((extraHours * hourlyRate).toFixed(2));
    penalityHoursAmount = Number((missingHours * hourlyRate).toFixed(2));

    // 4. Sales commission (ID-BASED PIPELINE: employee_id -> GL Transactions -> department_id -> Sales Aggregator -> Commission)
    let salesAmount = 0;
    let commissionAmount = 0;

    if (contractType !== "FIXED") {
      const summaryId = `ess_${employee.business_id}_${cycle.id}_${employee.id}`;
      const eligibleTxs = SalesAggregator.getEligibleTransactions(
        employee.id,
        transactions,
        startKey,
        endKey,
        employee.email,
        summaryId
      );

      const salesByDept = SalesAggregator.aggregateSalesByEmployeeAndDept(
        employee.id,
        eligibleTxs,
        startKey,
        endKey,
        employee.email,
        summaryId
      );
      salesAmount = Object.values(salesByDept).reduce((sum: number, s: any) => sum + (s?.salesAmount || 0), 0);

      eligibleTxs.forEach(t => {
        const deptId = t.departmentId || (t as any).department_id || "unassigned";
        const amt = t.amount || (t.amount_cents ? t.amount_cents / 100 : 0);
        const txDate = t.date ? t.date.split('T')[0] : startKey;
        
        const temporalRate = CommissionEngine.resolveCommissionRate(employee, contract, txDate);
        const commResult = CommissionEngine.calculateTransactionCommission(
          amt,
          t.category || "REVENUE",
          deptId,
          [],
          (employee as any).commissionPlanId || (employee as any).commission_plan_id,
          temporalRate
        );
        
        commissionAmount += commResult.commissionAmount;
      });
      commissionAmount = Number(commissionAmount.toFixed(2));
    }

    // 5. Bonuses
    const employeeTxs = (transactions || []).filter(t => {
      const dk = toDateKey(t.date);
      return matchesEmp(t) && dk >= startKey && dk <= endKey;
    });
    const bonuses = employeeTxs
      .filter(t => (t.type === "BONUS" || (t.category || "").toUpperCase() === "BONUS") && t.status === "POSTED")
      .reduce((sum, t) => sum + (t.amount || (t.amount_cents ? t.amount_cents / 100 : 0)), 0);

    // 6. Advances
    const advances = employeeTxs
      .filter(t => (t.type === "ADVANCE" || (t.category || "").toUpperCase() === "ADVANCE") && t.status === "POSTED")
      .reduce((sum, t) => sum + (t.amount || (t.amount_cents ? t.amount_cents / 100 : 0)), 0);

    // 7. Gross Salary
    // FIXED: Base + Prime - Penality + Bonus
    // HYBRID: Base + Commission + Prime - Penality + Bonus
    // COMMISSION: Commission + Prime - Penality + Bonus
    let grossSalary = quincenaBase + commissionAmount + primeHoursAmount - penalityHoursAmount + bonuses;
    if (grossSalary < 0) grossSalary = 0;

    // 8. Government deductions
    // Configurable from government_rules, but for now we fallback to standard if eligible
    let cnss = 0;
    let cns = 0;
    const isSocialActive = socialTaxEligible !== false;
    if (isSocialActive) {
      cnss = Number((grossSalary * 0.06).toFixed(2));
      cns = Number((grossSalary * 0.02).toFixed(2));
    }
    const totalDeductions = cnss + cns;

    // 9. Net Salary
    let netSalary = Math.max(0, grossSalary - totalDeductions - advances);

    return {
      id: `snap_${cycle.id}_${employee.id}`,
      business_id: employee.business_id,
      employeeId: employee.id,
      employeeName: employee.name,
      cycleId: cycle.id,
      cycleName: cycle.cycleName || "Cycle",
      
      workedHours: Number(workedHours.toFixed(2)),
      scheduledHours: Number(expectedHours.toFixed(2)),
      overtimeHours: 0,
      nightHours: 0,
      weekendHours: 0,
      holidayHours: 0,
      netPayrollHours: Number(workedHours.toFixed(2)),
      
      baseSalaryHtg: quincenaBase,
      leaveCompensationHtg: 0,
      bonusesHtg: bonuses,
      commissionsHtg: commissionAmount,
      salesHtg: salesAmount,
      latePenaltiesHtg: 0,
      absencePenaltiesHtg: penalityHoursAmount,
      advancesHtg: advances,
      
      deductionsHtg: {
        cnss: cnss,
        cns: cns,
        other: 0,
        total: totalDeductions
      },
      
      grossSalaryHtg: Number(grossSalary.toFixed(2)),
      netSalaryHtg: Number(netSalary.toFixed(2)),
      
      attendanceScore: 100,
      punctualityScore: 100,
      scheduleCompliance: 100,
      leaveCompliance: 100,
      overtimeContribution: primeHoursAmount,
      productivityScore: 100,
      overallWorkforceScore: 100,
      
      payrollStatus: (cycle.status === "LOCKED" || cycle.status === "PAID") ? "LOCKED" : "DRAFT",
      status: (cycle.status === "LOCKED" || cycle.status === "PAID") ? "LOCKED" : "DRAFT",
      generatedAt: new Date().toISOString(),
      generated_at: new Date().toISOString(),
      generated_by: "SYSTEM_WORKFORCE_ENGINE",
      version: 1,
      payroll_cycle_id: cycle.id,
      employee_id: employee.id,
      period_start: startDate,
      period_end: endDate,
      hash: "SHA256::" + btoa(`${employee.business_id}:${employee.id}:${cycle.id}:${grossSalary}:${netSalary}:${Date.now()}`).slice(0, 32).toUpperCase(),

      // Enterprise Structured SSOT Sections
      hr: {
        employee_id: employee.id,
        display_name: employee.name || "Employé",
        employee_name: employee.name,
        email: employee.email || "",
        contract_type: contractType,
        pay_regime: contractType as any,
        salary_base: quincenaBase,
        commission_rate: CommissionEngine.resolveCommissionRate(employee, contract),
        primary_branch: employee.branchId || "br1",
        primary_department: employee.departmentId || "d1",
        department_id: employee.departmentId,
        branch_id: employee.branchId,
        job_title: (employee as any).jobTitle || employee.role,
      },
      sales: {
        sales_total: salesAmount,
        commission_rate: CommissionEngine.resolveCommissionRate(employee, contract),
        commission_amount: commissionAmount,
        source: "GL_TRANSACTIONS",
        transaction_count: employeeTxs.length,
      },
      attendance: {
        expected_hours: expectedHours,
        worked_hours: workedHours,
        extra_hours: extraHours,
        missing_hours: missingHours,
        prime_hours: extraHours,
        prime_amount: primeHoursAmount,
        penalty_hours: missingHours,
        penalty_amount: penalityHoursAmount,
        prime: primeHoursAmount,
        penalty: penalityHoursAmount,
      },
      adjustments: {
        manual_bonus: bonuses,
        manual_deduction: 0,
        advances,
        bonus: bonuses,
        deduction: 0,
        items: [],
      },
    };
  },
  /**
   * Persist a payroll inputs snapshot to Firestore
   */
  async persistSnapshot(snapshot: PayrollInputSnapshot, actor: { id: string, name: string, role: string }): Promise<void> {
    const snapRef = doc(db, "payroll_inputs_snapshots", snapshot.id);
    await setDoc(snapRef, snapshot);

    if (snapshot.business_id) {
      try {
        const tenantSnapRef = doc(db, `businesses/${snapshot.business_id}/payroll_input_snapshots`, snapshot.id);
        await setDoc(tenantSnapRef, snapshot, { merge: true });
      } catch (e) {
        console.warn("[WorkforceDataEngine] Optional tenant path write warning:", e);
      }
    }

    await WorkforceAuditService.logTransition({
      action: "PAYROLL_INPUT_SNAPSHOT_GENERATED" as any,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      employeeId: snapshot.employeeId,
      businessId: snapshot.business_id,
      before: null,
      after: snapshot
    });
  }
};
