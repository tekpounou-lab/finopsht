import { Query, DocumentReference, onSnapshot } from "firebase/firestore";
import { updateHealthListeners } from "../health/firestoreHealth";
import { PerformanceService } from "../performance/PerformanceService";
import { isRetriableFirestoreError, calculateBackoffDelay } from "./firestoreRetry";
import { LogSanitizer } from "../security/LogSanitizer";
import { logger } from "../observability/Logger";
import { RateLimiter } from "../security/RateLimiter";

interface SubscriptionState {
  unsubscribe: () => void;
  callbacks: Set<(snap: any, changes?: any[]) => void>;
  errorCallbacks: Set<(err: any) => void>;
  lastSnapshot?: any;
  perfUnsub?: () => void;
  retryAttempt: number;
  retryTimeout: ReturnType<typeof setTimeout> | null;
  isClosed: boolean;
  createdAt: number;
  lastAccessAt: number;
}

class SubscriptionRegistry {
  private subscriptions = new Map<string, SubscriptionState>();
  private activeListenersCount = 0;
  private duplicatesPreventedCount = 0;
  private cleanupsExecutedCount = 0;
  private MAX_ACTIVE_LISTENERS = 20;
  private readonly rateLimiter = RateLimiter.get("firestore_subscription_rate", 300, 60000);

  public setMaxActiveListeners(max: number): void {
    if (max > 0) {
      this.MAX_ACTIVE_LISTENERS = max;
      logger.info(`[FirestoreSubscriptionRegistry] Max active listeners threshold updated to ${max}`);
    }
  }

  private attachNativeListener(
    key: string,
    query: Query | DocumentReference,
    state: SubscriptionState
  ): () => void {
    if (state.isClosed || state.callbacks.size === 0) {
      return () => {};
    }

    if (!this.rateLimiter.tryAcquire()) {
      logger.warn(`[FirestoreSubscriptionRegistry] Rate limit reached for new stream connections on "${LogSanitizer.sanitizeString(key)}"`);
    }

    let nativeUnsub: () => void = () => {};

    try {
      nativeUnsub = onSnapshot(
        query as any,
        (snapshot: any) => {
          if (state.isClosed) return;

          state.lastAccessAt = Date.now();

          // If we recovered from a retry, log and reset backoff counter
          if (state.retryAttempt > 0) {
            logger.info(`[FirestoreSubscriptionRegistry] Reconnection successful for stream "${LogSanitizer.sanitizeString(key)}" (recovered after attempt ${state.retryAttempt}).`);
          }
          state.retryAttempt = 0;
          if (state.retryTimeout) {
            clearTimeout(state.retryTimeout);
            state.retryTimeout = null;
          }

          state.lastSnapshot = snapshot;
          const changes = typeof snapshot.docChanges === "function" ? snapshot.docChanges() : [];
          if (changes.length > 0) {
            const removedChanges = changes.filter((c: any) => c.type === "removed");
            if (removedChanges.length > 0) {
              logger.debug(`[FirestoreSubscriptionRegistry] Detected ${removedChanges.length} REMOVED document(s) in snapshot for key "${LogSanitizer.sanitizeString(key)}"`);
            }
          }

          state.callbacks.forEach((cb) => {
            try {
              cb(snapshot, changes);
            } catch (e) {
              logger.error("[FirestoreSubscriptionRegistry] Error in onNext callback:", e);
            }
          });
        },
        (error: any) => {
          if (state.isClosed) return;

          // Check if error is transient / overload
          if (isRetriableFirestoreError(error)) {
            const MAX_RETRIES = 6;
            if (state.retryAttempt < MAX_RETRIES) {
              state.retryAttempt++;
              const delay = calculateBackoffDelay(state.retryAttempt, 400, 8000);
              logger.warn(
                `[FirestoreSubscriptionRegistry] Overload/Transient issue on stream "${LogSanitizer.sanitizeString(key)}". Reconnecting with backoff in ${delay}ms (attempt ${state.retryAttempt}/${MAX_RETRIES}). Error:`,
                error?.message || error
              );

              // Clean up previous native listener handle safely
              try {
                if (typeof nativeUnsub === "function") {
                  nativeUnsub();
                }
              } catch (_) {}

              // Schedule backoff reconnect
              if (state.retryTimeout) {
                clearTimeout(state.retryTimeout);
              }
              state.retryTimeout = setTimeout(() => {
                if (!state.isClosed && state.callbacks.size > 0) {
                  state.unsubscribe = this.attachNativeListener(key, query, state);
                }
              }, delay);

              // Keep last cached snapshot available to avoid blanking UI during transient reconnect
              return;
            }
          }

          // Non-retriable or retries exhausted
          logger.warn(`[FirestoreSubscriptionRegistry] Stream notice on key: ${LogSanitizer.sanitizeString(key)}`, error);
          state.errorCallbacks.forEach((cb) => {
            try {
              cb(error);
            } catch (e) {
              logger.error("[FirestoreSubscriptionRegistry] Error in onError callback:", e);
            }
          });
        }
      );
    } catch (createErr) {
      logger.warn(`[FirestoreSubscriptionRegistry] Warning initializing onSnapshot for key "${LogSanitizer.sanitizeString(key)}":`, createErr);
    }

    return () => {
      try {
        if (typeof nativeUnsub === "function") {
          nativeUnsub();
        }
      } catch (unsubErr) {
        logger.warn(`[FirestoreSubscriptionRegistry] Safe unsubscribe caught error on key "${LogSanitizer.sanitizeString(key)}":`, unsubErr);
      }
    };
  }

