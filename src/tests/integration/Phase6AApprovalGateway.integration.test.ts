import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import * as fs from "fs";
import { ServerApprovalGateway } from "../../modules/workflow/approval/ServerApprovalGateway";
import { ApprovalExecutionWorker } from "../../modules/workflow/approval/ApprovalExecutionWorker";
import { ApprovalHashingService } from "../../modules/workflow/approval/ApprovalHashingService";
import { PayrollSourceSnapshot } from "../../modules/workflow/approval/types";

/**
 * PHASE 6A — APPROVAL GATEWAY & TRUSTED EXECUTION MODEL TEST SUITE (45 TESTS)
 */
describe("Phase 6A: Approval Gateway & Trusted Execution Model Security Contract", () => {
  let testEnv: RulesTestEnvironment;
  let adminDb: any;
  let tenantADb: any;
  let tenantBDb: any;
  let gateway: ServerApprovalGateway;
  let worker: ApprovalExecutionWorker;

  const BIZ_A = "biz_phase6a_A";
  const BIZ_B = "biz_phase6a_B";
  const USER_MAKER = "user_maker_alice";
  const USER_CHECKER_L1 = "user_checker_mgr_bob";
  const USER_CHECKER_L2 = "user_checker_owner_carol";

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8088";
    const rules = fs.readFileSync("firestore.rules", "utf8");
    testEnv = await initializeTestEnvironment({
      projectId: "demo-finops-phase6a",
      firestore: {
        host: "127.0.0.1",
        port: 8088,
        rules,
      },
    });

    const superAdminContext = testEnv.authenticatedContext("super_admin_001", {
      email: "admin@finops.com",
      role: "SUPER_ADMIN",
    });
    adminDb = superAdminContext.firestore();

    const tenantAContext = testEnv.authenticatedContext(USER_MAKER, {
      email: "alice@bizA.com",
      business_id: BIZ_A,
      role: "HR",
    });
    tenantADb = tenantAContext.firestore();

    const tenantBContext = testEnv.authenticatedContext("user_biz_b", {
      email: "dave@bizB.com",
      business_id: BIZ_B,
      role: "OWNER",
    });
    tenantBDb = tenantBContext.firestore();

    gateway = new ServerApprovalGateway(adminDb as any);
    worker = new ApprovalExecutionWorker(adminDb as any);
  }, 30000);

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();

    // Setup 2-Step Policy for BIZ_A
    await adminDb.collection("approval_policies").doc("pol_payroll_bizA").set({
      id: "pol_payroll_bizA",
      businessId: BIZ_A,
      business_id: BIZ_A,
      name: "Payroll 2-Level Governance Policy",
      entityType: "PAYROLL",
      minLevels: 2,
      steps: [
        { level: 1, roleRequired: "MANAGER", assignedTo: [] },
        { level: 2, roleRequired: "OWNER", assignedTo: [] }
      ]
    });
  });

  async function seedTestPayrollCycle(cycleId: string, businessId: string = BIZ_A, status: string = "CALCULATED") {
    const cycleRef = adminDb.collection("payroll_cycles").doc(cycleId);
    await cycleRef.set({
      id: cycleId,
      cycleName: `Cycle ${cycleId}`,
      business_id: businessId,
      businessId: businessId,
      status,
      currency: "HTG",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      effectiveAccountingDate: "2026-09-30",
      calculated_at: "2026-09-14T10:00:00.000Z"
    });

    const rec1Ref = adminDb.collection("payroll_records").doc(`rec_${cycleId}_emp1`);
    await rec1Ref.set({
      id: `rec_${cycleId}_emp1`,
      payroll_cycle_id: cycleId,
      business_id: businessId,
      employeeId: "emp_001",
      employeeName: "Jean Baptiste",
      grossSalary: 50000,
      netPaid: 42000,
      employerTaxes: 4500,
      employeeDeductions: 8000,
      advances: 0
    });

    const rec2Ref = adminDb.collection("payroll_records").doc(`rec_${cycleId}_emp2`);
    await rec2Ref.set({
      id: `rec_${cycleId}_emp2`,
      payroll_cycle_id: cycleId,
      business_id: businessId,
      employeeId: "emp_002",
      employeeName: "Marie Curie",
      grossSalary: 60000,
      netPaid: 51000,
      employerTaxes: 5400,
      employeeDeductions: 9000,
      advances: 0
    });
  }

  // === CATEGORY 1: DIRECT FIRESTORE CLIENT WRITE ATTEMPTS (TC-SEC-01 to TC-SEC-08) ===
  describe("Category 1: Client Security Rules Enforcement", () => {
    it("TC-SEC-01: Client cannot create approval_instances directly", async () => {
      const ref = tenantADb.collection("approval_instances").doc("app_hack_01");
      await assertFails(ref.set({ id: "app_hack_01", business_id: BIZ_A, status: "APPROVED" }));
    });

    it("TC-SEC-02: Client cannot update approval_instances directly", async () => {
      await adminDb.collection("approval_instances").doc("app_seeded_02").set({
        id: "app_seeded_02",
        business_id: BIZ_A,
        status: "PENDING_APPROVAL"
      });
      const ref = tenantADb.collection("approval_instances").doc("app_seeded_02");
      await assertFails(ref.update({ status: "APPROVED" }));
    });

    it("TC-SEC-03: Client cannot delete approval_instances", async () => {
      await adminDb.collection("approval_instances").doc("app_seeded_03").set({
        id: "app_seeded_03",
        business_id: BIZ_A,
        status: "PENDING_APPROVAL"
      });
      const ref = tenantADb.collection("approval_instances").doc("app_seeded_03");
      await assertFails(ref.delete());
    });

    it("TC-SEC-04: Client cannot create active_approval_locks directly", async () => {
      const ref = tenantADb.collection("active_approval_locks").doc("lock_hack_04");
      await assertFails(ref.set({ lockId: "lock_hack_04", business_id: BIZ_A, status: "PENDING_APPROVAL" }));
    });

    it("TC-SEC-05: Client cannot update active_approval_locks directly", async () => {
      await adminDb.collection("active_approval_locks").doc("lock_seeded_05").set({
        lockId: "lock_seeded_05",
        business_id: BIZ_A,
        status: "PENDING_APPROVAL"
      });
      const ref = tenantADb.collection("active_approval_locks").doc("lock_seeded_05");
      await assertFails(ref.update({ status: "CANCELLED" }));
    });

    it("TC-SEC-06: Cross-tenant client cannot read another tenant's approval_instances", async () => {
      await adminDb.collection("approval_instances").doc("app_bizA_06").set({
        id: "app_bizA_06",
        business_id: BIZ_A,
        businessId: BIZ_A,
        status: "PENDING_APPROVAL"
      });
      const ref = tenantBDb.collection("approval_instances").doc("app_bizA_06");
      await assertFails(ref.get());
    });

    it("TC-SEC-07: Cross-tenant client cannot read another tenant's active_approval_locks", async () => {
      await adminDb.collection("active_approval_locks").doc("lock_bizA_07").set({
        lockId: "lock_bizA_07",
        business_id: BIZ_A,
        status: "PENDING_APPROVAL"
      });
      const ref = tenantBDb.collection("active_approval_locks").doc("lock_bizA_07");
      await assertFails(ref.get());
    });

    it("TC-SEC-08: Authorized tenant user can read own approval_instances", async () => {
      await adminDb.collection("approval_instances").doc("app_bizA_08").set({
        id: "app_bizA_08",
        business_id: BIZ_A,
        businessId: BIZ_A,
        status: "PENDING_APPROVAL"
      });
      const ref = tenantADb.collection("approval_instances").doc("app_bizA_08");
      await assertSucceeds(ref.get());
    });
  });

  // === CATEGORY 2: INITIATION MUTEX & CONCURRENCY (TC-MUT-01 to TC-MUT-06) ===
  describe("Category 2: Initiation Mutex & Concurrency", () => {
    it("TC-MUT-01: Successfully initiates approval and creates deterministic lock", async () => {
      const cycleId = "cycle_mut_01";
      await seedTestPayrollCycle(cycleId);

      const result = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      expect(result.status).toBe("PENDING_APPROVAL");
      expect(result.lockId).toBe(ApprovalHashingService.computeLockId(BIZ_A, "PAYROLL", cycleId));

      const lockDoc = await adminDb.collection("active_approval_locks").doc(result.lockId).get();
      expect(lockDoc.exists).toBe(true);
      expect(lockDoc.data().status).toBe("PENDING_APPROVAL");
    });

    it("TC-MUT-02: Rejects second concurrent initiation on same cycle (Active Lock Conflict)", async () => {
      const cycleId = "cycle_mut_02";
      await seedTestPayrollCycle(cycleId);

      await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      await expect(
        gateway.initiatePayrollApproval({
          businessId: BIZ_A,
          cycleId,
          requesterId: "user_other",
          requesterRole: "HR"
        })
      ).rejects.toThrow("ACTIVE_APPROVAL_ALREADY_EXISTS");
    });

    it("TC-MUT-03: Rejects initiation if cycle status is not CALCULATED or DRAFT", async () => {
      const cycleId = "cycle_mut_03";
      await seedTestPayrollCycle(cycleId, BIZ_A, "SEALED");

      await expect(
        gateway.initiatePayrollApproval({
          businessId: BIZ_A,
          cycleId,
          requesterId: USER_MAKER,
          requesterRole: "HR"
        })
      ).rejects.toThrow("INVALID_CYCLE_STATUS");
    });

    it("TC-MUT-04: Rejects initiation if cycle belongs to a different tenant", async () => {
      const cycleId = "cycle_mut_04";
      await seedTestPayrollCycle(cycleId, BIZ_B);

      await expect(
        gateway.initiatePayrollApproval({
          businessId: BIZ_A,
          cycleId,
          requesterId: USER_MAKER,
          requesterRole: "HR"
        })
      ).rejects.toThrow("TENANT_MISMATCH");
    });

    it("TC-MUT-05: Re-initiation is permitted after previous instance was CANCELLED", async () => {
      const cycleId = "cycle_mut_05";
      await seedTestPayrollCycle(cycleId);

      const initResult = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      await gateway.cancelApproval({
        businessId: BIZ_A,
        instanceId: initResult.instanceId,
        actorUid: USER_MAKER,
        actorRole: "HR"
      });

      const reInit = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });
      expect(reInit.status).toBe("PENDING_APPROVAL");
    });

    it("TC-MUT-06: Re-initiation is permitted after previous instance was REJECTED", async () => {
      const cycleId = "cycle_mut_06";
      await seedTestPayrollCycle(cycleId);

      const initResult = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      await gateway.submitStepDecision({
        businessId: BIZ_A,
        instanceId: initResult.instanceId,
        actorUid: USER_CHECKER_L1,
        actorRole: "MANAGER",
        action: "REJECT",
        comment: "Budget exceeded"
      });

      const reInit = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });
      expect(reInit.status).toBe("PENDING_APPROVAL");
    });
  });

  // === CATEGORY 3: MAKER-CHECKER & ROLE ENFORCEMENT (TC-MC-01 to TC-MC-06) ===
  describe("Category 3: Maker-Checker & Role Enforcement", () => {
    it("TC-MC-01: Requester cannot approve Step 1 (Maker-Checker violation)", async () => {
      const cycleId = "cycle_mc_01";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      await expect(
        gateway.submitStepDecision({
          businessId: BIZ_A,
          instanceId,
          actorUid: USER_MAKER,
          actorRole: "MANAGER",
          action: "APPROVE"
        })
      ).rejects.toThrow("MAKER_CHECKER_VIOLATION");
    });

    it("TC-MC-02: Requester cannot reject Step 1 (Maker-Checker violation)", async () => {
      const cycleId = "cycle_mc_02";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      await expect(
        gateway.submitStepDecision({
          businessId: BIZ_A,
          instanceId,
          actorUid: USER_MAKER,
          actorRole: "MANAGER",
          action: "REJECT"
        })
      ).rejects.toThrow("MAKER_CHECKER_VIOLATION");
    });

    it("TC-MC-03: User with unauthorized role cannot approve step", async () => {
      const cycleId = "cycle_mc_03";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      await expect(
        gateway.submitStepDecision({
          businessId: BIZ_A,
          instanceId,
          actorUid: "user_teller",
          actorRole: "JUNIOR_TELLER",
          action: "APPROVE"
        })
      ).rejects.toThrow("ROLE_UNAUTHORIZED");
    });

    it("TC-MC-04: Authorized MANAGER approves Step 1 successfully", async () => {
      const cycleId = "cycle_mc_04";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      const decResult = await gateway.submitStepDecision({
        businessId: BIZ_A,
        instanceId,
        actorUid: USER_CHECKER_L1,
        actorRole: "MANAGER",
        action: "APPROVE"
      });

      expect(decResult.currentLevel).toBe(2);
      expect(decResult.finalApproved).toBe(false);
      expect(decResult.status).toBe("PENDING_APPROVAL");
    });

    it("TC-MC-05: OWNER approves Step 2 successfully achieving final approval", async () => {
      const cycleId = "cycle_mc_05";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      await gateway.submitStepDecision({
        businessId: BIZ_A,
        instanceId,
        actorUid: USER_CHECKER_L1,
        actorRole: "MANAGER",
        action: "APPROVE"
      });

      const finalDec = await gateway.submitStepDecision({
        businessId: BIZ_A,
        instanceId,
        actorUid: USER_CHECKER_L2,
        actorRole: "OWNER",
        action: "APPROVE"
      });

      expect(finalDec.finalApproved).toBe(true);
      expect(finalDec.status).toBe("EXECUTION_PENDING");
    });

    it("TC-MC-06: SUPER_ADMIN bypasses role requirement and approves", async () => {
      const cycleId = "cycle_mc_06";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      const decResult = await gateway.submitStepDecision({
        businessId: BIZ_A,
        instanceId,
        actorUid: "admin_super",
        actorRole: "SUPER_ADMIN",
        action: "APPROVE"
      });

      expect(decResult.currentLevel).toBe(2);
    });
  });

  // === CATEGORY 4: MULTI-STEP INTEGRITY & MUTATION DETECTION (TC-STP-01 to TC-STP-08) ===
  describe("Category 4: Multi-Step Progression & Mutation Detection", () => {
    it("TC-STP-01: Rejects decision if payroll records are mutated during pending approval", async () => {
      const cycleId = "cycle_stp_01";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      // Illegally mutate payroll record directly
      await adminDb.collection("payroll_records").doc(`rec_${cycleId}_emp1`).update({
        grossSalary: 999999
      });

      await expect(
        gateway.submitStepDecision({
          businessId: BIZ_A,
          instanceId,
          actorUid: USER_CHECKER_L1,
          actorRole: "MANAGER",
          action: "APPROVE"
        })
      ).rejects.toThrow("PAYLOAD_MUTATION_DETECTED");
    });

    it("TC-STP-02: Step 1 rejection immediately terminates whole instance as REJECTED", async () => {
      const cycleId = "cycle_stp_02";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      const result = await gateway.submitStepDecision({
        businessId: BIZ_A,
        instanceId,
        actorUid: USER_CHECKER_L1,
        actorRole: "MANAGER",
        action: "REJECT",
        comment: "Discrepancy in hours"
      });

      expect(result.status).toBe("REJECTED");
      expect(result.rejected).toBe(true);

      const docSnap = await adminDb.collection("approval_instances").doc(instanceId).get();
      expect(docSnap.data().status).toBe("REJECTED");
    });

    it("TC-STP-03: Step 2 rejection after Step 1 approval terminates instance as REJECTED", async () => {
      const cycleId = "cycle_stp_03";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      await gateway.submitStepDecision({
        businessId: BIZ_A,
        instanceId,
        actorUid: USER_CHECKER_L1,
        actorRole: "MANAGER",
        action: "APPROVE"
      });

      const rejResult = await gateway.submitStepDecision({
        businessId: BIZ_A,
        instanceId,
        actorUid: USER_CHECKER_L2,
        actorRole: "OWNER",
        action: "REJECT"
      });

      expect(rejResult.status).toBe("REJECTED");
    });

    it("TC-STP-04: Cannot act on already acted step", async () => {
      const cycleId = "cycle_stp_04";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      await gateway.submitStepDecision({
        businessId: BIZ_A,
        instanceId,
        actorUid: USER_CHECKER_L1,
        actorRole: "MANAGER",
        action: "APPROVE"
      });

      await gateway.submitStepDecision({
        businessId: BIZ_A,
        instanceId,
        actorUid: USER_CHECKER_L2,
        actorRole: "OWNER",
        action: "APPROVE"
      });

      // Trying to decide again after terminal state
      await expect(
        gateway.submitStepDecision({
          businessId: BIZ_A,
          instanceId,
          actorUid: "user_other",
          actorRole: "OWNER",
          action: "APPROVE"
        })
      ).rejects.toThrow("INVALID_APPROVAL_STATUS");
    });

    it("TC-STP-05: Non-requester non-admin cannot cancel approval", async () => {
      const cycleId = "cycle_stp_05";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      await expect(
        gateway.cancelApproval({
          businessId: BIZ_A,
          instanceId,
          actorUid: "unauthorized_user",
          actorRole: "EMPLOYEE"
        })
      ).rejects.toThrow("UNAUTHORIZED_CANCEL");
    });

    it("TC-STP-06: Requester can cancel pending approval", async () => {
      const cycleId = "cycle_stp_06";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      const cancelResult = await gateway.cancelApproval({
        businessId: BIZ_A,
        instanceId,
        actorUid: USER_MAKER,
        actorRole: "HR"
      });
      expect(cancelResult.status).toBe("CANCELLED");
    });

    it("TC-STP-07: Owner can cancel pending approval", async () => {
      const cycleId = "cycle_stp_07";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      const cancelResult = await gateway.cancelApproval({
        businessId: BIZ_A,
        instanceId,
        actorUid: USER_CHECKER_L2,
        actorRole: "OWNER"
      });
      expect(cancelResult.status).toBe("CANCELLED");
    });

    it("TC-STP-08: Cross-tenant decision submission is rejected", async () => {
      const cycleId = "cycle_stp_08";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      await expect(
        gateway.submitStepDecision({
          businessId: BIZ_B, // Wrong business
          instanceId,
          actorUid: USER_CHECKER_L1,
          actorRole: "MANAGER",
          action: "APPROVE"
        })
      ).rejects.toThrow("TENANT_MISMATCH");
    });
  });

  // === CATEGORY 5: TRUSTED EXECUTION WORKER & RECOVERY (TC-EXE-01 to TC-EXE-12) ===
  describe("Category 5: Execution Worker & Financial Oracle", () => {
    it("TC-EXE-01: Worker claims pending execution with exclusive lease mutex", async () => {
      const cycleId = "cycle_exe_01";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({
        businessId: BIZ_A,
        cycleId,
        requesterId: USER_MAKER,
        requesterRole: "HR"
      });

      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L1, actorRole: "MANAGER", action: "APPROVE" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L2, actorRole: "OWNER", action: "APPROVE" });

      const claimed = await worker.claimExecution(instanceId, "worker_primary");
      expect(claimed).not.toBeNull();
      expect(claimed?.status).toBe("EXECUTING");
      expect(claimed?.claimedByWorker).toBe("worker_primary");
    });

    it("TC-EXE-02: Second worker cannot claim currently active lease", async () => {
      const cycleId = "cycle_exe_02";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({ businessId: BIZ_A, cycleId, requesterId: USER_MAKER, requesterRole: "HR" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L1, actorRole: "MANAGER", action: "APPROVE" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L2, actorRole: "OWNER", action: "APPROVE" });

      await worker.claimExecution(instanceId, "worker_1", 60000);
      const secondClaim = await worker.claimExecution(instanceId, "worker_2");
      expect(secondClaim).toBeNull();
    });

    it("TC-EXE-03: Worker can reclaim expired lease (Worker crash recovery)", async () => {
      const cycleId = "cycle_exe_03";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({ businessId: BIZ_A, cycleId, requesterId: USER_MAKER, requesterRole: "HR" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L1, actorRole: "MANAGER", action: "APPROVE" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L2, actorRole: "OWNER", action: "APPROVE" });

      // Claim with expired lease (in past)
      await adminDb.collection("approval_instances").doc(instanceId).update({
        status: "EXECUTING",
        claimedByWorker: "worker_dead",
        leaseExpiresAt: new Date(Date.now() - 5000).toISOString()
      });

      const recovered = await worker.claimExecution(instanceId, "worker_recovery");
      expect(recovered).not.toBeNull();
      expect(recovered?.claimedByWorker).toBe("worker_recovery");
    });

    it("TC-EXE-04: Full execution seals cycle and posts balanced ledger transactions", async () => {
      const cycleId = "cycle_exe_04";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({ businessId: BIZ_A, cycleId, requesterId: USER_MAKER, requesterRole: "HR" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L1, actorRole: "MANAGER", action: "APPROVE" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L2, actorRole: "OWNER", action: "APPROVE" });

      const execResult = await worker.executeApprovedPayroll({
        instanceId,
        workerId: "worker_main"
      });

      expect(execResult.success).toBe(true);
      expect(execResult.status).toBe("EXECUTED");

      const cycleDoc = await adminDb.collection("payroll_cycles").doc(cycleId).get();
      expect(cycleDoc.data().status).toBe("SEALED");

      const instanceDoc = await adminDb.collection("approval_instances").doc(instanceId).get();
      expect(instanceDoc.data().status).toBe("EXECUTED");
    });

    it("TC-EXE-05: Re-executing already executed instance returns ALREADY_EXECUTED idempotently", async () => {
      const cycleId = "cycle_exe_05";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({ businessId: BIZ_A, cycleId, requesterId: USER_MAKER, requesterRole: "HR" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L1, actorRole: "MANAGER", action: "APPROVE" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L2, actorRole: "OWNER", action: "APPROVE" });

      await worker.executeApprovedPayroll({ instanceId, workerId: "worker_main" });
      const secondExec = await worker.executeApprovedPayroll({ instanceId, workerId: "worker_retry" });

      expect(secondExec.success).toBe(true);
      expect(secondExec.status).toBe("ALREADY_EXECUTED");
    });

    it("TC-EXE-06: Financial Oracle detects complete GL postings on retry", async () => {
      const cycleId = "cycle_exe_06";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({ businessId: BIZ_A, cycleId, requesterId: USER_MAKER, requesterRole: "HR" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L1, actorRole: "MANAGER", action: "APPROVE" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L2, actorRole: "OWNER", action: "APPROVE" });

      await worker.executeApprovedPayroll({ instanceId, workerId: "worker_main" });

      // Reset instance status to EXECUTION_PENDING to simulate crash before instance update
      await adminDb.collection("approval_instances").doc(instanceId).update({
        status: "EXECUTION_PENDING"
      });

      const recoveryExec = await worker.executeApprovedPayroll({ instanceId, workerId: "worker_oracle" });
      expect(recoveryExec.success).toBe(true);
      expect(recoveryExec.status).toBe("ALREADY_EXECUTED");
    });

    it("TC-EXE-07: Execution fails gracefully if payroll records are missing", async () => {
      const cycleId = "cycle_exe_07";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({ businessId: BIZ_A, cycleId, requesterId: USER_MAKER, requesterRole: "HR" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L1, actorRole: "MANAGER", action: "APPROVE" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L2, actorRole: "OWNER", action: "APPROVE" });

      // Illegally delete record to simulate data corruption
      await adminDb.collection("payroll_records").doc(`rec_${cycleId}_emp1`).delete();

      const execResult = await worker.executeApprovedPayroll({ instanceId, workerId: "worker_main" });
      expect(execResult.success).toBe(false);
      expect(execResult.status).toBe("EXECUTION_FAILED");
    });

    it("TC-EXE-08: Execution creates immutable forensic audit log", async () => {
      const cycleId = "cycle_exe_08";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({ businessId: BIZ_A, cycleId, requesterId: USER_MAKER, requesterRole: "HR" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L1, actorRole: "MANAGER", action: "APPROVE" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L2, actorRole: "OWNER", action: "APPROVE" });

      await worker.executeApprovedPayroll({ instanceId, workerId: "worker_main" });

      const logsSnap = await adminDb
        .collection("forensic_logs")
        .where("business_id", "==", BIZ_A)
        .where("action", "==", "PAYROLL_CYCLE_SEALED")
        .get();

      expect(logsSnap.empty).toBe(false);
    });

    it("TC-EXE-09: Execution writes event outbox payload", async () => {
      const cycleId = "cycle_exe_09";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({ businessId: BIZ_A, cycleId, requesterId: USER_MAKER, requesterRole: "HR" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L1, actorRole: "MANAGER", action: "APPROVE" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L2, actorRole: "OWNER", action: "APPROVE" });

      await worker.executeApprovedPayroll({ instanceId, workerId: "worker_main" });

      const outboxSnap = await adminDb
        .collection("event_outbox")
        .where("businessId", "==", BIZ_A)
        .where("type", "==", "PAYROLL_CYCLE_SEALED")
        .get();

      expect(outboxSnap.empty).toBe(false);
    });

    it("TC-EXE-10: Generated ledger transactions are balanced (Total Debit == Total Credit)", async () => {
      const cycleId = "cycle_exe_10";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({ businessId: BIZ_A, cycleId, requesterId: USER_MAKER, requesterRole: "HR" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L1, actorRole: "MANAGER", action: "APPROVE" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L2, actorRole: "OWNER", action: "APPROVE" });

      await worker.executeApprovedPayroll({ instanceId, workerId: "worker_main" });

      const txSnap = await adminDb
        .collection("ledger_transactions")
        .where("payroll_cycle_id", "==", cycleId)
        .get();

      let totalDebit = 0;
      let totalCredit = 0;
      txSnap.docs.forEach((doc: any) => {
        totalDebit += doc.data().debit || 0;
        totalCredit += doc.data().credit || 0;
      });

      expect(totalDebit).toBeGreaterThan(0);
      expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
    });

    it("TC-EXE-11: Sealing cycle marks all payslips as SEALED", async () => {
      const cycleId = "cycle_exe_11";
      await seedTestPayrollCycle(cycleId);

      const { instanceId } = await gateway.initiatePayrollApproval({ businessId: BIZ_A, cycleId, requesterId: USER_MAKER, requesterRole: "HR" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L1, actorRole: "MANAGER", action: "APPROVE" });
      await gateway.submitStepDecision({ businessId: BIZ_A, instanceId, actorUid: USER_CHECKER_L2, actorRole: "OWNER", action: "APPROVE" });

      await worker.executeApprovedPayroll({ instanceId, workerId: "worker_main" });

      const psSnap = await adminDb
        .collection("payslips")
        .where("payroll_cycle_id", "==", cycleId)
        .get();

      expect(psSnap.empty).toBe(false);
      psSnap.docs.forEach((d: any) => {
        expect(d.data().status).toBe("SEALED");
      });
    });

    it("TC-EXE-12: Hashing service produces retry-stable idempotency keys", () => {
      const key1 = ApprovalHashingService.computeIdempotencyKey(BIZ_A, "app_123", "cycle_123", "hash_abc");
      const key2 = ApprovalHashingService.computeIdempotencyKey(BIZ_A, "app_123", "cycle_123", "hash_abc");
      expect(key1).toBe(key2);
      expect(key1.startsWith("tx_exec_")).toBe(true);
    });
  });

  // === CATEGORY 6: HASHING & IMMUTABILITY CONTRACT (TC-HSH-01 to TC-HSH-05) ===
  describe("Category 6: Hashing & Immutability Contract", () => {
    it("TC-HSH-01: Source hash is deterministic regardless of employee array order", () => {
      const snap1: PayrollSourceSnapshot = {
        cycleId: "c1",
        business_id: BIZ_A,
        totalGrossCents: 100000,
        totalNetCents: 85000,
        totalEmployerDeductionsCents: 9000,
        currency: "HTG",
        effectiveAccountingDate: "2026-09-30",
        employees: [
          { employeeId: "emp_B", employeeName: "B", grossCents: 50000, netCents: 42500, employerTaxesCents: 4500, employeeDeductionsCents: 7500, advancesCents: 0 },
          { employeeId: "emp_A", employeeName: "A", grossCents: 50000, netCents: 42500, employerTaxesCents: 4500, employeeDeductionsCents: 7500, advancesCents: 0 }
        ]
      };

      const snap2: PayrollSourceSnapshot = {
        cycleId: "c1",
        business_id: BIZ_A,
        totalGrossCents: 100000,
        totalNetCents: 85000,
        totalEmployerDeductionsCents: 9000,
        currency: "HTG",
        effectiveAccountingDate: "2026-09-30",
        employees: [
          { employeeId: "emp_A", employeeName: "A", grossCents: 50000, netCents: 42500, employerTaxesCents: 4500, employeeDeductionsCents: 7500, advancesCents: 0 },
          { employeeId: "emp_B", employeeName: "B", grossCents: 50000, netCents: 42500, employerTaxesCents: 4500, employeeDeductionsCents: 7500, advancesCents: 0 }
        ]
      };

      const hash1 = ApprovalHashingService.computePayrollSourceHash(snap1);
      const hash2 = ApprovalHashingService.computePayrollSourceHash(snap2);
      expect(hash1).toBe(hash2);
    });

    it("TC-HSH-02: Source hash changes when monetary amount changes", () => {
      const snap1: PayrollSourceSnapshot = {
        cycleId: "c1",
        business_id: BIZ_A,
        totalGrossCents: 100000,
        totalNetCents: 85000,
        totalEmployerDeductionsCents: 9000,
        currency: "HTG",
        effectiveAccountingDate: "2026-09-30",
        employees: [{ employeeId: "emp_A", employeeName: "A", grossCents: 50000, netCents: 42500, employerTaxesCents: 4500, employeeDeductionsCents: 7500, advancesCents: 0 }]
      };

      const snap2: PayrollSourceSnapshot = {
        ...snap1,
        totalGrossCents: 100001
      };

      const hash1 = ApprovalHashingService.computePayrollSourceHash(snap1);
      const hash2 = ApprovalHashingService.computePayrollSourceHash(snap2);
      expect(hash1).not.toBe(hash2);
    });

    it("TC-HSH-03: Source hash changes when currency changes", () => {
      const snap1: PayrollSourceSnapshot = {
        cycleId: "c1",
        business_id: BIZ_A,
        totalGrossCents: 100000,
        totalNetCents: 85000,
        totalEmployerDeductionsCents: 9000,
        currency: "HTG",
        effectiveAccountingDate: "2026-09-30",
        employees: []
      };

      const snap2: PayrollSourceSnapshot = {
        ...snap1,
        currency: "USD"
      };

      expect(ApprovalHashingService.computePayrollSourceHash(snap1)).not.toBe(
        ApprovalHashingService.computePayrollSourceHash(snap2)
      );
    });

    it("TC-HSH-04: Lock ID is tenant-isolated and deterministic", () => {
      const lockA = ApprovalHashingService.computeLockId(BIZ_A, "PAYROLL", "cycle_100");
      const lockB = ApprovalHashingService.computeLockId(BIZ_B, "PAYROLL", "cycle_100");
      expect(lockA).not.toBe(lockB);
      expect(lockA.startsWith("lock_")).toBe(true);
    });

    it("TC-HSH-05: Source version formatting is monotonic and contains status & timestamp", () => {
      const version = ApprovalHashingService.computePayrollSourceVersion("CALCULATED", "2026-09-14T12:00:00.000Z");
      expect(version).toBe("CALCULATED_2026-09-14T12:00:00.000Z");
    });
  });
});
