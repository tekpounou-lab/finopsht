import { db, auth } from "../lib/firebase";
import { collection, getDocs, doc, writeBatch, deleteField } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export interface CleanupResult {
  collectionName: string;
  totalDocsExamined: number;
  totalDocsCleaned: number;
  fieldsRemovedCount: number;
  details: { docId: string; removedFields: string[] }[];
}

const ALL_OBSOLETE_KEYS = [
  "business_id", "branch_id", "department_id", "employee_id", "firebase_uid", 
  "display_name", "employee_name", "created_at", "updated_at", "hire_date", 
  "base_salary", "salary_base_htg", "salaryBaseHtg", "payment_model", "commission_rate", 
  "business_status", "account_status", "onboarding_completed", "normalized_email", 
  "total_gross_htg", "total_net_htg", "amount_paid", "is_paid", "customer_id", 
  "invoice_date", "due_date", "owner_id", "is_active", "totalGrossHtg", "totalNetHtg",
  "target_user_id", "target_roles", "read_at", "amount_cents", "debit_account", 
  "credit_account", "debit_cents", "credit_cents"
];

const TARGET_COLLECTIONS = [
  "businesses",
  "branches",
  "departments",
  "cost_centers",
  "employees",
  "users",
  "user_preferences",
  "invoices",
  "proformas",
  "leads",
  "transactions",
  "ledger_transactions",
  "payroll_cycles",
  "payroll_records",
  "payrolls",
  "payslips",
  "notifications",
  "documents",
  "audit_logs"
];

/**
 * Sweeps Firestore collections to identify and remove residual obsolete fields.
 * If dryRun is true, scans and returns what would be modified without executing writes.
 */
export async function cleanupObsoleteFields(dryRun = false): Promise<CleanupResult[]> {
  const results: CleanupResult[] = [];

  if (auth && !auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch (e) {
      console.warn("[CleanupScript] Anonymous auth fallback skipped or failed:", e);
    }
  }

  for (const collName of TARGET_COLLECTIONS) {
    const obsoleteFields = ALL_OBSOLETE_KEYS;
    try {
      const collRef = collection(db, collName);
      const snap = await getDocs(collRef);
      
      let totalDocsCleaned = 0;
      let fieldsRemovedCount = 0;
      const details: { docId: string; removedFields: string[] }[] = [];
      
      let batch = writeBatch(db);
      let batchCount = 0;

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const fieldsToRemove = obsoleteFields.filter(f => Object.prototype.hasOwnProperty.call(data, f));

        if (fieldsToRemove.length > 0) {
          totalDocsCleaned++;
          fieldsRemovedCount += fieldsToRemove.length;
          details.push({ docId: docSnap.id, removedFields: fieldsToRemove });

          if (!dryRun) {
            const docRef = doc(db, collName, docSnap.id);
            const updatePayload: Record<string, any> = {};
            for (const field of fieldsToRemove) {
              updatePayload[field] = deleteField();
            }
            batch.update(docRef, updatePayload);
            batchCount++;

            if (batchCount >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              batchCount = 0;
            }
          }
        }
      }

      if (!dryRun && batchCount > 0) {
        await batch.commit();
      }

      results.push({
        collectionName: collName,
        totalDocsExamined: snap.docs.length,
        totalDocsCleaned,
        fieldsRemovedCount,
        details
      });
    } catch (err) {
      console.warn(`[CleanupScript] Failed processing collection ${collName}:`, err);
      results.push({
        collectionName: collName,
        totalDocsExamined: 0,
        totalDocsCleaned: 0,
        fieldsRemovedCount: 0,
        details: []
      });
    }
  }

  return results;
}

if (process.argv[1]?.endsWith("cleanupObsoleteFields.ts")) {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(`[CleanupScript] Starting Firestore obsolete fields sweep (dryRun=${isDryRun})...`);
  cleanupObsoleteFields(isDryRun)
    .then(results => {
      console.log("[CleanupScript] Sweep execution finished successfully.");
      console.table(results.map(r => ({
        Collection: r.collectionName,
        Examined: r.totalDocsExamined,
        Cleaned: r.totalDocsCleaned,
        FieldsRemoved: r.fieldsRemovedCount
      })));
      process.exit(0);
    })
    .catch(err => {
      console.error("[CleanupScript] Fatal execution error:", err);
      process.exit(1);
    });
}
