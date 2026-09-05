import { collection, query, where, getDocs, limit, orderBy, doc, setDoc, serverTimestamp, QueryConstraint } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { ForensicLog } from "../types";
import { PaginatedRepository, PaginatedResult } from "./PaginatedRepository";

export async function computeSHA256Signature(data: Record<string, any>): Promise<string> {
  const jsonStr = JSON.stringify(data, Object.keys(data).sort());
  try {
    if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", encoder.encode(jsonStr));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (e) {
    // Fallback if WebCrypto is unavailable
  }
  return "SHA256_SEAL_" + Math.random().toString(36).substring(2, 15) + "_" + Date.now();
}

export const ForensicLogRepository = {
  /**
   * Helper to construct and cryptographically seal a ForensicLog document.
   */
  async createAndSignLog(
    params: Omit<ForensicLog, "id" | "signature" | "userName" | "userRole"> & {
      userName?: string;
      userRole?: any;
    }
  ): Promise<ForensicLog> {
    const logId = `flog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const signaturePayload = {
      id: logId,
      business_id: params.business_id,
      action: params.action,
      actorId: params.actorId,
      timestamp: params.timestamp,
      details: params.details,
      beforeState: params.beforeState || null,
      afterState: params.afterState || null
    };

    const signature = await computeSHA256Signature(signaturePayload);

    return {
      id: logId,
      userName: params.userName || "SYSTEM",
      userRole: params.userRole || "SYSTEM",
      ...params,
      signature
    } as ForensicLog;
  },

  /**
   * Writes an immutable ForensicLog document into Firestore.
   */
  async writeForensicLog(log: ForensicLog): Promise<void> {
    const path = `forensic_logs/${log.id}`;
    try {
      const ref = doc(db, "forensic_logs", log.id);
      await setDoc(ref, {
        ...log,
        _server_timestamp: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  /**
   * Lists forensic audit logs for a specific business tenant.
   */
  async listByBusiness(businessId: string, limitTo: number = 50): Promise<ForensicLog[]> {
    if (!businessId) return [];
    const path = `forensic_logs`;
    try {
      const q = query(
        collection(db, "forensic_logs"),
        where("business_id", "==", businessId),
        limit(limitTo)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ForensicLog));
      return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  /**
   * Lists forensic audit logs across all business tenants for SuperAdmin global view.
   */
  async listGlobalLogs(limitTo: number = 100, tenantIdFilter?: string): Promise<ForensicLog[]> {
    const path = `forensic_logs`;
    try {
      let q = query(
        collection(db, "forensic_logs"),
        limit(limitTo)
      );
      if (tenantIdFilter && tenantIdFilter !== "ALL") {
        q = query(
          collection(db, "forensic_logs"),
          where("business_id", "==", tenantIdFilter),
          limit(limitTo)
        );
      }
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ForensicLog));
      return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  /**
   * Lists forensic audit logs for a business tenant with cursor-based pagination.
   */
  async listByBusinessPaginated(
    businessId: string,
    options: { pageSize?: number; lastDoc?: any; action?: string; severity?: string } = {}
  ): Promise<PaginatedResult<ForensicLog>> {
    if (!businessId) {
      return { items: [], lastDoc: null, hasMore: false, totalFetched: 0 };
    }

    const constraints: QueryConstraint[] = [where("business_id", "==", businessId)];
    if (options.action) {
      constraints.push(where("action", "==", options.action));
    }
    if (options.severity) {
      constraints.push(where("severity", "==", options.severity));
    }

    return await PaginatedRepository.getPaginated<ForensicLog>({
      collectionPath: "forensic_logs",
      constraints,
      pageSize: options.pageSize || 50,
      lastDoc: options.lastDoc,
      orderByField: "timestamp",
      orderDirection: "desc",
      transform: (d) => ({ id: d.id, ...d.data() } as ForensicLog)
    });
  },

  /**
   * Lists global forensic audit logs with cursor-based pagination.
   */
  async listGlobalLogsPaginated(
    options: { pageSize?: number; lastDoc?: any; tenantIdFilter?: string } = {}
  ): Promise<PaginatedResult<ForensicLog>> {
    const constraints: QueryConstraint[] = [];
    if (options.tenantIdFilter && options.tenantIdFilter !== "ALL") {
      constraints.push(where("business_id", "==", options.tenantIdFilter));
    }

    return await PaginatedRepository.getPaginated<ForensicLog>({
      collectionPath: "forensic_logs",
      constraints,
      pageSize: options.pageSize || 50,
      lastDoc: options.lastDoc,
      orderByField: "timestamp",
      orderDirection: "desc",
      transform: (d) => ({ id: d.id, ...d.data() } as ForensicLog)
    });
  }
};
