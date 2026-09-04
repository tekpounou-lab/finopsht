import { db } from "../../lib/firebase";
import { onSnapshotsInSync, doc, getDoc } from "firebase/firestore";

export interface FirestoreHealthState {
  status: "CONNECTED" | "DISCONNECTED";
  listeners: number;
  reconnects: number;
  failedStreams: number;
  latency: number; // in ms
}

let healthState: FirestoreHealthState = {
  status: "CONNECTED",
  listeners: 0,
  reconnects: 0,
  failedStreams: 0,
  latency: 50,
};

const listenersCallbacks = new Set<(state: FirestoreHealthState) => void>();

export function getFirestoreHealth(): FirestoreHealthState {
  return { ...healthState };
}

export function subscribeToFirestoreHealth(cb: (state: FirestoreHealthState) => void): () => void {
  listenersCallbacks.add(cb);
  cb({ ...healthState });
  return () => {
    listenersCallbacks.delete(cb);
  };
}

function notifyCallbacks() {
  listenersCallbacks.forEach((cb) => cb({ ...healthState }));
}

export function updateHealthListeners(count: number) {
  healthState.listeners = count;
  notifyCallbacks();
}

export function incrementReconnects() {
  healthState.reconnects++;
  notifyCallbacks();
}

export function incrementFailedStreams() {
  healthState.failedStreams++;
  notifyCallbacks();
}

// Latency tracker & live status checking with timeout protection
let isChecking = false;
export async function checkFirestoreLatency() {
  if (isChecking || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  isChecking = true;
  const start = performance.now();
  try {
    // Perform a lightweight metadata-only read with a 5-second timeout safeguard
    const testRef = doc(db, "_health_heartbeat_", "ping");
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Firestore latency ping timeout")), 5000)
    );
    await Promise.race([getDoc(testRef), timeoutPromise]);
    const end = performance.now();
    
    const oldStatus = healthState.status;
    healthState.status = "CONNECTED";
    healthState.latency = Math.round(end - start);
    
    if (oldStatus === "DISCONNECTED") {
      healthState.reconnects++;
    }
  } catch (error) {
    // Soft fallback without polluting console
    healthState.status = "DISCONNECTED";
    healthState.failedStreams++;
  } finally {
    isChecking = false;
    notifyCallbacks();
  }
}

// Set up periodic connection checks (every 30 seconds, deferred on start)
if (typeof window !== "undefined") {
  setTimeout(() => {
    setInterval(() => {
      checkFirestoreLatency();
    }, 30000);
  }, 5000);

  // Use online/offline browser events as instant signals
  window.addEventListener("online", () => {
    healthState.status = "CONNECTED";
    healthState.reconnects++;
    notifyCallbacks();
    checkFirestoreLatency();
  });

  window.addEventListener("offline", () => {
    healthState.status = "DISCONNECTED";
    notifyCallbacks();
  });

  // Track Firestore sync events to confirm server syncing
  try {
    onSnapshotsInSync(db, () => {
      // Every time local changes sync with server
      if (healthState.status === "DISCONNECTED") {
        healthState.status = "CONNECTED";
        healthState.reconnects++;
      }
      notifyCallbacks();
    });
  } catch (err) {
    // Gracefully ignore sync hook error
  }
}
