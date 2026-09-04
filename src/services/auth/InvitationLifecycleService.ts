import { db } from "../../lib/firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  runTransaction 
} from "firebase/firestore";
import { Invitation, Employee } from "../../types";
import { EmployeeRepository } from "../../repositories/EmployeeRepository";
import { EmployeeAuditService } from "../audit/EmployeeAuditService";

export const InvitationLifecycleService = {
  /**
   * Create invitation transaction linking to an existing or new Employee record.
   */
  async createInvitation(
    params: {
      businessId: string;
      email: string;
      name: string;
      role: Employee["role"];
      branchId: string;
      departmentId: string;
      position?: string;
      baseSalary?: number;
      paymentModel?: Employee["paymentModel"];
    },
    actor: { id: string; name: string; role: string }
  ): Promise<{ invitation: Invitation; employee: Employee }> {
    const cleanEmail = params.email.toLowerCase().trim();
    const token = `tok_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    let employeeId = "";
    let employee: Employee;

    // Step 1: Create Employee record in DRAFT/INVITED status first, if not exists
    const qEmp = query(
      collection(db, "employees"),
      where("business_id", "==", params.businessId),
      where("normalizedEmail", "==", cleanEmail)
    );
    const snapEmp = await getDocs(qEmp);

    if (!snapEmp.empty) {
      const existingEmp = snapEmp.docs[0].data() as Employee;
      employeeId = snapEmp.docs[0].id;
      // Transition existing employee to INVITED status
      employee = await EmployeeRepository.updateEmployee(
        employeeId,
        {
          status: "INVITED",
          role: params.role,
          branchId: params.branchId,
          departmentId: params.departmentId,
          position: params.position || existingEmp.position
        },
        actor
      );
    } else {
      // Create new Employee record in INVITED status
      const generatedId = `emp_${Math.random().toString(36).substring(2, 11)}`;
      employee = await EmployeeRepository.createEmployee({
        id: generatedId,
        business_id: params.businessId,
        name: params.name,
        email: cleanEmail,
        normalizedEmail: cleanEmail,
        role: params.role,
        branchId: params.branchId,
        departmentId: params.departmentId,
        position: params.position || "",
        baseSalary: params.baseSalary || 0,
        paymentModel: params.paymentModel || "FIXED",
        status: "INVITED",
        isActive: false
      }, actor);
      employeeId = employee.id;
    }

    const invitationId = `inv_${Math.random().toString(36).substring(2, 9)}`;
    const invitation: Invitation = {
      id: invitationId,
      business_id: params.businessId,
      businessId: params.businessId,
      employeeId,
      email: cleanEmail,
      normalizedEmail: cleanEmail,
      name: params.name,
      role: params.role,
      branchId: params.branchId,
      departmentId: params.departmentId,
      status: "PENDING",
      invitedAt: new Date().toISOString(),
      token,
      expiresAt: expiresAt.toISOString()
    };

    // Save invitation doc
    await setDoc(doc(db, "invitations", invitationId), invitation);

    await EmployeeAuditService.logTransition({
      employeeId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      business_id: params.businessId,
      action: "INVITATION_SENT",
      beforeState: null,
      afterState: invitation,
      severity: "info",
      metadata: { invitationId, token }
    });

    return { invitation, employee };
  },

  /**
   * Resend invitation (refreshes token & expiration)
   */
  async resendInvitation(
    invitationId: string,
    actor: { id: string; name: string; role: string }
  ): Promise<Invitation> {
    const invRef = doc(db, "invitations", invitationId);
    let beforeState: Invitation | null = null;
    let afterState: Invitation | null = null;

    const token = `tok_${Math.random().toString(36).substring(2, 15)}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(invRef);
      if (!snap.exists()) throw new Error("Invitation introuvable.");

      beforeState = snap.data() as Invitation;
      const updates: Partial<Invitation> = {
        token,
        status: "PENDING",
        invitedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString()
      };

      transaction.update(invRef, updates);
      afterState = { ...beforeState, ...updates };

      // Make sure the linked employee status is also INVITED
      if (beforeState.employeeId) {
        const empRef = doc(db, "employees", beforeState.employeeId);
        transaction.update(empRef, { status: "INVITED" });
      }
    });

    if (beforeState && afterState) {
      await EmployeeAuditService.logTransition({
        employeeId: beforeState.employeeId || "",
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        business_id: beforeState.business_id,
        action: "INVITATION_UPDATED",
        beforeState,
        afterState,
        severity: "info"
      });
    }

    return afterState!;
  },

  /**
   * Cancel / Revoke invitation
   */
  async cancelInvitation(
    invitationId: string,
    actor: { id: string; name: string; role: string }
  ): Promise<void> {
    const invRef = doc(db, "invitations", invitationId);
    let beforeState: Invitation | null = null;

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(invRef);
      if (!snap.exists()) throw new Error("Invitation introuvable.");

      beforeState = snap.data() as Invitation;
      transaction.update(invRef, {
        status: "REVOKED",
        updatedAt: new Date().toISOString()
      });

      if (beforeState.employeeId) {
        const empRef = doc(db, "employees", beforeState.employeeId);
        transaction.update(empRef, { status: "DRAFT" }); // revert back to draft
      }
    });

    if (beforeState) {
      await EmployeeAuditService.logTransition({
        employeeId: beforeState.employeeId || "",
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        business_id: beforeState.business_id,
        action: "INVITATION_UPDATED",
        beforeState: { status: "PENDING" },
        afterState: { status: "REVOKED" },
        severity: "warning"
      });
    }
  },

  /**
   * Accept an invitation and bind to Firebase Auth Identity
   */
  async acceptInvitation(
    invitationId: string,
    firebaseUid: string,
    actor: { id: string; name: string; role: string }
  ): Promise<Employee> {
    const invRef = doc(db, "invitations", invitationId);
    let inviteData: Invitation | null = null;
    let employee: Employee | null = null;

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(invRef);
      if (!snap.exists()) throw new Error("Invitation introuvable.");

      inviteData = snap.data() as Invitation;
      if (inviteData.status !== "PENDING") {
        throw new Error("Cette invitation a déjà été acceptée, expirée ou révoquée.");
      }

      const employeeId = inviteData.employeeId;
      if (!employeeId) throw new Error("L'invitation ne référence aucun employé.");

      const empRef = doc(db, "employees", employeeId);
      const empSnap = await transaction.get(empRef);
      if (!empSnap.exists()) throw new Error("Fiche employé introuvable.");

      const empData = empSnap.data() as Employee;

      // Update Employee status to ACTIVE, bind firebase_uid
      const empUpdates: Partial<Employee> = {
        status: "ACTIVE",
        isActive: true,
        uid: firebaseUid,
        firebase_uid: firebaseUid,
        updatedAt: new Date().toISOString()
      };
      transaction.update(empRef, empUpdates);

      // Create / Update UserProfile doc
      const userRef = doc(db, "users", firebaseUid);
      const userProfile = {
        uid: firebaseUid,
        id: firebaseUid,
        email: inviteData.email.toLowerCase().trim(),
        name: inviteData.name || empData.name,
        role: inviteData.role,
        business_id: inviteData.business_id,
        branchId: inviteData.branchId,
        departmentId: inviteData.departmentId,
        employee_id: employeeId,
        onboarding_completed: true,
        account_status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      transaction.set(userRef, userProfile, { merge: true });

      // Update Invitation status to ACCEPTED
      transaction.update(invRef, {
        status: "ACCEPTED",
        updatedAt: new Date().toISOString()
      });

      employee = { ...empData, ...empUpdates } as Employee;
    });

    if (inviteData && employee) {
      await EmployeeAuditService.logTransition({
        employeeId: (inviteData as Invitation).employeeId || "",
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        business_id: (inviteData as Invitation).business_id,
        action: "INVITATION_ACCEPTED",
        beforeState: inviteData,
        afterState: employee,
        severity: "info",
        metadata: { firebaseUid }
      });
    }

    return employee!;
  },

  /**
   * Refuse / Reject invitation
   */
  async refuseInvitation(
    invitationId: string,
    actor: { id: string; name: string; role: string }
  ): Promise<void> {
    const invRef = doc(db, "invitations", invitationId);
    await updateDoc(invRef, { status: "REVOKED", rejectedAt: new Date().toISOString() });
  },

  /**
   * Flag as expired
   */
  async checkAndExpireInvitations(): Promise<number> {
    const now = new Date().toISOString();
    const q = query(
      collection(db, "invitations"),
      where("status", "==", "PENDING")
    );
    const snap = await getDocs(q);
    let expiredCount = 0;

    for (const d of snap.docs) {
      const data = d.data() as Invitation;
      if (data.expiresAt && data.expiresAt < now) {
        await updateDoc(doc(db, "invitations", d.id), { status: "EXPIRED" });
        expiredCount++;
      }
    }
    return expiredCount;
  }
};
