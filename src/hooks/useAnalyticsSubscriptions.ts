// src/hooks/useAnalyticsSubscriptions.ts
import { useState, useEffect, useMemo } from "react";
import { collection, limit, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import { tenantQuery } from "../services/firestore/realtimeManager";
import { FirestoreRealtimeManager } from "../services/firestore/FirestoreRealtimeManager";
import {
  Employee,
  LedgerTransaction,
  AttendanceRecord,
  PayrollRecord,
  Department,
  Branch,
  EmployeeContract,
  EmployeeDepartmentActivity,
  PayrollCycle,
} from "../types";

export interface AnalyticsSubscriptions {
  employees: Employee[];
  transactions: LedgerTransaction[];
  attendance: AttendanceRecord[];
  payrollRecords: PayrollRecord[];
  payrollCycles: PayrollCycle[];
  departments: Department[];
  branches: Branch[];
  departmentActivities: EmployeeDepartmentActivity[];
  contracts: EmployeeContract[];
  isLoading: boolean;
  error: string | null;
}

export function useAnalyticsSubscriptions(businessId: string): AnalyticsSubscriptions {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [payrollCycles, setPayrollCycles] = useState<PayrollCycle[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departmentActivities, setDepartmentActivities] = useState<EmployeeDepartmentActivity[]>([]);
  const [contracts, setContracts] = useState<EmployeeContract[]>([]);

  const [loadingStates, setLoadingStates] = useState({
    emp: true,
    tx: true,
    att: true,
    pay: true,
    cycle: true,
    dept: true,
    branch: true,
    activity: true,
    contract: true,
  });

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) {
      setEmployees([]);
      setTransactions([]);
      setAttendance([]);
      setPayrollRecords([]);
      setPayrollCycles([]);
      setDepartments([]);
      setBranches([]);
      setDepartmentActivities([]);
      setContracts([]);
      setLoadingStates({
        emp: false,
        tx: false,
        att: false,
        pay: false,
        cycle: false,
        dept: false,
        branch: false,
        activity: false,
        contract: false,
      });
      return;
    }

    setLoadingStates({
      emp: true,
      tx: true,
      att: true,
      pay: true,
      cycle: true,
      dept: true,
      branch: true,
      activity: true,
      contract: true,
    });
    setError(null);

    console.debug(`[useAnalyticsSubscriptions] Initializing subscriptions for businessId: ${businessId}`);

    // 1. Employees query with bound and order
    const qEmp = tenantQuery(collection(db, "employees"), businessId, orderBy("name"), limit(200));
    const unsubEmp = FirestoreRealtimeManager.registerListener(
      `employees:${businessId}`,
      "employees",
      qEmp,
      (data) => {
        console.debug(`[useAnalyticsSubscriptions] Loaded ${data.length} employees`);
        setEmployees(data as Employee[]);
        setLoadingStates((prev) => ({ ...prev, emp: false }));
      }
    );

    // 2. Transactions query with bound and order
    const qTx = tenantQuery(collection(db, "ledger_transactions"), businessId, orderBy("date", "desc"), limit(300));
    const unsubTx = FirestoreRealtimeManager.registerListener(
      `transactions:${businessId}`,
      "transactions",
      qTx,
      (data) => {
        console.debug(`[useAnalyticsSubscriptions] Loaded ${data.length} transactions`);
        setTransactions(data as LedgerTransaction[]);
        setLoadingStates((prev) => ({ ...prev, tx: false }));
      }
    );

    // 3. Attendance query
    const qAtt = tenantQuery(collection(db, "attendance_logs"), businessId, orderBy("date", "desc"), limit(300));
    const unsubAtt = FirestoreRealtimeManager.registerListener(
      `attendance_logs:${businessId}`,
      "attendance_logs",
      qAtt,
      (data) => {
        console.debug(`[useAnalyticsSubscriptions] Loaded ${data.length} attendance logs`);
        setAttendance(data as AttendanceRecord[]);
        setLoadingStates((prev) => ({ ...prev, att: false }));
      }
    );

    // 4. Payroll Records query
    const qPay = tenantQuery(collection(db, "payroll_records"), businessId, limit(200));
    const unsubPay = FirestoreRealtimeManager.registerListener(
      `payroll_records:${businessId}`,
      "payroll_records",
      qPay,
      (data) => {
        console.debug(`[useAnalyticsSubscriptions] Loaded ${data.length} payroll records`);
        setPayrollRecords(data as PayrollRecord[]);
        setLoadingStates((prev) => ({ ...prev, pay: false }));
      }
    );

    // 4b. Payroll Cycles query
    const qCycle = tenantQuery(collection(db, "payroll_cycles"), businessId, limit(50));
    const unsubCycle = FirestoreRealtimeManager.registerListener(
      `payroll_cycles:${businessId}`,
      "payroll_cycles",
      qCycle,
      (data) => {
        console.debug(`[useAnalyticsSubscriptions] Loaded ${data.length} payroll cycles`);
        setPayrollCycles(data as PayrollCycle[]);
        setLoadingStates((prev) => ({ ...prev, cycle: false }));
      }
    );

    // 5. Departments query
    const qDept = tenantQuery(collection(db, "departments"), businessId, orderBy("name"), limit(50));
    const unsubDept = FirestoreRealtimeManager.registerListener(
      `departments:${businessId}`,
      "departments",
      qDept,
      (data) => {
        setDepartments(data as Department[]);
        setLoadingStates((prev) => ({ ...prev, dept: false }));
      }
    );

    // 6. Branches query
    const qBranch = tenantQuery(collection(db, "branches"), businessId, limit(50));
    const unsubBranch = FirestoreRealtimeManager.registerListener(
      `branches:${businessId}`,
      "branches",
      qBranch,
      (data) => {
        setBranches(data as Branch[]);
        setLoadingStates((prev) => ({ ...prev, branch: false }));
      }
    );

    // 7. Employee Department Activity query
    const qAct = tenantQuery(collection(db, "employee_department_activity"), businessId, limit(200));
    const unsubAct = FirestoreRealtimeManager.registerListener(
      `employee_department_activity:${businessId}`,
      "employee_department_activity",
      qAct,
      (data) => {
        setDepartmentActivities(data as EmployeeDepartmentActivity[]);
        setLoadingStates((prev) => ({ ...prev, activity: false }));
      }
    );

    // 8. Employee Contracts query
    const qCont = tenantQuery(collection(db, "employee_contracts"), businessId, limit(200));
    const unsubCont = FirestoreRealtimeManager.registerListener(
      `employee_contracts:${businessId}`,
      "employee_contracts",
      qCont,
      (data) => {
        setContracts(data as EmployeeContract[]);
        setLoadingStates((prev) => ({ ...prev, contract: false }));
      }
    );

    return () => {
      unsubEmp();
      unsubTx();
      unsubAtt();
      unsubPay();
      unsubCycle();
      unsubDept();
      unsubBranch();
      unsubAct();
      unsubCont();
    };
  }, [businessId]);

  const isLoading = useMemo(() => {
    return Object.values(loadingStates).some((loading) => loading);
  }, [loadingStates]);

  return {
    employees,
    transactions,
    attendance,
    payrollRecords,
    payrollCycles,
    departments,
    branches,
    departmentActivities,
    contracts,
    isLoading,
    error,
  };
}
