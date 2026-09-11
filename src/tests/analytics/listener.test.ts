// src/tests/analytics/listener.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual<any>("firebase/firestore");
  return {
    ...actual,
    onSnapshot: vi.fn((q: any, onNext: any) => {
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

import { FirestoreRealtimeManager } from "../../services/firestore/FirestoreRealtimeManager";
import { EventBus } from "../../modules/runtime/EventBus";

describe("FirestoreRealtimeManager Deduplication & Lifecycle Test", () => {
  beforeEach(() => {
    FirestoreRealtimeManager.clearAll();
  });

  it("should prevent duplicate listener registration for the same key", () => {
    const dummyQuery = { type: "mock_query" } as any;
    let callCount = 0;
    const callback = (data: any) => {
      callCount++;
    };

    // First listener registration
    const unsub1 = FirestoreRealtimeManager.registerListener(
      "employees_test_id",
      "employees",
      dummyQuery,
      callback
    );

    // Second registration with the same key
    const unsub2 = FirestoreRealtimeManager.registerListener(
      "employees_test_id",
      "employees",
      dummyQuery,
      callback
    );

    const stats = FirestoreRealtimeManager.getListenerStats();
    
    // We expect the deduplication logic to increment ref count but not open a new Firestore listener
    expect(stats.duplicatesPrevented).toBeGreaterThanOrEqual(1);

    unsub1();
    unsub2();
  });

  it("should clean up listeners correctly when all consumers unsubscribe", () => {
    const dummyQuery = { type: "mock_query" } as any;
    const callback = () => {};

    const unsub = FirestoreRealtimeManager.registerListener(
      "tx_test_id",
      "transactions",
      dummyQuery,
      callback
    );

    unsub();
    
    const stats = FirestoreRealtimeManager.getListenerStats();
    expect(stats.cleanupsExecuted).toBeGreaterThanOrEqual(1);
    expect(FirestoreRealtimeManager.getActiveListenerCount()).toBe(0);
  });

  it("should keep active listeners alive even if safety timer fires when subscribers are active", () => {
    vi.useFakeTimers();
    try {
      const dummyQuery = { type: "mock_query" } as any;
      const callback = vi.fn();

      const unsub = FirestoreRealtimeManager.registerListener(
        "employees:biz_keepalive",
        "employees",
        dummyQuery,
        callback
      );

      expect(FirestoreRealtimeManager.getActiveListenerCount()).toBe(1);

      // Advance time past the 5-minute safety threshold
      vi.advanceTimersByTime(350000);

      // The listener should STILL be active because a subscriber is mounted!
      expect(FirestoreRealtimeManager.getActiveListenerCount()).toBe(1);

      unsub();
      expect(FirestoreRealtimeManager.getActiveListenerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("should renew all active listeners on EventBus Heartbeat", () => {
    const dummyQuery = { type: "mock_query" } as any;
    const callback = vi.fn();

    const unsub = FirestoreRealtimeManager.registerListener(
      "transactions:biz_heartbeat",
      "transactions",
      dummyQuery,
      callback
    );

    const initialEntry = FirestoreRealtimeManager.listenerRegistry.get("transactions:biz_heartbeat");
    expect(initialEntry).toBeDefined();
    const registeredTime = initialEntry!.lastActivity;

    // Simulate time passing
    initialEntry!.lastActivity = registeredTime - 10000;

    // Publish heartbeat on EventBus
    EventBus.publish(
      EventBus.createEvent({
        type: "Heartbeat",
        module: "RUNTIME",
        aggregate: "HEALTH",
        payload: { timestamp: Date.now() },
        businessId: "global"
      })
    );

    const updatedEntry = FirestoreRealtimeManager.listenerRegistry.get("transactions:biz_heartbeat");
    expect(updatedEntry!.lastActivity).toBeGreaterThan(registeredTime - 10000);

    unsub();
  });

  it("should clean up only listeners for a specific tenant on cleanupBusinessListeners", () => {
    const dummyQuery = { type: "mock_query" } as any;

    const unsub1 = FirestoreRealtimeManager.registerListener(
      "employees:biz_A",
      "employees",
      dummyQuery,
      () => {}
    );
    const unsub2 = FirestoreRealtimeManager.registerListener(
      "employees:biz_B",
      "employees",
      dummyQuery,
      () => {}
    );

    expect(FirestoreRealtimeManager.getActiveListenerCount()).toBe(2);

    FirestoreRealtimeManager.cleanupBusinessListeners("biz_A");

    expect(FirestoreRealtimeManager.getActiveListenerCount()).toBe(1);
    expect(FirestoreRealtimeManager.listenerRegistry.has("employees:biz_A")).toBe(false);
    expect(FirestoreRealtimeManager.listenerRegistry.has("employees:biz_B")).toBe(true);

    unsub2();
  });
});
