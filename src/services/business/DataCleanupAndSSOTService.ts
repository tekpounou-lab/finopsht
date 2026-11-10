/**
 * FINOPS ERP — SSOT & Data Redundancy Remediation Service (Phase 1.2)
 * 
 * Enforces Single Source of Truth (SSOT) across all ERP domains:
 * 1. Financial totals are canonically sourced from General Ledger (`ledger_transactions`).
 * 2. Invoice & Proforma calculations are dynamically computed from line items (`items`).
 * 3. Payroll cycle sums are dynamically aggregated from individual `payslips`.
 * 4. Provides batch migration to strip legacy redundant/cached summary fields.
 */

import { 
  collection, 
  getDocs, 
  query, 
  where, 
  writeBatch, 
  doc, 
  deleteField,
  DocumentData
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Invoice, InvoiceLine, Proforma } from "../../types/crm";
import { PayrollCycle, Payslip, LedgerTransaction } from "../../types";

export interface SSOTMigrationSummary {
  businessId: string;
  invoicesCleaned: number;
  proformasCleaned: number;
  payrollCyclesCleaned: number;
  totalFieldsRemoved: number;
  timestamp: string;
}

export class DataCleanupAndSSOTService {
  private static instance: DataCleanupAndSSOTService;

  private constructor() {}

  public static getInstance(): DataCleanupAndSSOTService {
    if (!DataCleanupAndSSOTService.instance) {
      DataCleanupAndSSOTService.instance = new DataCleanupAndSSOTService();
    }
    return DataCleanupAndSSOTService.instance;
  }

