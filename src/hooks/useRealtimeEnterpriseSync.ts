import { useEffect } from "react";
import { collection, limit, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Employee, LedgerTransaction, AttendanceRecord, PayrollRecord, ERPEvent, ForensicLog, Invitation } from "../types";
import { tenantQuery, realtimeManager } from "../services/firestore/realtimeManager";

interface SyncSetters {
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  setLedgerTransactions: React.Dispatch<React.SetStateAction<LedgerTransaction[]>>;
  setAttendanceRecords: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
  setPayrollRecords: React.Dispatch<React.SetStateAction<PayrollRecord[]>>;
  setEvents: React.Dispatch<React.SetStateAction<ERPEvent[]>>;
  setForensicLogs: React.Dispatch<React.SetStateAction<ForensicLog[]>>;
  setInvitations: React.Dispatch<React.SetStateAction<Invitation[]>>;
}

function processSnapshotDocs<T extends { id: string }>(snap: any, docChanges?: any[]): T[] {
  const changes = docChanges || (typeof snap.docChanges === "function" ? snap.docChanges() : []);
  const removedSet = new Set<string>();
  if (changes && changes.length > 0) {
    changes.forEach((c: any) => {
      if (c.type === "removed" && c.doc?.id) {
        removedSet.add(c.doc.id);
      }
    });
  }
  const arr: T[] = [];
  snap.forEach((d: any) => {
    if (!removedSet.has(d.id)) {
      arr.push({ id: d.id, ...d.data() } as T);
    }
  });
  return arr;
}

export function useRealtimeEnterpriseSync(business_id: string | undefined, setters: SyncSetters) {
  useEffect(() => {
    if (!business_id) return;

    const unsubs: (() => void)[] = [];

    // 1. Employees (shares native listener with useEmployees)
    const qEmp = tenantQuery(collection(db, "employees"), business_id);
    unsubs.push(realtimeManager.subscribe(`employees:${business_id}`, qEmp, (snap, changes) => {
      const arr = processSnapshotDocs<Employee>(snap, changes);
      setters.setEmployees(arr);
    }, (error) => {
      console.warn("[Enterprise Sync] Employees snapshot error:", error);
    }));
    
    // 2. Ledger (shares native listener with useLedgerTransactions)
    const qTx = tenantQuery(
      collection(db, "ledger_transactions"), 
      business_id,
      orderBy("date", "desc"),
      limit(3000)
    );
    unsubs.push(realtimeManager.subscribe(`ledger_transactions:${business_id}:business_id_==_${business_id}:date:desc:3000`, qTx, (snap, changes) => {
      const arr = processSnapshotDocs<LedgerTransaction>(snap, changes);
      setters.setLedgerTransactions(arr);
    }, (error) => {
      console.warn("[Enterprise Sync] Transactions snapshot error:", error);
    }));
    
    // 3. Attendance (shares native listener with useAttendanceRecords)
    const qAtt = tenantQuery(
      collection(db, "attendance_logs"), 
      business_id,
      orderBy("date", "desc"),
      limit(3000)
    );
    unsubs.push(realtimeManager.subscribe(`attendance_logs:${business_id}:business_id_==_${business_id}:date:desc:3000`, qAtt, (snap, changes) => {
      const arr = processSnapshotDocs<AttendanceRecord>(snap, changes);
      setters.setAttendanceRecords(arr);
    }, (error) => {
      console.warn("[Enterprise Sync] Attendance Logs snapshot error:", error);
    }));
    
    // 4. Payroll records (shares native listener with usePayrollRecords)
    const qPay = tenantQuery(collection(db, "payroll_records"), business_id);
    unsubs.push(realtimeManager.subscribe(`payroll_records:${business_id}`, qPay, (snap, changes) => {
      const records = processSnapshotDocs<PayrollRecord>(snap, changes);
      setters.setPayrollRecords(records);
    }, (error) => {
      console.warn("[Enterprise Sync] Payrolls snapshot error:", error);
    }));

    // 5. Events (shares native listener with useEvents)
    const qEv = tenantQuery(
      collection(db, "events"), 
      business_id,
      orderBy("timestamp", "desc"),
      limit(100)
    );
    unsubs.push(realtimeManager.subscribe(`events:${business_id}`, qEv, (snap, changes) => {
      const arr = processSnapshotDocs<ERPEvent>(snap, changes);
      setters.setEvents(arr.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    }, (error) => {
      console.warn("[Enterprise Sync] Events snapshot error:", error);
    }));

    // 6. Audit logs (shares native listener with useForensicLogs)
    const qAud = tenantQuery(
      collection(db, "audit_logs"), 
      business_id,
      orderBy("timestamp", "desc"),
      limit(200)
    );
    unsubs.push(realtimeManager.subscribe(`audit_logs:${business_id}`, qAud, (snap, changes) => {
      const arr = processSnapshotDocs<ForensicLog>(snap, changes);
      setters.setForensicLogs(arr.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    }, (error) => {
      console.warn("[Enterprise Sync] Audit Logs snapshot error:", error);
    }));

    // 7. Invitations (shares native listener with useInvitations)
    const qInv = tenantQuery(collection(db, "invitations"), business_id);
    unsubs.push(realtimeManager.subscribe(`invitations:${business_id}`, qInv, (snap, changes) => {
      const arr = processSnapshotDocs<Invitation>(snap, changes);
      setters.setInvitations(arr);
    }, (error) => {
      console.warn("[Enterprise Sync] Invitations snapshot error:", error);
    }));

    return () => unsubs.forEach(u => u());
  }, [
    business_id,
    setters.setEmployees,
    setters.setLedgerTransactions,
    setters.setAttendanceRecords,
    setters.setPayrollRecords,
    setters.setEvents,
    setters.setForensicLogs,
    setters.setInvitations
  ]);
}
