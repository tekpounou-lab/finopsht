import { auth, db } from "../lib/firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  orderBy,
  QueryConstraint
} from "firebase/firestore";
import { AttendanceRecord, Employee } from "../types";
import { PaginatedRepository, PaginatedResult } from "./PaginatedRepository";
import { getDeviceLocalDate, getDeviceLocalTime, getDeviceMetadata } from "../lib/attendanceSSOT";
import { EventBus } from "../modules/runtime/EventBus";
import { tenantQuery } from "../services/firestore/realtimeManager";
import { mapAttendanceRecord } from "../utils/caseConverter";
import { safeFetchJson } from "../utils/safeFetch";
import { extractCanonicalBusinessId } from "../domains/attendance/AttendanceAuthorizationService";

export interface AttendanceSession {
  sessionId: string;
  employeeId: string;
  businessId: string;
  branchId: string;
  checkIn: {
    timestamp: any;
    method: "QR" | "NFC" | "MANUAL" | "BIOMETRIC";
    deviceId: string;
    location: string;
    locationGeo?: { latitude: number; longitude: number; accuracy?: number } | null;
    deviceDate?: string;
    deviceTime?: string;
    deviceTimezone?: string;
    deviceInfo?: string;
  };
  checkOut: {
    timestamp: any;
    method: "QR" | "NFC" | "MANUAL" | "BIOMETRIC";
    locationGeo?: { latitude: number; longitude: number; accuracy?: number } | null;
    deviceDate?: string;
    deviceTime?: string;
    deviceTimezone?: string;
    deviceInfo?: string;
  } | null;
  status: "ACTIVE" | "COMPLETED" | "FLAGGED" | "CANCELLED";
  totalMinutes: number;
  overtimeMinutes: number;
  void?: boolean;
  voidedBy?: string;
  voidedAt?: any;
  createdAt: any;
}

export interface AttendanceEvent {
  eventId: string;
  action: "CHECK_IN" | "CHECK_OUT" | "MANUAL_ADJUSTMENT" | "BULK_IMPORT" | "RECORD_VOIDED";
  employeeId: string;
  performedBy: string;
  timestamp: any;
  previousState: string | null;
  newState: string;
  deviceInfo: string;
  auditHash: string;
}

export interface AttendanceAdjustmentRequest {
  requestId: string;
  sessionId: string;
  employeeId: string;
  businessId: string;
  requestedHours: number;
  status: "REQUESTED" | "APPROVED" | "APPLIED" | "AUDITED" | "REJECTED";
  reason: string;
  requestedBy: string;
  approvedBy?: string;
  createdAt: any;
}

// Short-lived in-memory caches to make QR scanning near-instantaneous
const periodLockCache = new Map<string, { timestamp: number; lockedCycles: any[] }>();
const employeeActiveCache = new Map<string, { timestamp: number; emp: Employee }>();

