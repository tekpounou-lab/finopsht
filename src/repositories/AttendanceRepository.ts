import { db } from "../lib/firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  runTransaction,
  serverTimestamp,
  GeoPoint,
  orderBy,
  writeBatch,
  QueryConstraint
} from "firebase/firestore";
import { AttendanceRecord, Employee } from "../types";
import { PaginatedRepository, PaginatedResult } from "./PaginatedRepository";
import { EmployeeAuditService } from "../services/audit/EmployeeAuditService";
import { ScheduleRepository } from "./ScheduleRepository";
import { calculateAttendanceVariance, getDeviceLocalDate, getDeviceLocalTime, getDeviceMetadata } from "../lib/attendanceSSOT";
import { EventBus } from "../modules/runtime/EventBus";
import { tenantQuery } from "../services/firestore/realtimeManager";
import { mapAttendanceRecord } from "../utils/caseConverter";
import { IntegrityValidator } from "../services/integrity/ForeignKeyIntegrityValidator";

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
  async verifyPeriodLock(businessId: string, dateStr: string): Promise<void> {
    if (!businessId || !dateStr) return;

    const now = Date.now();
    let lockedCycles: any[] = [];
    const cached = periodLockCache.get(businessId);

    if (cached && now - cached.timestamp < 30000) {
      lockedCycles = cached.lockedCycles;
    } else {
      try {
        const q = query(
          collection(db, "payroll_cycles"),
          where("business_id", "==", businessId),
          where("status", "in", ["LOCKED", "PESSIMISTIC_LOCKED", "SEALED", "PAID"])
        );
        const snapshot = await getDocs(q);
        lockedCycles = snapshot.docs.map(docSnap => docSnap.data());
        periodLockCache.set(businessId, { timestamp: now, lockedCycles });
      } catch (e) {
        // Fallback to cached if network glitch
        if (cached) lockedCycles = cached.lockedCycles;
      }
    }

    for (const cycle of lockedCycles) {
      const startDate = cycle.startDate || cycle.periodStart;
      const endDate = cycle.endDate || cycle.periodEnd;

      if (startDate && endDate && dateStr >= startDate && dateStr <= endDate) {
        throw new Error(
          `Période verrouillée: Impossible de modifier le pointage pour une période de paie clôturée ou verrouillée (Cycle: ${cycle.cycleName || cycle.label || cycle.id}, Statut: ${cycle.status}).`
        );
      }
    }
  },

  /**
   * Verifies that the employee exists and is ACTIVE before allowing clock-in.
   * Uses 60-second in-memory cache to speed up scanning.
   */
  async verifyEmployeeActive(businessId: string, employeeId: string): Promise<Employee> {
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
      // Fallback check users collection
      const userSnap = await getDoc(doc(db, "users", employeeId));
      if (!userSnap.exists()) {
        throw new Error(`Pointage refusé: Employé introuvable (ID: ${employeeId}).`);
      }
      const uData = userSnap.data() || {};
      if (uData.status === "SUSPENDED" || uData.status === "TERMINATED" || uData.status === "ARCHIVED") {
        throw new Error(`Pointage refusé: L'employé ${uData.name || employeeId} est inactif ou suspendu (${uData.status}).`);
      }
      const activeEmp = { id: employeeId, name: uData.name || "Employé", business_id: businessId, ...uData } as Employee;
      employeeActiveCache.set(cacheKey, { timestamp: now, emp: activeEmp });
      return activeEmp;
    }

    const empData = empSnap.data() as Employee;
    const status = empData.status ? String(empData.status).toUpperCase() : "ACTIVE";

    if (status === "SUSPENDED" || status === "TERMINATED" || status === "ARCHIVED" || empData.isActive === false) {
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
    actor: { id: string; name: string; role: string };
    overrideTimestamp?: Date;
    deviceDate?: string;
    deviceTime?: string;
    deviceTimezone?: string;
    deviceInfo?: string;
  }): Promise<any> {
    const { 
      employeeId, 
      businessId, 
      branchId, 
      method, 
      deviceId, 
      location, 
      locationGeo, 
      actor, 
      overrideTimestamp,
      deviceDate,
      deviceTime,
      deviceTimezone,
      deviceInfo 
    } = params;
    const localNow = overrideTimestamp || new Date();
    const localIso = localNow.toISOString();
    const devMeta = getDeviceMetadata();
    const dateStr = deviceDate || getDeviceLocalDate(localNow);
    const timeStr = deviceTime || getDeviceLocalTime(localNow);
    const tzStr = deviceTimezone || devMeta.deviceTimezone;
    const infoStr = deviceInfo || devMeta.userAgent;

    // 1. Period Lock Check
    await this.verifyPeriodLock(businessId, dateStr);

    // 2. Active Employee Check
    const activeEmp = await this.verifyEmployeeActive(businessId, employeeId);

    // 3. Shift Assignment Check (ScheduleRepository)
    let isUnplanned = false;
    try {
      const shift = await ScheduleRepository.getShiftByEmployeeAndDate(businessId, employeeId, dateStr);
      if (!shift) isUnplanned = true;
    } catch (e) {
      isUnplanned = true;
    }

    const sessionId = `sess_${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = overrideTimestamp ? overrideTimestamp : serverTimestamp();

    // Validated Geolocation
    const formattedGeo = locationGeo && !isNaN(locationGeo.latitude) && !isNaN(locationGeo.longitude)
      ? {
          geoPoint: new GeoPoint(locationGeo.latitude, locationGeo.longitude),
          latitude: locationGeo.latitude,
          longitude: locationGeo.longitude,
          accuracy: locationGeo.accuracy || 0
        }
      : null;

    const newSession: any = {
      sessionId,
      employeeId,
      businessId,
      branchId,
      checkIn: {
        timestamp,
        method,
        deviceId: deviceId || devMeta.deviceId,
        location,
        locationGeo: formattedGeo,
        deviceDate: dateStr,
        deviceTime: timeStr,
        deviceTimezone: tzStr,
        deviceInfo: infoStr
      },
      checkOut: null,
      status: "ACTIVE",
      totalMinutes: 0,
      overtimeMinutes: 0,
      createdAt: timestamp,
      unplanned: isUnplanned
    };

    const legacyRecord: any = {
      id: sessionId,
      employeeId,
      employeeName: activeEmp.name || actor.name,
      business_id: businessId,
      branchId: branchId || activeEmp.branchId || "BRANCH_DEFAULT",
      departmentId: activeEmp.departmentId || "DEPT_DEFAULT",
      date: dateStr,
      checkIn: timeStr,
      checkOut: null,
      plannedHours: isUnplanned ? 0 : 8,
      realHours: 0,
      variance: isUnplanned ? 0 : -8,
      status: "NORMAL",
      unplanned: isUnplanned,
      deviceId: deviceId || devMeta.deviceId,
      deviceTimezone: tzStr
    };

    const hash = `hash_${Math.floor(Math.random() * 99999999)}`;
    const newEvent: any = {
      eventId: `ev_${Math.random().toString(36).substring(2, 9)}`,
      action: "CHECK_IN",
      employeeId,
      business_id: businessId,
      performedBy: actor.id,
      timestamp,
      previousState: null,
      newState: JSON.stringify(params),
      deviceInfo: infoStr,
      auditHash: hash
    };

    await runTransaction(db, async (transaction) => {
      // Use attendance_status singleton to enforce no concurrent sessions on same day
      const statusRef = doc(db, "attendance_status", employeeId);
      const statusSnap = await transaction.get(statusRef);
      if (statusSnap.exists() && statusSnap.data()?.activeSessionId) {
        const prevData = statusSnap.data();
        const prevDate = prevData.lastCheckInDate || (prevData.lastCheckIn ? String(prevData.lastCheckIn).split("T")[0] : "");
        // If the active session is from a previous calendar day, allow clock-in for today
        if (prevDate && prevDate === dateStr) {
          throw new Error("L'employé a déjà une session de pointage active pour aujourd'hui.");
        }
      }

      transaction.set(statusRef, { activeSessionId: sessionId, lastCheckIn: localIso, lastCheckInDate: dateStr, lastCheckInTime: timeStr, deviceId: deviceId || devMeta.deviceId }, { merge: true });
      transaction.set(doc(db, "attendance_sessions", sessionId), newSession);
      transaction.set(doc(db, "attendance_logs", sessionId), legacyRecord);
      transaction.set(doc(db, "attendance_records", sessionId), legacyRecord);
      transaction.set(doc(db, "attendance_events", newEvent.eventId), newEvent);
    });

    await EmployeeAuditService.logTransition({
      employeeId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      business_id: businessId,
      action: "EMPLOYEE_ACTIVATED",
      beforeState: null,
      afterState: { sessionId, checkIn: timestamp, deviceDate: dateStr, deviceTime: timeStr, deviceTimezone: tzStr },
      severity: "info"
    });

    EventBus.publish(EventBus.createEvent({
      correlationId: `checkin_${sessionId}`,
      actorId: actor.id,
      businessId: businessId,
      module: "ATTENDANCE",
      aggregate: "SESSION",
      type: "ATTENDANCE_CLOCKED_IN",
      payload: { sessionId, employeeId, action: "CHECK_IN", clockIn: localIso, deviceDate: dateStr, deviceTime: timeStr, deviceTimezone: tzStr, business_id: businessId, isUnplanned }
    }));

    return newSession;
  },

  /**
   * Safe transaction to check out an employee
   */
  async checkOut(params: {
    sessionId: string;
    method: "QR" | "NFC" | "MANUAL" | "BIOMETRIC";
    locationGeo?: { latitude: number; longitude: number; accuracy?: number } | null;
    actor: { id: string; name: string; role: string };
    overrideTimestamp?: Date;
    deviceId?: string;
    deviceDate?: string;
    deviceTime?: string;
    deviceTimezone?: string;
    deviceInfo?: string;
  }): Promise<any> {
    const { 
      sessionId, 
      method, 
      locationGeo, 
      actor, 
      overrideTimestamp,
      deviceId,
      deviceDate,
      deviceTime,
      deviceTimezone,
      deviceInfo
    } = params;
    const timestamp = overrideTimestamp ? overrideTimestamp : serverTimestamp();
    const localNow = overrideTimestamp || new Date();
    const localIso = localNow.toISOString();
    const devMeta = getDeviceMetadata();
    const dateStrToday = deviceDate || getDeviceLocalDate(localNow);
    const timeStrToday = deviceTime || getDeviceLocalTime(localNow);
    const tzStr = deviceTimezone || devMeta.deviceTimezone;
    const infoStr = deviceInfo || devMeta.userAgent;

    // 1. Pre-fetch session outside transaction to verify period lock safely
    const sessDocRef = doc(db, "attendance_sessions", sessionId);
    const legacyDocRef = doc(db, "attendance_logs", sessionId);
    
    let preSessSnap = await getDoc(sessDocRef);
    let legacySnap = await getDoc(legacyDocRef);
    
    if (!preSessSnap.exists() && !legacySnap.exists()) {
      throw new Error("Session ou journal de pointage introuvable.");
    }
    
    const preSession = preSessSnap.exists() ? (preSessSnap.data() as any) : (legacySnap.data() as any);
    const bizId = preSession.businessId || preSession.business_id;
    const preDateStr = preSession.checkIn?.deviceDate || preSession.date || (preSession.checkIn?.timestamp?.toDate ? getDeviceLocalDate(preSession.checkIn.timestamp.toDate()) : dateStrToday);

    if (bizId) {
      await this.verifyPeriodLock(bizId, preDateStr);
    }

    let updatedSession: any = null;

    await runTransaction(db, async (transaction) => {
      const sessSnap = await transaction.get(sessDocRef);
      const currentLegacySnap = await transaction.get(legacyDocRef);
      
      let sessionData = sessSnap.exists() ? sessSnap.data() : null;
      let legacyData = currentLegacySnap.exists() ? currentLegacySnap.data() : null;

      if (!sessionData && !legacyData) {
        throw new Error("Session de pointage introuvable.");
      }

      if (sessionData && sessionData.status === "COMPLETED") {
        throw new Error("Cette session est déjà clôturée.");
      }

      if (legacyData && legacyData.checkOut && !sessionData) {
        throw new Error("Cette session est déjà clôturée.");
      }

      const empId = sessionData?.employeeId || legacyData?.employeeId || actor.id;
      const bId = sessionData?.businessId || legacyData?.business_id || bizId;
      const brId = sessionData?.branchId || legacyData?.branchId || "BRANCH_DEFAULT";

      let checkInTs: Date;
      if (sessionData?.checkIn?.timestamp?.toDate) {
        checkInTs = sessionData.checkIn.timestamp.toDate();
      } else if (sessionData?.checkIn?.timestamp) {
        checkInTs = new Date(sessionData.checkIn.timestamp);
      } else if (legacyData?.date && legacyData?.checkIn) {
        checkInTs = new Date(`${legacyData.date}T${legacyData.checkIn}`);
      } else {
        checkInTs = new Date(localNow.getTime() - 60000);
      }

      const dateStr = sessionData?.checkIn?.deviceDate || legacyData?.date || getDeviceLocalDate(checkInTs);

      // Safe diff calculation (at least 1 minute)
      const diffMs = Math.max(60000, localNow.getTime() - checkInTs.getTime());
      const totalMinutes = Math.max(1, Math.round(diffMs / 60000));
      const workedHours = Number((totalMinutes / 60).toFixed(2));

      const formattedGeo = locationGeo && !isNaN(locationGeo.latitude) && !isNaN(locationGeo.longitude)
        ? {
            geoPoint: new GeoPoint(locationGeo.latitude, locationGeo.longitude),
            latitude: locationGeo.latitude,
            longitude: locationGeo.longitude,
            accuracy: locationGeo.accuracy || 0
          }
        : null;

      updatedSession = {
        sessionId,
        employeeId: empId,
        businessId: bId,
        branchId: brId,
        checkIn: sessionData?.checkIn || {
          timestamp: checkInTs,
          method,
          deviceId: deviceId || devMeta.deviceId,
          location: "Kiosk Terminal",
          deviceDate: dateStr,
          deviceTime: legacyData?.checkIn || getDeviceLocalTime(checkInTs),
          deviceTimezone: tzStr,
          deviceInfo: infoStr
        },
        checkOut: {
          timestamp,
          method,
          locationGeo: formattedGeo,
          deviceDate: dateStrToday,
          deviceTime: timeStrToday,
          deviceTimezone: tzStr,
          deviceInfo: infoStr
        },
        status: "COMPLETED",
        totalMinutes
      };

      transaction.set(sessDocRef, updatedSession, { merge: true });

      // Keep legacy log in sync
      const updatedLegacyData: any = {
        id: sessionId,
        employeeId: empId,
        employeeName: legacyData?.employeeName || actor.name,
        business_id: bId,
        branchId: brId,
        date: dateStr,
        checkIn: legacyData?.checkIn || sessionData?.checkIn?.deviceTime || getDeviceLocalTime(checkInTs),
        checkOut: timeStrToday,
        plannedHours: legacyData?.plannedHours !== undefined ? legacyData.plannedHours : 8,
        realHours: workedHours,
        variance: calculateAttendanceVariance(workedHours, legacyData?.plannedHours !== undefined ? legacyData.plannedHours : 8),
        status: "NORMAL",
        unplanned: legacyData?.unplanned || false,
        deviceId: deviceId || devMeta.deviceId,
        deviceTimezone: tzStr
      };

      transaction.set(legacyDocRef, updatedLegacyData, { merge: true });
      transaction.set(doc(db, "attendance_records", sessionId), updatedLegacyData, { merge: true });
      
      const statusRef = doc(db, "attendance_status", empId);
      transaction.set(statusRef, { activeSessionId: null, lastCheckOut: localIso, lastCheckOutDate: dateStrToday, lastCheckOutTime: timeStrToday }, { merge: true });

      // Audit Event
      const hash = `hash_${Math.floor(Math.random() * 99999999)}`;
      const newEvent: any = {
        eventId: `ev_${Math.random().toString(36).substring(2, 9)}`,
        action: "CHECK_OUT",
        employeeId: empId,
        business_id: bId,
        performedBy: actor.id,
        timestamp,
        previousState: JSON.stringify(sessionData || legacyData),
        newState: JSON.stringify(updatedSession),
        deviceInfo: infoStr,
        auditHash: hash
      };
      transaction.set(doc(db, "attendance_events", newEvent.eventId), newEvent);
    });

    if (updatedSession) {
      if (updatedSession.totalMinutes > 720) {
        EventBus.publish(EventBus.createEvent({
          correlationId: `alert_long_shift_${sessionId}`,
          actorId: actor.id,
          businessId: updatedSession.businessId,
          module: "ATTENDANCE",
          aggregate: "SESSION",
          type: "ATTENDANCE_LONG_SHIFT_ALERT",
          payload: { sessionId, totalMinutes: updatedSession.totalMinutes }
        }));
      }

      EventBus.publish(EventBus.createEvent({
        correlationId: `checkout_${sessionId}`,
        actorId: actor.id,
        businessId: updatedSession.businessId,
        module: "ATTENDANCE",
        aggregate: "SESSION",
        type: "ATTENDANCE_CLOCKED_OUT",
        payload: { sessionId, action: "CHECK_OUT", clockOut: localIso }
      }));
    }

    return updatedSession;
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
   * Request manual adjustment validation
   */
  async createAdjustmentRequest(params: {
    sessionId: string;
    employeeId: string;
    businessId: string;
    requestedHours: number;
    reason: string;
    actor: { id: string; name: string; role: string };
  }): Promise<AttendanceAdjustmentRequest> {
    const { sessionId, employeeId, businessId, requestedHours, reason, actor } = params;
    const requestId = `adj_${Math.random().toString(36).substring(2, 9)}`;

    // Verify active status
    await this.verifyEmployeeActive(businessId, employeeId);

    const request: any = {
      requestId,
      sessionId,
      employeeId,
      businessId,
      requestedHours,
      status: "REQUESTED",
      reason,
      requestedBy: actor.id,
      createdAt: serverTimestamp()
    };

    await setDoc(doc(db, "attendance_adjustment_requests", requestId), request);
    return request;
  },

  /**
   * Approve and apply adjustment request transactionally
   */
  async approveAdjustmentRequest(params: {
    requestId: string;
    actor: { id: string; name: string; role: string };
  }): Promise<void> {
    const { requestId, actor } = params;

    // 1. Pre-check request and period lock outside transaction
    const reqRef = doc(db, "attendance_adjustment_requests", requestId);
    const reqSnap = await getDoc(reqRef);
    if (!reqSnap.exists()) {
      throw new Error("Demande d'ajustement introuvable.");
    }
    const request = reqSnap.data() as AttendanceAdjustmentRequest;
    if (request.status !== "REQUESTED") {
      throw new Error("Cette demande a déjà été traitée.");
    }

    const sessRef = doc(db, "attendance_sessions", request.sessionId);
    const sessSnap = await getDoc(sessRef);
    if (sessSnap.exists()) {
      const session = sessSnap.data() as AttendanceSession;
      const checkInTs = session.checkIn?.timestamp?.toDate
        ? session.checkIn.timestamp.toDate()
        : new Date(session.checkIn?.timestamp || Date.now());
      const dateStr = checkInTs.toISOString().split("T")[0];
      await this.verifyPeriodLock(request.businessId, dateStr);
    }

    await runTransaction(db, async (transaction) => {
      const tReqSnap = await transaction.get(reqRef);
      if (!tReqSnap.exists()) {
        throw new Error("Demande d'ajustement introuvable.");
      }
      const tRequest = tReqSnap.data() as AttendanceAdjustmentRequest;
      if (tRequest.status !== "REQUESTED") {
        throw new Error("Cette demande a déjà été traitée.");
      }

      const tSessSnap = await transaction.get(sessRef);
      if (tSessSnap.exists()) {
        const totalMinutes = tRequest.requestedHours * 60;
        const variance = calculateAttendanceVariance(tRequest.requestedHours, 8);
        const overtimeMinutes = Math.max(0, Math.round(variance * 60));

        transaction.update(sessRef, {
          totalMinutes,
          overtimeMinutes,
          status: "COMPLETED"
        });

        const legacyRef = doc(db, "attendance_logs", tRequest.sessionId);
        transaction.update(legacyRef, {
          realHours: tRequest.requestedHours,
          variance,
          status: "NORMAL"
        });
      }

      transaction.update(reqRef, {
        status: "APPROVED",
        approvedBy: actor.id,
        updatedAt: serverTimestamp()
      });
    });
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
   * Saves or updates an attendance record with period lock verification and SSOT event.
   */
  async updateRecord(id: string, data: Partial<AttendanceRecord>, actor: any): Promise<void> {
    const ref = doc(db, "attendance_logs", id);
    const refSec = doc(db, "attendance_records", id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const existing = snap.data() as AttendanceRecord;
      const bId = existing.business_id || data.business_id;
      const date = existing.date || data.date;
      if (bId && date) {
        await this.verifyPeriodLock(bId, date);
      }
    }
    const payload = { ...data, updatedAt: serverTimestamp(), updatedBy: actor?.id || "SYSTEM" };
    await setDoc(ref, payload, { merge: true });
    await setDoc(refSec, payload, { merge: true });
  },

  async batchSaveRecords(businessId: string, records: AttendanceRecord[], actor: any): Promise<void> {
    if (!records || records.length === 0) return;

    const checkedDates = new Set<string>();
    for (const rec of records) {
      const bId = rec.business_id || businessId;
      if (bId && rec.date) {
        const key = `${bId}_${rec.date}`;
        if (!checkedDates.has(key)) {
          await this.verifyPeriodLock(bId, rec.date);
          checkedDates.add(key);
        }
      }
    }
    const batch = writeBatch(db);
    for (const rec of records) {
      const ref = doc(db, "attendance_logs", rec.id);
      const refSec = doc(db, "attendance_records", rec.id);
      const payload = { ...rec, updatedAt: serverTimestamp(), updatedBy: actor?.id || "SYSTEM" };
      batch.set(ref, payload, { merge: true });
      batch.set(refSec, payload, { merge: true });
    }
    await batch.commit();
  },

  async saveRecord(record: AttendanceRecord, actor?: { uid: string; name?: string; role?: string }): Promise<void> {
    const bizId = record.business_id || (record as any).businessId;
    if (bizId && record.date) {
      await this.verifyPeriodLock(bizId, record.date);
    }
    const payload = { 
      ...record, 
      business_id: bizId, 
      updatedAt: serverTimestamp(), 
      updatedBy: actor?.uid || "SYSTEM" 
    };
    await setDoc(doc(db, "attendance_logs", record.id), payload, { merge: true });
    await setDoc(doc(db, "attendance_records", record.id), payload, { merge: true });

    EventBus.publish(EventBus.createEvent({
      correlationId: `att_save_${record.id}_${Date.now()}`,
      actorId: actor?.uid || record.employeeId,
      businessId: record.business_id,
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
    const docRef = doc(collection(db, "attendance_justifications"));
    await setDoc(docRef, {
      id: docRef.id,
      business_id: params.businessId,
      employeeId: params.employeeId,
      employeeName: params.employeeName,
      attendanceId: params.attendanceId,
      date: params.date,
      note: params.note,
      status: "PENDING",
      createdAt: new Date().toISOString()
    });

    EventBus.publish(EventBus.createEvent({
      correlationId: `justif_${docRef.id}`,
      actorId: params.employeeId,
      businessId: params.businessId,
      module: "ATTENDANCE",
      aggregate: "ATTENDANCE_JUSTIFICATION",
      type: "AttendanceJustificationSubmitted",
      payload: { id: docRef.id, employeeId: params.employeeId, attendanceId: params.attendanceId }
    }));
  },
  
  async batchDeleteRecords(recordIds: string[], actor: any): Promise<void> {
    if (!recordIds.length) return;
    const batch = writeBatch(db);
    recordIds.forEach(id => {
      const ref = doc(db, "attendance_logs", id);
      batch.delete(ref);
    });
    await batch.commit();

    EventBus.publish(EventBus.createEvent({
      correlationId: `bulk_del_${Math.random().toString(36).substr(2, 9)}`,
      actorId: actor?.uid || actor?.id || "SYSTEM",
      businessId: actor?.business_id || "UNKNOWN",
      module: "ATTENDANCE",
      aggregate: "ATTENDANCE_LEDGER",
      type: "AttendanceRecordsDeleted",
      payload: { deletedCount: recordIds.length, recordIds }
    }));
  }
};