  public subscribe(
    key: string,
    query: Query | DocumentReference,
    onNext: (snap: any, changes?: any[]) => void,
    onError?: (err: any) => void
  ): () => void {
    let sub = this.subscriptions.get(key);

    if (sub) {
      // Duplicate subscription prevented!
      this.duplicatesPreventedCount++;
      sub.lastAccessAt = Date.now();
      sub.callbacks.add(onNext);
      if (onError) {
        sub.errorCallbacks.add(onError);
      }
      
      // If we already have a cached snapshot, deliver it immediately but asynchronously
      if (sub.lastSnapshot) {
        const snapshot = sub.lastSnapshot;
        Promise.resolve().then(() => {
          // Check if the callback is still registered
          if (sub?.callbacks.has(onNext)) {
            onNext(snapshot);
          }
        });
      }
      
      this.printDiagnostics();
      
      return () => {
        this.unsubscribeClient(key, onNext, onError);
      };
    }

    // Check active listener limits and auto-prune oldest if needed
    if (this.subscriptions.size >= this.MAX_ACTIVE_LISTENERS) {
      this.cleanupUnusedListeners();
      if (this.subscriptions.size >= this.MAX_ACTIVE_LISTENERS) {
        this.pruneOldestSubscription();
      }
    }

    // New native listener
    this.activeListenersCount++;
    updateHealthListeners(this.activeListenersCount);
    
    const callbacks = new Set<(snap: any, changes?: any[]) => void>([onNext]);
    const errorCallbacks = new Set<(err: any) => void>();
    if (onError) {
      errorCallbacks.add(onError);
    }

    const state: SubscriptionState = {
      unsubscribe: () => {}, // placeholder, set below
      callbacks,
      errorCallbacks,
      retryAttempt: 0,
      retryTimeout: null,
      isClosed: false,
      createdAt: Date.now(),
      lastAccessAt: Date.now(),
    };

    // Attach native Firestore onSnapshot with auto-retry
    state.unsubscribe = this.attachNativeListener(key, query, state);

    try {
      state.perfUnsub = PerformanceService.registerSubscription(key);
    } catch (e) {}
    this.subscriptions.set(key, state);
    this.printDiagnostics();

    return () => {
      this.unsubscribeClient(key, onNext, onError);
    };
  }

  private unsubscribeClient(
    key: string,
    onNext: (snap: any) => void,
    onError?: (err: any) => void
  ) {
    const sub = this.subscriptions.get(key);
    if (!sub) return;

    sub.callbacks.delete(onNext);
    if (onError) {
      sub.errorCallbacks.delete(onError);
    }

    // If no more callbacks are registered, clean up the native subscription
    if (sub.callbacks.size === 0) {
      sub.isClosed = true;
      if (sub.retryTimeout) {
        clearTimeout(sub.retryTimeout);
        sub.retryTimeout = null;
      }
      try {
        if (typeof sub.unsubscribe === "function") {
          sub.unsubscribe();
        }
      } catch (err) {
        logger.warn(`[FirestoreSubscriptionRegistry] Error during unsub of key ${LogSanitizer.sanitizeString(key)}:`, err);
      }
      try {
        sub.perfUnsub?.();
      } catch (err) {}
      this.subscriptions.delete(key);
      this.activeListenersCount = Math.max(0, this.activeListenersCount - 1);
      updateHealthListeners(this.activeListenersCount);
      this.cleanupsExecutedCount++;
    }

    this.printDiagnostics();
  }

