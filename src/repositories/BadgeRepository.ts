import { db } from "../lib/firebase";
import { 
  doc, 
  collection, 
  query, 
  where, 
  getDocs, 
} from "firebase/firestore";
import { EmployeeBadge } from "../types";
import { EmployeeAuditService } from "../services/audit/EmployeeAuditService";
import { EventBus } from "../modules/runtime/EventBus";
import { TransactionEngine } from "../modules/runtime/TransactionEngine";

export interface ExtendedEmployeeBadge extends EmployeeBadge {
  type: "QR" | "NFC";
  tokenHash: string;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  createdAt: string;
  expiresAt: string;
  generatedBy: string;
  lastUsedAt: string | null;
  securityVersion: number;
  hardwareId?: string;
  serialNumber?: string;
}

export const BadgeRepository = {
  /**
   * Fetches an active badge for a specific employee
   */
  async getBadgeByEmployee(employeeId: string): Promise<ExtendedEmployeeBadge | null> {
    try {
      const q = query(
        collection(db, "employee_badges"),
        where("employeeId", "==", employeeId)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      
      // Return the most recently updated or active badge
      const activeBadge = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ExtendedEmployeeBadge))
        .find(b => b.status === "ACTIVE");
        
      return activeBadge || (snap.docs[0].data() as ExtendedEmployeeBadge);
    } catch (e) {
      console.error("[BadgeRepository] Error fetching badge:", e);
      return null;
    }
  },

  /**
   * Generates or regenerates an Employee Badge (QR/NFC)
   * Ensures old tokens are immediately invalidated/revoked (Edge Case support)
   */
  async generateBadge(params: {
    employeeId: string;
    businessId: string;
    branchId: string;
    departmentId: string;
    role: string;
    type: "QR" | "NFC";
    actor: { id: string; name: string; role: string };
    hardwareId?: string;
    serialNumber?: string;
  }): Promise<ExtendedEmployeeBadge> {
    const { employeeId, businessId, branchId, departmentId, role, type, actor, hardwareId, serialNumber } = params;
    
    const badgeId = `bdg_${Math.random().toString(36).substring(2, 9)}`;
    const signature = `sig_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
    const issuedAt = new Date().toISOString();
    
    const qrPayloadObj = {
      employee_id: employeeId,
      business_id: businessId,
      branch_id: branchId,
      role,
      signature
    };
    const qrPayload = JSON.stringify(qrPayloadObj);

    // Create 1-year expiry
    const expiresDate = new Date();
    expiresDate.setFullYear(expiresDate.getFullYear() + 1);

    const newBadge: ExtendedEmployeeBadge = {
      id: badgeId,
      employeeId,
      business_id: businessId,
      branchId,
      departmentId,
      role,
      issuedAt,
      signature,
      qrPayload,
      type,
      tokenHash: signature,
      status: "ACTIVE",
      createdAt: issuedAt,
      expiresAt: expiresDate.toISOString(),
      generatedBy: actor.id,
      lastUsedAt: null,
      securityVersion: 1,
      hardwareId,
      serialNumber
    };

    await TransactionEngine.execute("generateBadge", businessId, async (transaction) => {
      // Find and revoke any existing active badges for this employee
      const q = query(
        collection(db, "employee_badges"),
        where("employeeId", "==", employeeId),
        where("status", "==", "ACTIVE")
      );
      const existingSnap = await getDocs(q);
      existingSnap.forEach((docSnap) => {
        transaction.update(doc(db, "employee_badges", docSnap.id), {
          status: "REVOKED",
          revokedAt: issuedAt,
          revokedBy: actor.id
        });
      });

      // Write the new badge
      transaction.set(doc(db, "employee_badges", badgeId), newBadge);

      await EmployeeAuditService.logTransition({
        employeeId,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        business_id: businessId,
        action: "INVITATION_UPDATED", // badge update action
        beforeState: { type: "BADGE_ROTATION", status: "PENDING" },
        afterState: { badgeId, type, status: "ACTIVE" },
        severity: "info"
      });
    }, { employeeId, type });

    EventBus.publish(EventBus.createEvent({
      correlationId: `badge_gen_${badgeId}`,
      actorId: actor.id,
      businessId,
      module: "WORKFORCE",
      aggregate: "BADGE",
      type: "BadgeAssigned",
      payload: newBadge
    }));

    return newBadge;
  },

  /**
   * Revoke a badge immediately (e.g. lost badge or terminated employee)
   */
  async revokeBadge(badgeId: string, actor: { id: string; name: string; role: string }): Promise<void> {
    const badgeRef = doc(db, "employee_badges", badgeId);
    let businessId = "";
    let employeeId = "";

    await TransactionEngine.execute("revokeBadge", "PENDING", async (transaction) => {
      const snap = await transaction.get(badgeRef);
      if (!snap.exists()) throw new Error("Badge introuvable.");
      const beforeState = snap.data() as ExtendedEmployeeBadge;
      businessId = beforeState.business_id;
      employeeId = beforeState.employeeId;

      transaction.update(badgeRef, {
        status: "REVOKED",
        updatedAt: new Date().toISOString()
      });

      await EmployeeAuditService.logTransition({
        employeeId: beforeState.employeeId,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        business_id: beforeState.business_id,
        action: "INVITATION_UPDATED",
        beforeState: { badgeId, status: "ACTIVE" },
        afterState: { badgeId, status: "REVOKED" },
        severity: "warning"
      });
    }, { badgeId });

    EventBus.publish(EventBus.createEvent({
      correlationId: `badge_revoke_${badgeId}`,
      actorId: actor.id,
      businessId,
      module: "WORKFORCE",
      aggregate: "BADGE",
      type: "BadgeRevoked",
      payload: { badgeId, employeeId }
    }));
  },

  /**
   * Suspend a badge temporary
   */
  async suspendBadge(badgeId: string, actor: { id: string; name: string; role: string }): Promise<void> {
    const badgeRef = doc(db, "employee_badges", badgeId);
    let businessId = "";
    let employeeId = "";

    await TransactionEngine.execute("suspendBadge", "PENDING", async (transaction) => {
      const snap = await transaction.get(badgeRef);
      if (!snap.exists()) throw new Error("Badge introuvable.");
      const beforeState = snap.data() as ExtendedEmployeeBadge;
      businessId = beforeState.business_id;
      employeeId = beforeState.employeeId;

      transaction.update(badgeRef, {
        status: "SUSPENDED",
        updatedAt: new Date().toISOString()
      });

      await EmployeeAuditService.logTransition({
        employeeId: beforeState.employeeId,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        business_id: beforeState.business_id,
        action: "INVITATION_UPDATED",
        beforeState: { badgeId, status: "ACTIVE" },
        afterState: { badgeId, status: "SUSPENDED" },
        severity: "warning"
      });
    }, { badgeId });

    EventBus.publish(EventBus.createEvent({
      correlationId: `badge_suspend_${badgeId}`,
      actorId: actor.id,
      businessId,
      module: "WORKFORCE",
      aggregate: "BADGE",
      type: "BadgeSuspended",
      payload: { badgeId, employeeId }
    }));
  }
};
