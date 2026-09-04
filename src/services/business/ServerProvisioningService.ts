
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, getAdminAuth } from "../../lib/firebaseAdmin";
import firebaseConfig from "../../../firebase-applet-config.json";

export interface ProvisioningResult {
  businessId: string;
  employeeId: string;
}

export class ServerProvisioningService {
  /**
   * Helper to get Firestore instance with exact project & database binding.
   */
  private static getDb() {
    return getAdminFirestore();
  }

  /**
   * Server-side atomic provisioning.
   * Bypasses security rules and updates custom claims.
   */
  static async provision(
    founder: { uid: string; email: string; name: string },
    businessName: string,
    options: any = {}
  ): Promise<ProvisioningResult> {
    const db = this.getDb();
    const auth = getAdminAuth();
    
    const businessId = options.businessId || `biz_${founder.uid}`;
    const employeeId = options.employeeId || `emp_${founder.uid}`;
    
    const now = FieldValue.serverTimestamp();
    const isoNow = new Date().toISOString();
    
    console.log(`[ServerProvisioning] Starting orchestration for ${businessName} (Business ID: ${businessId}, Founder: ${founder.uid})`);

    try {
      // 1. Check idempotency before transaction
      try {
        const existingQuery = await db.collection("businesses")
          .where("ownerId", "==", founder.uid)
          .get();
        
        let activeOrPending = existingQuery.docs.find(d => {
          const st = d.data().status;
          return d.id !== businessId && st && st !== "CANCELLED";
        });

        if (!activeOrPending) {
          const legacyQuery = await db.collection("businesses")
            .where("owner_id", "==", founder.uid)
            .get();
          activeOrPending = legacyQuery.docs.find(d => {
            const st = d.data().status;
            return d.id !== businessId && st && st !== "CANCELLED";
          });
        }

        if (activeOrPending) {
          console.log(`[ServerProvisioning] Business already exists for owner ${founder.uid}: ${activeOrPending.id}`);
          throw new Error("BUSINESS_ALREADY_EXISTS");
        }
      } catch (err: any) {
        if (err.message === "BUSINESS_ALREADY_EXISTS") throw err;
        console.warn("[ServerProvisioning] Idempotency check warning:", err);
      }

      await db.runTransaction(async (transaction) => {
        // 2. Prepare documents (Phase 1: Minimum Viable Identity, strictly camelCase)
        const businessData = {
          id: businessId,
          name: businessName,
          status: "PENDING", // Start in PENDING state for Superadmin approval
          ownerId: founder.uid,
          ownerEmployeeId: employeeId,
          createdAt: now,
          updatedAt: now,
          nif: options.nif || "",
          domain: options.domain || "SME",
          industry: options.domain || "SME"
        };

        const settings = {
          businessId: businessId,
          currency: "USD",
          timezone: "UTC",
          dateFormat: "DD/MM/YYYY",
          fiscalYearStart: "01-01",
          updatedAt: now
        };

        const subscription = {
          businessId: businessId,
          plan: "FREE_TIER",
          status: "PENDING", // Subscription also pending
          expiresAt: null,
          seats: 5,
          updatedAt: now
        };

        const featureFlags = {
          businessId: businessId,
          ai_cfo: true,
          advanced_payroll: true,
          multi_branch: true,
          updatedAt: now
        };

        // Deterministic Branch & Department
        const branchId = `br_${businessId}`;
        const deptId = `dept_${businessId}`;

        const branchData = {
          id: branchId,
          businessId: businessId,
          name: options.branchName || "Siège Social",
          location: options.location || "Port-au-Prince",
          isActive: true,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now
        };

        const departmentData = {
          id: deptId,
          businessId: businessId,
          branchId: branchId,
          name: "Direction Générale",
          isActive: true,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now
        };

        const employeeData = {
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
        };

        const membershipId = `${businessId}_${founder.uid}`;
        const membershipData = {
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
        };

        // WRITES (Phase 1 Atomic Provisioning)
        transaction.set(db.doc(`businesses/${businessId}`), businessData);
        transaction.set(db.doc(`business_settings/${businessId}`), settings);
        transaction.set(db.doc(`subscriptions/${businessId}`), subscription);
        transaction.set(db.doc(`features/${businessId}`), featureFlags);
        transaction.set(db.doc(`branches/${branchId}`), branchData);
        transaction.set(db.doc(`departments/${deptId}`), departmentData);
        transaction.set(db.doc(`employees/${employeeId}`), employeeData);
        transaction.set(db.doc(`memberships/${membershipId}`), membershipData);
        
        transaction.set(db.doc(`users/${founder.uid}`), {
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

        // Audit Log
        transaction.set(db.collection("forensic_logs").doc(), {
          businessId: businessId,
          userId: founder.uid,
          userName: founder.name,
          userRole: "OWNER",
          action: "BUSINESS_CREATED_PENDING",
          timestamp: now,
          severity: "info"
        });
      });

      // 3. Update Custom Claims (Non-blocking)
      try {
        console.log(`[ServerProvisioning] Updating custom claims for ${founder.uid}`);
        await auth.setCustomUserClaims(founder.uid, {
          businessId: businessId,
          business_id: businessId,
          role: "OWNER"
        });
      } catch (claimErr) {
        console.warn("[ServerProvisioning] Custom claims update non-fatal warning:", claimErr);
      }

      console.log(`[ServerProvisioning] Successfully committed all workspace collections for ${businessId}`);
      return { businessId, employeeId };

    } catch (error: any) {
      if (error?.message === "BUSINESS_ALREADY_EXISTS") {
        throw error;
      }
      console.error("[ServerProvisioning] Critical provisioning transaction failure:", error);
      throw error;
    }
  }
}
