import { useState, useEffect, useCallback } from "react";
import { db } from "../../../lib/firebase";
import { collection, query, limit, orderBy, onSnapshot } from "firebase/firestore";
import { ForensicLog } from "../../../types";

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  dbLatencyMs: number;
  activeSessions: number;
  uptimeSeconds: number;
  status: "HEALTHY" | "DEGRADED" | "DOWN";
}

export function useSystemHealth() {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpuUsage: 18,
    memoryUsage: 42,
    dbLatencyMs: 34,
    activeSessions: 12,
    uptimeSeconds: 864200,
    status: "HEALTHY",
  });

  const [auditLogs, setAuditLogs] = useState<ForensicLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);

  // Pulse metrics to simulate live server telemetry
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics((prev) => ({
        ...prev,
        cpuUsage: Math.min(100, Math.max(10, Math.round(prev.cpuUsage + (Math.random() * 6 - 3)))),
        memoryUsage: Math.min(100, Math.max(30, Math.round(prev.memoryUsage + (Math.random() * 4 - 2)))),
        dbLatencyMs: Math.min(200, Math.max(15, Math.round(prev.dbLatencyMs + (Math.random() * 10 - 5)))),
        uptimeSeconds: prev.uptimeSeconds + 5,
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Listen to recent forensic logs
  useEffect(() => {
    try {
      const q = query(collection(db, "forensic_logs"), orderBy("timestamp", "desc"), limit(50));
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const logs: ForensicLog[] = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          } as ForensicLog));
          setAuditLogs(logs);
          setLoadingAudit(false);
        },
        (err) => {
          console.warn("Forensic logs listener fallback:", err);
          setLoadingAudit(false);
        }
      );

      return () => unsub();
    } catch (e) {
      setLoadingAudit(false);
    }
  }, []);

  return {
    metrics,
    auditLogs,
    loadingAudit,
  };
}
