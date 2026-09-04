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

describe("FirestoreRealtimeManager Deduplication & Lifecycle Test", () => {
  beforeEach(() => {
    // Clear status or reset states if needed
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
  });
});
