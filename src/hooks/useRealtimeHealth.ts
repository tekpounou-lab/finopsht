import { useState, useEffect } from 'react';
import { getFirestoreHealth, subscribeToFirestoreHealth } from '../services/health/firestoreHealth';
import { realtimeManager } from '../services/firestore/realtimeManager';

interface RealtimeHealth {
  isRealtimeConnected: boolean;
  activeListeners: number;
  syncLatency: number;
  lastSyncAt: Date | null;
  offlineQueueSize: number;
}

export function useRealtimeHealth(): RealtimeHealth {
  const [health, setHealth] = useState<RealtimeHealth>(() => {
    const raw = getFirestoreHealth();
    return {
      isRealtimeConnected: raw.status === "CONNECTED",
      activeListeners: realtimeManager.getDiagnostics().activeListeners,
      syncLatency: raw.latency,
      lastSyncAt: new Date(),
      offlineQueueSize: 0
    };
  });
  
  useEffect(() => {
    const unsubscribe = subscribeToFirestoreHealth((rawState) => {
      setHealth({
        isRealtimeConnected: rawState.status === "CONNECTED",
        activeListeners: realtimeManager.getDiagnostics().activeListeners,
        syncLatency: rawState.latency,
        lastSyncAt: new Date(),
        offlineQueueSize: rawState.failedStreams
      });
    });
    return () => unsubscribe();
  }, []);
  
  return health;
}
