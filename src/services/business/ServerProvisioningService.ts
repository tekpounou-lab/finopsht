
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, getAdminAuth } from "../../lib/firebaseAdmin";
import { isInvalidTenantId } from "../../modules/workflow/approval/serverAuthMiddleware";
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
    founder: {
      uid: string;
      email: string;
      name: string;
      existingBusinessId?: string;
      isSuperAdmin?: boolean;
    },
    businessName: string,
    options: any = {}
  ): Promise<ProvisioningResult> {
    if (!founder?.uid || !founder?.email || !businessName?.trim()) {
      throw new Error("INVALID_PROVISIONING_PARAMS");
    }

    const db = this.getDb();
    const auth = getAdminAuth();
    
    const requestedBizId = typeof options.businessId === "string" ? options.businessId.trim() : "";
    if (
      requestedBizId &&
      (isInvalidTenantId(requestedBizId) || requestedBizId.includes("/"))
    ) {
      throw new Error("INVALID_BUSINESS_ID");
    }

    const requestedEmpId = typeof options.employeeId === "string" ? options.employeeId.trim() : "";
    if (
      requestedEmpId &&
      (isInvalidTenantId(requestedEmpId) || requestedEmpId.includes("/"))
    ) {
      throw new Error("INVALID_PROVISIONING_PARAMS");
    }

    const businessId = requestedBizId || `biz_${founder.uid}`;
    const employeeId = requestedEmpId || `emp_${founder.uid}`;

    const callerClaimBiz =
      typeof founder.existingBusinessId === "string" ? founder.existingBusinessId.trim() : "";
    if (
      !founder.isSuperAdmin &&
      callerClaimBiz &&
      !isInvalidTenantId(callerClaimBiz) &&
      callerClaimBiz !== businessId
    ) {
      throw new Error("USER_ALREADY_BOUND_TO_TENANT");
    }
    
    const now = FieldValue.serverTimestamp();
    
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
        // READ PHASE: Verify target businessId, founder user profile, and target employeeId inside transaction
        const targetBizRef = db.doc(`businesses/${businessId}`);
        const founderUserRef = db.doc(`users/${founder.uid}`);
        const targetEmpRef = db.doc(`employees/${employeeId}`);
        const [existingBizSnap, existingUserSnap, existingEmpSnap] = await Promise.all([
          transaction.get(targetBizRef),
          transaction.get(founderUserRef),
          transaction.get(targetEmpRef)
        ]);

        if (existingBizSnap.exists) {
          const existingBizData = existingBizSnap.data() || {};
          const existingOwner = existingBizData.ownerId || existingBizData.owner_id || "";
          if (!existingOwner || existingOwner !== founder.uid) {
            throw new Error("TENANT_OVERWRITE_FORBIDDEN");
          }
          if (existingBizData.status && String(existingBizData.status).toUpperCase() !== "CANCELLED") {
            throw new Error("BUSINESS_ALREADY_EXISTS");
          }
        }

        if (existingUserSnap.exists) {
          const existingUserData = existingUserSnap.data() || {};
          const uBiz1 =
            typeof existingUserData.businessId === "string" ? existingUserData.businessId.trim() : "";
          const uBiz2 =
            typeof existingUserData.business_id === "string" ? existingUserData.business_id.trim() : "";
          if (
            uBiz1 &&
            uBiz2 &&
            !isInvalidTenantId(uBiz1) &&
            !isInvalidTenantId(uBiz2) &&
            uBiz1 !== uBiz2
          ) {
            throw new Error("USER_ALREADY_BOUND_TO_TENANT");
          }

          const existingUserBiz = uBiz1 || uBiz2;
          const existingUserBizStatus = String(
            existingUserData.businessStatus || existingUserData.business_status || ""
          ).toUpperCase();
          if (
            existingUserBiz &&
            !isInvalidTenantId(existingUserBiz) &&
            existingUserBiz !== businessId &&
            existingUserBizStatus !== "CANCELLED"
          ) {
            throw new Error("USER_ALREADY_BOUND_TO_TENANT");
          }
        }

        if (existingEmpSnap.exists) {
          const existingEmpData = existingEmpSnap.data() || {};
          const empBiz1 =
            typeof existingEmpData.businessId === "string" ? existingEmpData.businessId.trim() : "";
          const empBiz2 =
            typeof existingEmpData.business_id === "string" ? existingEmpData.business_id.trim() : "";
          if (empBiz1 && empBiz2 && empBiz1 !== empBiz2) {
            throw new Error("TENANT_OVERWRITE_FORBIDDEN");
          }
          const empBiz = empBiz1 || empBiz2;
          const empUid = String(existingEmpData.uid || existingEmpData.firebase_uid || "").trim();

          if (
            (empBiz && empBiz !== businessId) ||
            (empUid && empUid !== founder.uid) ||
            (!empBiz && !empUid)
          ) {
            throw new Error("TENANT_OVERWRITE_FORBIDDEN");
          }
        }

        // 2. Prepare documents (Phase 1: Minimum Viable Identity)
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

        const rawPlan = options.plan || options.selectedPlan || "STARTER";
        const planCandidate = (rawPlan || "").trim().toUpperCase();
        const SUPPORTED_PLANS = ["STARTER", "PROFESSIONAL", "BUSINESS", "ENTERPRISE", "FREE_TIER", "CUSTOM", "TRIAL"];
        const targetPlan = SUPPORTED_PLANS.includes(planCandidate) ? planCandidate : "STARTER";

        const subscription = {
          businessId: businessId,
          plan: targetPlan,
          status: "ACTIVE",
          expiresAt: null,
          seats: 100,
          allowedLimits: {
            maxEmployees: 100,
            maxTransactions: 10000,
            featuresEnabled: ["attendance", "payroll", "hr", "accounting", "bi", "aiCfo"]
          },
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
          business_id: businessId,
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
          business_id: businessId,
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
        transaction.set(targetBizRef, businessData);
        transaction.set(db.doc(`business_settings/${businessId}`), settings);
        transaction.set(db.doc(`subscriptions/${businessId}`), subscription);
        transaction.set(db.doc(`features/${businessId}`), featureFlags);
        transaction.set(db.doc(`branches/${branchId}`), branchData);
        transaction.set(db.doc(`departments/${deptId}`), departmentData);
        transaction.set(db.doc(`employees/${employeeId}`), employeeData);
        transaction.set(db.doc(`memberships/${membershipId}`), membershipData);
        
        transaction.set(founderUserRef, {
          id: founder.uid,
          uid: founder.uid,
          name: founder.name,
          displayName: founder.name,
          email: founder.email.toLowerCase().trim(),
          normalizedEmail: founder.email.toLowerCase().trim(),
          businessId: businessId,
          business_id: businessId,
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
          business_id: businessId,
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
      if (
        error?.message === "BUSINESS_ALREADY_EXISTS" ||
        error?.message === "TENANT_OVERWRITE_FORBIDDEN" ||
        error?.message === "USER_ALREADY_BOUND_TO_TENANT" ||
        error?.message === "INVALID_BUSINESS_ID"
      ) {
        throw error;
      }
      console.error("[ServerProvisioning] Critical provisioning transaction failure:", error);
      throw error;
    }
  }
}
