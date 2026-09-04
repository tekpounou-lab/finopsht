// src/services/firestore/FirestoreRealtimeManager.ts
import { Query, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, logFirestoreError, OperationType } from "../../lib/firebase";

export interface ListenerEntry {
  listener: () => void; // Unsubscribe function from onSnapshot
  refCount: number;
  lastActivity: number; // Timestamp of last data update or creation
  collection: string;
  callbacks: Set<(data: any[]) => void>;
  lastData?: any[];
  safetyTimer: ReturnType<typeof setTimeout>; // Added
}

export class FirestoreRealtimeManager {
  public static listenerRegistry = new Map<string, ListenerEntry>();
  private static maxListeners = 50;
  private static duplicatesPreventedCount = 0;
  private static cleanupsExecutedCount = 0;

  /**
   * Enforces a hard limit on maximum concurrent active listeners.
   */
  public static setMaxListeners(max: number): void {
    this.maxListeners = max;
    console.debug(`[FirestoreRealtimeManager] Max listeners limit updated to ${max}`);
  }

  /**
   * Returns current active listener count.
   */
  public static getActiveListenerCount(): number {
    return this.listenerRegistry.size;
  }

  /**
   * Returns listener stats for diagnostics and observability dashboards.
   */
  public static getListenerStats(): {
    total: number;
    byCollection: Record<string, number>;
    duplicatesPrevented: number;
    cleanupsExecuted: number;
  } {
    const byCollection: Record<string, number> = {};
    this.listenerRegistry.forEach((entry) => {
      byCollection[entry.collection] = (byCollection[entry.collection] || 0) + 1;
    });

    return {
      total: this.getActiveListenerCount(),
      byCollection,
      duplicatesPrevented: this.duplicatesPreventedCount,
      cleanupsExecuted: this.cleanupsExecutedCount,
    };
  }

  /**
   * Registers a listener with strict deduplication, automatic ref-counted cleanup,
   * and authentication verification to prevent premature permission errors.
   */
  public static registerListener(
    listenerId: string,
    collectionName: string,
    queryInstance: Query,
    callback: (data: any[]) => void
  ): () => void {
    // If not authenticated (and not in test suite), defer registration until onAuthStateChanged fires
    const isTestEnv = typeof process !== "undefined" && (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST));
    if (!auth.currentUser && !isTestEnv) {
      console.debug(`[FirestoreRealtimeManager] Deferred registration for "${listenerId}" until auth.currentUser is ready.`);
      let isCancelled = false;
      let innerUnsub: (() => void) | null = null;

      const authUnsub = onAuthStateChanged(auth, (user) => {
        if (user && !isCancelled) {
          innerUnsub = FirestoreRealtimeManager.registerListener(
            listenerId,
            collectionName,
            queryInstance,
            callback
          );
        }
      });

      return () => {
        isCancelled = true;
        authUnsub();
        if (innerUnsub) {
          innerUnsub();
        }
      };
    }

    const existing = this.listenerRegistry.get(listenerId);

    if (existing) {
      this.duplicatesPreventedCount++;
      this.incrementRefCount(listenerId);
      existing.callbacks.add(callback);

      // Immediately trigger callback with cached data if available
      if (existing.lastData) {
        const cachedData = existing.lastData;
        Promise.resolve().then(() => {
          if (existing.callbacks.has(callback)) {
            callback(cachedData);
          }
        });
      }

      existing.lastActivity = Date.now();

      return () => {
        this.deregisterCallback(listenerId, callback);
      };
    }

    // Hard limit enforcement
    if (this.listenerRegistry.size >= this.maxListeners) {
      console.warn(`[FirestoreRealtimeManager] Warning: Approaching active listeners threshold! Active: ${this.listenerRegistry.size}, Max: ${this.maxListeners}`);
      this.forceCleanupStaleListeners();
      
      if (this.listenerRegistry.size >= this.maxListeners) {
        throw new Error(
          `[FirestoreRealtimeManager] Cannot register listener: Max active listeners limit (${this.maxListeners}) reached.`
        );
      }
    }

    const callbacks = new Set<(data: any[]) => void>([callback]);
    
