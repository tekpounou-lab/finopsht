import { db } from "../../../lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  startAfter,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  Employee,
  LedgerTransaction,
  AttendanceRecord,
  PayrollRecord,
  Branch,
  Department,
  EmployeeContract,
} from "../../../types";

export interface PaginationOptions {
  limitSize?: number;
  lastDoc?: QueryDocumentSnapshot;
}

export interface PaginatedResult<T> {
  items: T[];
  lastDoc?: QueryDocumentSnapshot;
}

/**
 * Enterprise Repository Layer for optimized Firestore queries with local caching, memoization, and pagination.
 */
export class AnalyticsRepository {
  private static cache = new Map<string, { data: any; expiry: number }>();
  private static CACHE_TTL_MS = 15000; // 15 seconds Cache TTL

  private static getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }
    return null;
  }

  private static setCached(key: string, data: any): void {
    this.cache.set(key, { data, expiry: Date.now() + this.CACHE_TTL_MS });
  }

  /**
   * Clears query cache.
   */
  static invalidateCache(): void {
    this.cache.clear();
  }

  /**
   * Fetches employees for a business with pagination options.
   */
  static async fetchEmployees(
    businessId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<Employee>> {
    const cacheKey = `employees_${businessId}_${options?.limitSize || "all"}_${options?.lastDoc?.id || "start"}`;
    const cached = this.getCached<PaginatedResult<Employee>>(cacheKey);
    if (cached) return cached;

    try {
      let q = query(collection(db, "employees"), where("business_id", "==", businessId));
      if (options?.limitSize) {
        q = query(q, limit(options.limitSize));
      }
      if (options?.lastDoc) {
        q = query(q, startAfter(options.lastDoc));
      }

      const snap = await getDocs(q);
      const items: Employee[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as Employee));

      const lastDoc = snap.docs[snap.docs.length - 1];
      const result = { items, lastDoc };
      this.setCached(cacheKey, result);
      return result;
    } catch (e) {
      console.error("[AnalyticsRepository] Failed to fetch employees:", e);
      return { items: [] };
    }
  }

  /**
   * Fetches ledger transactions for a business with pagination and filtering.
   */
  static async fetchTransactions(
    businessId: string,
    options?: PaginationOptions & { type?: string; branchId?: string }
  ): Promise<PaginatedResult<LedgerTransaction>> {
    const cacheKey = `txs_${businessId}_${options?.type || "ALL"}_${options?.branchId || "ALL"}_${options?.limitSize || 100}`;
    const cached = this.getCached<PaginatedResult<LedgerTransaction>>(cacheKey);
    if (cached) return cached;

    try {
      let q = query(
        collection(db, "ledger_transactions"),
        where("business_id", "==", businessId),
        orderBy("date", "desc")
      );

      if (options?.type && options.type !== "ALL") {
        q = query(q, where("type", "==", options.type));
      }
      if (options?.branchId && options.branchId !== "ALL") {
        q = query(q, where("branchId", "==", options.branchId));
      }
      if (options?.limitSize) {
        q = query(q, limit(options.limitSize));
      } else {
        q = query(q, limit(150));
      }
      if (options?.lastDoc) {
        q = query(q, startAfter(options.lastDoc));
      }

      const snap = await getDocs(q);
      const items: LedgerTransaction[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as LedgerTransaction));

      const lastDoc = snap.docs[snap.docs.length - 1];
      const result = { items, lastDoc };
      this.setCached(cacheKey, result);
      return result;
    } catch (e) {
      console.error("[AnalyticsRepository] Failed to fetch transactions:", e);
      return { items: [] };
    }
  }

  /**
   * Fetches attendance logs.
   */
  static async fetchAttendanceLogs(
    businessId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<AttendanceRecord>> {
    try {
      let q = query(
        collection(db, "attendance_logs"),
        where("business_id", "==", businessId),
        orderBy("date", "desc")
      );
      if (options?.limitSize) {
        q = query(q, limit(options.limitSize));
      } else {
        q = query(q, limit(200));
      }
      if (options?.lastDoc) {
        q = query(q, startAfter(options.lastDoc));
      }

      const snap = await getDocs(q);
      const items: AttendanceRecord[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as AttendanceRecord));

      return { items, lastDoc: snap.docs[snap.docs.length - 1] };
    } catch (e) {
      console.error("[AnalyticsRepository] Failed to fetch attendance logs:", e);
      return { items: [] };
    }
  }
}
