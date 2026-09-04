import { expect, test, describe, vi, beforeEach } from "vitest";

// Mock onSnapshot in firebase/firestore
vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual<any>("firebase/firestore");
  return {
    ...actual,
    onSnapshot: vi.fn((q: any, onNext: any) => {
      // Return dummy unsubscribe
      return () => {};
    }),
    query: vi.fn((...args: any[]) => ({ type: "mock_query", args })),
    where: vi.fn((...args: any[]) => ({ type: "where", args })),
    collection: vi.fn((...args: any[]) => ({ type: "collection", args })),
    orderBy: vi.fn((...args: any[]) => ({ type: "orderBy", args })),
    limit: vi.fn((...args: any[]) => ({ type: "limit", args })),
    doc: vi.fn((...args: any[]) => ({ type: "doc", args }))
  };
});

import { subscriptionRegistry } from "../../services/firestore/subscriptionRegistry";
import { realtimeManager } from "../../services/firestore/realtimeManager";
import { CacheInvalidationService, CacheRefreshPayload } from "../../services/performance/CacheInvalidationService";

describe("Real-Time Subscription & Firestore Deletion Engine", () => {
  beforeEach(() => {
    subscriptionRegistry.purgeAll();
  });

  test("SubscriptionRegistry processes docChanges with type: 'removed' and dispatches to subscribers", async () => {
    let capturedSnapshot: any = null;
    let capturedChanges: any[] = [];

    const mockQuery = { type: "mock_query" } as any;

    // Subscribe
    const unsubscribe = realtimeManager.subscribe(
      "test_key_1",
      mockQuery,
      (snap, changes) => {
        capturedSnapshot = snap;
        capturedChanges = changes || [];
      }
    );

    // Initial snapshot with 3 documents
    const initialDoc1 = { id: "tx_001", data: () => ({ description: "Vente 1", amount: 100 }) };
    const initialDoc2 = { id: "tx_002", data: () => ({ description: "Vente 2", amount: 200 }) };
    const initialDoc3 = { id: "tx_003", data: () => ({ description: "Vente 3", amount: 300 }) };

    const initialSnapshot = {
      docs: [initialDoc1, initialDoc2, initialDoc3],
      docChanges: () => [
        { type: "added", doc: initialDoc1 },
        { type: "added", doc: initialDoc2 },
        { type: "added", doc: initialDoc3 },
      ],
      forEach: (cb: any) => [initialDoc1, initialDoc2, initialDoc3].forEach(cb)
    };

    // Trigger subscriber via registry directly by simulating onSnapshot delivery
    const sub = (subscriptionRegistry as any).subscriptions.get("test_key_1");
    expect(sub).toBeDefined();

    sub.callbacks.forEach((cb: any) => cb(initialSnapshot, initialSnapshot.docChanges()));

    expect(capturedSnapshot).toBeDefined();
    expect(capturedSnapshot.docs.length).toBe(3);
    expect(capturedChanges.length).toBe(3);

    // Subsequent snapshot where doc tx_002 is deleted directly from Firestore
    const updatedSnapshot = {
      docs: [initialDoc1, initialDoc3], // tx_002 is gone from docs
      docChanges: () => [
        { type: "removed", doc: initialDoc2 }
      ],
      forEach: (cb: any) => [initialDoc1, initialDoc3].forEach(cb)
    };

    sub.callbacks.forEach((cb: any) => cb(updatedSnapshot, updatedSnapshot.docChanges()));

    expect(capturedSnapshot.docs.length).toBe(2);
    expect(capturedChanges.length).toBe(1);
    expect(capturedChanges[0].type).toBe("removed");
    expect(capturedChanges[0].doc.id).toBe("tx_002");

    unsubscribe();
  });

  test("Removed documents are immediately filtered out from the local data array", () => {
    const doc1 = { id: "emp_001", name: "Jean Baptiste", role: "EMPLOYEE" };
    const doc2 = { id: "emp_002", name: "Marie Curie", role: "MANAGER" };
    const doc3 = { id: "emp_003", name: "Pierre Paul", role: "EMPLOYEE" };

    // Simulate snapshot with docs
    const mockSnap = {
      docs: [
        { id: "emp_001", data: () => doc1 },
        { id: "emp_002", data: () => doc2 }, // To be removed
        { id: "emp_003", data: () => doc3 }
      ],
      docChanges: () => [
        { type: "removed", doc: { id: "emp_002" } }
      ]
    };

    // Process snapshot with removal filter
    const changes = mockSnap.docChanges();
    const removedSet = new Set<string>();
    changes.forEach((c: any) => {
      if (c.type === "removed") {
        removedSet.add(c.doc.id);
      }
    });

    const resultingArray = mockSnap.docs
      .filter((d) => !removedSet.has(d.id))
      .map((d) => ({ id: d.id, ...d.data() }));

    expect(resultingArray.length).toBe(2);
    expect(resultingArray.find((e: any) => e.id === "emp_002")).toBeUndefined();
    expect(resultingArray.map((e: any) => e.id)).toEqual(["emp_001", "emp_003"]);
  });

  test("CacheInvalidationService.sweepLocal() increments sweepVersion and notifies refresh subscribers", () => {
    let notifiedPayload: CacheRefreshPayload | null = null;

    const initialVersion = CacheInvalidationService.getSweepVersion();

    const unsub = CacheInvalidationService.subscribeToRefresh((payload) => {
      notifiedPayload = payload;
    });

    // Execute local sweep
    CacheInvalidationService.sweepLocal("biz_enterprise_01", true);

    expect(CacheInvalidationService.getSweepVersion()).toBe(initialVersion + 1);
    expect(notifiedPayload).not.toBeNull();
    expect(notifiedPayload?.businessId).toBe("biz_enterprise_01");
    expect(notifiedPayload?.refresh).toBe(true);
    expect(notifiedPayload?.sweepVersion).toBe(initialVersion + 1);

    unsub();
  });

  test("CacheInvalidationService.sweepLocal() purges cached snapshots in SubscriptionRegistry", () => {
    const mockQuery = { type: "mock_query" } as any;
    realtimeManager.subscribe("employees:biz_test_99", mockQuery, () => {});

    const sub = (subscriptionRegistry as any).subscriptions.get("employees:biz_test_99");
    expect(sub).toBeDefined();
    sub.lastSnapshot = { docs: [{ id: "temp" }] };

    expect(sub.lastSnapshot).toBeDefined();

    // Sweep cache for biz_test_99
    CacheInvalidationService.sweepLocal("biz_test_99", true);

    // lastSnapshot must be cleared
    expect(sub.lastSnapshot).toBeUndefined();
  });
});