  private pruneOldestSubscription(): void {
    // 1. First attempt to clean up any orphaned or callback-free subscriptions
    const cleaned = this.cleanupUnusedListeners();
    if (cleaned > 0 && this.subscriptions.size < this.MAX_ACTIVE_LISTENERS) {
      return;
    }

    // 2. Find oldest subscription, preferring one with 0 callbacks
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    // First pass: look for any with callbacks.size === 0
    for (const [k, s] of this.subscriptions.entries()) {
      if (s.callbacks.size === 0 && s.lastAccessAt < oldestAccess) {
        oldestAccess = s.lastAccessAt;
        oldestKey = k;
      }
    }

    // Second pass: if none with 0 callbacks, find oldest overall
    if (!oldestKey) {
      for (const [k, s] of this.subscriptions.entries()) {
        if (s.lastAccessAt < oldestAccess) {
          oldestAccess = s.lastAccessAt;
          oldestKey = k;
        }
      }
    }

    if (oldestKey) {
      const sub = this.subscriptions.get(oldestKey);
      if (sub) {
        sub.isClosed = true;
        if (sub.retryTimeout) {
          clearTimeout(sub.retryTimeout);
          sub.retryTimeout = null;
        }
        try {
          sub.unsubscribe();
        } catch {}
        try {
          sub.perfUnsub?.();
        } catch {}
        this.subscriptions.delete(oldestKey);
        this.activeListenersCount = Math.max(0, this.activeListenersCount - 1);
        updateHealthListeners(this.activeListenersCount);
        logger.info(`[FirestoreSubscriptionRegistry] Pruned oldest subscription "${LogSanitizer.sanitizeString(oldestKey)}" to respect max listener threshold (${this.activeListenersCount}/${this.MAX_ACTIVE_LISTENERS}).`);
      }
    }
  }

  public cleanupUnusedListeners(): number {
    let cleaned = 0;
    for (const [key, sub] of this.subscriptions.entries()) {
      if (!sub.callbacks || sub.callbacks.size === 0) {
        try {
          sub.unsubscribe();
        } catch (e) {
          logger.warn(`[FirestoreSubscriptionRegistry] Cleanup error on key ${LogSanitizer.sanitizeString(key)}:`, e);
        }
        this.subscriptions.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.activeListenersCount = Math.max(0, this.activeListenersCount - cleaned);
      updateHealthListeners(this.activeListenersCount);
      this.cleanupsExecutedCount += cleaned;
      logger.info(`[FirestoreSubscriptionRegistry] Garbage collected ${cleaned} unused listeners. Active listeners: ${this.activeListenersCount}`);
    }
    return cleaned;
  }

  public clearSnapshotCache(businessIdOrPattern?: string): void {
    if (!businessIdOrPattern) {
      for (const sub of this.subscriptions.values()) {
        delete sub.lastSnapshot;
      }
      logger.info("[FirestoreSubscriptionRegistry] Cleared all cached snapshots in subscription registry.");
    } else {
      let count = 0;
      for (const [key, sub] of this.subscriptions.entries()) {
        if (key.includes(businessIdOrPattern)) {
          delete sub.lastSnapshot;
          count++;
        }
      }
      logger.info(`[FirestoreSubscriptionRegistry] Cleared ${count} cached snapshots matching "${LogSanitizer.sanitizeString(businessIdOrPattern)}".`);
    }
  }

  public invalidate(key: string): void {
    const sub = this.subscriptions.get(key);
    if (sub) {
      delete sub.lastSnapshot;
    }
  }

  public purgeAll(): void {
    logger.warn(`[FirestoreSubscriptionRegistry] Purging ALL ${this.subscriptions.size} active subscriptions.`);
    for (const [, sub] of this.subscriptions.entries()) {
      try {
        sub.unsubscribe();
      } catch (e) {}
    }
    this.subscriptions.clear();
    this.activeListenersCount = 0;
    this.rateLimiter.reset();
    updateHealthListeners(0);
  }

  public getDiagnostics() {
    return {
      activeListeners: this.activeListenersCount,
      duplicatesPrevented: this.duplicatesPreventedCount,
      cleanupsExecuted: this.cleanupsExecutedCount,
    };
  }

  public getStats() {
    const keys = Array.from(this.subscriptions.entries()).map(([key, sub]) => ({
      key: LogSanitizer.sanitizeString(key),
      callbacksCount: sub.callbacks.size,
      hasLastSnapshot: Boolean(sub.lastSnapshot)
    }));

    return {
      activeListeners: this.activeListenersCount,
      duplicatesPrevented: this.duplicatesPreventedCount,
      cleanupsExecuted: this.cleanupsExecutedCount,
      activeKeysCount: keys.length,
      keys
    };
  }

  private printDiagnostics() {
    logger.debug(
      `[FirestoreRealtimeManager] Active: ${this.activeListenersCount} | Dups Prevented: ${this.duplicatesPreventedCount} | Cleanups: ${this.cleanupsExecutedCount}`
    );
  }
}

export const subscriptionRegistry = new SubscriptionRegistry();
