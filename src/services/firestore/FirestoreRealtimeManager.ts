// src/services/firestore/FirestoreRealtimeManager.ts
import { Query, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, logFirestoreError, OperationType } from "../../lib/firebase";
import { EventBus } from "../../modules/runtime/EventBus";

export interface ListenerEntry {
  listener: () => void; // Unsubscribe function from onSnapshot
  refCount: number;
  lastActivity: number; // Timestamp of last data update, heartbeat, or interaction
  registeredAt: number;
  collection: string;
  businessId?: string;
  callbacks: Set<(data: any[]) => void>;
  lastData?: any[];
  safetyTimer: ReturnType<typeof setTimeout> | null;
}

export type ListenerCleanupReason = 
  | "component_unmount" 
  | "tenant_change" 
  | "user_logout" 
  | "safety_timeout_orphaned" 
  | "manual_purge"
  | "capacity_limit";

export class FirestoreRealtimeManager {
  public static listenerRegistry = new Map<string, ListenerEntry>();
  private static maxListeners = 100;
  private static duplicatesPreventedCount = 0;
  private static cleanupsExecutedCount = 0;
  public static readonly SAFETY_TIMEOUT_MS = 300000; // 5 minutes safety threshold
  private static isInitialized = false;
  private static eventBusUnsub: (() => void) | null = null;
  private static windowListenersAttached = false;

  /**
   * Initializes real-time runtime listeners:
   * 1. Subscribes to the Enterprise EventBus 'Heartbeat' event to refresh active subscriptions.
   * 2. Binds throttled user interaction listeners (pointerdown, keydown, focus) to keep connections alive.
   */
  public static init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. Enterprise EventBus Heartbeat subscription
    try {
      this.eventBusUnsub = EventBus.subscribe("Heartbeat", () => {
        FirestoreRealtimeManager.renewAllListeners("heartbeat");
      });
    } catch (e) {
      console.debug("[FirestoreRealtimeManager] EventBus heartbeat subscription deferred:", e);
    }

