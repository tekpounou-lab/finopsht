import { doc, getDoc, setDoc, collection, query, where, getDocs, limit, writeBatch } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { PermissionRepository, IdentityRepository } from "../../repositories";
import { isSuperAdminEmail } from "../../config/superadmin";

export interface IdentityResolutionResult {
  uid: string;
  email: string;
  employeeId: string;
  businessId: string;
  role: string;
  permissions: string[];
  status: "SUPER_ADMIN" | "ACTIVE" | "PROFILE_ONLY" | "INITIAL_IDENTITY";
}

export const IdentityResolver = {
  async resolve(uid: string, email: string): Promise<IdentityResolutionResult> {
    const cleanEmail = (email || "").toLowerCase().trim();

    // 1. Super Admin bypass
    if (isSuperAdminEmail(cleanEmail)) {
      const perms = await PermissionRepository.getRolePermissions("SUPER_ADMIN");
      return {
        uid,
        email: cleanEmail,
        employeeId: "",
        businessId: "",
        role: "SUPER_ADMIN",
        permissions: perms,
        status: "SUPER_ADMIN",
      };
    }

    // 2. Query employee membership where firebase_uid == uid
    try {
      const q = query(
        collection(db, "employees"),
        where("firebase_uid", "==", uid),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const empDoc = snap.docs[0];
        const empData = empDoc.data();
        const role = empData.role || "EMPLOYEE";
        const businessId = empData.business_id || "";
        const permissions = await PermissionRepository.getRolePermissions(role, businessId);
        return {
          uid,
          email: cleanEmail,
          employeeId: empDoc.id,
          businessId,
          role,
          permissions,
          status: "ACTIVE",
        };
      }
    } catch (err) {
      console.warn("[IdentityResolver] Error querying employees by firebase_uid:", err);
    }

    // 3. Fallback: Query employee membership where id == uid (direct ID mapping)
    try {
      const empDocRef = doc(db, "employees", uid);
      const empSnap = await getDoc(empDocRef);
      if (empSnap.exists()) {
        const empData = empSnap.data();
        const role = empData.role || "EMPLOYEE";
        const businessId = empData.business_id || "";
        const permissions = await PermissionRepository.getRolePermissions(role, businessId);
        return {
          uid,
          email: cleanEmail,
          employeeId: empSnap.id,
          businessId,
          role,
          permissions,
          status: "ACTIVE",
        };
      }
    } catch (err) {
      console.warn("[IdentityResolver] Error checking employee by doc id:", err);
    }

    // 4. Fallback: Check users/{uid} profile
    try {
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const employeeId = userData.employee_id || "";

        // If user profile lists an employeeId, try to load that Employee record
        if (employeeId) {
          const empRef = doc(db, "employees", employeeId);
          const empSnap = await getDoc(empRef);
          if (empSnap.exists()) {
            const empData = empSnap.data();
            const role = empData.role || userData.role || "EMPLOYEE";
            const businessId = empData.business_id || userData.business_id || "";
            const permissions = await PermissionRepository.getRolePermissions(role, businessId);
            return {
              uid,
              email: cleanEmail,
              employeeId,
              businessId,
              role,
              permissions,
              status: "ACTIVE",
            };
          }
        }

        // If no employee record could be fetched, fall back to profile details (e.g. newly registered owner)
        const role = userData.role || "EMPLOYEE";
        const businessId = userData.business_id || "";
        const permissions = await PermissionRepository.getRolePermissions(role, businessId);
        return {
          uid,
          email: cleanEmail,
          employeeId: "",
          businessId,
          role,
          permissions,
          status: "PROFILE_ONLY",
        };
      }
    } catch (err) {
      console.warn("[IdentityResolver] Error fetching user profile:", err);
    }

    // 5. Default Fallback
    return {
      uid,
      email: cleanEmail,
      employeeId: "",
      businessId: "",
      role: "",
      permissions: [],
      status: "INITIAL_IDENTITY",
    };
  },

  /**
   * Controlled update workflow for roles and emails.
   * Handles multi-collection transaction audits and controlled updates across employees, users, and invitations.
   */
  async processEmployeeUpdate(
    oldEmployee: any,
    updatedEmployee: any,
    actor: { id: string; name: string; role: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const oldEmail = oldEmployee.email.toLowerCase().trim();
      const newEmail = updatedEmployee.email.toLowerCase().trim();
      const oldRole = oldEmployee.role;
      const newRole = updatedEmployee.role;

      // 1. Validate: check duplicate email across all employees
      if (oldEmail !== newEmail) {
        const qEmp = query(
          collection(db, "employees"),
          where("email", "==", newEmail)
        );
        const snapEmp = await getDocs(qEmp);
        const duplicates = snapEmp.docs.filter((d) => d.id !== updatedEmployee.id);
        if (duplicates.length > 0) {
          return {
            success: false,
            error: "Un autre employé possède déjà cette adresse e-mail.",
          };
        }
      }

      // 2. Locate or resolve existing Firebase identity (firebase_uid)
      let resolvedUid = updatedEmployee.firebase_uid || oldEmployee.firebase_uid || "";

      if (!resolvedUid) {
        // Query users collection to find if there is an existing Firebase identity
        try {
          // Check by employee_id first
          let qUser = query(collection(db, "users"), where("employee_id", "==", updatedEmployee.id));
          let snapUser = await getDocs(qUser);
          
          if (snapUser.empty) {
            // Check by new email
            qUser = query(collection(db, "users"), where("email", "==", newEmail));
            snapUser = await getDocs(qUser);
          }
          if (snapUser.empty && oldEmail) {
            // Check by old email
            qUser = query(collection(db, "users"), where("email", "==", oldEmail));
            snapUser = await getDocs(qUser);
          }
          if (snapUser.empty && newEmail) {
            // Check by normalizedEmail
            qUser = query(collection(db, "users"), where("normalizedEmail", "==", newEmail));
            snapUser = await getDocs(qUser);
          }

          if (!snapUser.empty) {
            resolvedUid = snapUser.docs[0].id;
            console.log(`[IdentityResolver Workflow] Discovered existing Firebase UID for linking: ${resolvedUid}`);
          }
        } catch (e) {
          console.warn("[IdentityResolver Workflow] Could not lookup users by email/employee_id:", e);
        }
      }

      // 3. Build email history array
      const existingHistory: string[] = Array.isArray(oldEmployee.email_history) ? oldEmployee.email_history : [];
      const emailHistory = Array.from(new Set([
        ...existingHistory,
        oldEmail,
        newEmail
      ])).filter(Boolean);

      // Build Batch for atomicity
      const batch = writeBatch(db);

      // Update Employee document
      const empRef = doc(db, "employees", updatedEmployee.id);
      const bizId = updatedEmployee.business_id || updatedEmployee.businessId || "";
      const resolvedSalary = updatedEmployee.baseSalary !== undefined 
        ? updatedEmployee.baseSalary 
        : (updatedEmployee.salaryBaseHtg !== undefined ? updatedEmployee.salaryBaseHtg : (updatedEmployee as any).salary_base_htg);
      const resolvedCommission = updatedEmployee.commissionRate !== undefined 
        ? updatedEmployee.commissionRate 
        : (updatedEmployee as any).commission_rate;

      const finalEmployeeData = {
        ...updatedEmployee,
        email: newEmail,
        normalizedEmail: newEmail,
        email_history: emailHistory,
        business_id: bizId,
        businessId: bizId,
        firebase_uid: resolvedUid || null,
        uid: resolvedUid || null,
        ...(resolvedSalary !== undefined ? { baseSalary: resolvedSalary, salaryBaseHtg: resolvedSalary } : {}),
        ...(resolvedCommission !== undefined ? { commissionRate: resolvedCommission, commission_rate: resolvedCommission } : {}),
        updatedAt: new Date().toISOString(),
      };
      batch.set(empRef, finalEmployeeData);

      // Update linked User profile doc if UID is resolved
      if (resolvedUid) {
        const userRef = doc(db, "users", resolvedUid);
        const userProfileUpdates: any = {
          email: newEmail,
          normalizedEmail: newEmail,
          employee_id: updatedEmployee.id,
          role: newRole,
          business_id: bizId,
          businessId: bizId,
          branchId: updatedEmployee.branchId || null,
          departmentId: updatedEmployee.departmentId || null,
          account_status: "ACTIVE",
          onboarding_completed: true,
          updatedAt: new Date().toISOString(),
        };
        if (updatedEmployee.name || updatedEmployee.first_name || updatedEmployee.last_name) {
          userProfileUpdates.name = updatedEmployee.name || `${updatedEmployee.first_name || ''} ${updatedEmployee.last_name || ''}`.trim();
        }
        batch.set(userRef, userProfileUpdates, { merge: true });
      }

      // Update any Invitation records matching old/new email or employeeId/employee_id
      try {
        const qInv1 = query(collection(db, "invitations"), where("email", "==", oldEmail));
        const qInv2 = query(collection(db, "invitations"), where("email", "==", newEmail));
        const qInv3 = query(collection(db, "invitations"), where("employeeId", "==", updatedEmployee.id));
        const qInv4 = query(collection(db, "invitations"), where("employee_id", "==", updatedEmployee.id));
        const [snapInv1, snapInv2, snapInv3, snapInv4] = await Promise.all([
          getDocs(qInv1).catch(() => null),
          getDocs(qInv2).catch(() => null),
          getDocs(qInv3).catch(() => null),
          getDocs(qInv4).catch(() => null)
        ]);
        const invDocs = [
          ...(snapInv1?.docs || []), 
          ...(snapInv2?.docs || []), 
          ...(snapInv3?.docs || []),
          ...(snapInv4?.docs || [])
        ];
        const processedInvIds = new Set<string>();
        
        invDocs.forEach((invDoc) => {
          if (!processedInvIds.has(invDoc.id)) {
            processedInvIds.add(invDoc.id);
            const invData = invDoc.data();
            const invHistory = Array.from(new Set([
              ...(Array.isArray(invData.email_history) ? invData.email_history : []),
              (invData.email || "").toLowerCase().trim(),
              oldEmail,
              newEmail
            ])).filter(Boolean);

            const invRef = doc(db, "invitations", invDoc.id);
            batch.update(invRef, {
              email: newEmail,
              normalizedEmail: newEmail,
              email_history: invHistory,
              employee_id: updatedEmployee.id,
              employeeId: updatedEmployee.id,
              role: newRole,
              ...(resolvedUid ? { firebase_uid: resolvedUid } : {})
            });
          }
        });
      } catch (e) {
        console.warn("[IdentityResolver Workflow] Non-fatal error matching invitations:", e);
      }

      // Sync active Employee Contract records for employeeId
      try {
        const qContract1 = query(collection(db, "employee_contracts"), where("employeeId", "==", updatedEmployee.id));
        const qContract2 = query(collection(db, "employee_contracts"), where("employee_id", "==", updatedEmployee.id));
        const [snapContract1, snapContract2] = await Promise.all([
          getDocs(qContract1).catch(() => null),
          getDocs(qContract2).catch(() => null)
        ]);
        const contractDocs = [...(snapContract1?.docs || []), ...(snapContract2?.docs || [])];
        const processedContractIds = new Set<string>();

        contractDocs.forEach((cDoc) => {
          if (!processedContractIds.has(cDoc.id)) {
            processedContractIds.add(cDoc.id);
            const cUpdates: any = {
              updatedAt: new Date().toISOString()
            };
            if (resolvedSalary !== undefined) {
              cUpdates.salaryBaseHtg = resolvedSalary;
            }
            if (updatedEmployee.contractType) {
              cUpdates.contractType = updatedEmployee.contractType;
            }
            if (updatedEmployee.payRegime || updatedEmployee.paymentModel) {
              cUpdates.payRegime = (updatedEmployee.payRegime || updatedEmployee.paymentModel?.toLowerCase()) as any;
            }
            if (resolvedCommission !== undefined) {
              cUpdates.commissionRate = resolvedCommission;
            }
            batch.update(cDoc.ref, cUpdates);
          }
        });
      } catch (e) {
        console.warn("[IdentityResolver Workflow] Non-fatal error syncing employee contracts:", e);
      }

      // Commit transaction
      await batch.commit();

      // 4. Create Forensic Audit Logs
      if (oldEmail !== newEmail) {
        await IdentityRepository.createAuditLog({
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          business_id: updatedEmployee.business_id || null,
          action: "EMAIL_CHANGED",
          beforeState: JSON.stringify({ email: oldEmail }),
          afterState: JSON.stringify({ email: newEmail }),
          severity: "critical",
        });
      }

      if (oldRole !== newRole) {
        await IdentityRepository.createAuditLog({
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          business_id: updatedEmployee.business_id || null,
          action: "ROLE_CHANGED",
          beforeState: JSON.stringify({ role: oldRole }),
          afterState: JSON.stringify({ role: newRole }),
          severity: "critical",
        });
      }

      // Log standard update event
      await IdentityRepository.createAuditLog({
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        business_id: updatedEmployee.business_id || null,
        action: "EMPLOYEE_UPDATED",
        beforeState: JSON.stringify(oldEmployee),
        afterState: JSON.stringify(updatedEmployee),
        severity: "info",
      });

      return { success: true };
    } catch (error: any) {
      console.error("[IdentityResolver Workflow] Critical failure during employee update processing:", error);
      return { success: false, error: error.message || String(error) };
    }
  },
};
