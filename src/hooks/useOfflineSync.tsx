import { useState, useEffect } from "react";
import { initOfflineDB } from "../lib/offlineSync";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingAttendance, setPendingAttendance] = useState(0);
  const [failedAttendance, setFailedAttendance] = useState(0);
  const [dlqDetails, setDlqDetails] = useState<any[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);

      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  useEffect(() => {
    const fetchQueueStatus = async () => {
      const db = await initOfflineDB();
      if (!db) return;
      const tx = db.transaction("attendance_queue", "readonly");
      const store = tx.objectStore("attendance_queue");
      const all = await store.getAll();
      
      const pending = all.filter(r => r.syncStatus === "PENDING").length;
      const failedItems = all.filter(r => r.syncStatus === "FAILED");
      
      setPendingAttendance(pending);
      setFailedAttendance(failedItems.length);
      setDlqDetails(failedItems);
    };

    fetchQueueStatus();
    const interval = setInterval(fetchQueueStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return { isOnline, pendingAttendance, failedAttendance, dlqDetails };
}