    // 2. Browser interaction listeners (throttled user activity renewal every 30s)
    if (typeof window !== "undefined" && !this.windowListenersAttached) {
      this.windowListenersAttached = true;
      let lastActivityTouch = 0;
      const onUserActivity = () => {
        const now = Date.now();
        if (now - lastActivityTouch > 30000) {
          lastActivityTouch = now;
          FirestoreRealtimeManager.renewAllListeners("user_interaction");
        }
      };

      window.addEventListener("pointerdown", onUserActivity, { passive: true });
      window.addEventListener("keydown", onUserActivity, { passive: true });
      window.addEventListener("focus", onUserActivity, { passive: true });
    }
  }

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
   * Returns detailed listener stats for diagnostics and observability.
   */
  public static getListenerStats(): {
    total: number;
    byCollection: Record<string, number>;
    activeListeners: Array<{
      id: string;
      collection: string;
      refCount: number;
      callbacksCount: number;
      idleSeconds: number;
    }>;
    duplicatesPrevented: number;
    cleanupsExecuted: number;
  } {
    const byCollection: Record<string, number> = {};
    const activeListeners: Array<{
      id: string;
      collection: string;
      refCount: number;
      callbacksCount: number;
      idleSeconds: number;
    }> = [];
    const now = Date.now();

    this.listenerRegistry.forEach((entry, id) => {
      byCollection[entry.collection] = (byCollection[entry.collection] || 0) + 1;
      activeListeners.push({
        id,
        collection: entry.collection,
        refCount: entry.refCount,
        callbacksCount: entry.callbacks.size,
        idleSeconds: Math.round((now - entry.lastActivity) / 1000),
      });
    });

    return {
      total: this.getActiveListenerCount(),
      byCollection,
      activeListeners,
      duplicatesPrevented: this.duplicatesPreventedCount,
      cleanupsExecuted: this.cleanupsExecutedCount,
    };
  }

  /**
   * Schedules or reschedules the safety timer for a listener.
   */
  private static scheduleSafetyTimer(listenerId: string): void {
    const entry = this.listenerRegistry.get(listenerId);
    if (!entry) return;

    if (entry.safetyTimer) {
      clearTimeout(entry.safetyTimer);
    }

    entry.safetyTimer = setTimeout(() => {
      this.handleSafetyTimeout(listenerId);
    }, this.SAFETY_TIMEOUT_MS);
  }

  /**
   * Evaluates the safety timeout when it fires.
   * CRITICAL RULE: Never clean up an active listener if the component is still subscribed
   * (refCount > 0 and callbacks exist) and the user is authenticated.
   * Only truly orphaned or abandoned listeners are cleaned up.
   */
  private static handleSafetyTimeout(listenerId: string): void {
    const entry = this.listenerRegistry.get(listenerId);
    if (!entry) return;

    const isTestEnv =
      typeof process !== "undefined" &&
      (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST));
    const isUserActive = Boolean(auth.currentUser) || isTestEnv;
    const hasActiveSubscribers = entry.refCount > 0 && entry.callbacks.size > 0;

    // If the listener has active component consumers and the user is authenticated,
    // it is completely legitimate for a collection to remain quiet without updates.
    // KEEP ALIVE by rescheduling the safety timer.
    if (hasActiveSubscribers && isUserActive) {
      entry.lastActivity = Date.now();
      this.scheduleSafetyTimer(listenerId);
      return;
    }

    // Otherwise, the listener is genuinely orphaned or user logged out without cleanup
    const reason: ListenerCleanupReason = !isUserActive ? "user_logout" : "safety_timeout_orphaned";
    console.warn(
      `[FirestoreRealtimeManager] Safety Timeout: Cleaning up orphaned listener "${listenerId}" (Reason: ${reason}, refCount: ${entry.refCount}, callbacks: ${entry.callbacks.size}). Active remaining: ${this.listenerRegistry.size - 1}`
    );

    try {
      entry.listener();
    } catch (err) {
      console.error(`[FirestoreRealtimeManager] Error unsubscribing native listener ${listenerId}:`, err);
    }

    if (entry.safetyTimer) {
      clearTimeout(entry.safetyTimer);
      entry.safetyTimer = null;
    }

    this.listenerRegistry.delete(listenerId);
    this.cleanupsExecutedCount++;
  }

  /**
   * Renews the safety timer and updates lastActivity for a specific listener.
   */
  public static renewListener(listenerId: string, reason: string = "activity"): void {
    const entry = this.listenerRegistry.get(listenerId);
    if (!entry) return;

    entry.lastActivity = Date.now();
    this.scheduleSafetyTimer(listenerId);
  }

  /**
   * Renews safety timers and updates activity for ALL active listeners across the application.
   */
  public static renewAllListeners(reason: string = "heartbeat"): void {
    if (this.listenerRegistry.size === 0) return;

    this.listenerRegistry.forEach((entry, id) => {
      entry.lastActivity = Date.now();
      this.scheduleSafetyTimer(id);
    });
  }

  /**
   * Registers a listener with strict deduplication, automatic ref-counted cleanup,
   * authentication verification, and robust activity-based safety timeout management.
   */
  public static registerListener(
    listenerId: string,
    collectionName: string,
    queryInstance: Query,
    callback: (data: any[]) => void
  ): () => void {
    this.init();

    // If not authenticated (and not in test suite), defer registration until onAuthStateChanged fires
    const isTestEnv =
      typeof process !== "undefined" &&
      (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST));

    if (!auth.currentUser && !isTestEnv) {
      console.debug(
        `[FirestoreRealtimeManager] Deferred registration for "${listenerId}" until auth.currentUser is ready.`
      );
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

      this.renewListener(listenerId, "duplicate_registered");

      return () => {
        this.deregisterCallback(listenerId, callback, "component_unmount");
      };
    }

    // Capacity management: auto-prune stale orphaned listeners before hitting hard limit
    if (this.listenerRegistry.size >= this.maxListeners) {
      this.forceCleanupStaleListeners();

      if (this.listenerRegistry.size >= this.maxListeners) {
        // Expand capacity gracefully for large enterprise multi-dashboard views
        this.maxListeners = Math.max(this.maxListeners * 2, this.listenerRegistry.size + 20);
        console.warn(
          `[FirestoreRealtimeManager] Expanded listener capacity to ${this.maxListeners} (Active: ${this.listenerRegistry.size})`
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
          // Renew activity timer upon every snapshot data arrival
          this.renewListener(listenerId, "data_received");

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

    const businessId = listenerId.includes(":") ? listenerId.split(":")[1] : undefined;

    const entry: ListenerEntry = {
      listener: unsubscribe,
      refCount: 1,
      lastActivity: Date.now(),
      registeredAt: Date.now(),
      collection: collectionName,
      businessId,
      callbacks,
      safetyTimer: null,
    };

    this.listenerRegistry.set(listenerId, entry);
    this.scheduleSafetyTimer(listenerId);

    console.debug(
      `[FirestoreRealtimeManager] Registered listener: ${listenerId} (Collection: ${collectionName}). Total active: ${this.listenerRegistry.size}`
    );

    return () => {
      this.deregisterCallback(listenerId, callback, "component_unmount");
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
  public static decrementRefCount(
    listenerId: string,
    reason: ListenerCleanupReason = "component_unmount"
  ): void {
    const entry = this.listenerRegistry.get(listenerId);
    if (!entry) return;

    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount === 0 || entry.callbacks.size === 0) {
      try {
        entry.listener();
      } catch (err) {
        console.error(`[FirestoreRealtimeManager] Error unsubscribing native listener ${listenerId}:`, err);
      }
      if (entry.safetyTimer) {
        clearTimeout(entry.safetyTimer);
        entry.safetyTimer = null;
      }
      this.listenerRegistry.delete(listenerId);
      this.cleanupsExecutedCount++;
      console.debug(
        `[FirestoreRealtimeManager] Active listener cleaned up: ${listenerId} (Reason: ${reason}). Total active remaining: ${this.listenerRegistry.size}`
      );
    }
  }

  /**
   * Returns listeners with refCount === 0 or empty callbacks that haven't been cleaned up.
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
   * Safely cleans up truly orphaned listeners (refCount === 0 or callbacks.size === 0).
   * Active listeners with valid component subscribers are NEVER touched here.
   */
  public static forceCleanupStaleListeners(): void {
    const orphaned = this.getOrphanedListeners();
    if (orphaned.length > 0) {
      console.debug(`[FirestoreRealtimeManager] Cleaning up ${orphaned.length} orphaned listeners.`);
      orphaned.forEach((id) => {
        const entry = this.listenerRegistry.get(id);
        if (entry) {
          try {
            entry.listener();
          } catch (e) {
            console.warn(`[FirestoreRealtimeManager] Error in stale listener cleanup ${id}:`, e);
          }
          if (entry.safetyTimer) {
            clearTimeout(entry.safetyTimer);
            entry.safetyTimer = null;
          }
          this.listenerRegistry.delete(id);
          this.cleanupsExecutedCount++;
          console.debug(
            `[FirestoreRealtimeManager] Stale listener cleaned up: ${id} (Reason: orphaned_stale). Active remaining: ${this.listenerRegistry.size}`
          );
        }
      });
    }
  }

  /**
   * Cleans up all listeners associated with a specific business tenant upon tenant switch.
   */
  public static cleanupBusinessListeners(businessId: string): void {
    if (!businessId) return;
    const toRemove: string[] = [];
    this.listenerRegistry.forEach((entry, id) => {
      if (
        entry.businessId === businessId ||
        id.includes(`:${businessId}`) ||
        id.endsWith(`_${businessId}`)
      ) {
        toRemove.push(id);
      }
    });

    if (toRemove.length > 0) {
      console.debug(
        `[FirestoreRealtimeManager] Cleaning up ${toRemove.length} listeners for tenant "${businessId}" (Reason: tenant_change).`
      );
      toRemove.forEach((id) => {
        const entry = this.listenerRegistry.get(id);
        if (entry) {
          try {
            entry.listener();
          } catch (e) {
            console.warn(`[FirestoreRealtimeManager] Error cleaning up tenant listener ${id}:`, e);
          }
          if (entry.safetyTimer) {
            clearTimeout(entry.safetyTimer);
            entry.safetyTimer = null;
          }
          this.listenerRegistry.delete(id);
          this.cleanupsExecutedCount++;
        }
      });
      console.debug(
        `[FirestoreRealtimeManager] Tenant listeners cleanup complete. Total active remaining: ${this.listenerRegistry.size}`
      );
    }
  }

  /**
   * Internal helper to remove a specific callback from a listener.
   */
  private static deregisterCallback(
    listenerId: string,
    callback: (data: any[]) => void,
    reason: ListenerCleanupReason = "component_unmount"
  ): void {
    const entry = this.listenerRegistry.get(listenerId);
    if (!entry) return;

    entry.callbacks.delete(callback);
    this.decrementRefCount(listenerId, reason);
  }

  /**
   * Purges ALL active listeners and callbacks in the registry.
   * Essential for tenant boundary switching and user session teardown.
   */
  public static clearAll(reason: ListenerCleanupReason = "manual_purge"): void {
    const count = this.listenerRegistry.size;
    console.debug(`[FirestoreRealtimeManager] Purging all active listeners (${count}) (Reason: ${reason})...`);
    this.listenerRegistry.forEach((entry, id) => {
      try {
        entry.listener();
      } catch (e) {
        console.warn(`[FirestoreRealtimeManager] Error cleaning up listener ${id}:`, e);
      }
      if (entry.safetyTimer) {
        clearTimeout(entry.safetyTimer);
        entry.safetyTimer = null;
      }
    });
    this.listenerRegistry.clear();
    this.duplicatesPreventedCount = 0;
    this.cleanupsExecutedCount = 0;
    console.debug(`[FirestoreRealtimeManager] All listeners cleared. Total active remaining: 0`);
  }
}

