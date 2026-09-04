// src/repositories/AnalyticsRepository.ts
import { db } from "../lib/firebase";
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  writeBatch
} from "firebase/firestore";
import { 
  AnalyticsSnapshot, 
  EmployeeDepartmentActivity, 
  WorkforcePerformanceSnapshot, 
  DepartmentAlias 
} from "../types";

export class AnalyticsSnapshotRepository {
  static async getById(businessId: string, snapshotId: string): Promise<AnalyticsSnapshot | null> {
    const docRef = doc(db, "analytics_snapshots", snapshotId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    if (data.businessId !== businessId && data.business_id !== businessId) return null;
    return { id: docSnap.id, ...data } as AnalyticsSnapshot;
  }

  static async getLatest(businessId: string): Promise<AnalyticsSnapshot | null> {
    const q = query(
      collection(db, "analytics_snapshots"),
      where("businessId", "==", businessId),
      orderBy("generatedAt", "desc"),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...docSnap.data() } as AnalyticsSnapshot;
  }

  static async getByPeriodKey(businessId: string, periodKey: string): Promise<AnalyticsSnapshot | null> {
    const q = query(
      collection(db, "analytics_snapshots"),
      where("businessId", "==", businessId),
      where("periodKey", "==", periodKey),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...docSnap.data() } as AnalyticsSnapshot;
  }

  static async listByPeriod(businessId: string, periodKey: string): Promise<AnalyticsSnapshot[]> {
    const q = query(
      collection(db, "analytics_snapshots"),
      where("businessId", "==", businessId),
      where("periodKey", "==", periodKey)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AnalyticsSnapshot));
  }

  static async listByPeriodRange(businessId: string, startPeriod: string, endPeriod: string): Promise<AnalyticsSnapshot[]> {
    const q = query(
      collection(db, "analytics_snapshots"),
      where("businessId", "==", businessId),
      where("periodKey", ">=", startPeriod),
      where("periodKey", "<=", endPeriod)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AnalyticsSnapshot));
  }

  static async create(
    businessId: string, 
    snapshot: Omit<AnalyticsSnapshot, "id" | "createdAt" | "updatedAt">
  ): Promise<AnalyticsSnapshot> {
    const colRef = collection(db, "analytics_snapshots");
    const newDocRef = doc(colRef);
    const now = new Date().toISOString();
    const data: any = {
      ...snapshot,
      businessId,
      business_id: businessId,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(newDocRef, data);
    return { id: newDocRef.id, ...data } as AnalyticsSnapshot;
  }

  static async update(
    businessId: string, 
    snapshotId: string, 
    updates: Partial<AnalyticsSnapshot>
  ): Promise<AnalyticsSnapshot> {
    const docRef = doc(db, "analytics_snapshots", snapshotId);
    const now = new Date().toISOString();
    const data = {
      ...updates,
      updatedAt: now,
    };
    await updateDoc(docRef, data);
    const docSnap = await getDoc(docRef);
    return { id: docSnap.id, ...docSnap.data() } as AnalyticsSnapshot;
  }

  static async delete(businessId: string, snapshotId: string): Promise<void> {
    const docRef = doc(db, "analytics_snapshots", snapshotId);
    await deleteDoc(docRef);
  }
}

export class EmployeeDepartmentActivityRepository {
  static async getByEmployee(businessId: string, employeeId: string): Promise<EmployeeDepartmentActivity[]> {
    const q = query(
      collection(db, "employee_department_activity"),
      where("businessId", "==", businessId),
      where("employeeId", "==", employeeId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as EmployeeDepartmentActivity));
  }

  static async getByDepartment(businessId: string, departmentId: string): Promise<EmployeeDepartmentActivity[]> {
    const q = query(
      collection(db, "employee_department_activity"),
      where("businessId", "==", businessId),
      where("departmentId", "==", departmentId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as EmployeeDepartmentActivity));
  }

  static async getByEmployeeAndDepartment(
    businessId: string, 
    employeeId: string, 
    departmentId: string
  ): Promise<EmployeeDepartmentActivity | null> {
    const id = `${employeeId}_${departmentId}`;
    const docRef = doc(db, "employee_department_activity", id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...docSnap.data() } as EmployeeDepartmentActivity;
  }

  static async upsert(
    businessId: string, 
    activity: Omit<EmployeeDepartmentActivity, "id" | "createdAt" | "updatedAt">
  ): Promise<EmployeeDepartmentActivity> {
    const id = `${activity.employeeId}_${activity.departmentId}`;
    const docRef = doc(db, "employee_department_activity", id);
    const now = new Date().toISOString();
    
    // Support dual cases for safety
    const data: any = {
      ...activity,
      id,
      businessId,
      business_id: businessId,
      employee_id: activity.employeeId,
      department_id: activity.departmentId,
      department_name: activity.departmentName,
      branch_id: activity.branchId,
      created_at: activity.created_at || now,
      updated_at: now,
      createdAt: (activity as any).createdAt || activity.created_at || now,
      updatedAt: now,
    };
    await setDoc(docRef, data, { merge: true });
    return data as EmployeeDepartmentActivity;
  }

  static async bulkUpsert(
    businessId: string, 
    activities: Omit<EmployeeDepartmentActivity, "id" | "createdAt" | "updatedAt">[]
  ): Promise<EmployeeDepartmentActivity[]> {
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    const results: EmployeeDepartmentActivity[] = [];

    for (const activity of activities) {
      const id = `${activity.employeeId}_${activity.departmentId}`;
      const docRef = doc(db, "employee_department_activity", id);
      const data: any = {
        ...activity,
        id,
        businessId,
        business_id: businessId,
        employee_id: activity.employeeId,
        department_id: activity.departmentId,
        department_name: activity.departmentName,
        branch_id: activity.branchId,
        created_at: activity.created_at || now,
        updated_at: now,
        createdAt: (activity as any).createdAt || activity.created_at || now,
        updatedAt: now,
      };
      batch.set(docRef, data, { merge: true });
      results.push(data);
    }
    await batch.commit();
    return results;
  }

