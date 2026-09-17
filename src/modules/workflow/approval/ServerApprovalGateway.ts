import { Firestore, Transaction, FieldValue } from "firebase-admin/firestore";
import { ApprovalHashingService } from "./ApprovalHashingService";
import {
  ApprovalInstance,
  ApprovalPolicySnapshot,
  ApprovalStatus,
  ApprovalStep,
  ActiveApprovalLock,
  PayrollSourceSnapshot,
  PayrollSnapshotEmployee
} from "./types";

export interface InitiateResult {
  instanceId: string;
  status: ApprovalStatus;
  lockId: string;
}

export interface DecisionResult {
  instanceId: string;
  status: ApprovalStatus;
  currentLevel: number;
  actedLevel: number;
  finalApproved: boolean;
  rejected: boolean;
}

export interface CancelResult {
  instanceId: string;
  status: "CANCELLED";
}

export class ServerApprovalGateway {
  constructor(private firestore: Firestore) {}

  /**
   * STAGE 3 & 4: Atomic Initiation with Deterministic Mutex Lock
   */
  public async initiatePayrollApproval(params: {
    businessId: string;
    cycleId: string;
    requesterId: string;
    requesterRole: string;
  }): Promise<InitiateResult> {
    const { businessId, cycleId, requesterId } = params;

    return await this.firestore.runTransaction(async (t: Transaction) => {
      // 1. Read & Validate Payroll Cycle
      const cycleRef = this.firestore.collection("payroll_cycles").doc(cycleId);
      const cycleDoc = await t.get(cycleRef);

      if (!cycleDoc.exists) {
        throw new Error("PAYROLL_CYCLE_NOT_FOUND");
      }

      const cycle = cycleDoc.data()!;
      if (cycle.business_id !== businessId) {
        throw new Error("TENANT_MISMATCH");
      }

      if (cycle.status !== "CALCULATED" && cycle.status !== "DRAFT") {
        throw new Error(`INVALID_CYCLE_STATUS: Cycle status is ${cycle.status}, expected CALCULATED`);
      }

      // 2. Fetch Payroll Records for Snapshot
      const recordsQuery = this.firestore
        .collection("payroll_records")
        .where("payroll_cycle_id", "==", cycleId)
        .where("business_id", "==", businessId);
      const recordsSnap = await t.get(recordsQuery);

      const employees: PayrollSnapshotEmployee[] = recordsSnap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((r: any) => !r.deleted)
        .map((r: any) => ({
          employeeId: r.employeeId || r.employee_id || r.id,
          employeeName: r.employeeName || r.employee_name || "Employee",
          grossCents: Math.round((r.grossSalary ?? (r.gross_salary_cents ? r.gross_salary_cents / 100 : 0)) * 100),
          netCents: Math.round((r.netPaid ?? (r.net_salary_cents ? r.net_salary_cents / 100 : 0)) * 100),
          employerTaxesCents: Math.round((r.employerTaxes ?? (r.employer_deductions_cents ? r.employer_deductions_cents / 100 : 0)) * 100),
          employeeDeductionsCents: Math.round((r.employeeDeductions ?? (r.employee_deductions_cents ? r.employee_deductions_cents / 100 : 0)) * 100),
          advancesCents: Math.round((r.advances ?? 0) * 100)
        }));

      const totalGrossCents = employees.reduce((acc, e) => acc + e.grossCents, 0);
      const totalNetCents = employees.reduce((acc, e) => acc + e.netCents, 0);
      const totalEmployerDeductionsCents = employees.reduce((acc, e) => acc + e.employerTaxesCents, 0);

      const sourceSnapshot: PayrollSourceSnapshot = {
        cycleId,
        business_id: businessId,
        totalGrossCents,
        totalNetCents,
        totalEmployerDeductionsCents,
        currency: cycle.currency || "HTG",
        effectiveAccountingDate: cycle.effectiveAccountingDate || cycle.endDate || new Date().toISOString().split("T")[0],
        employees
      };

      const sourceHash = ApprovalHashingService.computePayrollSourceHash(sourceSnapshot);
      const sourceVersion = ApprovalHashingService.computePayrollSourceVersion(
        cycle.status,
        cycle.calculated_at || cycle.updated_at || new Date().toISOString()
      );

      // 3. Mutex Verification: Check Active Approval Lock
      const lockId = ApprovalHashingService.computeLockId(businessId, "PAYROLL", cycleId);
      const lockRef = this.firestore.collection("active_approval_locks").doc(lockId);
      const lockDoc = await t.get(lockRef);

      if (lockDoc.exists) {
        const lockData = lockDoc.data()!;
        const activeStatuses: ApprovalStatus[] = [
          "PENDING_APPROVAL",
          "EXECUTION_PENDING",
          "EXECUTING"
        ];
        if (activeStatuses.includes(lockData.status)) {
          throw new Error("ACTIVE_APPROVAL_ALREADY_EXISTS");
        }
      }

      // 4. Resolve Approval Policy Snapshot
      const policyQuery = this.firestore
        .collection("approval_policies")
        .where("businessId", "==", businessId)
        .where("entityType", "==", "PAYROLL")
        .limit(1);
      const policySnap = await t.get(policyQuery);

      let policySnapshot: ApprovalPolicySnapshot;
      let policyId = "pol_default_payroll";
      let policyVersion = 1;

      if (!policySnap.empty) {
        const pDoc = policySnap.docs[0];
        const pData = pDoc.data();
        policyId = pDoc.id;
        policyVersion = pData.version || 1;
        policySnapshot = {
          policyId,
          policyVersion,
          name: pData.name || "Default Payroll Policy",
          minLevels: pData.minLevels || pData.steps?.length || 1,
          steps: (pData.steps || []).map((s: any) => ({
            level: s.level,
            roleRequired: s.roleRequired,
            assignedTo: s.assignedTo || []
          }))
        };
      } else {
        // Fallback default policy: 1 level (OWNER or MANAGER)
        policySnapshot = {
          policyId: "pol_default_payroll",
          policyVersion: 1,
          name: "Standard Payroll 1-Step Policy",
          minLevels: 1,
          steps: [
            {
              level: 1,
              roleRequired: "OWNER",
              assignedTo: []
            }
          ]
        };
      }

      // 5. Generate Approval Instance & Steps
      const instanceId = `app_${cycleId}_${Date.now()}`;
      const steps: ApprovalStep[] = policySnapshot.steps.map((s) => ({
        id: `step_${s.level}`,
        level: s.level,
        roleRequired: s.roleRequired,
        assignedTo: s.assignedTo || [],
        status: "PENDING"
      }));

      const now = new Date().toISOString();
      const instance: ApprovalInstance = {
        id: instanceId,
        business_id: businessId,
        businessId: businessId,
        entityType: "PAYROLL",
        entityId: cycleId,
        sourceDocPath: `payroll_cycles/${cycleId}`,
        sourceVersion,
        sourceHash,
        amount_cents: totalNetCents,
        currency: cycle.currency || "HTG",
        policyId,
        policyVersion,
        policySnapshot,
        requesterId,
        initiatorId: requesterId,
        status: "PENDING_APPROVAL",
        currentLevel: 1,
        steps,
        createdAt: now,
        updatedAt: now
      };

      // 6. Write Mutex Lock Doc
      const lockPayload: ActiveApprovalLock = {
        lockId,
        business_id: businessId,
        entityType: "PAYROLL",
        entityId: cycleId,
        approvalInstanceId: instanceId,
        status: "PENDING_APPROVAL",
        acquiredAt: now,
        updatedAt: now
      };
      t.set(lockRef, lockPayload);

      // 7. Write Approval Instance
      const instanceRef = this.firestore.collection("approval_instances").doc(instanceId);
      t.set(instanceRef, instance);

      // 8. Update Cycle with Pending Approval metadata
      t.update(cycleRef, {
        approval_status: "PENDING_APPROVAL",
        approval_instance_id: instanceId,
        updated_at: FieldValue.serverTimestamp()
      });

      return {
        instanceId,
        status: "PENDING_APPROVAL",
        lockId
      };
    });
  }

