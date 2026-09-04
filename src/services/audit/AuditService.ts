import { db } from "../../lib/firebase";
import { collection, addDoc } from "firebase/firestore";

export interface AuditEntry {
  id?: string;
  timestamp: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  business_id: string;
  action: string;
  [key: string]: any;
}

export const AuditService = {
  async writeLog(entry: AuditEntry): Promise<void> {
    try {
      await addDoc(collection(db, "audit_logs"), {
        ...entry,
        createdAt: new Date().toISOString()
      });
      console.log(`[AuditService] Logged action: ${entry.action}`);
    } catch (error) {
      console.error("[AuditService] Critical failure writing audit log:", error);
      // We don't rethrow to prevent crashing the UI if logging fails
    }
  }
};