export const AttendanceRepository = {
  /**
   * Checks if a target date is inside a LOCKED or SEALED payroll cycle for the tenant.
   * Uses a 30-second memory cache to eliminate redundant network roundtrips during rapid QR scanning.
   */
  async verifyPeriodLock(businessId: string, dateStr: string, options?: { bypassCache?: boolean }): Promise<void> {
    if (!businessId || !dateStr) {
      throw new Error("Pointage refusé: Contexte entreprise ou date manquant pour vérification de période.");
    }

    const now = Date.now();
    let lockedCycles: any[] = [];
    const cached = !options?.bypassCache ? periodLockCache.get(businessId) : undefined;

    if (cached && now - cached.timestamp < 5000) {
      lockedCycles = cached.lockedCycles;
    } else {
      try {
        const lockedStatuses = ["LOCKED", "PESSIMISTIC_LOCKED", "SEALED", "PAID"];
        const [snapSnake, snapCamel] = await Promise.all([
          getDocs(
            query(
              collection(db, "payroll_cycles"),
              where("business_id", "==", businessId),
              where("status", "in", lockedStatuses)
            )
          ),
          getDocs(
            query(
              collection(db, "payroll_cycles"),
              where("businessId", "==", businessId),
              where("status", "in", lockedStatuses)
            )
          )
        ]);
        const merged = new Map<string, any>();
        snapSnake.docs.forEach((d) => merged.set(d.id, { id: d.id, ...d.data() }));
        snapCamel.docs.forEach((d) => merged.set(d.id, { id: d.id, ...d.data() }));
        lockedCycles = Array.from(merged.values());
        periodLockCache.set(businessId, { timestamp: now, lockedCycles });
      } catch (e: any) {
        throw new Error(
          `Vérification du verrouillage de paie impossible (fail-closed): ${e?.message || "Erreur Firestore"}`
        );
      }
    }

    for (const cycle of lockedCycles) {
      const startDate = cycle.startDate || cycle.periodStart;
      const endDate = cycle.endDate || cycle.periodEnd;

      if (!startDate || !endDate) {
        throw new Error(
          `Vérification du verrouillage de paie impossible (fail-closed): bornes de dates manquantes sur le cycle verrouillé (${cycle.id || "unknown"}).`
        );
      }

      if (dateStr >= startDate && dateStr <= endDate) {
        throw new Error(
          `Période verrouillée: Impossible de modifier le pointage pour une période de paie clôturée ou verrouillée (Cycle: ${cycle.cycleName || cycle.label || cycle.id}, Statut: ${cycle.status}).`
        );
      }
    }
  },

  /**
   * Verifies that the employee exists, belongs to the verified businessId, and is ACTIVE before allowing clock-in.
   */
  async verifyEmployeeActive(businessId: string, employeeId: string): Promise<Employee> {
    if (!businessId || !employeeId) {
      throw new Error("Pointage refusé: Identifiant employé ou entreprise manquant.");
    }

    const now = Date.now();
    const cacheKey = `${businessId}_${employeeId}`;
    const cached = employeeActiveCache.get(cacheKey);

    if (cached && now - cached.timestamp < 60000) {
      return cached.emp;
    }

    let empRef = doc(db, "employees", employeeId);
    let empSnap = await getDoc(empRef);

    if (!empSnap.exists()) {
      empRef = doc(db, `businesses/${businessId}/employees`, employeeId);
      empSnap = await getDoc(empRef);
    }

    if (!empSnap.exists()) {
      const userSnap = await getDoc(doc(db, "users", employeeId));
      if (!userSnap.exists()) {
        throw new Error(`Pointage refusé: Employé introuvable (ID: ${employeeId}).`);
      }
      const uData = userSnap.data() || {};
      const userBiz = extractCanonicalBusinessId(uData);
      if (!userBiz) {
        throw new Error(`Pointage refusé: Le profil employé (${employeeId}) ne possède aucun business_id canonique.`);
      }
      if (userBiz !== businessId) {
        throw new Error(`Pointage refusé: Violation d'isolation multi-tenant pour l'employé ${employeeId}.`);
      }
      const uStatus = uData.status ? String(uData.status).toUpperCase() : "ACTIVE";
      if (["INACTIVE", "SUSPENDED", "TERMINATED", "DELETED", "DISABLED", "ARCHIVED"].includes(uStatus) || uData.active === false) {
        throw new Error(`Pointage refusé: L'employé ${uData.name || employeeId} est inactif ou suspendu (${uStatus}).`);
      }
      const activeEmp = { id: employeeId, name: uData.name || "Employé", ...uData, business_id: userBiz } as Employee;
      employeeActiveCache.set(cacheKey, { timestamp: now, emp: activeEmp });
      return activeEmp;
    }

    const rawEmp = { id: empSnap.id, ...(empSnap.data() as any) };
    const canonicalEmpBiz = extractCanonicalBusinessId(rawEmp);
    if (!canonicalEmpBiz) {
      throw new Error(`Pointage refusé: L'employé ${rawEmp.name || employeeId} ne possède aucun business_id canonique.`);
    }
    if (canonicalEmpBiz !== businessId) {
      throw new Error(`Pointage refusé: L'employé ${rawEmp.name || employeeId} appartient à une autre entreprise.`);
    }

    const empData = { ...rawEmp, business_id: canonicalEmpBiz } as Employee;
    const status = empData.status ? String(empData.status).toUpperCase() : "ACTIVE";

    if (["INACTIVE", "SUSPENDED", "TERMINATED", "DELETED", "DISABLED", "ARCHIVED"].includes(status) || empData.isActive === false || (empData as any).active === false) {
      throw new Error(`Pointage refusé: L'employé ${empData.name} est suspendu ou inactif (Statut: ${status}).`);
    }

    employeeActiveCache.set(cacheKey, { timestamp: now, emp: empData });
    return empData;
  },

  async checkIn(params: {
    employeeId: string;
    businessId: string;
    branchId: string;
    method: "QR" | "NFC" | "MANUAL" | "BIOMETRIC";
    deviceId: string;
    location: string;
    locationGeo?: { latitude: number; longitude: number; accuracy?: number } | null;
    actor: {
      id: string;
      name: string;
      role: string;
      businessId?: string;
      branchId?: string;
      departmentId?: string;
      employeeId?: string;
      authorizedBranchIds?: string[];
      authorizedDepartmentIds?: string[];
      authorizedTeamIds?: string[];
      explicitAttendanceDelegation?: boolean;
      isSuperAdmin?: boolean;
    };
    overrideTimestamp?: Date;
    deviceDate?: string;
    deviceTime?: string;
    deviceTimezone?: string;
    deviceInfo?: string;
    badgeId?: string;
    qrSignature?: string;
    badgePayload?: string;
    idempotencyKey?: string;
    preferDirectFirestore?: boolean;
  }): Promise<any> {
    if (params.preferDirectFirestore) {
      throw new Error(
        "MUTATION_BYPASS_DENIED: Les mutations directes de pointage côté client sont désactivées. Utilisez l'API serveur /api/attendance/check-in."
      );
    }

    if (!auth?.currentUser || typeof auth.currentUser.getIdToken !== "function") {
      throw new Error("Authentification Firebase requise pour enregistrer une arrivée.");
    }

    const {
      employeeId,
      businessId,
      branchId,
      method,
      deviceId,
      location,
      locationGeo,
      overrideTimestamp,
      deviceDate,
      deviceTime,
      deviceTimezone,
      deviceInfo,
      badgeId,
      qrSignature,
      badgePayload,
      idempotencyKey
    } = params;

    const localNow = overrideTimestamp || new Date();
    const devMeta = getDeviceMetadata();
    const dateStr = deviceDate || getDeviceLocalDate(localNow);
    const timeStr = deviceTime || getDeviceLocalTime(localNow);
    const tzStr = deviceTimezone || devMeta.deviceTimezone;
    const infoStr = deviceInfo || devMeta.userAgent;

    const apiResp = await safeFetchJson<{ success: boolean; session: any; idempotentReplay?: boolean }>("/api/attendance/check-in", {
      method: "POST",
      body: JSON.stringify({
        employeeId,
        businessId,
        branchId,
        method,
        deviceId: deviceId || devMeta.deviceId,
        location,
        locationGeo,
        deviceDate: dateStr,
        deviceTime: timeStr,
        deviceTimezone: tzStr,
        deviceInfo: infoStr,
        badgeId,
        qrSignature,
        badgePayload,
        idempotencyKey,
        overrideTimestamp: overrideTimestamp ? overrideTimestamp.toISOString() : undefined
      })
    });

    if (!apiResp?.session) {
      throw new Error("Échec de l'enregistrement d'arrivée: réponse serveur invalide (fail-closed).");
    }

    periodLockCache.delete(businessId);
    return apiResp.session;
  },

  /**
   * Server-authoritative check-out via /api/attendance/check-out
   */
  async checkOut(params: {
    sessionId: string;
    employeeId?: string;
    businessId?: string;
    method: "QR" | "NFC" | "MANUAL" | "BIOMETRIC";
    locationGeo?: { latitude: number; longitude: number; accuracy?: number } | null;
    actor: {
      id: string;
      name: string;
      role: string;
      businessId?: string;
      branchId?: string;
      departmentId?: string;
      employeeId?: string;
      authorizedBranchIds?: string[];
      authorizedDepartmentIds?: string[];
      authorizedTeamIds?: string[];
      explicitAttendanceDelegation?: boolean;
      isSuperAdmin?: boolean;
    };
    overrideTimestamp?: Date;
    deviceId?: string;
    deviceDate?: string;
    deviceTime?: string;
    deviceTimezone?: string;
    deviceInfo?: string;
    badgeId?: string;
    qrSignature?: string;
    badgePayload?: string;
    idempotencyKey?: string;
    preferDirectFirestore?: boolean;
  }): Promise<any> {
    if (params.preferDirectFirestore) {
      throw new Error(
        "MUTATION_BYPASS_DENIED: Les mutations directes de pointage côté client sont désactivées. Utilisez l'API serveur /api/attendance/check-out."
      );
    }

    if (!auth?.currentUser || typeof auth.currentUser.getIdToken !== "function") {
      throw new Error("Authentification Firebase requise pour enregistrer une sortie.");
    }

    const {
      sessionId,
      employeeId,
      businessId,
      method,
      locationGeo,
      overrideTimestamp,
      deviceId,
      deviceDate,
      deviceTime,
      deviceTimezone,
      deviceInfo,
      badgeId,
      qrSignature,
      badgePayload,
      idempotencyKey
    } = params;

    const localNow = overrideTimestamp || new Date();
    const devMeta = getDeviceMetadata();
    const dateStrToday = deviceDate || getDeviceLocalDate(localNow);
    const timeStrToday = deviceTime || getDeviceLocalTime(localNow);
    const tzStr = deviceTimezone || devMeta.deviceTimezone;
    const infoStr = deviceInfo || devMeta.userAgent;

    const apiResp = await safeFetchJson<{ success: boolean; session: any; idempotentReplay?: boolean }>("/api/attendance/check-out", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        employeeId,
        businessId,
        method,
        locationGeo,
        deviceId: deviceId || devMeta.deviceId,
        deviceDate: dateStrToday,
        deviceTime: timeStrToday,
        deviceTimezone: tzStr,
        deviceInfo: infoStr,
        badgeId,
        qrSignature,
        badgePayload,
        idempotencyKey,
        overrideTimestamp: overrideTimestamp ? overrideTimestamp.toISOString() : undefined
      })
    });

    if (!apiResp?.session) {
      throw new Error("Échec de l'enregistrement de sortie: réponse serveur invalide (fail-closed).");
    }

    if (businessId) {
      periodLockCache.delete(businessId);
    }
    return apiResp.session;
  },

  async getActiveSession(employeeId: string): Promise<string | null> {
    const snap = await getDoc(doc(db, "attendance_status", employeeId));
    if (snap.exists() && snap.data().activeSessionId) {
      return snap.data().activeSessionId;
    }
    return null;
  },

  /**
   * Queries attendance records leveraging composite index (business_id + employeeId + date)
   */
  async listByEmployeeAndDate(
    businessId: string,
    employeeId: string,
    startDate: string,
    endDate: string
  ): Promise<AttendanceRecord[]> {
    const q = tenantQuery(
      collection(db, "attendance_logs"),
      businessId,
      where("employeeId", "==", employeeId),
      where("date", ">=", startDate),
      where("date", "<=", endDate),
      orderBy("date", "desc")
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => mapAttendanceRecord<AttendanceRecord>({ id: docSnap.id, ...docSnap.data() }));
  },

  /**
   * Fetches attendance logs using Firestore cursor-based pagination.
   */
  async listByBusinessPaginated(
    businessId: string,
    options: { pageSize?: number; lastDoc?: any; employeeId?: string; startDate?: string; endDate?: string } = {}
  ): Promise<PaginatedResult<AttendanceRecord>> {
    if (!businessId) {
      return { items: [], lastDoc: null, hasMore: false, totalFetched: 0 };
    }

    const constraints: QueryConstraint[] = [where("business_id", "==", businessId)];
    if (options.employeeId && options.employeeId !== "ALL") {
      constraints.push(where("employeeId", "==", options.employeeId));
    }
    if (options.startDate) {
      constraints.push(where("date", ">=", options.startDate));
    }
    if (options.endDate) {
      constraints.push(where("date", "<=", options.endDate));
    }

    return await PaginatedRepository.getPaginated<AttendanceRecord>({
      collectionPath: "attendance_logs",
      constraints,
      pageSize: options.pageSize || 50,
      lastDoc: options.lastDoc,
      orderByField: "date",
      orderDirection: "desc",
      transform: (d) => mapAttendanceRecord<AttendanceRecord>({ id: d.id, ...d.data() })
    });
  },

  /**
   * Request manual adjustment via server API
   */
  async createAdjustmentRequest(params: {
    sessionId: string;
    employeeId: string;
    businessId: string;
    requestedHours: number;
    reason: string;
    actor: { id: string; name: string; role: string };
  }): Promise<AttendanceAdjustmentRequest> {
    if (!auth?.currentUser || typeof auth.currentUser.getIdToken !== "function") {
      throw new Error("Authentification Firebase requise pour soumettre une demande d'ajustement.");
    }

    const { sessionId, employeeId, businessId, requestedHours, reason } = params;
    const apiResp = await safeFetchJson<{ success: boolean; request: AttendanceAdjustmentRequest }>("/api/attendance/adjustments", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        employeeId,
        businessId,
        requestedHours,
        reason
      })
    });

    if (!apiResp?.request) {
      throw new Error("Échec de la création de demande d'ajustement (fail-closed).");
    }

    return apiResp.request;
  },

  /**
   * Approve and apply adjustment request transactionally via server API (enforces Maker-Checker + RBAC + payroll lock)
   */
  async approveAdjustmentRequest(params: {
    requestId: string;
    businessId?: string;
    actor: { id: string; name: string; role: string };
  }): Promise<void> {
    if (!auth?.currentUser || typeof auth.currentUser.getIdToken !== "function") {
      throw new Error("Authentification Firebase requise pour approuver une demande d'ajustement.");
    }

    const { requestId, businessId } = params;
    const apiResp = await safeFetchJson<{ success: boolean; request: AttendanceAdjustmentRequest }>("/api/attendance/adjustments/approve", {
      method: "POST",
      body: JSON.stringify({
        requestId,
        businessId
      })
    });

    if (!apiResp?.success) {
      throw new Error("Échec de l'approbation d'ajustement (fail-closed).");
    }

    if (businessId) {
      periodLockCache.delete(businessId);
    }
  },

  /**
   * Rules management
   */
  async getRules(businessId: string): Promise<any> {
    const docRef = doc(db, "attendance_rules", businessId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }

    const defaultRules = {
      business_id: businessId,
      timezone: "America/Port-au-Prince",
      workingDays: [1, 2, 3, 4, 5],
      standardHoursPerDay: 8,
      lateToleranceMinutes: 15,
      criticalLateMinutes: 60,
      nightShiftStart: "18:00",
      nightShiftEnd: "06:00",
      overtimeRate: 1.5,
      updatedAt: serverTimestamp()
    };

    await setDoc(docRef, defaultRules);
    return defaultRules;
  },

  async saveRules(businessId: string, rules: any): Promise<void> {
    const docRef = doc(db, "attendance_rules", businessId);
    await setDoc(docRef, {
      business_id: businessId,
      ...rules,
      updatedAt: serverTimestamp()
    }, { merge: true });
  },

  /**
   * Saves or updates an attendance record via server /api/attendance/override
   */
  async updateRecord(id: string, data: Partial<AttendanceRecord>, actor: any): Promise<void> {
    if (!auth?.currentUser || typeof auth.currentUser.getIdToken !== "function") {
      throw new Error("Authentification Firebase requise pour modifier un pointage.");
    }

    const businessId = data.business_id || (data as any).businessId || actor?.business_id || actor?.businessId;
    const apiResp = await safeFetchJson<{ success: boolean; record: AttendanceRecord }>("/api/attendance/override", {
      method: "POST",
      body: JSON.stringify({
        recordId: id,
        employeeId: data.employeeId,
        businessId,
        branchId: data.branchId,
        departmentId: data.departmentId,
        date: data.date,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        plannedHours: data.plannedHours,
        realHours: data.realHours,
        status: data.status,
        reason: (data as any).overrideReason || (data as any).reason || "Mise à jour du registre de présence"
      })
    });

    if (!apiResp?.success) {
      throw new Error("Échec de la mise à jour du pointage côté serveur (fail-closed).");
    }

    if (businessId) {
      periodLockCache.delete(businessId);
    }
  },

  async batchSaveRecords(businessId: string, records: AttendanceRecord[], _actor: any): Promise<void> {
    if (!records || records.length === 0) return;

    if (!auth?.currentUser || typeof auth.currentUser.getIdToken !== "function") {
      throw new Error("Authentification Firebase requise pour l'importation en masse.");
    }

    const apiResp = await safeFetchJson<{ success: boolean; count: number }>("/api/attendance/bulk-import", {
      method: "POST",
      body: JSON.stringify({
        businessId,
        records
      })
    });

    if (!apiResp?.success) {
      throw new Error("Échec de l'importation massive côté serveur (fail-closed).");
    }

    periodLockCache.delete(businessId);
  },

  async saveRecord(record: AttendanceRecord, actor?: { uid: string; name?: string; role?: string }): Promise<void> {
    if (!auth?.currentUser || typeof auth.currentUser.getIdToken !== "function") {
      throw new Error("Authentification Firebase requise pour enregistrer un pointage.");
    }

    const bizId = record.business_id || (record as any).businessId;
    const apiResp = await safeFetchJson<{ success: boolean; record: AttendanceRecord }>("/api/attendance/override", {
      method: "POST",
      body: JSON.stringify({
        recordId: record.id,
        employeeId: record.employeeId,
        businessId: bizId,
        branchId: record.branchId,
        departmentId: record.departmentId,
        date: record.date,
        checkIn: record.checkIn,
        checkOut: record.checkOut,
        plannedHours: record.plannedHours,
        realHours: record.realHours,
        status: record.status,
        reason: record.overrideReason || "Enregistrement de pointage"
      })
    });

    if (!apiResp?.success) {
      throw new Error("Échec de l'enregistrement du pointage côté serveur (fail-closed).");
    }

    if (bizId) {
      periodLockCache.delete(bizId);
    }

    EventBus.publish(EventBus.createEvent({
      correlationId: `att_save_${record.id}_${Date.now()}`,
      actorId: actor?.uid || auth.currentUser.uid,
      businessId: bizId,
      module: "ATTENDANCE",
      aggregate: "ATTENDANCE_RECORD",
      type: "AttendanceRecordSaved",
      payload: { recordId: record.id, employeeId: record.employeeId, date: record.date }
    }));
  },

  /**
   * Submits an attendance justification via SSOT repository.
   */
  async submitJustification(params: {
    businessId: string;
    employeeId: string;
    employeeName: string;
    attendanceId: string;
    date: string;
    note: string;
  }): Promise<void> {
    const actorUid = auth?.currentUser?.uid;
    if (!actorUid) {
      throw new Error("Authentification Firebase requise pour soumettre une justification.");
    }

    const docRef = doc(collection(db, "attendance_justifications"));
    await setDoc(docRef, {
      id: docRef.id,
      business_id: params.businessId,
      businessId: params.businessId,
      employeeId: params.employeeId,
      employeeName: params.employeeName,
      attendanceId: params.attendanceId,
      date: params.date,
      note: params.note,
      status: "PENDING",
      recordedBy: actorUid,
      actorId: actorUid,
      createdAt: new Date().toISOString()
    });

    EventBus.publish(EventBus.createEvent({
      correlationId: `justif_${docRef.id}`,
      actorId: actorUid,
      businessId: params.businessId,
      module: "ATTENDANCE",
      aggregate: "ATTENDANCE_JUSTIFICATION",
      type: "AttendanceJustificationSubmitted",
      payload: { id: docRef.id, employeeId: params.employeeId, attendanceId: params.attendanceId }
    }));
  },
  
  async batchDeleteRecords(recordIds: string[], actor: any, businessId?: string): Promise<void> {
    if (!recordIds.length) return;

    if (!auth?.currentUser || typeof auth.currentUser.getIdToken !== "function") {
      throw new Error("Authentification Firebase requise pour supprimer des pointages.");
    }

    const resolvedBizId = businessId || actor?.business_id || actor?.businessId;
    const apiResp = await safeFetchJson<{ success: boolean; deletedCount: number }>("/api/attendance/delete", {
      method: "POST",
      body: JSON.stringify({
        recordIds,
        businessId: resolvedBizId
      })
    });

    if (!apiResp?.success) {
      throw new Error("Échec de la suppression côté serveur (fail-closed).");
    }

    if (resolvedBizId) {
      periodLockCache.delete(resolvedBizId);
    }

    EventBus.publish(EventBus.createEvent({
      correlationId: `bulk_del_${Math.random().toString(36).substr(2, 9)}`,
      actorId: auth.currentUser.uid,
      businessId: resolvedBizId || "UNKNOWN",
      module: "ATTENDANCE",
      aggregate: "ATTENDANCE_LEDGER",
      type: "AttendanceRecordsDeleted",
      payload: { deletedCount: apiResp.deletedCount ?? recordIds.length, recordIds }
    }));
  }
};
