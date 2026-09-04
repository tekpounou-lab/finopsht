import { EventBus } from "../../modules/runtime/EventBus";
import { finopsEventOrchestrator } from "../finopsEventOrchestrator";
import { db } from "../../lib/firebase";
import { doc, writeBatch, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";

export interface ProvisioningResult {
  businessId: string;
  employeeId: string;
}

export interface ProvisioningOptions {
  nif?: string;
  domain?: string;
  branchName?: string;
  location?: string;
  correlationId?: string;
  businessId?: string;
  employeeId?: string;
}

export class WorkspaceProvisioningService {
  /**
   * Orchestrates enterprise workspace creation via secure server-side API
   * with automatic, authenticated client-side fallback.
   * 
   * Strict Sequence:
   * 1. Deterministic businessId and employeeId generated upfront.
   * 2. Idempotency verification: reject if existing active/pending business exists.
   * 3. Atomic batch writes (businesses, settings, sub, features, employee, membership, user with role: OWNER).
   * 4. ONLY AFTER batch commits successfully: publish scoped events with real business_id.
   * 5. On failure: no event is emitted, error is thrown to caller.
   */
  static async provision(
    founder: { uid: string; email: string; name: string }, 
    businessName: string,
    options: ProvisioningOptions = {}
  ): Promise<ProvisioningResult> {
    const correlationId = options.correlationId || `prov_${Date.now()}_${founder.uid}`;
    // 1. Generate deterministic identifiers upfront
    const businessId = options.businessId || `biz_${founder.uid}`;
    const employeeId = options.employeeId || `emp_${founder.uid}`;
    
    console.log(`[Provisioning] Initiating orchestration for ${businessName} (Business ID: ${businessId}, Correlation: ${correlationId})`);

    // 2. Pre-flight Idempotency Check
    try {
      let existingSnap = await getDocs(query(
        collection(db, "businesses"),
        where("ownerId", "==", founder.uid)
      ));
      if (existingSnap.empty) {
        existingSnap = await getDocs(query(
          collection(db, "businesses"),
          where("owner_id", "==", founder.uid)
        ));
      }
      const activeOrPending = existingSnap.docs.find(d => {
        const status = d.data().status;
        return d.id !== businessId && status && status !== "CANCELLED";
      });
      if (activeOrPending) {
        console.warn(`[Provisioning] Business already exists for owner ${founder.uid}: ${activeOrPending.id}`);
        throw new Error("BUSINESS_ALREADY_EXISTS");
      }
    } catch (checkErr: any) {
      if (checkErr.message === "BUSINESS_ALREADY_EXISTS") {
        throw checkErr;
      }
      console.warn("[Provisioning] Pre-flight idempotency check bypassed due to network/rules warning:", checkErr);
    }

    let provisioningCompleted = false;

    // 3. Attempt Server-Side Provisioning First (Admin SDK with service account)
    try {
      const { auth } = await import("../../lib/firebase");
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest"
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      console.log(`[Provisioning] Dispatching server-side provisioning request for ${businessId}...`);
      const resp = await fetch("/api/provisioning/create-business", {
        method: "POST",
        headers,
        body: JSON.stringify({
          founder,
          businessName,
          options: { ...options, businessId, employeeId, correlationId }
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.success) {
          console.log(`[Provisioning] Server-side provisioning confirmed for ${businessId}`);
          provisioningCompleted = true;
        }
      } else {
        const errText = await resp.text().catch(() => "");
        console.warn(`[Provisioning] Server endpoint returned status ${resp.status}: ${errText}. Falling back to client-side batch write.`);
      }
    } catch (serverErr) {
      console.warn("[Provisioning] Server endpoint unreachable, falling back to direct client batch write:", serverErr);
    }

    // 4. Client-Side Fallback / Primary Path (Authenticated Batch Provisioning)
    if (!provisioningCompleted) {
      console.log(`[Provisioning] Executing client-side authenticated batch write for ${businessId}...`);
      const membershipId = `${businessId}_${founder.uid}`;
      const now = serverTimestamp();

      const batch = writeBatch(db);

      // Business
      batch.set(doc(db, "businesses", businessId), {
        id: businessId,
        name: businessName,
        status: "PENDING",
        ownerId: founder.uid,
        ownerEmployeeId: employeeId,
        createdAt: now,
        updatedAt: now,
        nif: options.nif || "",
        domain: options.domain || "SME",
        industry: options.domain || "SME"
      });

      // Settings
      batch.set(doc(db, "business_settings", businessId), {
        businessId: businessId,
        currency: "USD",
        timezone: "UTC",
        dateFormat: "DD/MM/YYYY",
        fiscalYearStart: "01-01",
        updatedAt: now
      });

      // Subscription
      batch.set(doc(db, "subscriptions", businessId), {
        businessId: businessId,
        plan: "FREE_TIER",
        status: "PENDING",
        expiresAt: null,
        seats: 5,
        updatedAt: now
      });

      // Features
      batch.set(doc(db, "features", businessId), {
        businessId: businessId,
        aiCfo: true,
        advancedPayroll: true,
        multiBranch: true,
        updatedAt: now
      });

      // Deterministic Branch & Department
      const branchId = `br_${businessId}`;
      const deptId = `dept_${businessId}`;

      // Branch
      batch.set(doc(db, "branches", branchId), {
        id: branchId,
        businessId: businessId,
        name: options.branchName || "Siège Social",
        location: options.location || "Port-au-Prince",
        isActive: true,
        createdAt: now,
        updatedAt: now
      });

      // Department
      batch.set(doc(db, "departments", deptId), {
        id: deptId,
        businessId: businessId,
        branchId: branchId,
        name: "Direction Générale",
        isActive: true,
        createdAt: now,
        updatedAt: now
      });

      // Employee
      batch.set(doc(db, "employees", employeeId), {
        id: employeeId,
        businessId: businessId,
        uid: founder.uid,
        email: founder.email.toLowerCase().trim(),
        normalizedEmail: founder.email.toLowerCase().trim(),
        name: founder.name,
        displayName: founder.name,
        position: "Propriétaire / Directeur Général",
        role: "OWNER",
        status: "ACTIVE",
        onboardingComplete: true,
        isActive: true,
        branchId: branchId,
        departmentId: deptId,
        baseSalary: 0,
        paymentModel: "FIXED",
        payRegime: "fixe",
        contractType: "cdi",
        hireDate: new Date().toISOString().split("T")[0],
        createdAt: now,
        updatedAt: now
      });

      // Membership
      batch.set(doc(db, "memberships", membershipId), {
        id: membershipId,
        uid: founder.uid,
        businessId: businessId,
        role: "OWNER",
        permissions: ["*"],
        status: "ACTIVE",
        joinedAt: now,
        updatedAt: now,
        employeeId: employeeId,
        branchId: branchId,
        departmentId: deptId
      });

      // User Profile Update (Role: OWNER, Onboarding: Completed, Business Status)
      batch.set(doc(db, "users", founder.uid), {
        id: founder.uid,
        uid: founder.uid,
        name: founder.name,
        displayName: founder.name,
        email: founder.email.toLowerCase().trim(),
        normalizedEmail: founder.email.toLowerCase().trim(),
        businessId: businessId,
        branchId: branchId,
        departmentId: deptId,
        employeeId: employeeId,
        role: "OWNER",
        businessStatus: "PENDING",
        accountStatus: "ACTIVE",
        onboardingComplete: true,
        updatedAt: now
      }, { merge: true });

      // Forensic Log
      const logRef = doc(collection(db, "forensic_logs"));
      batch.set(logRef, {
        businessId: businessId,
        userId: founder.uid,
        userName: founder.name,
        userRole: "OWNER",
        action: "BUSINESS_CREATED_PENDING",
        timestamp: now,
        severity: "info"
      });

      try {
        await batch.commit();
        console.log(`[Provisioning] Authenticated batch committed successfully for business: ${businessId}`);
        provisioningCompleted = true;
      } catch (batchErr: any) {
        console.error("[Provisioning] Client batch commit failed:", batchErr);
        throw batchErr;
      }
    }

    if (!provisioningCompleted) {
      throw new Error("Provisioning failed to commit to persistence store.");
    }

    // 5. POST-COMMIT: Publish strictly scoped events with real businessId
    EventBus.publish(EventBus.createEvent({
      type: "WORKSPACE_PROVISIONED",
      module: "IDENTITY",
      aggregate: "BUSINESS",
      businessId,
      payload: { business_id: businessId, businessId, employeeId, ownerUid: founder.uid },
      correlationId
    }));

    await finopsEventOrchestrator.emit("ONBOARDING_STATE_TRANSITION", businessId, {
      correlationId: `onboarding_prov_${businessId}`,
      business_id: businessId,
      businessId,
      userId: founder.uid,
      email: founder.email,
      currentState: "WAITING_APPROVAL",
      action: "WORKSPACE_PROVISIONED",
      timestamp: new Date().toISOString()
    }).catch(err => {
      console.warn("[WorkspaceProvisioningService] Scoped transition emit warning:", err);
    });

    console.log(`[Provisioning] Enterprise ${businessId} successfully provisioned and scoped.`);
    return { businessId, employeeId };
  }
}

