import { useState, useEffect, useCallback, useRef } from "react";
import { db, auth } from "../lib/firebase";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";
import { AttendanceRepository, AttendanceSession } from "../repositories/AttendanceRepository";
import { AttendanceRecord } from "../types";
import { tenantQuery, realtimeManager } from "../services/firestore/realtimeManager";
import { toast } from "sonner";

export interface UseAttendanceOptions {
  businessId: string | undefined;
  employeeId?: string;
  actor?: { id: string; name: string; role: string };
}

export function useAttendance({ businessId, employeeId, actor }: UseAttendanceOptions) {
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [recentRecords, setRecentRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Initialize BroadcastChannel for multi-tab synchronization
  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("finops_attendance_sync");
    broadcastChannelRef.current = channel;

    channel.onmessage = (event) => {
      if (event.data?.type === "ATTENDANCE_STATE_CHANGED" && event.data?.businessId === businessId) {
        // Trigger local refresh or toast notice if relevant
        if (employeeId && event.data?.employeeId === employeeId) {
          toast.info("Mise à jour du pointage détectée sur un autre appareil.");
        }
      }
    };

    return () => {
      channel.close();
      broadcastChannelRef.current = null;
    };
  }, [businessId, employeeId]);

  // Subscribe to real-time active session
  useEffect(() => {
    if (
      !businessId || 
      !employeeId || 
      businessId === "undefined" || 
      businessId === "null" || 
      employeeId === "undefined" || 
      employeeId === "null" || 
      !auth.currentUser
    ) {
      setActiveSession(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const qActive = query(
      collection(db, "attendance_sessions"),
      where("businessId", "==", businessId),
      where("employeeId", "==", employeeId),
      where("status", "==", "ACTIVE"),
      limit(1)
    );

    const unsubActive = realtimeManager.subscribe(
      `attendance_active_session:${businessId}:${employeeId}`,
      qActive,
      (snapshot) => {
        if (!snapshot.empty) {
          const docData = snapshot.docs[0].data();
          setActiveSession({ sessionId: snapshot.docs[0].id, ...docData } as AttendanceSession);
        } else {
          setActiveSession(null);
        }
        setIsLoading(false);
      },
      (err) => {
        console.warn("Notice listening to active attendance session:", err);
        setError(err.message);
        setIsLoading(false);
      }
    );

    return () => unsubActive();
  }, [businessId, employeeId]);

  // Subscribe to real-time attendance logs
  useEffect(() => {
    if (!businessId || businessId === "undefined" || businessId === "null" || !auth.currentUser) {
      setRecentRecords([]);
      return;
    }

    const qLogs = tenantQuery(
      collection(db, "attendance_logs"),
      businessId,
      limit(100)
    );

    const unsubLogs = realtimeManager.subscribe(
      `attendance_logs_recent:${businessId}`,
      qLogs,
      (snapshot) => {
        const records: AttendanceRecord[] = [];
        snapshot.forEach((d: any) => {
          records.push({ id: d.id, ...d.data() } as AttendanceRecord);
        });
        // Sort in memory to avoid index requirements
        records.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setRecentRecords(records);
      },
      (err) => {
        console.warn("Notice listening to attendance logs:", err);
      }
    );

    return () => unsubLogs();
  }, [businessId]);

  // Optimistic Clock-in Action
  const clockIn = useCallback(
    async (params: {
      method?: "QR" | "NFC" | "MANUAL";
      deviceId?: string;
      location?: string;
      locationGeo?: { latitude: number; longitude: number; accuracy?: number };
    }) => {
      if (!businessId || !employeeId || !actor) {
        throw new Error("Contexte entreprise ou employé incomplet pour le pointage.");
      }

      const previousSession = activeSession;
      const tempSessionId = `temp_sess_${Date.now()}`;
      
      // Optimistic state update
      const optimisticSession: AttendanceSession = {
        sessionId: tempSessionId,
        employeeId,
        businessId,
        branchId: "main",
        checkIn: {
          timestamp: new Date().toISOString(),
          method: params.method || "MANUAL",
          deviceId: params.deviceId || "web_ui",
          location: params.location || "Web Portal"
        },
        checkOut: null,
        status: "ACTIVE",
        totalMinutes: 0,
        overtimeMinutes: 0,
        createdAt: new Date().toISOString()
      };

      setActiveSession(optimisticSession);

      try {
        const realSession = await AttendanceRepository.checkIn({
          employeeId,
          businessId,
          branchId: "main",
          method: params.method || "MANUAL",
          deviceId: params.deviceId || "web_ui",
          location: params.location || "Web Portal",
          locationGeo: params.locationGeo,
          actor
        });

        // Broadcast to other open tabs
        broadcastChannelRef.current?.postMessage({
          type: "ATTENDANCE_STATE_CHANGED",
          businessId,
          employeeId,
          action: "CLOCK_IN"
        });

        toast.success("Pointage d'entrée enregistré avec succès.");
        return realSession;
      } catch (err: any) {
        // Rollback optimistic state
        setActiveSession(previousSession);
        toast.error(`Échec du pointage: ${err.message || "Erreur serveur"}`);
        throw err;
      }
    },
    [businessId, employeeId, actor, activeSession]
  );

  // Optimistic Clock-out Action
  const clockOut = useCallback(
    async (params?: { method?: "QR" | "NFC" | "MANUAL" }) => {
      if (!activeSession) {
        throw new Error("Aucune session active à clôturer.");
      }
      if (!actor) {
        throw new Error("Utilisateur non identifié pour le pointage de sortie.");
      }

      const previousSession = activeSession;

      // Optimistic update
      setActiveSession(null);

      try {
        const updatedSession = await AttendanceRepository.checkOut({
          sessionId: activeSession.sessionId,
          method: params?.method || "MANUAL",
          actor
        });

        // Broadcast change
        broadcastChannelRef.current?.postMessage({
          type: "ATTENDANCE_STATE_CHANGED",
          businessId: activeSession.businessId,
          employeeId: activeSession.employeeId,
          action: "CLOCK_OUT"
        });

        toast.success("Pointage de sortie enregistré.");
        return updatedSession;
      } catch (err: any) {
        // Rollback optimistic update
        setActiveSession(previousSession);
        toast.error(`Échec de la sortie: ${err.message || "Erreur serveur"}`);
        throw err;
      }
    },
    [activeSession, actor]
  );

  return {
    activeSession,
    recentRecords,
    isLoading,
    error,
    clockIn,
    clockOut
  };
}
