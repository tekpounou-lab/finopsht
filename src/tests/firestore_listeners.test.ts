import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    onSnapshot: vi.fn(() => () => {})
  };
});

import { FirestoreRealtimeManager } from '../services/firestore/FirestoreRealtimeManager';

beforeEach(() => {
  FirestoreRealtimeManager.clearAll();
});

it("should share the same listener for identical queries", () => {
  // Mock query object
  const mockQuery = { path: "ledger" } as any;
  const callback = vi.fn();
  
  const unsub1 = FirestoreRealtimeManager.registerListener("test_listener_id", "ledger", mockQuery, callback);
  const unsub2 = FirestoreRealtimeManager.registerListener("test_listener_id", "ledger", mockQuery, callback);
  
  expect(FirestoreRealtimeManager.getActiveListenerCount()).toBe(1);
  
  unsub1();
  unsub2();
  
  expect(FirestoreRealtimeManager.getActiveListenerCount()).toBe(0);
});