  /**
   * Computes invoice financial summary on the fly from canonical line items (SSOT).
   */
  public calculateInvoiceTotalsFromItems(items: InvoiceLine[] = []): {
    subtotal: number;
    totalDiscount: number;
    taxAmount: number;
    totalAmount: number;
  } {
    let subtotal = 0;
    let totalDiscount = 0;
    let taxAmount = 0;
    let totalAmount = 0;

    for (const item of items) {
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const discountRate = Number(item.discountRate) || 0;
      const taxRate = Number(item.taxRate) || 0;

      const raw = qty * unitPrice;
      const disc = raw * (discountRate / 100);
      const netSubtotal = raw - disc;
      const lineTax = netSubtotal * (taxRate / 100);
      const lineTotal = netSubtotal + lineTax;

      subtotal += netSubtotal;
      totalDiscount += disc;
      taxAmount += lineTax;
      totalAmount += lineTotal;
    }

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100
    };
  }

  /**
   * Computes payroll cycle totals on the fly from individual payslips (SSOT).
   */
  public calculatePayrollCycleTotalsFromPayslips(payslips: Payslip[] = []): {
    employeeCount: number;
    totalGross: number;
    totalNet: number;
    totalTaxes: number;
  } {
    let totalGross = 0;
    let totalNet = 0;
    let totalTaxes = 0;

    for (const p of payslips) {
      const gross = Number((p as any).grossSalary ?? (p as any).grossSalaryHtg ?? (p.amount_cents ? p.amount_cents / 100 : 0)) || 0;
      const net = Number((p as any).netPaid ?? (p as any).netPaidHtg ?? (p.amount_cents ? p.amount_cents / 100 : 0)) || 0;
      const taxes = Number((p as any).taxDeductions ?? (p as any).onaHtg ?? 0) + Number((p as any).ofatmaHtg ?? 0);

      totalGross += gross;
      totalNet += net;
      totalTaxes += taxes;
    }

    return {
      employeeCount: payslips.length,
      totalGross: Math.round(totalGross * 100) / 100,
      totalNet: Math.round(totalNet * 100) / 100,
      totalTaxes: Math.round(totalTaxes * 100) / 100
    };
  }

  /**
   * Executes a database migration to strip duplicated, redundant, and out-of-sync fields
   * from Firestore documents across tenant collections.
   */
  public async runSSOTCleanupMigration(
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

    console.log(`[SSOT Cleanup Migration] Starting data cleanup for tenant ${trimmedBiz}...`);

    let invoicesCleaned = 0;
    let proformasCleaned = 0;
    let payrollCyclesCleaned = 0;
    let totalFieldsRemoved = 0;

    const isServerRuntime = Boolean(adminDb) || typeof window === "undefined";
    if (isServerRuntime) {
      let resolvedAdminDb = adminDb;
      if (!resolvedAdminDb) {
        const adminModulePath = "../../lib/firebaseAdmin";
        const { getAdminFirestore } = await import(/* @vite-ignore */ adminModulePath);
        resolvedAdminDb = getAdminFirestore();
      }
      const adminFirestoreModule = "firebase-admin/firestore";
      const { FieldValue } = await import(/* @vite-ignore */ adminFirestoreModule);

      const queryTenantCollection = async (colName: string) => {
        const colRef = resolvedAdminDb.collection(colName);
        const subColRef = resolvedAdminDb.collection(`businesses/${trimmedBiz}/${colName}`);
        const [snap1, snap2, subSnap] = await Promise.all([
          colRef.where("businessId", "==", trimmedBiz).get(),
          colRef.where("business_id", "==", trimmedBiz).get(),
          typeof subColRef?.get === "function" ? subColRef.get() : Promise.resolve({ docs: [] })
        ]);
        const byPath = new Map<string, { snap: any; path: string }>();
        snap1?.docs?.forEach((d: any) => byPath.set(`${colName}/${d.id}`, { snap: d, path: `${colName}/${d.id}` }));
        snap2?.docs?.forEach((d: any) => byPath.set(`${colName}/${d.id}`, { snap: d, path: `${colName}/${d.id}` }));
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
        _colName: string,
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

      invoicesCleaned = await applyCleanup("invoices", invDocs, [
        "totalRevenue",
        "totalExpenses",
        "cachedLedgerTotal",
        "redundantSummary"
      ]);
      proformasCleaned = await applyCleanup("proformas", profDocs, [
        "totalRevenue",
        "cachedProfit"
      ]);
      payrollCyclesCleaned = await applyCleanup("payroll_cycles", cycleDocs, [
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

    // 1. Invoices Collection: Remove redundant duplicated fields (e.g. legacy totalRevenue, cachedLedgerTotal, redundantTax)
    try {
      const invoicesRef = collection(db, "businesses", trimmedBiz, "invoices");
      const invSnap = await getDocs(invoicesRef);

      let batch = writeBatch(db);
      let batchOps = 0;

      for (const docSnap of invSnap.docs) {
        const data = docSnap.data();
        const fieldsToDelete: Record<string, any> = {};

        if (data.totalRevenue !== undefined) {
          fieldsToDelete.totalRevenue = deleteField();
          totalFieldsRemoved++;
        }
        if (data.totalExpenses !== undefined) {
          fieldsToDelete.totalExpenses = deleteField();
          totalFieldsRemoved++;
        }
        if (data.cachedLedgerTotal !== undefined) {
          fieldsToDelete.cachedLedgerTotal = deleteField();
          totalFieldsRemoved++;
        }
        if (data.redundantSummary !== undefined) {
          fieldsToDelete.redundantSummary = deleteField();
          totalFieldsRemoved++;
        }

        if (Object.keys(fieldsToDelete).length > 0) {
          batch.update(docSnap.ref, fieldsToDelete);
          invoicesCleaned++;
          batchOps++;

          if (batchOps >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            batchOps = 0;
          }
        }
      }

      if (batchOps > 0) {
        await batch.commit();
      }
    } catch (err: any) {
      console.warn(`[SSOT Cleanup] Invoices migration warning:`, err?.message || err);
    }

    // 2. Proformas Collection: Remove duplicate cached summary fields
    try {
      const proformasRef = collection(db, "businesses", trimmedBiz, "proformas");
      const profSnap = await getDocs(proformasRef);

      let batch = writeBatch(db);
      let batchOps = 0;

      for (const docSnap of profSnap.docs) {
        const data = docSnap.data();
        const fieldsToDelete: Record<string, any> = {};

        if (data.totalRevenue !== undefined) {
          fieldsToDelete.totalRevenue = deleteField();
          totalFieldsRemoved++;
        }
        if (data.cachedProfit !== undefined) {
          fieldsToDelete.cachedProfit = deleteField();
          totalFieldsRemoved++;
        }

        if (Object.keys(fieldsToDelete).length > 0) {
          batch.update(docSnap.ref, fieldsToDelete);
          proformasCleaned++;
          batchOps++;

          if (batchOps >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            batchOps = 0;
          }
        }
      }

      if (batchOps > 0) {
        await batch.commit();
      }
    } catch (err: any) {
      console.warn(`[SSOT Cleanup] Proformas migration warning:`, err?.message || err);
    }

    // 3. Payroll Cycles: Remove duplicate top-level financial metrics (sourcing from payslips/ledger)
    try {
      const cyclesQuery = query(collection(db, "payroll_cycles"), where("business_id", "==", trimmedBiz));
      const cycleSnap = await getDocs(cyclesQuery);

      let batch = writeBatch(db);
      let batchOps = 0;

      for (const docSnap of cycleSnap.docs) {
        const data = docSnap.data();
        const fieldsToDelete: Record<string, any> = {};

        if (data.totalRevenue !== undefined) {
          fieldsToDelete.totalRevenue = deleteField();
          totalFieldsRemoved++;
        }
        if (data.totalProfit !== undefined) {
          fieldsToDelete.totalProfit = deleteField();
          totalFieldsRemoved++;
        }

        if (Object.keys(fieldsToDelete).length > 0) {
          batch.update(docSnap.ref, fieldsToDelete);
          payrollCyclesCleaned++;
          batchOps++;

          if (batchOps >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            batchOps = 0;
          }
        }
      }

      if (batchOps > 0) {
        await batch.commit();
      }
    } catch (err: any) {
      console.warn(`[SSOT Cleanup] Payroll cycles migration warning:`, err?.message || err);
    }

    const summary: SSOTMigrationSummary = {
      businessId: trimmedBiz,
      invoicesCleaned,
      proformasCleaned,
      payrollCyclesCleaned,
      totalFieldsRemoved,
      timestamp: new Date().toISOString()
    };

    console.log(`[SSOT Cleanup Migration] Completed for ${trimmedBiz}:`, summary);
    return summary;
  }
}

export const DataCleanupAndSSOT = DataCleanupAndSSOTService.getInstance();
