import { db } from "../../lib/firebase";
import { doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp, collection } from "firebase/firestore";
import { Business, Branch, Department, Employee } from "../../types";
import { 
  BusinessIntegritySchema, 
  BranchIntegritySchema, 
  DepartmentIntegritySchema, 
  EmployeeIntegritySchema,
  validateOrThrow 
} from "../../validations/integritySchemas";
import { EnterpriseIdentityOrchestrator } from "../../modules/identity/EnterpriseIdentityOrchestrator";

export const BusinessSetupService = {
  async completeOnboarding(data: {
    business: Business;
    branch: Branch;
    departments: Department[];
    employees: Employee[];
    payrollConfig: any;
    userId?: string;
  }) {
    console.log("[BusinessSetupService] Initiating atomic onboarding persistence for:", data.business.name);
    
    try {
      // 0. Pre-flight Idempotency Check: Verify user does not already have a different business
      const targetUserId = data.userId || data.business.ownerId;
      if (targetUserId) {
        let existingBizId: string | null = null;

        // A. Check user document
        const userSnap = await getDoc(doc(db, "users", targetUserId));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          const biz = uData?.businessId || uData?.business_id;
          if (biz && biz !== "global" && biz !== "none" && biz.trim() !== "") {
            if (biz !== data.business.id) {
              existingBizId = biz;
            }
          }
        }

        // B. Query businesses by ownerId (canonical camelCase)
        if (!existingBizId) {
          const qBiz = query(collection(db, "businesses"), where("ownerId", "==", targetUserId));
          const bizSnaps = await getDocs(qBiz);
          const otherDoc = bizSnaps.docs.find(d => d.id !== data.business.id);
          if (otherDoc) {
            existingBizId = otherDoc.id;
          }
        }

        // C. Query businesses by owner_id (legacy fallback check)
        if (!existingBizId) {
          const qBizLegacy = query(collection(db, "businesses"), where("owner_id", "==", targetUserId));
          const bizSnapsLegacy = await getDocs(qBizLegacy);
          const otherDocLegacy = bizSnapsLegacy.docs.find(d => d.id !== data.business.id);
          if (otherDocLegacy) {
            existingBizId = otherDocLegacy.id;
          }
        }

        if (existingBizId) {
          console.warn(`[BusinessSetupService] User ${targetUserId} already owns/belongs to business ${existingBizId}. Updating profile state and triggering redirect.`);
          // Repair user doc to ensure proper routing
          const userRef = doc(db, "users", targetUserId);
          const userDoc = await getDoc(userRef);
          const batch = writeBatch(db);
          batch.set(userRef, {
            id: targetUserId,
            email: userDoc.exists() ? userDoc.data()?.email || "" : "",
            name: userDoc.exists() ? userDoc.data()?.name || "" : "",
            role: "OWNER",
            businessId: existingBizId,
            business_id: existingBizId,
            businessStatus: userDoc.data()?.businessStatus || "PENDING",
            accountStatus: "ACTIVE",
            onboardingComplete: true,
            updatedAt: serverTimestamp()
          }, { merge: true });
          await batch.commit();

          EnterpriseIdentityOrchestrator.invalidateCache(targetUserId);
          throw new Error("BUSINESS_ALREADY_EXISTS");
        }
      }

      // 1. Pre-validate core entities with Zod schemas
      const bizStatus = data.business.status || "PENDING_APPROVAL";

      validateOrThrow(BusinessIntegritySchema, {
        id: data.business.id,
        name: data.business.name,
        nif: data.business.nif || "000-000-000-0",
        domain: data.business.domain || "SME",
        ownerId: data.userId || data.business.ownerId,
        currency: data.payrollConfig?.currency || "HTG",
        status: bizStatus
      }, "Business");

      validateOrThrow(BranchIntegritySchema, {
        id: data.branch.id,
        businessId: data.business.id,
        name: data.branch.name,
        location: data.branch.location || "Port-au-Prince",
        status: "ACTIVE",
        isActive: true
      }, "Branch");

      for (const dept of data.departments) {
        validateOrThrow(DepartmentIntegritySchema, {
          id: dept.id,
          businessId: data.business.id,
          branchId: data.branch.id,
          name: dept.name,
          status: "ACTIVE",
          isActive: true
        }, `Department_${dept.name}`);
      }

      const batch = writeBatch(db);

      // 2. Save Business Instance (Strictly camelCase)
      const businessRef = doc(db, "businesses", data.business.id);
      batch.set(businessRef, {
        id: data.business.id,
        name: data.business.name,
        nif: data.business.nif || "000-000-000-0",
        domain: data.business.domain || "SME",
        ownerId: data.userId || data.business.ownerId,
        currency: data.payrollConfig?.currency || "HTG",
        status: bizStatus,
        settings: {
          payroll: data.payrollConfig,
          onboardingComplete: true,
          createdAt: new Date().toISOString()
        },
        onboardingComplete: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 3. Save Core Branch (Strictly camelCase)
      const branchRef = doc(db, "branches", data.branch.id);
      batch.set(branchRef, {
        id: data.branch.id,
        businessId: data.business.id,
        name: data.branch.name,
        location: data.branch.location || "Port-au-Prince",
        status: "ACTIVE",
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 4. Save Organizational Departments (Strictly camelCase)
      for (const dept of data.departments) {
        const deptRef = doc(db, "departments", dept.id);
        batch.set(deptRef, {
          id: dept.id,
          businessId: data.business.id,
          branchId: data.branch.id,
          name: dept.name,
          status: "ACTIVE",
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      // 5. Save Initial Workforce (Strictly camelCase, no legacy keys)
      for (const emp of data.employees) {
        const isOwner = emp.role === "OWNER";
        const empId = emp.id || `e_${Math.random().toString(36).substring(2, 9)}`;
        const empRef = doc(db, "employees", empId);
        
        const sanitizedEmp: Record<string, any> = {
          id: empId,
          businessId: data.business.id,
          branchId: emp.branchId || data.branch.id,
          departmentId: emp.departmentId || (data.departments[0]?.id || `d_${data.business.id}_0`),
          name: emp.name || (isOwner ? "Propriétaire" : "Collaborateur"),
          displayName: emp.name || (isOwner ? "Propriétaire" : "Collaborateur"),
          email: emp.email ? emp.email.toLowerCase().trim() : (data.userId ? `${data.userId}@finops.local` : "employee@finops.local"),
          role: emp.role || (isOwner ? "OWNER" : "EMPLOYEE"),
          position: isOwner ? (emp.position || "Propriétaire / Directeur") : (emp.position || "Collaborateur"),
          baseSalary: typeof emp.baseSalary === "number" ? emp.baseSalary : 0,
          paymentModel: emp.paymentModel || "FIXED",
          contractType: emp.contractType || "cdi",
          payRegime: emp.payRegime || "fixe",
          status: isOwner ? "ACTIVE" : "PENDING_ACCEPTANCE",
          isActive: isOwner ? true : false,
          onboardingComplete: isOwner ? true : false,
          uid: isOwner ? (data.userId || emp.uid) : (emp.uid || null),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        validateOrThrow(EmployeeIntegritySchema, sanitizedEmp, `Employee_${sanitizedEmp.name}`);
        batch.set(empRef, sanitizedEmp, { merge: true });
      }

      // 6. Upgrade User Profile context (SSOT users collection, strictly camelCase)
      if (data.userId) {
        const ownerEmp = data.employees.find(e => e.role === "OWNER") || data.employees[0];
        const userRef = doc(db, "users", data.userId);
        batch.set(userRef, {
          id: data.userId,
          uid: data.userId,
          businessId: data.business.id,
          branchId: data.branch.id,
          departmentId: data.departments[0]?.id || "",
          employeeId: ownerEmp?.id || `e_${data.userId}`,
          name: ownerEmp?.name || "Propriétaire",
          displayName: ownerEmp?.name || "Propriétaire",
          role: "OWNER",
          onboardingComplete: true,
          accountStatus: "ACTIVE",
          businessStatus: bizStatus,
          business_status: bizStatus,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // 7. Generate Immutable Audit Trail Entry (Strictly camelCase)
      const auditRef = doc(collection(db, "audit_logs"));
      batch.set(auditRef, {
        businessId: data.business.id,
        timestamp: new Date().toISOString(),
        action: "BUSINESS_LAUNCHED_VIA_WIZARD",
        userId: data.userId || "system",
        details: `L'entreprise "${data.business.name}" (ID: ${data.business.id}) a été initialisée avec succès via le wizard d'onboarding.`,
        severity: "INFO",
        metadata: {
          branchCount: 1,
          deptCount: data.departments.length,
          employeeCount: data.employees.length
        }
      });

      await batch.commit();
      console.debug("[BusinessSetupService] Batch commit successful for business:", data.business.id);

      // Invalidate identity cache to force immediate recalculation of flowState
      if (data.userId) {
        console.debug("[BusinessSetupService] Invalidating EnterpriseIdentityOrchestrator cache for UID:", data.userId);
        EnterpriseIdentityOrchestrator.invalidateCache(data.userId);
      }

      return true;
    } catch (error) {
      console.error("[BusinessSetupService] Atomic persistence failed:", error);
      throw error;
    }
  }
};
