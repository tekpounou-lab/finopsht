
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, getAdminAuth } from "../../lib/firebaseAdmin";
import firebaseConfig from "../../../firebase-applet-config.json";
import { EventBus } from "../../modules/runtime/EventBus";

export class BusinessActivationService {
  /**
   * Helper to get Firestore instance with exact project & database binding.
   */
  private static getDb() {
    return getAdminFirestore();
  }

  /**
   * Activates a pending business and seeds its default assets.
   * Superadmin only.
   */
  static async activate(businessId: string, actor: { uid: string; email: string }): Promise<void> {
    const db = this.getDb();
    
    console.log(`[Activation] Starting Phase 2 activation for business: ${businessId}`);

    const now = FieldValue.serverTimestamp();
    const isoNow = new Date().toISOString();

    try {
      await db.runTransaction(async (transaction) => {
        const bizDoc = await transaction.get(db.doc(`businesses/${businessId}`));
        if (!bizDoc.exists) throw new Error("BUSINESS_NOT_FOUND");
        
        const bizData = bizDoc.data()!;
        if (bizData.status === "ACTIVE") return; // Already active

        const ownerUid = bizData.owner_id;
        const ownerEmployeeId = bizData.owner_employee_id;
        const branchId = `br_${Math.random().toString(36).substring(2, 11)}`;
        const deptId = `dept_${Math.random().toString(36).substring(2, 11)}`;

        // 1. Roles
        const defaultRoles = [
          { id: `role_owner_${businessId}`, name: "Propriétaire", permissions: ["*"], business_id: businessId },
          { id: `role_manager_${businessId}`, name: "Manager", permissions: ["employees.read", "attendance.manage", "payroll.view"], business_id: businessId },
          { id: `role_employee_${businessId}`, name: "Employé", permissions: ["self.read", "attendance.scan"], business_id: businessId }
        ];

        // 2. Branch & Department
        const branchData = {
          id: branchId,
          business_id: businessId,
          name: "Siège Social",
          location: "Port-au-Prince",
          is_active: true,
          created_at: now
        };

        const deptData = {
          id: deptId,
          business_id: businessId,
          branch_id: branchId,
          name: "Administration",
          is_active: true,
          createdAt: now
        };

        // 3. Workflows & Policies
        const onboardingWf = {
          id: `wf_onboarding_${businessId}`,
          business_id: businessId,
          name: "Onboarding Employé",
          description: "Processus d'accueil et configuration du profil employé",
          triggerEvent: "EmployeeCreated",
          version: "1.0.0",
          isActive: true
        };

        const leavePolicy = {
          id: `pol_leave_${businessId}`,
          business_id: businessId,
          name: "Politique de Congés Standard",
          entityType: "LEAVE",
          minLevels: 1,
          steps: [{ level: 1, roleRequired: "MANAGER" }]
        };

        // 4. Update Business & Owner statuses
        transaction.update(db.doc(`businesses/${businessId}`), { 
          status: "ACTIVE", 
          activatedAt: now,
          updatedAt: now 
        });

        transaction.update(db.doc(`subscriptions/${businessId}`), { 
          status: "ACTIVE", 
          updatedAt: now 
        });

        // Update owner employee & membership
        if (ownerEmployeeId) {
          transaction.update(db.doc(`employees/${ownerEmployeeId}`), {
            status: "ACTIVE",
            isActive: true,
            branchId,
            departmentId: deptId,
            updatedAt: now
          });
        }

        const membershipId = `${businessId}_${ownerUid}`;
        transaction.update(db.doc(`memberships/${membershipId}`), {
          status: "ACTIVE",
          branch_id: branchId,
          department_id: deptId,
          employee_id: ownerEmployeeId || null,
          updatedAt: now
        });

        transaction.update(db.doc(`users/${ownerUid}`), {
          account_status: "ACTIVE",
          updatedAt: now
        });

        // WRITES (Seeding)
        for (const role of defaultRoles) {
          transaction.set(db.doc(`roles/${role.id}`), role);
        }
        transaction.set(db.doc(`branches/${branchId}`), branchData);
        transaction.set(db.doc(`departments/${deptId}`), deptData);
        transaction.set(db.doc(`workflow_definitions/${onboardingWf.id}`), onboardingWf);
        transaction.set(db.doc(`approval_policies/${leavePolicy.id}`), leavePolicy);

        // Audit Log
        transaction.set(db.collection("forensic_logs").doc(), {
          business_id: businessId,
          userId: actor.uid,
          userName: actor.email,
          userRole: "SUPER_ADMIN",
          action: "BUSINESS_ACTIVATED",
          timestamp: now,
          severity: "success"
        });
      });

      console.log(`[Activation] Business ${businessId} successfully activated.`);

    } catch (error) {
      console.error("[Activation] CRITICAL FAILURE:", error);
      throw error;
    }
  }
}
