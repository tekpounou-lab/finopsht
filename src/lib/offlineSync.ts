import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { auth } from './firebase';

export type SyncErrorType = "NETWORK_ERROR" | "VALIDATION_ERROR" | "PERMISSION_ERROR" | "CONFLICT_ERROR" | "UNKNOWN_ERROR";

export interface OfflineAttendanceQueueRecord {
  id: string; // Acts as offlineEventId & idempotency key
  business_id: string;
  employeeId: string;
  branchId?: string;
  actorId: string;
  actorName?: string;
  actorRole?: string;
  timestamp: string;
  type: "CHECK_IN" | "CHECK_OUT";
  method: "QR" | "NFC" | "MANUAL" | "BIOMETRIC";
  deviceId?: string;
  location?: string;
  badgeId?: string;
  qrSignature?: string;
  badgePayload?: string;
  idempotencyKey?: string;
  verificationImage?: string;
  syncStatus: "PENDING" | "FAILED";
  lat?: number;
  lng?: number;
  retryCount: number;
  localCreatedAt: number;
  errorType?: SyncErrorType;
  errorMessage?: string;
}

interface FinopsSyncDB extends DBSchema {
  attendance_queue: {
    key: string;
    value: OfflineAttendanceQueueRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<FinopsSyncDB>> | null = null;

export const initOfflineDB = async () => {
  if (typeof window === 'undefined') return null;
  dbPromise = openDB<FinopsSyncDB>('finops-offline-db', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('attendance_queue')) {
        db.createObjectStore('attendance_queue', { keyPath: 'id' });
      }
    },
  });
  return dbPromise;
};

export const queueAttendanceLog = async (
  record: Omit<OfflineAttendanceQueueRecord, "syncStatus" | "retryCount" | "localCreatedAt" | "actorId"> & { actorId?: string }
) => {
  const actorUid = record.actorId || auth?.currentUser?.uid;
  if (!actorUid) {
    throw new Error("AUTH_REQUIRED: Impossible de mettre en file d'attente un pointage hors-ligne sans opérateur authentifié.");
  }

  if (!dbPromise) await initOfflineDB();
  const idb = await dbPromise;
  if (!idb) return;
  await idb.put('attendance_queue', {
    ...record,
    actorId: actorUid,
    idempotencyKey: record.idempotencyKey || `offline_${record.id}`,
    syncStatus: 'PENDING',
    retryCount: 0,
    localCreatedAt: Date.now(),
  });

  // Try to sync immediately if online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    syncAttendanceQueue();
  }
};

export const syncAttendanceQueue = async () => {
  if (!auth?.currentUser?.uid) {
    // Do not attempt sync without a live authenticated Firebase session; never impersonate another user
    return;
  }

  if (!dbPromise) await initOfflineDB();
  const idb = await dbPromise;
  if (!idb) return;

  const tx = idb.transaction('attendance_queue', 'readwrite');
  const store = tx.objectStore('attendance_queue');
  const allPending = await store.getAll();
  const sessionActorUid = auth.currentUser.uid;

  for (const record of allPending) {
    if (record.syncStatus === 'PENDING' || record.syncStatus === 'FAILED') {
      try {
        if (!record.actorId || record.actorId !== sessionActorUid) {
          throw Object.assign(
            new Error("PERMISSION_DENIED: L'utilisateur connecté ne correspond pas à l'opérateur d'origine du pointage hors-ligne."),
            { code: 'permission-denied' }
          );
        }

        const { AttendanceRepository } = await import('../repositories/AttendanceRepository');
        const actor = {
          id: sessionActorUid,
          name: record.actorName || auth.currentUser.displayName || auth.currentUser.email || sessionActorUid,
          role: record.actorRole || "",
          businessId: record.business_id
        };
        const overrideTimestamp = new Date(record.timestamp || record.localCreatedAt);
        const geo = record.lat && record.lng ? { latitude: record.lat, longitude: record.lng } : null;
        const idempotencyKey = record.idempotencyKey || `offline_${record.id}`;

        if (record.type === "CHECK_IN") {
          await AttendanceRepository.checkIn({
            employeeId: record.employeeId,
            businessId: record.business_id,
            branchId: record.branchId || "",
            method: record.method || "QR",
            deviceId: record.deviceId || "offline",
            location: record.location || "Offline Scan",
            locationGeo: geo,
            actor,
            overrideTimestamp,
            badgeId: record.badgeId,
            qrSignature: record.qrSignature,
            badgePayload: record.badgePayload,
            idempotencyKey
          });
        } else {
          const activeSessionId = await AttendanceRepository.getActiveSession(record.employeeId);
          if (!activeSessionId) {
            throw new Error("No active session found for check-out sync.");
          }
          await AttendanceRepository.checkOut({
            sessionId: activeSessionId,
            employeeId: record.employeeId,
            businessId: record.business_id,
            method: record.method || "QR",
            locationGeo: geo,
            actor,
            overrideTimestamp,
            deviceId: record.deviceId || "offline",
            badgeId: record.badgeId,
            qrSignature: record.qrSignature,
            badgePayload: record.badgePayload,
            idempotencyKey
          });
        }

        // Success
        await store.delete(record.id);
      } catch (e: any) {
        console.error("Failed to sync attendance record", record.id, e);
        record.syncStatus = 'FAILED';
        record.retryCount += 1;

        let errType: SyncErrorType = "UNKNOWN_ERROR";
        const msg = String(e?.message || "");
        if (e?.code === 'permission-denied' || msg.includes('PERMISSION')) errType = "PERMISSION_ERROR";
        else if (e?.code === 'unavailable' || msg.includes('network')) errType = "NETWORK_ERROR";
        else if (msg.includes('validation') || msg.includes('BADGE')) errType = "VALIDATION_ERROR";
        else if (e?.code === 'already-exists') errType = "CONFLICT_ERROR";

        record.errorType = errType;
        record.errorMessage = msg || "Unknown error";

        await store.put(record);
      }
    }
  }
  await tx.done;
};

// Start a background sync loop
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncAttendanceQueue();
  });
  
  setInterval(() => {
    if (navigator.onLine) {
      syncAttendanceQueue();
    }
  }, 1000 * 60 * 5); // every 5 minutes
}
