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
import {
  extractRawOperationalProfileFromRecord,
  validateRoleOperationalProfileCompatibility
} from "../../domains/rbac/operationalProfilePolicy";

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
      operational_profile?: Employee["operational_profile"];
      operationalProfile?: Employee["operational_profile"];
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

    const profileInfo = extractRawOperationalProfileFromRecord(params);
    if (profileInfo.conflict) {
      throw new Error("CONFLICTING_OPERATIONAL_PROFILE_FIELDS: Incohérence entre operational_profile et operationalProfile.");
    }

    const compat = validateRoleOperationalProfileCompatibility(params.role, profileInfo.rawValue, {
      allowLegacyBarberAlias: false,
      allowMissingForExecutiveOrOversight: true
    });
    if (!compat.valid) {
      throw new Error(`${compat.code}: ${compat.reason}`);
    }

    const normalizedProfileFields = compat.normalizedProfile
      ? {
          operational_profile: compat.normalizedProfile,
          operationalProfile: compat.normalizedProfile
        }
      : {};

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
          ...normalizedProfileFields,
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
        ...normalizedProfileFields,
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
      ...normalizedProfileFields,
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
   * Client-side invitation acceptance is disabled for security.
   * All invitation acceptances must execute via EnterpriseIdentityOrchestrator -> POST /api/invitations/accept.
   */
  async acceptInvitation(
    _invitationId: string,
    _firebaseUid: string,
    _actor: { id: string; name: string; role: string }
  ): Promise<Employee> {
    throw new Error(
      "CLIENT_INVITATION_ACCEPTANCE_FORBIDDEN: Invitation acceptance must execute through POST /api/invitations/accept."
    );
  },

  /**
   * Client-side invitation refusal is disabled for security.
   * All invitation rejections must execute via EnterpriseIdentityOrchestrator -> POST /api/invitations/reject.
   */
  async refuseInvitation(
    _invitationId: string,
    _actor: { id: string; name: string; role: string }
  ): Promise<void> {
    throw new Error(
      "CLIENT_INVITATION_REJECTION_FORBIDDEN: Invitation rejection must execute through POST /api/invitations/reject."
    );
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
