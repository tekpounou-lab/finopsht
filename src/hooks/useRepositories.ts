import { useState, useEffect, useMemo } from "react";
import { collection, limit, orderBy, doc, DocumentReference, onSnapshot, where, query } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { useIdentity } from "../modules/identity/IdentityContext";
import { PlanningDomainService } from "../domains/planning/services/PlanningDomainService";
import { useRealtimeSubscription, QueryFilter } from "./useRealtimeSubscription";
import { 
  Employee, 
  LedgerTransaction, 
  AttendanceRecord, 
  PayrollRecord, 
  ERPEvent, 
  ForensicLog, 
  Invitation, 
  EmployeeContract, 
  LeaveRecord, 
  PayrollInputSnapshot, 
  OvertimeRequest, 
  AbsenceEvent, 
  SalaryStructure, 
  PayrollProfile, 
  SalaryAdvance, 
  PayrollBonus, 
  PayrollDeduction, 
  Payslip, 
  EmployeeBadge, 
  CompensationModelConfig, 
  PayrollPolicyConfig, 
  RoleProfile, 
  Branch, 
  Department 
} from "../types";
import { tenantQuery, realtimeManager } from "../services/firestore/realtimeManager";

export function useCompensationModels(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<CompensationModelConfig>(
    "compensation_models",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function usePayrollPolicies(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<PayrollPolicyConfig>(
    "payroll_policies",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function useRoleProfiles(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<RoleProfile>(
    "role_profiles",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function useEmployees(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<Employee>(
    "employees",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export { useLedgerTransactions } from "./useLedgerTransactions";

export function useAttendanceRecords(business_id: string | undefined) {
  const { identity } = useIdentity();
  const filters = useMemo(() => {
    if (!business_id) return [];
    const arr: QueryFilter[] = [{ field: "business_id", operator: "==", value: business_id }];
    if (identity?.role === "EMPLOYEE") {
      const empId = identity.employee?.id || identity.user_uid;
      if (empId) {
        arr.push({ field: "employeeId", operator: "==", value: empId });
      }
    }
    return arr;
  }, [business_id, identity?.role, identity?.employee?.id, identity?.user_uid]);

  const { data: logsData } = useRealtimeSubscription<AttendanceRecord>(
    "attendance_logs",
    filters,
    { 
      enabled: Boolean(business_id), 
      businessId: business_id,
      limitCount: 3000,
      deps: [identity?.user_uid]
    }
  );

  const { data: recordsData } = useRealtimeSubscription<AttendanceRecord>(
    "attendance_records",
    filters,
    { 
      enabled: Boolean(business_id), 
      businessId: business_id,
      limitCount: 3000,
      deps: [identity?.user_uid]
    }
  );

  return useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    
    // Add recordsData first
    if (recordsData && recordsData.length > 0) {
      for (const item of recordsData) {
        if (item.id) map.set(item.id, item);
      }
    }
    
    // Add or merge logsData (overwrites or supplements recordsData)
    if (logsData && logsData.length > 0) {
      for (const item of logsData) {
        if (!item.id) continue;
        const existing = map.get(item.id);
        if (!existing) {
          map.set(item.id, item);
        } else {
          // Merge preference: keep checkOut/realHours if present in either
          map.set(item.id, {
            ...existing,
            ...item,
            checkIn: item.checkIn || existing.checkIn,
            checkOut: item.checkOut || existing.checkOut,
            realHours: item.realHours || existing.realHours || 0,
            status: item.checkOut ? (item.status || existing.status) : existing.status
          });
        }
      }
    }
    
    return Array.from(map.values());
  }, [logsData, recordsData]);
}

export function usePayrollRecords(business_id: string | undefined) {
  const { identity } = useIdentity();
  const filters = useMemo(() => {
    if (!business_id) return [];
    const arr: QueryFilter[] = [{ field: "business_id", operator: "==", value: business_id }];
    if (identity?.role === "EMPLOYEE") {
      const empId = identity.employee?.id || identity.user_uid;
      if (empId) {
        arr.push({ field: "employeeId", operator: "==", value: empId });
      }
    }
    return arr;
  }, [business_id, identity?.role, identity?.employee?.id, identity?.user_uid]);

  const { data } = useRealtimeSubscription<PayrollRecord>(
    "payroll_records",
    filters,
    { 
      enabled: Boolean(business_id), 
      businessId: business_id,
      deps: [identity?.user_uid]
    }
  );
  return data;
}

export function useEvents(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<ERPEvent>(
    "events",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { 
      enabled: Boolean(business_id), 
      businessId: business_id,
      orderByField: "timestamp",
      orderDirection: "desc",
      limitCount: 100
    }
  );
  return data;
}

export function useForensicLogs(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<ForensicLog>(
    "audit_logs",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { 
      enabled: Boolean(business_id), 
      businessId: business_id,
      orderByField: "timestamp",
      orderDirection: "desc",
      limitCount: 200
    }
  );
  return data;
}

export function useInvitations(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<Invitation>(
    "invitations",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function useReadNotifications(userId: string | undefined) {
  const [readIds, setReadIds] = useState<string[]>([]);
  useEffect(() => {
    if (!userId) {
      setReadIds([]);
      return;
    }
    const q = doc(db, "user_preferences", userId);
    const key = `user_preferences:${userId}`;

    const unsubscribe = realtimeManager.subscribe(key, q, (docSnap) => {
      if (docSnap.exists()) {
        setReadIds(docSnap.data().readNotificationIds || []);
      } else {
        setReadIds([]);
      }
    }, (error) => {
      console.warn("[Read Notifications Sync] Error fetching user preferences:", error);
    });
    return () => unsubscribe();
  }, [userId]);

  const updateReadIds = (updateFn: string[] | ((prev: string[]) => string[])) => {
    setReadIds((prev) => {
      const nextIds = typeof updateFn === "function" ? updateFn(prev) : updateFn;
      if (userId) {
        import("firebase/firestore").then(({ setDoc, doc }) => {
          setDoc(doc(db, "user_preferences", userId), { readNotificationIds: nextIds }, { merge: true }).catch(console.error);
        });
      }
      return nextIds;
    });
  };

  return [readIds, updateReadIds] as const;
}

export function useEmployeeContracts(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<EmployeeContract>(
    "employee_contracts",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function useLeaves(business_id: string | undefined) {
  const { identity } = useIdentity();
  const filters = useMemo(() => {
    if (!business_id) return [];
    const arr: QueryFilter[] = [{ field: "business_id", operator: "==", value: business_id }];
    if (identity?.role === "EMPLOYEE") {
      const empId = identity.employee?.id || identity.user_uid;
      if (empId) {
        arr.push({ field: "employeeId", operator: "==", value: empId });
      }
    }
    return arr;
  }, [business_id, identity?.role, identity?.employee?.id, identity?.user_uid]);

  const { data } = useRealtimeSubscription<LeaveRecord>(
    "leaves",
    filters,
    { 
      enabled: Boolean(business_id), 
      businessId: business_id,
      deps: [identity?.user_uid]
    }
  );
  return data;
}

export function useShifts(business_id: string | undefined) {
  const { identity } = useIdentity();
  const employees = useEmployees(business_id);
  const { data: rawShifts } = useRealtimeSubscription<any>(
    "shifts",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );

  const shifts = useMemo(() => {
    if (!identity) return [];
    const actor = identity.employee || {
      id: identity.user_uid,
      role: identity.role || "EMPLOYEE",
    };
    return PlanningDomainService.filterVisibleShifts(rawShifts, actor as any, employees);
  }, [rawShifts, employees, identity]);

  return shifts;
}

export function useShiftTemplates(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<any>(
    "shift_templates",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function useEmployeeAssignments(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<any>(
    "employee_assignments",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function usePayrollInputsSnapshots(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<PayrollInputSnapshot>(
    "payroll_inputs_snapshots",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function useOvertimeRequests(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<OvertimeRequest>(
    "overtime_requests",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function useAbsenceEvents(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<AbsenceEvent>(
    "absence_events",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function useSalaryStructures(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<SalaryStructure>(
    "salary_structures",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function usePayrollProfiles(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<PayrollProfile>(
    "payroll_profiles",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function useSalaryAdvances(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<SalaryAdvance>(
    "salary_advances",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function usePayrollBonuses(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<PayrollBonus>(
    "payroll_bonuses",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function usePayrollDeductions(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<PayrollDeduction>(
    "payroll_deductions",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function usePayslips(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<Payslip>(
    "payslips",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function useEmployeeBadges(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<EmployeeBadge>(
    "employee_badges",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function useAttendanceRules(business_id: string | undefined) {
  const [rules, setRules] = useState<any | null>(null);
  useEffect(() => {
    if (!business_id) return;
    const docRef = doc(db, "attendance_rules", business_id);
    const key = `attendance_rules:${business_id}`;
    
    const unsubscribe = realtimeManager.subscribe(key, docRef, (snap) => {
      if (snap.exists()) {
        setRules(snap.data());
      } else {
        setRules({
          business_id,
          timezone: "America/Port-au-Prince",
          workingDays: [1, 2, 3, 4, 5],
          standardHoursPerDay: 8,
          lateToleranceMinutes: 15,
          criticalLateMinutes: 60,
          nightShiftStart: "18:00",
          nightShiftEnd: "06:00",
          overtimeRate: 1.5,
          updatedAt: new Date().toISOString()
        });
      }
    }, (error) => {
      console.warn("Firestore rules fetch error:", error);
    });
    return () => unsubscribe();
  }, [business_id]);
  return rules;
}

export function useBranchDepartmentLinks(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<any>(
    "branch_department_links",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function useBranches(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<Branch>(
    "branches",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}

export function useDepartments(business_id: string | undefined) {
  const { data } = useRealtimeSubscription<Department>(
    "departments",
    business_id ? [{ field: "business_id", operator: "==", value: business_id }] : [],
    { enabled: Boolean(business_id), businessId: business_id }
  );
  return data;
}