  /**
   * STAGE 6: Step Decisions with Maker-Checker and Payload Re-verification
   */
  public async submitStepDecision(params: {
    businessId: string;
    instanceId: string;
    actorUid: string;
    actorRole: string;
    action: "APPROVE" | "REJECT";
    comment?: string;
  }): Promise<DecisionResult> {
    const { businessId, instanceId, actorUid, actorRole, action, comment } = params;

    return await this.firestore.runTransaction(async (t: Transaction) => {
      // 1. Read & Validate Instance
      const instanceRef = this.firestore.collection("approval_instances").doc(instanceId);
      const instanceDoc = await t.get(instanceRef);

      if (!instanceDoc.exists) {
        throw new Error("APPROVAL_INSTANCE_NOT_FOUND");
      }

      const instance = instanceDoc.data() as ApprovalInstance;
      if (instance.business_id !== businessId && instance.businessId !== businessId) {
        throw new Error("TENANT_MISMATCH");
      }

      if (instance.status !== "PENDING_APPROVAL") {
        throw new Error(`INVALID_APPROVAL_STATUS: Current status is ${instance.status}`);
      }

      // 2. Maker-Checker Rule Enforcement
      if (instance.requesterId === actorUid || instance.initiatorId === actorUid) {
        throw new Error("MAKER_CHECKER_VIOLATION: Requester cannot approve or reject their own submission.");
      }

      // 3. Multi-Level Step Integrity Validation
      const currentLevel = instance.currentLevel;
      const stepIndex = instance.steps.findIndex((s) => s.level === currentLevel);
      if (stepIndex === -1) {
        throw new Error("CURRENT_STEP_NOT_FOUND");
      }

      const currentStep = instance.steps[stepIndex];
      if (currentStep.status !== "PENDING") {
        throw new Error("STEP_ALREADY_ACTED");
      }

      // Prior step completion oracle: Verify all prior steps are APPROVED
      for (let i = 0; i < stepIndex; i++) {
        if (instance.steps[i].status !== "APPROVED") {
          throw new Error(`PRIOR_STEP_INCOMPLETE: Step ${instance.steps[i].level} is not approved.`);
        }
      }

      // Role check: Actor role must match required role (or be SUPER_ADMIN / OWNER)
      const allowedRoles = [currentStep.roleRequired, "SUPER_ADMIN", "OWNER"];
      if (!allowedRoles.includes(actorRole)) {
        throw new Error(`ROLE_UNAUTHORIZED: Required ${currentStep.roleRequired}, actor has ${actorRole}`);
      }

      // 4. Payload Mutation Detection: Recompute sourceHash on underlying cycle & records
      const cycleRef = this.firestore.collection("payroll_cycles").doc(instance.entityId);
      const cycleDoc = await t.get(cycleRef);
      if (!cycleDoc.exists) {
        throw new Error("UNDERLYING_PAYROLL_CYCLE_MISSING");
      }

      const cycle = cycleDoc.data()!;
      const recordsQuery = this.firestore
        .collection("payroll_records")
        .where("payroll_cycle_id", "==", instance.entityId)
        .where("business_id", "==", businessId);
      const recordsSnap = await t.get(recordsQuery);

      const employees: PayrollSnapshotEmployee[] = recordsSnap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((r: any) => !r.deleted)
        .map((r: any) => ({
          employeeId: r.employeeId || r.employee_id || r.id,
          employeeName: r.employeeName || r.employee_name || "Employee",
          grossCents: Math.round((r.grossSalary ?? (r.gross_salary_cents ? r.gross_salary_cents / 100 : 0)) * 100),
          netCents: Math.round((r.netPaid ?? (r.net_salary_cents ? r.net_salary_cents / 100 : 0)) * 100),
          employerTaxesCents: Math.round((r.employerTaxes ?? (r.employer_deductions_cents ? r.employer_deductions_cents / 100 : 0)) * 100),
          employeeDeductionsCents: Math.round((r.employeeDeductions ?? (r.employee_deductions_cents ? r.employee_deductions_cents / 100 : 0)) * 100),
          advancesCents: Math.round((r.advances ?? 0) * 100)
        }));

      const currentSnapshot: PayrollSourceSnapshot = {
        cycleId: instance.entityId,
        business_id: businessId,
        totalGrossCents: employees.reduce((acc, e) => acc + e.grossCents, 0),
        totalNetCents: employees.reduce((acc, e) => acc + e.netCents, 0),
        totalEmployerDeductionsCents: employees.reduce((acc, e) => acc + e.employerTaxesCents, 0),
        currency: cycle.currency || "HTG",
        effectiveAccountingDate: cycle.effectiveAccountingDate || cycle.endDate || new Date().toISOString().split("T")[0],
        employees
      };

      const currentSourceHash = ApprovalHashingService.computePayrollSourceHash(currentSnapshot);
      if (currentSourceHash !== instance.sourceHash) {
        throw new Error("PAYLOAD_MUTATION_DETECTED: Payroll records modified after approval initiation.");
      }

      const now = new Date().toISOString();
      const updatedSteps = [...instance.steps];

      // Mutex lock ref
      const lockId = ApprovalHashingService.computeLockId(businessId, "PAYROLL", instance.entityId);
      const lockRef = this.firestore.collection("active_approval_locks").doc(lockId);

      if (action === "REJECT") {
        updatedSteps[stepIndex] = {
          ...currentStep,
          status: "REJECTED",
          actedBy: actorUid,
          actedAt: now,
          comment
        };

        // Write terminal rejection
        t.update(instanceRef, {
          steps: updatedSteps,
          status: "REJECTED",
          actedByUid: actorUid,
          actedAt: now,
          updatedAt: now
        });

        // Release mutex lock
        t.update(lockRef, {
          status: "REJECTED",
          updatedAt: now
        });

        // Update cycle
        t.update(cycleRef, {
          approval_status: "REJECTED",
          updated_at: FieldValue.serverTimestamp()
        });

        return {
          instanceId,
          status: "REJECTED",
          currentLevel,
          actedLevel: currentLevel,
          finalApproved: false,
          rejected: true
        };
      }

      // Action is APPROVE
      updatedSteps[stepIndex] = {
        ...currentStep,
        status: "APPROVED",
        actedBy: actorUid,
        actedAt: now,
        comment
      };

      const isFinalLevel = currentLevel >= instance.steps.length;

      if (isFinalLevel) {
        // Compute retry-stable idempotencyKey
        const idempotencyKey = ApprovalHashingService.computeIdempotencyKey(
          businessId,
          instanceId,
          instance.entityId,
          instance.sourceHash
        );

        t.update(instanceRef, {
          steps: updatedSteps,
          status: "EXECUTION_PENDING",
          idempotencyKey,
          actedByUid: actorUid,
          actedAt: now,
          updatedAt: now
        });

        t.update(lockRef, {
          status: "EXECUTION_PENDING",
          updatedAt: now
        });

        t.update(cycleRef, {
          approval_status: "APPROVED",
          updated_at: FieldValue.serverTimestamp()
        });

        return {
          instanceId,
          status: "EXECUTION_PENDING",
          currentLevel,
          actedLevel: currentLevel,
          finalApproved: true,
          rejected: false
        };
      } else {
        const nextLevel = currentLevel + 1;
        t.update(instanceRef, {
          steps: updatedSteps,
          currentLevel: nextLevel,
          updatedAt: now
        });

        return {
          instanceId,
          status: "PENDING_APPROVAL",
          currentLevel: nextLevel,
          actedLevel: currentLevel,
          finalApproved: false,
          rejected: false
        };
      }
    });
  }

