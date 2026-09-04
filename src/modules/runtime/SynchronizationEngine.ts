import { auth, db, logFirestoreError, OperationType } from "../../lib/firebase";
import { collection, query, where, doc, Unsubscribe } from "firebase/firestore";
import { EventBus } from "./EventBus";
import { AdminRepository } from "../admin/AdminRepository";
import { realtimeManager, tenantQuery } from "../../services/firestore/realtimeManager";

class EnterpriseSynchronizationEngine {
  private static instance: EnterpriseSynchronizationEngine;
  private activeListeners: Map<string, Unsubscribe> = new Map();
  private currentBusinessId: string | null = null;
  private healthInterval: any = null;
  private lastPayloadHashes: Map<string, string> = new Map();

  private constructor() {}

  public static getInstance(): EnterpriseSynchronizationEngine {
    if (!EnterpriseSynchronizationEngine.instance) {
      EnterpriseSynchronizationEngine.instance = new EnterpriseSynchronizationEngine();
    }
    return EnterpriseSynchronizationEngine.instance;
  }

  /**
   * Orchestrate synchronization for a specific business.
   * Cleans up existing listeners before establishing new ones.
   */
  public startSync(businessId: string): void {
    if (!businessId || businessId === "none" || !auth.currentUser) {
      return;
    }

    if (this.currentBusinessId === businessId) return;
    
    this.stopSync();
    this.currentBusinessId = businessId;
    
    console.log(`[SynchronizationEngine] Starting real-time sync for business: ${businessId}`);

    // 1. Sync Branches
    this.registerListener("branches", realtimeManager.subscribe(
      `branches:${businessId}`,
      tenantQuery(collection(db, "branches"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("BRANCHES", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "branches")
    ));

    // 2. Sync Departments
    this.registerListener("departments", realtimeManager.subscribe(
      `departments:${businessId}`,
      tenantQuery(collection(db, "departments"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("DEPARTMENTS", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "departments")
    ));

    // 3. Sync Employees
    this.registerListener("employees", realtimeManager.subscribe(
      `employees:${businessId}`,
      tenantQuery(collection(db, "employees"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("EMPLOYEES", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "employees")
    ));

    // 4. Sync Settings
    this.registerListener("settings", realtimeManager.subscribe(
      `business_settings:${businessId}`,
      doc(db, "business_settings", businessId),
      (snap) => {
        if (snap.exists()) {
          this.publishSyncEvent("SETTINGS", { id: snap.id, ...snap.data() });
        }
      },
      (error) => logFirestoreError(error, OperationType.GET, `business_settings/${businessId}`)
    ));

    // 5. Sync Business Doc
    this.registerListener("business_doc", realtimeManager.subscribe(
      `businesses:${businessId}`,
      doc(db, "businesses", businessId),
      (snap) => {
        if (snap.exists()) {
          this.publishSyncEvent("BUSINESS", { id: snap.id, ...snap.data() });
        }
      },
      (error) => logFirestoreError(error, OperationType.GET, `businesses/${businessId}`)
    ));

    // 6. Sync Invitations
    this.registerListener("invitations", realtimeManager.subscribe(
      `invitations:${businessId}`,
      tenantQuery(collection(db, "invitations"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("INVITATIONS", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "invitations")
    ));

    // 7. Sync Roles
    this.registerListener("roles", realtimeManager.subscribe(
      `roles:${businessId}`,
      tenantQuery(collection(db, "roles"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("ROLES", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "roles")
    ));

    // 8. Sync Ledger Transactions
    this.registerListener("transactions", realtimeManager.subscribe(
      `transactions:${businessId}`,
      tenantQuery(collection(db, "ledger_transactions"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("LEDGER_TRANSACTIONS", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "transactions")
    ));

    // 9. Sync Payroll Records
    this.registerListener("payroll_records", realtimeManager.subscribe(
      `payroll_records:${businessId}`,
      tenantQuery(collection(db, "payroll_records"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("PAYROLL_RECORDS", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "payroll_records")
    ));

    // 10. Sync Attendance Records
    this.registerListener("attendance_logs", realtimeManager.subscribe(
      `attendance_logs:${businessId}`,
      tenantQuery(collection(db, "attendance_logs"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("ATTENDANCE_RECORDS", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "attendance_logs")
    ));

    // 11. Sync Forensic Logs
    this.registerListener("forensic_logs", realtimeManager.subscribe(
      `audit_logs:${businessId}`,
      tenantQuery(collection(db, "audit_logs"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("FORENSIC_LOGS", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "audit_logs")
    ));

    // 12. Sync Events
    this.registerListener("events", realtimeManager.subscribe(
      `events:${businessId}`,
      tenantQuery(collection(db, "events"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("EVENTS", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "events")
    ));

    // 13. Sync Leaves
    this.registerListener("leaves", realtimeManager.subscribe(
      `leaves:${businessId}`,
      tenantQuery(collection(db, "leaves"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("LEAVES", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "leaves")
    ));

    // 14. Sync Compensation Models
    this.registerListener("compensation_models", realtimeManager.subscribe(
      `compensation_models:${businessId}`,
      tenantQuery(collection(db, "compensation_models"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("COMPENSATION_MODELS", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "compensation_models")
    ));

    // 15. Sync Payroll Policies
    this.registerListener("payroll_policies", realtimeManager.subscribe(
      `payroll_policies:${businessId}`,
      tenantQuery(collection(db, "payroll_policies"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("PAYROLL_POLICIES", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "payroll_policies")
    ));

    // 16. Sync Role Profiles
    this.registerListener("role_profiles", realtimeManager.subscribe(
      `role_profiles:${businessId}`,
      tenantQuery(collection(db, "role_profiles"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("ROLE_PROFILES", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "role_profiles")
    ));

    // 17. Sync Shifts
    this.registerListener("schedules", realtimeManager.subscribe(
      `shifts:${businessId}`,
      tenantQuery(collection(db, "shifts"), businessId),
      (snap) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        this.publishSyncEvent("SCHEDULES", data);
      },
      (error) => logFirestoreError(error, OperationType.LIST, "shifts")
    ));

    // Health Reporting
    this.registerHealthHeartbeat();

    console.log(`[SynchronizationEngine] Sync established for ${businessId}`);
  }

  private registerHealthHeartbeat(): void {
    const interval = setInterval(async () => {
      if (!auth.currentUser || !this.currentBusinessId) return;
      const { serverTimestamp } = await import("../../lib/firebase");
      await AdminRepository.reportHealth({
        name: "SYNC_ENGINE",
        businessId: this.currentBusinessId || undefined,
        status: "GREEN",
        lastUpdate: serverTimestamp(),
        metrics: { listeners: this.activeListeners.size }
      });
    }, 60000);
    
    this.healthInterval = interval;
  }

  private registerListener(key: string, unsub: Unsubscribe): void {
    this.activeListeners.set(key, unsub);
  }

  private publishSyncEvent(aggregate: string, data: any): void {
    try {
      // Fingerprint payload to prevent redundant event spam if underlying data hasn't changed
      const payloadHash = JSON.stringify(data);
      const lastHash = this.lastPayloadHashes.get(aggregate);
      if (lastHash === payloadHash) {
        return; // Suppress duplicate event publication
      }
      this.lastPayloadHashes.set(aggregate, payloadHash);

      EventBus.publish(EventBus.createEvent({
        correlationId: `sync_${aggregate}_${Date.now()}`,
        businessId: this.currentBusinessId || undefined,
        module: "SYNC_ENGINE",
        aggregate,
        type: `${aggregate}_Synced`,
        payload: data
      }));
    } catch (err) {
      console.warn(`[SynchronizationEngine] Error publishing sync event for ${aggregate}:`, err);
    }
  }

  public stopSync(): void {
    this.activeListeners.forEach(unsub => {
      try {
        unsub();
      } catch (e) {
        console.warn("[SynchronizationEngine] Unsubscribe error:", e);
      }
    });
    this.activeListeners.clear();
    this.lastPayloadHashes.clear();
    realtimeManager.cleanupUnusedListeners();

    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    this.currentBusinessId = null;
  }
}

export const SynchronizationEngine = EnterpriseSynchronizationEngine.getInstance();
