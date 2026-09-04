import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { Employee } from "../../types";
import { PerformanceService } from "../performance/PerformanceService";

export interface EmployeeFilterOptions {
  branchId?: string;
  departmentId?: string;
  status?: string;
  limitTo?: number;
}

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

export class EmployeeQueryService {
  private static cache = new Map<string, CacheEntry<Employee[]>>();
  private static TTL_MS = 30000; // 30 seconds

  public static invalidateCache(businessId?: string): void {
    if (businessId) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(businessId)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Fetches employees for a business with optional branch, department, and status filters.
   */
  public static async queryEmployees(
    businessId: string,
    options: EmployeeFilterOptions = {}
  ): Promise<Employee[]> {
    if (!businessId) return [];

    const cacheKey = `${businessId}:${options.branchId || ""}:${options.departmentId || ""}:${options.status || ""}:${options.limitTo || ""}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    return PerformanceService.trackExecution("query", `EmployeeQuery:${cacheKey}`, async () => {
      const path = `employees`;
      try {
        const constraints: any[] = [where("business_id", "==", businessId)];

        if (options.branchId) {
          constraints.push(where("branchId", "==", options.branchId));
        }
        if (options.departmentId) {
          constraints.push(where("departmentId", "==", options.departmentId));
        }
        if (options.status) {
          constraints.push(where("status", "==", options.status));
        }
        if (options.limitTo) {
          constraints.push(limit(options.limitTo));
        }

        const q = query(collection(db, "employees"), ...constraints);
        const snap = await getDocs(q);
        const results = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as Employee[];

        this.cache.set(cacheKey, {
          data: results,
          expiry: Date.now() + this.TTL_MS
        });

        return results;
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, path);
        return [];
      }
    });
  }

  /**
   * Gets employee count per department for org analytics.
   */
  public static async getHeadcountByDepartment(businessId: string): Promise<Record<string, number>> {
    const employees = await this.queryEmployees(businessId, { status: "ACTIVE" });
    const counts: Record<string, number> = {};

    employees.forEach((emp) => {
      const deptId = emp.departmentId || "unassigned";
      counts[deptId] = (counts[deptId] || 0) + 1;
    });

    return counts;
  }
}
