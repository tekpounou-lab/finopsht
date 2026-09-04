import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { PerformanceService } from "../performance/PerformanceService";

export interface PayrollCycleQueryOptions {
  year?: number;
  status?: string;
  limitTo?: number;
}

export class PayrollQueryService {
  /**
   * Queries payroll cycles for a business tenant.
   */
  public static async queryCycles(
    businessId: string,
    options: PayrollCycleQueryOptions = {}
  ): Promise<any[]> {
    if (!businessId) return [];

    return PerformanceService.trackExecution("query", `PayrollCycles:${businessId}`, async () => {
      const path = `payroll_cycles`;
      try {
        const constraints: any[] = [where("business_id", "==", businessId)];

        if (options.status) {
          constraints.push(where("status", "==", options.status));
        }
        if (options.limitTo) {
          constraints.push(limit(options.limitTo));
        }

        const q = query(collection(db, "payroll_cycles"), ...constraints);
        const snap = await getDocs(q);
        const cycles = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));

        if (options.year) {
          return cycles.filter((c: any) => {
            if (!c.startDate && !c.start_date) return true;
            const cycleYear = new Date(c.startDate || c.start_date).getFullYear();
            return cycleYear === options.year;
          });
        }

        return cycles;
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, path);
        return [];
      }
    });
  }

  /**
   * Queries payslips for a given cycle ID.
   */
  public static async queryPayslipsForCycle(businessId: string, cycleId: string): Promise<any[]> {
    if (!businessId || !cycleId) return [];

    return PerformanceService.trackExecution("query", `Payslips:${businessId}:${cycleId}`, async () => {
      const path = `payslips`;
      try {
        const q = query(
          collection(db, "payslips"),
          where("business_id", "==", businessId),
          where("cycleId", "==", cycleId)
        );
        const snap = await getDocs(q);
        return snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, path);
        return [];
      }
    });
  }
}
