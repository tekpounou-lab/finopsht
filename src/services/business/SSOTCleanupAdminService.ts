import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "../../lib/firebaseAdmin";

export interface SSOTMigrationSummary {
  businessId: string;
  invoicesCleaned: number;
  proformasCleaned: number;
  payrollCyclesCleaned: number;
  totalFieldsRemoved: number;
  timestamp: string;
}

/**
 * Server-only Admin SDK SSOT Data Cleanup Service.
 * Zero browser Firebase SDK dependencies.
 */
export async function runSSOTCleanupMigrationWithAdmin(
  businessId: string,
  adminDb?: any
): Promise<SSOTMigrationSummary> {
  const trimmedBiz = typeof businessId === "string" ? businessId.trim() : "";
  if (
    !trimmedBiz ||
    ["none", "default", "biz_default", "demo", "biz_demo"].includes(trimmedBiz.toLowerCase())
  ) {
    throw new Error("MISSING_TENANT_CONTEXT");
  }

  const resolvedAdminDb = adminDb || getAdminFirestore();
  let totalFieldsRemoved = 0;

  const queryTenantCollection = async (colName: string) => {
    const colRef = resolvedAdminDb.collection(colName);
    const subColRef = resolvedAdminDb.collection(`businesses/${trimmedBiz}/${colName}`);
    const [snap1, snap2, subSnap] = await Promise.all([
      colRef.where("businessId", "==", trimmedBiz).get(),
      colRef.where("business_id", "==", trimmedBiz).get(),
      typeof subColRef?.get === "function" ? subColRef.get() : Promise.resolve({ docs: [] })
    ]);
    const byPath = new Map<string, { snap: any; path: string }>();
    snap1?.docs?.forEach((d: any) =>
      byPath.set(`${colName}/${d.id}`, { snap: d, path: `${colName}/${d.id}` })
    );
    snap2?.docs?.forEach((d: any) =>
      byPath.set(`${colName}/${d.id}`, { snap: d, path: `${colName}/${d.id}` })
    );
    subSnap?.docs?.forEach((d: any) =>
      byPath.set(`businesses/${trimmedBiz}/${colName}/${d.id}`, {
        snap: d,
        path: `businesses/${trimmedBiz}/${colName}/${d.id}`
      })
    );
    return Array.from(byPath.values()).filter(({ snap, path }) => {
      const data = typeof snap.data === "function" ? snap.data() : snap;
      const b1 = typeof data?.businessId === "string" ? data.businessId.trim() : "";
      const b2 = typeof data?.business_id === "string" ? data.business_id.trim() : "";
      if (b1 && b2 && b1 !== b2) {
        const err: any = new Error("TENANT_ISOLATION_VIOLATION");
        err.code = "TENANT_ISOLATION_VIOLATION";
        throw err;
      }
      const resolvedBiz = b1 || b2 || (path.startsWith(`businesses/${trimmedBiz}/`) ? trimmedBiz : "");
      return resolvedBiz === trimmedBiz;
    });
  };

  const applyCleanup = async (
    entries: Array<{ snap: any; path: string }>,
    redundantKeys: string[]
  ): Promise<number> => {
    let cleaned = 0;
    for (const { snap: docSnap, path: docPath } of entries) {
      const data = typeof docSnap.data === "function" ? docSnap.data() : docSnap;
      const updates: Record<string, any> = {};
      for (const key of redundantKeys) {
        if (data && data[key] !== undefined) {
          updates[key] = FieldValue.delete();
          totalFieldsRemoved++;
        }
      }
      if (Object.keys(updates).length > 0) {
        const targetRef = resolvedAdminDb.doc(docPath);
        await targetRef.update(updates);
        cleaned++;
      }
    }
    return cleaned;
  };

  const [invDocs, profDocs, cycleDocs] = await Promise.all([
    queryTenantCollection("invoices"),
    queryTenantCollection("proformas"),
    queryTenantCollection("payroll_cycles")
  ]);

  const invoicesCleaned = await applyCleanup(invDocs, [
    "totalRevenue",
    "totalExpenses",
    "cachedLedgerTotal",
    "redundantSummary"
  ]);
  const proformasCleaned = await applyCleanup(profDocs, [
    "totalRevenue",
    "cachedProfit"
  ]);
  const payrollCyclesCleaned = await applyCleanup(cycleDocs, [
    "totalRevenue",
    "totalProfit"
  ]);

  return {
    businessId: trimmedBiz,
    invoicesCleaned,
    proformasCleaned,
    payrollCyclesCleaned,
    totalFieldsRemoved,
    timestamp: new Date().toISOString()
  };
}
