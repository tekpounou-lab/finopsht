/**
 * FINOPS ERP — Phase 3: Payroll Input Snapshot Repository
 * Repository Pattern encapsulation for Firestore `businesses/{businessId}/payroll_input_snapshots`
 */

import { db } from "../lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { PayrollInputSnapshot } from "../types";

const PRIMARY_COLLECTION = "payroll_input_snapshots";
const LEGACY_COLLECTION = "payroll_inputs_snapshots";

export class PayrollInputSnapshotRepository {
  /**
   * Save a single snapshot to Firestore
   * Supports both saveSnapshot(snapshot) and saveSnapshot(businessId, snapshot)
   */
  public static async saveSnapshot(arg1: any, arg2?: any): Promise<void> {
    let businessId: string;
    let snapshot: PayrollInputSnapshot;

    if (typeof arg1 === "string" && arg2) {
      businessId = arg1;
      snapshot = arg2;
    } else {
      snapshot = arg1;
      businessId = snapshot?.business_id || (snapshot as any)?.businessId || "";
    }

    if (!snapshot?.id) return;
    try {
      const payload = {
        ...snapshot,
        business_id: businessId,
        businessId,
        updatedAt: new Date().toISOString(),
        server_updated_at: serverTimestamp(),
      };

      // Dual write to primary and legacy collection for maximum compatibility
      const primaryRef = doc(db, PRIMARY_COLLECTION, snapshot.id);
      const legacyRef = doc(db, LEGACY_COLLECTION, snapshot.id);

      await Promise.all([
        setDoc(primaryRef, payload, { merge: true }),
        setDoc(legacyRef, payload, { merge: true }),
      ]);
    } catch (err) {
      console.error("[PayrollInputSnapshotRepository] Error saving snapshot:", err);
      throw err;
    }
  }

  /**
   * Save batch snapshots for a full cycle
   */
  public static async saveSnapshots(businessId: string, snapshots: PayrollInputSnapshot[]): Promise<void> {
    if (!businessId || !snapshots || snapshots.length === 0) return;
    try {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();

      snapshots.forEach((snap) => {
        const payload = {
          ...snap,
          business_id: businessId,
          businessId,
          updatedAt: nowIso,
        };
        const primaryRef = doc(db, PRIMARY_COLLECTION, snap.id);
        const legacyRef = doc(db, LEGACY_COLLECTION, snap.id);
        batch.set(primaryRef, payload, { merge: true });
        batch.set(legacyRef, payload, { merge: true });
      });

      await batch.commit();
    } catch (err) {
      console.error("[PayrollInputSnapshotRepository] Error saving batch snapshots:", err);
      throw err;
    }
  }

  /**
   * Fetch snapshot by ID
   */
  public static async getSnapshot(businessId: string, snapshotId: string): Promise<PayrollInputSnapshot | null> {
    if (!businessId || !snapshotId) return null;
    try {
      const docRef = doc(db, PRIMARY_COLLECTION, snapshotId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as PayrollInputSnapshot;
      }

      // Fallback check legacy collection
      const legacyRef = doc(db, LEGACY_COLLECTION, snapshotId);
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists()) {
        return { id: legacySnap.id, ...legacySnap.data() } as PayrollInputSnapshot;
      }

      return null;
    } catch (err) {
      console.error("[PayrollInputSnapshotRepository] Error fetching snapshot:", err);
      return null;
    }
  }

  /**
   * Fetch all snapshots for a specific payroll cycle
   */
  public static async getSnapshotsByCycle(businessId: string, cycleId: string): Promise<PayrollInputSnapshot[]> {
    if (!businessId || !cycleId) return [];
    try {
      const q = query(collection(db, PRIMARY_COLLECTION), where("business_id", "==", businessId));
      const snapshotDocs = await getDocs(q);
      const results: PayrollInputSnapshot[] = [];

      snapshotDocs.forEach((d) => {
        const data = d.data() as PayrollInputSnapshot;
        if (data.payroll_cycle_id === cycleId || data.cycleId === cycleId) {
          results.push({ id: d.id, ...data });
        }
      });

      if (results.length > 0) return results;

      // Fallback to legacy collection if primary has no entries
      const qLegacy = query(collection(db, LEGACY_COLLECTION), where("business_id", "==", businessId));
      const legacyDocs = await getDocs(qLegacy);
      legacyDocs.forEach((d) => {
        const data = d.data() as PayrollInputSnapshot;
        if (data.payroll_cycle_id === cycleId || data.cycleId === cycleId) {
          results.push({ id: d.id, ...data });
        }
      });

      return results;
    } catch (err) {
      console.error("[PayrollInputSnapshotRepository] Error fetching snapshots by cycle:", err);
      return [];
    }
  }

  /**
   * Lock all snapshots for a cycle once validated
   */
  public static async lockSnapshotsForCycle(businessId: string, cycleId: string): Promise<void> {
    if (!businessId || !cycleId) return;
    try {
      const snapshots = await this.getSnapshotsByCycle(businessId, cycleId);
      if (snapshots.length === 0) return;

      const batch = writeBatch(db);
      snapshots.forEach((snap) => {
        const primaryRef = doc(db, PRIMARY_COLLECTION, snap.id);
        const legacyRef = doc(db, LEGACY_COLLECTION, snap.id);
        const updateData = { status: "LOCKED", payrollStatus: "LOCKED", lockedAt: new Date().toISOString() };
        batch.set(primaryRef, updateData, { merge: true });
        batch.set(legacyRef, updateData, { merge: true });
      });

      await batch.commit();
    } catch (err) {
      console.error("[PayrollInputSnapshotRepository] Error locking snapshots:", err);
    }
  }
}