  static async deleteByEmployee(businessId: string, employeeId: string): Promise<void> {
    const items = await this.getByEmployee(businessId, employeeId);
    const batch = writeBatch(db);
    for (const item of items) {
      batch.delete(doc(db, "employee_department_activity", item.id));
    }
    await batch.commit();
  }

  static async deleteByDepartment(businessId: string, departmentId: string): Promise<void> {
    const items = await this.getByDepartment(businessId, departmentId);
    const batch = writeBatch(db);
    for (const item of items) {
      batch.delete(doc(db, "employee_department_activity", item.id));
    }
    await batch.commit();
  }
}

export class WorkforcePerformanceSnapshotRepository {
  static async getByEmployee(businessId: string, employeeId: string): Promise<WorkforcePerformanceSnapshot[]> {
    const q = query(
      collection(db, "workforce_performance_snapshots"),
      where("businessId", "==", businessId),
      where("employeeId", "==", employeeId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkforcePerformanceSnapshot));
  }

  static async getByPeriod(businessId: string, periodKey: string): Promise<WorkforcePerformanceSnapshot[]> {
    const q = query(
      collection(db, "workforce_performance_snapshots"),
      where("businessId", "==", businessId),
      where("periodKey", "==", periodKey)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkforcePerformanceSnapshot));
  }

  static async upsert(
    businessId: string, 
    snapshot: Omit<WorkforcePerformanceSnapshot, "id" | "createdAt" | "updatedAt">
  ): Promise<WorkforcePerformanceSnapshot> {
    const id = `${snapshot.periodKey}_${snapshot.employeeId}`;
    const docRef = doc(db, "workforce_performance_snapshots", id);
    const now = new Date().toISOString();
    const data: any = {
      ...snapshot,
      id,
      businessId,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(docRef, data, { merge: true });
    return data as WorkforcePerformanceSnapshot;
  }

  static async bulkUpsert(
    businessId: string, 
    snapshots: Omit<WorkforcePerformanceSnapshot, "id" | "createdAt" | "updatedAt">[]
  ): Promise<WorkforcePerformanceSnapshot[]> {
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    const results: WorkforcePerformanceSnapshot[] = [];

    for (const snapshot of snapshots) {
      const id = `${snapshot.periodKey}_${snapshot.employeeId}`;
      const docRef = doc(db, "workforce_performance_snapshots", id);
      const data: any = {
        ...snapshot,
        id,
        businessId,
        createdAt: now,
        updatedAt: now,
      };
      batch.set(docRef, data, { merge: true });
      results.push(data);
    }
    await batch.commit();
    return results;
  }
}

export class DepartmentAliasRepository {
  static async getByDepartment(businessId: string, departmentId: string): Promise<DepartmentAlias | null> {
    const q = query(
      collection(db, "department_aliases"),
      where("businessId", "==", businessId),
      where("departmentId", "==", departmentId),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...docSnap.data() } as DepartmentAlias;
  }

  static async listAll(businessId: string): Promise<DepartmentAlias[]> {
    const q = query(
      collection(db, "department_aliases"),
      where("businessId", "==", businessId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as DepartmentAlias));
  }

  static async fetchForBusiness(businessId: string): Promise<DepartmentAlias[]> {
    return this.listAll(businessId);
  }

  static async findByAlias(businessId: string, alias: string): Promise<DepartmentAlias | null> {
    const clean = alias.trim().toLowerCase();
    const q = query(
      collection(db, "department_aliases"),
      where("businessId", "==", businessId),
      where("alias", "==", clean),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...docSnap.data() } as DepartmentAlias;
  }

  static async save(alias: DepartmentAlias): Promise<void> {
    const docRef = doc(db, "department_aliases", alias.id);
    await setDoc(docRef, alias, { merge: true });
  }

  static async create(
    businessId: string, 
    alias: Omit<DepartmentAlias, "id" | "createdAt" | "updatedAt">
  ): Promise<DepartmentAlias> {
    const colRef = collection(db, "department_aliases");
    const newDocRef = doc(colRef);
    const now = new Date().toISOString();
    const data: any = {
      ...alias,
      id: newDocRef.id,
      businessId,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(newDocRef, data);
    return data as DepartmentAlias;
  }

  static async update(
    businessId: string, 
    aliasId: string, 
    updates: Partial<DepartmentAlias>
  ): Promise<DepartmentAlias> {
    const docRef = doc(db, "department_aliases", aliasId);
    const now = new Date().toISOString();
    const data = {
      ...updates,
      updatedAt: now,
    };
    await updateDoc(docRef, data);
    const docSnap = await getDoc(docRef);
    return { id: docSnap.id, ...docSnap.data() } as DepartmentAlias;
  }

  static async delete(businessId: string, aliasId: string): Promise<void> {
    const docRef = doc(db, "department_aliases", aliasId);
    await deleteDoc(docRef);
  }

  static async resolveAlias(businessId: string, aliasString: string): Promise<string | null> {
    const allAliases = await this.listAll(businessId);
    const searchVal = aliasString.trim().toLowerCase();
    for (const item of allAliases) {
      if (item.isActive === false) continue;
      // check list/array of aliases
      if (item.aliases && item.aliases.some(a => a.trim().toLowerCase() === searchVal)) {
        return item.departmentId;
      }
      // check single alias field
      if (item.alias && item.alias.trim().toLowerCase() === searchVal) {
        return item.departmentId;
      }
    }
    return null;
  }
}
