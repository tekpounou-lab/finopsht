import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export type SyncErrorType = "NETWORK_ERROR" | "VALIDATION_ERROR" | "PERMISSION_ERROR" | "CONFLICT_ERROR" | "UNKNOWN_ERROR";

interface FinopsSyncDB extends DBSchema {
  attendance_queue: {
    key: string;
    value: {
      id: string; // Acts as offlineEventId
      business_id: string;
      employeeId: string;
      timestamp: string;
      type: "CHECK_IN" | "CHECK_OUT";
      method: "QR" | "MANUAL" | "BIOMETRIC";
      location?: string;
      verificationImage?: string;
      syncStatus: "PENDING" | "FAILED";
      lat?: number;
      lng?: number;
      retryCount: number;
      localCreatedAt: number;
      errorType?: SyncErrorType;
      errorMessage?: string;
    };
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

export const queueAttendanceLog = async (record: any) => {
  if (!dbPromise) await initOfflineDB();
  const db = await dbPromise;
  if (!db) return;
  await db.put('attendance_queue', {
    ...record,
    syncStatus: 'PENDING',
    retryCount: 0,
    localCreatedAt: Date.now(),
  });
  
  // Try to sync immediately if online
  if (navigator.onLine) {
    syncAttendanceQueue();
  }
};

export const syncAttendanceQueue = async () => {
  if (!dbPromise) await initOfflineDB();
  const idb = await dbPromise;
  if (!idb) return;

  const tx = idb.transaction('attendance_queue', 'readwrite');
  const store = tx.objectStore('attendance_queue');
  const allPending = await store.getAll();

  for (const record of allPending) {
    if (record.syncStatus === 'PENDING' || record.syncStatus === 'FAILED') {
      try {
        const { AttendanceRepository } = await import('../repositories/AttendanceRepository');
        const actor = { id: record.employeeId, name: "Offline Sync", role: "EMPLOYEE" };
        const overrideTimestamp = new Date(record.timestamp || record.localCreatedAt);
        const geo = record.lat && record.lng ? { latitude: record.lat, longitude: record.lng } : null;

        if (record.type === "CHECK_IN") {
          await AttendanceRepository.checkIn({
            employeeId: record.employeeId,
            businessId: record.business_id,
            branchId: "UNKNOWN", // Branch should be part of the record if available
            method: record.method || "QR",
            deviceId: "offline",
            location: record.location || "Offline Scan",
            locationGeo: geo,
            actor,
            overrideTimestamp
          });
        } else {
          const activeSessionId = await AttendanceRepository.getActiveSession(record.employeeId);
          if (!activeSessionId) {
             throw new Error("No active session found for check-out sync.");
          }
          await AttendanceRepository.checkOut({
            sessionId: activeSessionId,
            method: record.method || "QR",
            locationGeo: geo,
            actor,
            overrideTimestamp
          });
        }

        // Success
        await store.delete(record.id);
      } catch (e: any) {
        console.error("Failed to sync attendance record", record.id, e);
        record.syncStatus = 'FAILED';
        record.retryCount += 1;
        
        let errType: SyncErrorType = "UNKNOWN_ERROR";
        if (e.code === 'permission-denied') errType = "PERMISSION_ERROR";
        else if (e.code === 'unavailable' || e.message.includes('network')) errType = "NETWORK_ERROR";
        else if (e.message.includes('validation')) errType = "VALIDATION_ERROR";
        else if (e.code === 'already-exists') errType = "CONFLICT_ERROR";
        
        record.errorType = errType;
        record.errorMessage = e.message || "Unknown error";
        
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