  /**
   * STAGE 8: Cancel Initiation by Requester/Owner
   */
  public async cancelApproval(params: {
    businessId: string;
    instanceId: string;
    actorUid: string;
    actorRole: string;
    reason?: string;
  }): Promise<CancelResult> {
    const { businessId, instanceId, actorUid, actorRole, reason } = params;

    return await this.firestore.runTransaction(async (t: Transaction) => {
      const instanceRef = this.firestore.collection("approval_instances").doc(instanceId);
      const instanceDoc = await t.get(instanceRef);

      if (!instanceDoc.exists) {
        throw new Error("APPROVAL_INSTANCE_NOT_FOUND");
      }

      const instance = instanceDoc.data() as ApprovalInstance;
      if (instance.business_id !== businessId && instance.businessId !== businessId) {
        throw new Error("TENANT_MISMATCH");
      }

      if (instance.status !== "PENDING_APPROVAL") {
        throw new Error(`CANNOT_CANCEL: Instance status is ${instance.status}`);
      }

      const isRequester = instance.requesterId === actorUid || instance.initiatorId === actorUid;
      const isOwnerOrAdmin = ["OWNER", "SUPER_ADMIN", "ADMIN"].includes(actorRole);

      if (!isRequester && !isOwnerOrAdmin) {
        throw new Error("UNAUTHORIZED_CANCEL: Only the requester or an administrator can cancel.");
      }

      const now = new Date().toISOString();
      t.update(instanceRef, {
        status: "CANCELLED",
        cancellationReason: reason || "User cancelled",
        updatedAt: now
      });

      const lockId = ApprovalHashingService.computeLockId(businessId, "PAYROLL", instance.entityId);
      const lockRef = this.firestore.collection("active_approval_locks").doc(lockId);
      t.update(lockRef, {
        status: "CANCELLED",
        updatedAt: now
      });

      const cycleRef = this.firestore.collection("payroll_cycles").doc(instance.entityId);
      t.update(cycleRef, {
        approval_status: "CANCELLED",
        updated_at: FieldValue.serverTimestamp()
      });

      return {
        instanceId,
        status: "CANCELLED"
      };
    });
  }
}
