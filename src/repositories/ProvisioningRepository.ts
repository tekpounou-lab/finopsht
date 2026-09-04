
import { db } from "../lib/firebase";
import { 
  collection, 
  doc, 
  runTransaction,
  query,
  where,
  getDocs,
  limit
} from "firebase/firestore";
import { Business, Employee, Branch, Department, Membership, BusinessSnapshot } from "../types";

export interface ProvisioningPayload {
  business: Business;
  settings: any;
  subscription: any;
  features: any;
  roles: any[];
  branch: Branch;
  department: Department;
  employee: Employee;
  membership: Membership;
  snapshot: BusinessSnapshot;
  workflows: any[];
  policies: any[];
  onboardingInstance: any;
  auditLog: any;
}

export class ProvisioningRepository {
  /**
   * Checks if a business already exists for a user or with a specific name.
   * This ensures idempotency at the repository level.
   */
  static async checkExisting(ownerId: string, businessName: string): Promise<boolean> {
    const q1 = query(
      collection(db, "businesses"), 
      where("ownerId", "==", ownerId),
      limit(1)
    );
    const snap1 = await getDocs(q1);
    if (!snap1.empty) return true;

    const q2 = query(
      collection(db, "businesses"), 
      where("owner_id", "==", ownerId),
      limit(1)
    );
    const snap2 = await getDocs(q2);
    return !snap2.empty;
  }

  /**
   * Executes the atomic provisioning transaction.
   * SSOT: This is the only place where workspace bootstrap data is committed.
   */
  static async commitProvisioning(payload: ProvisioningPayload): Promise<void> {
    await runTransaction(db, async (transaction) => {
      // 1. Core Business Entity
      transaction.set(doc(db, "businesses", payload.business.id), payload.business);
      
      // 2. Settings & Config
      transaction.set(doc(db, "business_settings", payload.business.id), payload.settings);
      transaction.set(doc(db, "subscriptions", payload.business.id), payload.subscription);
      transaction.set(doc(db, "features", payload.business.id), payload.features);
      
      // 3. Roles
      for (const role of payload.roles) {
        transaction.set(doc(db, "roles", role.id), role);
      }
      
      // 4. Structure
      transaction.set(doc(db, "branches", payload.branch.id), payload.branch);
      transaction.set(doc(db, "departments", payload.department.id), payload.department);
      
      // 5. Identity (Employee + User Profile)
      transaction.set(doc(db, "employees", payload.employee.id), payload.employee);
      transaction.set(doc(db, "memberships", payload.membership.id), payload.membership);
      
      // Update User SSOT document
      transaction.set(doc(db, "users", payload.employee.uid), {
        businessId: payload.business.id,
        employeeId: payload.employee.id,
        role: payload.employee.role,
        accountStatus: "ACTIVE",
        businessStatus: "PENDING",
        onboardingComplete: true,
        updatedAt: payload.business.updatedAt
      }, { merge: true });
      
      // 6. Snapshot
      transaction.set(doc(db, "business_snapshots", payload.business.id), payload.snapshot);
      
      // 7. Workflow Engine Seed
      for (const wf of payload.workflows) {
        transaction.set(doc(db, "workflow_definitions", wf.id), wf);
      }
      for (const pol of payload.policies) {
        transaction.set(doc(db, "approval_policies", pol.id), pol);
      }
      transaction.set(doc(db, "workflow_instances", payload.onboardingInstance.id), payload.onboardingInstance);
      
      // 8. Audit Trail
      const auditRef = doc(collection(db, "forensic_logs"));
      transaction.set(auditRef, payload.auditLog);
    });
  }
}
