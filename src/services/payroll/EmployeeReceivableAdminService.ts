import { getAdminFirestore } from "../../lib/firebaseAdmin";
import { EmployeeReceivable } from "../../types";
import { resolveReceivableTenantId } from "./EmployeeReceivableService";

const COLLECTION = "employee_receivables";

/**
 * Server-only Admin SDK Employee Receivable reader.
 * Zero browser Firebase SDK dependencies.
 */
export async function listReceivablesByBusinessWithAdmin(
  businessId: string,
  adminDb?: any
): Promise<EmployeeReceivable[]> {
  if (!businessId) return [];

  const resolvedAdminDb = adminDb || getAdminFirestore();
  const [camelSnap, snakeSnap] = await Promise.all([
    resolvedAdminDb.collection(COLLECTION).where("businessId", "==", businessId).get(),
    resolvedAdminDb.collection(COLLECTION).where("business_id", "==", businessId).get()
  ]);

  const byId = new Map<string, EmployeeReceivable>();
  const allDocs = [...(camelSnap?.docs || []), ...(snakeSnap?.docs || [])];
  for (const docSnap of allDocs) {
    const rawData = typeof docSnap.data === "function" ? docSnap.data() : docSnap;
    const docTenant = resolveReceivableTenantId({ ...rawData, id: docSnap.id });
    if (docTenant === businessId) {
      byId.set(docSnap.id, {
        ...rawData,
        id: docSnap.id,
        businessId
      } as EmployeeReceivable);
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}
