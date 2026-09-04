import { describe, it, expect, beforeEach, vi } from "vitest";

const docStore = new Map<string, any>();

vi.mock("../../lib/firebase", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    auth: {
      currentUser: { uid: "test_user_wf", email: "wf@test.com" }
    }
  };
});

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    collection: vi.fn((_db: any, name: string) => ({ name })),
    doc: vi.fn((_db: any, collName: string, id: string) => ({ collName, id })),
    setDoc: vi.fn(async (docRef: any, data: any) => {
      docStore.set(`${docRef.collName}/${docRef.id}`, data);
    }),
    getDoc: vi.fn(async (docRef: any) => {
      const key = `${docRef.collName}/${docRef.id}`;
      const data = docStore.get(key);
      return {
        exists: () => !!data,
        data: () => data
      };
    }),
    updateDoc: vi.fn(async (docRef: any, updates: any) => {
      const key = `${docRef.collName}/${docRef.id}`;
      const existing = docStore.get(key) || {};
      docStore.set(key, { ...existing, ...updates });
    }),
    getDocs: vi.fn(async (qObj: any) => {
      const collName = qObj.name || (qObj._coll && qObj._coll.name) || "approval_policies";
      const matchingDocs: any[] = [];
      docStore.forEach((val, k) => {
        if (k.startsWith(`${collName}/`)) {
          matchingDocs.push({
            id: k.split("/")[1],
            data: () => val
          });
        }
      });
      return {
        docs: matchingDocs,
        empty: matchingDocs.length === 0,
        forEach: (cb: any) => matchingDocs.forEach(cb)
      };
    }),
    query: vi.fn((coll: any) => ({ _coll: coll, name: coll.name })),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn()
  };
});

import { WorkflowRepository } from "../../modules/workflow/WorkflowRepository";
import { ApprovalRepository } from "../../modules/workflow/approval/ApprovalRepository";
import { CacheInvalidationService } from "../../services/performance/CacheInvalidationService";

describe("Workflow Engine SSOT & Integrity Tests", () => {
  const testBizId = "biz_test_wf_001";

  beforeEach(() => {
    docStore.clear();
    WorkflowRepository.invalidateCache();
    ApprovalRepository.invalidateCache();
  });

  it("seeds default workflows and approval policies idempotently with deterministic IDs", async () => {
    // 1. Initial Seed
    await WorkflowRepository.seedDefaultWorkflows(testBizId);

    const leaveWf = await WorkflowRepository.getDefinition(`wf_leave_${testBizId}`);
    expect(leaveWf).toBeDefined();
    expect(leaveWf?.id).toBe(`wf_leave_${testBizId}`);
    expect(leaveWf?.triggerEvent).toBe("LeaveRequested");

    // 2. Re-seed (Idempotency check)
    await WorkflowRepository.seedDefaultWorkflows(testBizId);
    const leaveWfRechecked = await WorkflowRepository.getDefinition(`wf_leave_${testBizId}`);
    expect(leaveWfRechecked?.id).toBe(`wf_leave_${testBizId}`);
  });

  it("handles approval policy creation and retrieval via ApprovalRepository", async () => {
    const policyId = `pol_leave_${testBizId}`;
    await ApprovalRepository.seedPolicy({
      id: policyId,
      businessId: testBizId,
      name: "Test Multi-Step Policy",
      entityType: "LEAVE",
      minLevels: 2,
      steps: [
        { level: 1, roleRequired: "MANAGER" },
        { level: 2, roleRequired: "HR" }
      ]
    });

    const fetched = await ApprovalRepository.findPolicy(testBizId, "LEAVE");
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(policyId);
    expect(fetched?.minLevels).toBe(2);
  });

  it("persists workflow instances and updates status with history log", async () => {
    const instanceId = `wfi_test_${Date.now()}`;
    const initialInstance = {
      id: instanceId,
      definitionId: `wf_leave_${testBizId}`,
      businessId: testBizId,
      entityId: "leave_req_101",
      entityType: "LEAVE",
      status: "WAITING_APPROVAL" as const,
      currentStep: "LEVEL_1",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      correlationId: `corr_${Date.now()}`,
      history: [
        {
          timestamp: new Date().toISOString(),
          type: "STEP_STARTED" as const,
          message: "Level 1 approval started"
        }
      ]
    };

    await WorkflowRepository.saveInstance(initialInstance);

    const saved = await WorkflowRepository.getInstance(instanceId);
    expect(saved?.id).toBe(instanceId);
    expect(saved?.status).toBe("WAITING_APPROVAL");

    // Update status
    await WorkflowRepository.updateInstanceStatus(instanceId, "COMPLETED", {
      timestamp: new Date().toISOString(),
      type: "STATUS_CHANGED",
      message: "Workflow completed successfully"
    });

    const updated = await WorkflowRepository.getInstance(instanceId);
    expect(updated?.status).toBe("COMPLETED");
  });

  it("invalidates local cache cleanly on sweepLocal", () => {
    const spyWf = vi.spyOn(WorkflowRepository, "invalidateCache");
    const spyAppr = vi.spyOn(ApprovalRepository, "invalidateCache");

    CacheInvalidationService.sweepLocal(testBizId);

    expect(spyWf).toHaveBeenCalled();
    expect(spyAppr).toHaveBeenCalled();

    spyWf.mockRestore();
    spyAppr.mockRestore();
  });
});
