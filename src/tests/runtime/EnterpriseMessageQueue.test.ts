// src/tests/runtime/EnterpriseMessageQueue.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { IdempotencyGuardian, EnterpriseMessageQueue } from "../../modules/runtime/EnterpriseMessageQueue";
import { EventBus } from "../../modules/runtime/EventBus";

// Mock Firebase firestore methods to simulate database reads/writes without network calls
vi.mock("firebase/firestore", () => {
  const store: Record<string, any> = {};
  return {
    db: { app: { options: { projectId: 'mocked' } } },
    initializeFirestore: vi.fn(() => ({ app: { options: { projectId: 'mocked' } } })),
    memoryLocalCache: vi.fn(() => ({})),
    persistentLocalCache: vi.fn(() => ({})),
    doc: vi.fn((_db, ...parts) => parts.join("/")),
    getDoc: vi.fn(async (path: string) => {
      return {
        exists: () => !!store[path],
        data: () => store[path]
      };
    }),
    setDoc: vi.fn(async (path: string, data: any) => {
      store[path] = data;
    }),
    runTransaction: vi.fn(async (_db, callback) => {
      const mockTx = {
        get: vi.fn(async (path: string) => {
          return {
            exists: () => !!store[path],
            data: () => store[path]
          };
        }),
        set: vi.fn((path: string, data: any) => {
          store[path] = data;
        })
      };
      return await callback(mockTx);
    }),
    writeBatch: vi.fn(() => {
      return {
        set: vi.fn(),
        commit: vi.fn(async () => {})
      };
    }),
    serverTimestamp: vi.fn(() => new Date().toISOString())
  };
});

describe("IdempotencyGuardian & EnterpriseMessageQueue Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully identify duplicate events and mark them processed", async () => {
    const businessId = "biz_enterprise_1";
    const consumerId = "ledger_service";
    const eventId = "evt_tx_posted_99";

    // 1. Initially should not be marked processed
    const initiallyProcessed = await IdempotencyGuardian.isEventProcessed(
      businessId,
      consumerId,
      eventId
    );
    expect(initiallyProcessed).toBe(false);

    // 2. Mark processed
    await IdempotencyGuardian.markEventProcessed(businessId, consumerId, eventId);

    // 3. Now should be marked processed
    const processedAfter = await IdempotencyGuardian.isEventProcessed(
      businessId,
      consumerId,
      eventId
    );
    expect(processedAfter).toBe(true);
  });

  it("should enforce the sliding window maximum processed IDs cap", async () => {
    const businessId = "biz_enterprise_1";
    const consumerId = "analytics_engine";

    // Seed 1002 event registrations
    for (let i = 1; i <= 1002; i++) {
      await IdempotencyGuardian.markEventProcessed(businessId, consumerId, `evt_${i}`);
    }

    // Checking if the oldest (evt_1) is evicted
    const isOldestProcessed = await IdempotencyGuardian.isEventProcessed(
      businessId,
      consumerId,
      "evt_1"
    );
    expect(isOldestProcessed).toBe(false);

    // Checking if the newest (evt_1002) is still present
    const isNewestProcessed = await IdempotencyGuardian.isEventProcessed(
      businessId,
      consumerId,
      "evt_1002"
    );
    expect(isNewestProcessed).toBe(true);
  });

  it("should execute outbox writes inside transactions and distribute to local EventBus", async () => {
    const businessId = "biz_enterprise_1";
    const event = EventBus.createEvent({
      correlationId: "cid_outbox_test",
      actorId: "usr_auth_99",
      businessId,
      module: "WORKFORCE",
      aggregate: "EMPLOYEE",
      type: "EmployeeCreated",
      payload: { name: "John Doe" }
    });

    const workPayload = { success: true, employeeId: "emp_john_1" };
    const workMock = vi.fn(async (_tx) => workPayload);

    const publishSpy = vi.spyOn(EventBus, "publish");

    const response = await EnterpriseMessageQueue.getInstance().persistAndPublishWithTransaction(
      businessId,
      workMock,
      event
    );

    expect(response).toEqual(workPayload);
    expect(workMock).toHaveBeenCalledTimes(1);
    expect(publishSpy).toHaveBeenCalled();
  });
});
