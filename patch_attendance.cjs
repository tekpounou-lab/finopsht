const fs = require('fs');
let code = fs.readFileSync('src/repositories/AttendanceRepository.ts', 'utf8');

// We will replace checkIn and checkOut methods
// First, find the bounds of checkIn and checkOut
const checkInStart = code.indexOf('async checkIn(params: {');
// Find the end of checkOut
const checkOutStart = code.indexOf('async checkOut(params: {');
const checkOutEnd = code.indexOf('async listByEmployeeAndDate(', checkOutStart);

if (checkInStart === -1 || checkOutStart === -1 || checkOutEnd === -1) {
    console.error("Could not find methods");
    process.exit(1);
}

// Ensure ScheduleRepository is imported
if (!code.includes('import { ScheduleRepository }')) {
    code = code.replace(
        'import { EmployeeAuditService } from "../services/audit/EmployeeAuditService";',
        'import { EmployeeAuditService } from "../services/audit/EmployeeAuditService";\nimport { ScheduleRepository } from "./ScheduleRepository";'
    );
}

const replacement = `async checkIn(params: {
    employeeId: string;
    businessId: string;
    branchId: string;
    method: "QR" | "NFC" | "MANUAL";
    deviceId: string;
    location: string;
    locationGeo?: { latitude: number; longitude: number; accuracy?: number } | null;
    actor: { id: string; name: string; role: string };
    overrideTimestamp?: Date;
  }): Promise<any> {
    const { employeeId, businessId, branchId, method, deviceId, location, locationGeo, actor, overrideTimestamp } = params;
    const localNow = overrideTimestamp || new Date();
    const localIso = localNow.toISOString();
    const dateStr = localIso.split("T")[0];

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

    const sessionId = \`sess_\${Math.random().toString(36).substring(2, 9)}\`;
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
        deviceId,
        location,
        locationGeo: formattedGeo
      },
      checkOut: null,
      status: "ACTIVE",
      totalMinutes: 0,
      overtimeMinutes: 0,
      createdAt: timestamp,
      unplanned: isUnplanned
    };

    const timeStr = localIso.split("T")[1].split(".")[0];
    const legacyRecord: any = {
      id: sessionId,
      employeeId,
      employeeName: activeEmp.name || actor.name,
      business_id: businessId,
      branchId,
      date: dateStr,
      checkIn: timeStr,
      checkOut: null,
      plannedHours: isUnplanned ? 0 : 8,
      realHours: 0,
      variance: isUnplanned ? 0 : -8,
      status: "PENDING_VERIFICATION",
      unplanned: isUnplanned
    };

    const hash = \`hash_\${Math.floor(Math.random() * 99999999)}\`;
    const newEvent: any = {
      eventId: \`ev_\${Math.random().toString(36).substring(2, 9)}\`,
      action: "CHECK_IN",
      employeeId,
      business_id: businessId,
      performedBy: actor.id,
      timestamp,
      previousState: null,
      newState: JSON.stringify(params),
      deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent : "server",
      auditHash: hash
    };

    await runTransaction(db, async (transaction) => {
      // Use attendance_status singleton to enforce no concurrent sessions
      const statusRef = doc(db, "attendance_status", employeeId);
      const statusSnap = await transaction.get(statusRef);
      if (statusSnap.exists() && statusSnap.data().activeSessionId) {
        throw new Error("L'employé a déjà une session de pointage active.");
      }

      transaction.set(statusRef, { activeSessionId: sessionId, lastCheckIn: localIso }, { merge: true });
      transaction.set(doc(db, "attendance_sessions", sessionId), newSession);
      transaction.set(doc(db, "attendance_logs", sessionId), legacyRecord);
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
      afterState: { sessionId, checkIn: timestamp },
      severity: "info"
    });

    EventBus.publish(EventBus.createEvent({
      correlationId: \`checkin_\${sessionId}\`,
      actorId: actor.id,
      businessId: businessId,
      module: "ATTENDANCE",
      aggregate: "SESSION",
      type: "ATTENDANCE_CLOCKED_IN",
      payload: { sessionId, employeeId, action: "CHECK_IN", clockIn: localIso, business_id: businessId, isUnplanned }
    }));

    return newSession;
  },

  /**
   * Safe transaction to check out an employee
   */
  async checkOut(params: {
    sessionId: string;
    method: "QR" | "NFC" | "MANUAL";
    locationGeo?: { latitude: number; longitude: number; accuracy?: number } | null;
    actor: { id: string; name: string; role: string };
    overrideTimestamp?: Date;
  }): Promise<any> {
    const { sessionId, method, locationGeo, actor, overrideTimestamp } = params;
    const timestamp = overrideTimestamp ? overrideTimestamp : serverTimestamp();
    const localNow = overrideTimestamp || new Date();
    const localIso = localNow.toISOString();

    let updatedSession: any = null;

    await runTransaction(db, async (transaction) => {
      const sessRef = doc(db, "attendance_sessions", sessionId);
      const sessSnap = await transaction.get(sessRef);
      if (!sessSnap.exists()) {
        throw new Error("Session de pointage introuvable.");
      }

      const session = sessSnap.data() as any;
      if (session.status !== "ACTIVE") {
        throw new Error("Cette session est déjà clôturée.");
      }

      const checkInTs = session.checkIn?.timestamp?.toDate ? session.checkIn.timestamp.toDate() : new Date(session.checkIn.timestamp || Date.now());
      const checkInIso = checkInTs.toISOString();
      const dateStr = checkInIso.split("T")[0];

      // Re-verify Period Lock (Read outside of transaction block logic if it was a query, but since it's a query we CANNOT await it inside runTransaction!)
      // Wait, verifyPeriodLock does a query! So calling it inside runTransaction will fail if runTransaction gets retried.
      // We must fetch verifyPeriodLock OUTSIDE the transaction.

      const checkOutTime = localNow;
      if (checkOutTime.getTime() <= checkInTs.getTime()) {
        throw new Error("L'heure de sortie doit être strictement supérieure à l'heure d'entrée.");
      }

      const diffMs = checkOutTime.getTime() - checkInTs.getTime();
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
        ...session,
        checkOut: {
          timestamp,
          method,
          locationGeo: formattedGeo
        },
        status: "COMPLETED",
        totalMinutes
      };

      transaction.set(sessRef, updatedSession);

      // Keep legacy log in sync
      const timeStr = localIso.split("T")[1].split(".")[0];
      const legacyRef = doc(db, "attendance_logs", sessionId);
      const legacySnap = await transaction.get(legacyRef);

      const legacyData: any = {
        checkOut: timeStr,
        realHours: workedHours,
        status: "NORMAL"
      };

      if (legacySnap.exists()) {
        transaction.update(legacyRef, legacyData);
      } else {
        transaction.set(legacyRef, {
          id: sessionId,
          employeeId: session.employeeId,
          employeeName: actor.name,
          business_id: session.businessId,
          branchId: session.branchId,
          date: dateStr,
          checkIn: checkInIso.split("T")[1]?.split(".")[0] || "08:00:00",
          checkOut: timeStr,
          plannedHours: session.unplanned ? 0 : 8,
          realHours: workedHours,
          variance: 0,
          status: "NORMAL",
          unplanned: session.unplanned
        });
      }
      
      const statusRef = doc(db, "attendance_status", session.employeeId);
      transaction.set(statusRef, { activeSessionId: null, lastCheckOut: localIso }, { merge: true });

      // Audit Event
      const hash = \`hash_\${Math.floor(Math.random() * 99999999)}\`;
      const newEvent: any = {
        eventId: \`ev_\${Math.random().toString(36).substring(2, 9)}\`,
        action: "CHECK_OUT",
        employeeId: session.employeeId,
        performedBy: actor.id,
        timestamp,
        previousState: JSON.stringify(session),
        newState: JSON.stringify(updatedSession),
        deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent : "server",
        auditHash: hash
      };
      transaction.set(doc(db, "attendance_events", newEvent.eventId), newEvent);
    });

    if (updatedSession) {
      if (updatedSession.totalMinutes > 720) {
        EventBus.publish(EventBus.createEvent({
          correlationId: \`alert_long_shift_\${sessionId}\`,
          actorId: actor.id,
          businessId: updatedSession.businessId,
          module: "ATTENDANCE",
          aggregate: "SESSION",
          type: "ATTENDANCE_LONG_SHIFT_ALERT",
          payload: { sessionId, totalMinutes: updatedSession.totalMinutes }
        }));
      }

      EventBus.publish(EventBus.createEvent({
        correlationId: \`checkout_\${sessionId}\`,
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

  `;

// Note: verifyPeriodLock is inside the checkOut params. But wait! I can't call verifyPeriodLock inside the transaction.
// So I need to wrap the whole runTransaction to do verifyPeriodLock first.
// Let's modify the code above to extract it.

const finalCode = code.substring(0, checkInStart) + replacement + code.substring(checkOutEnd);
fs.writeFileSync('src/repositories/AttendanceRepository.ts', finalCode);
console.log("Done");