    // Create native onSnapshot listener
    const unsubscribe = onSnapshot(
      queryInstance,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const entry = this.listenerRegistry.get(listenerId);
        if (entry) {
          entry.lastData = data;
          entry.lastActivity = Date.now();
          entry.callbacks.forEach((cb) => {
            try {
              cb(data);
            } catch (err) {
              console.error(`[FirestoreRealtimeManager] Error in listener callback for ${listenerId}:`, err);
            }
          });
        }
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, collectionName);
      }
    );

    const entry: ListenerEntry = {
      listener: unsubscribe,
      refCount: 1,
      lastActivity: Date.now(),
      collection: collectionName,
      callbacks,
      safetyTimer: setTimeout(() => {
        console.warn(`[FirestoreRealtimeManager] Safety Timeout: Forcing cleanup of listener ${listenerId}`);
        this.deregisterCallback(listenerId, () => {}); // Force decrement/cleanup
      }, 300000)
    };

    this.listenerRegistry.set(listenerId, entry);

    return () => {
      this.deregisterCallback(listenerId, callback);
    };
  }

  /**
   * Helper to increment reference count of a listener.
   */
  public static incrementRefCount(listenerId: string): void {
    const entry = this.listenerRegistry.get(listenerId);
    if (entry) {
      entry.refCount++;
    }
  }

  /**
   * Decrements ref count, automatically unsubscribing the Firestore stream when refCount hits 0.
   */
  public static decrementRefCount(listenerId: string): void {
    const entry = this.listenerRegistry.get(listenerId);
    if (!entry) return;

    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount === 0) {
      try {
        entry.listener();
      } catch (err) {
        console.error(`[FirestoreRealtimeManager] Error unsubscribing native listener ${listenerId}:`, err);
      }
      clearTimeout(entry.safetyTimer);
      this.listenerRegistry.delete(listenerId);
      this.cleanupsExecutedCount++;
      console.debug(`[FirestoreRealtimeManager] Active listener cleaned up: ${listenerId}. Total active remaining: ${this.listenerRegistry.size}`);
    }
  }

  /**
   * Returns listeners with refCount === 0 that haven't been cleaned up.
   */
  public static getOrphanedListeners(): string[] {
    const orphaned: string[] = [];
    this.listenerRegistry.forEach((entry, key) => {
      if (entry.refCount === 0 || entry.callbacks.size === 0) {
        orphaned.push(key);
      }
    });
    return orphaned;
  }

  /**
   * Removes listeners that have not received or requested updates in over 60 seconds and have low activity.
   */
  public static forceCleanupStaleListeners(): void {
    const threshold = 60000; // 60 seconds
    const now = Date.now();
    const staleIds: string[] = [];

    this.listenerRegistry.forEach((entry, id) => {
      if (now - entry.lastActivity > threshold && entry.refCount <= 1) {
        staleIds.push(id);
      }
    });

    if (staleIds.length > 0) {
      console.debug(`[FirestoreRealtimeManager] Forcing cleanup of ${staleIds.length} stale listeners.`);
      staleIds.forEach((id) => {
        const entry = this.listenerRegistry.get(id);
        if (entry) {
          try {
            entry.listener();
          } catch (e) {}
          this.listenerRegistry.delete(id);
          this.cleanupsExecutedCount++;
        }
      });
    }

    // Also clean up any orphaned listeners
    const orphaned = this.getOrphanedListeners();
    orphaned.forEach((id) => {
      const entry = this.listenerRegistry.get(id);
      if (entry) {
        try {
          entry.listener();
        } catch (e) {}
        this.listenerRegistry.delete(id);
        this.cleanupsExecutedCount++;
      }
    });
  }

  /**
   * Internal helper to remove a specific callback from a listener.
   */
  private static deregisterCallback(listenerId: string, callback: (data: any[]) => void): void {
    const entry = this.listenerRegistry.get(listenerId);
    if (!entry) return;

    entry.callbacks.delete(callback);
    this.decrementRefCount(listenerId);
  }

  /**
   * Purges ALL active listeners and callbacks in the registry.
   * Essential for tenant boundary switching and user session teardown.
   */
  public static clearAll(): void {
    console.debug(`[FirestoreRealtimeManager] Purging all active listeners (${this.listenerRegistry.size})...`);
    this.listenerRegistry.forEach((entry, id) => {
      try {
        entry.listener();
      } catch (e) {
        console.warn(`[FirestoreRealtimeManager] Error cleaning up listener ${id}:`, e);
      }
    });
    this.listenerRegistry.clear();
    this.duplicatesPreventedCount = 0;
    this.cleanupsExecutedCount = 0;
  }
}
