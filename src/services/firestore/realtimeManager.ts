import { CollectionReference, query, where, QueryConstraint, Query, DocumentReference } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { subscriptionRegistry } from "./subscriptionRegistry";
import { InputSanitizer } from "../security/InputSanitizer";
import { SubscriptionAccessControl } from "../security/SubscriptionAccessControl";
import { LogSanitizer } from "../security/LogSanitizer";
import { logger } from "../observability/Logger";

/**
 * TenantQueryBuilder ensures that all queries in a multi-tenant setup are securely bound 
 * to the active business_id. This prevents accidental cross-tenant data leaks.
 */
export function tenantQuery(
  collectionRef: CollectionReference,
  businessId: string | undefined | null,
  ...constraints: QueryConstraint[]
): Query {
  const validConstraints = constraints.filter(c => Boolean(c));
  
  if (!businessId || businessId === "undefined" || businessId === "null" || businessId === "none") {
    logger.warn(
      `[TENANT_SECURITY] Query rejected: missing or invalid business_id filter for collection: "${collectionRef?.path || 'unknown'}"`
    );
    // Return an intentionally empty/rejected query instead of allowing global scan
    return query(collectionRef, where("business_id", "==", "TENANT_SECURITY_REJECTED_EMPTY_ID"), ...validConstraints);
  }

  let sanitizedBizId: string;
  try {
    sanitizedBizId = InputSanitizer.sanitizeBusinessId(businessId);
  } catch (err: any) {
    logger.error(`[TENANT_SECURITY] Injection detected in business_id parameter: ${LogSanitizer.sanitizeString(businessId)}`);
    return query(collectionRef, where("business_id", "==", "TENANT_SECURITY_REJECTED_INJECTION"), ...validConstraints);
  }

  return query(collectionRef, where("business_id", "==", sanitizedBizId), ...validConstraints);
}

/**
 * Centralized Realtime Subscription Manager
 * Enforces:
 * 1. RBAC & Tenant Isolation Permission Gatekeeping before opening native onSnapshot streams.
 * 2. Strict authentication verification to eliminate 'Missing or insufficient permissions' errors.
 * 3. Sanitization of subscription keys and query parameters.
 * 4. PII-sanitized logging.
 */
export const realtimeManager = {
  subscribe<T = any>(
    key: string,
    queryInstance: Query | DocumentReference,
    onNext: (snapshot: any, changes?: any[]) => void,
    onError?: (error: any) => void
  ): () => void {
    if (!key || key.endsWith(":undefined") || key.endsWith(":null") || key.includes(":undefined:") || key.includes(":null:")) {
      logger.warn(`[realtimeManager] Subscription key is invalid or contains undefined tenant ("${LogSanitizer.sanitizeString(key)}"). Skipping registration.`);
      return () => {};
    }

    if (!queryInstance) {
      logger.warn(`[realtimeManager] Query instance is missing for key "${LogSanitizer.sanitizeString(key)}". Skipping registration.`);
      return () => {};
    }

    // Extract collection path from key for RBAC evaluation (e.g. "employees:biz_123" -> collection="employees", biz="biz_123")
    const keyParts = key.split(":");
    const collectionPath = keyParts[0] || "unknown";
    const requestedBizId = keyParts.length > 1 ? keyParts[1] : null;

    // Evaluate subscription permissions
    const access = SubscriptionAccessControl.evaluateSubscription(collectionPath, requestedBizId);
    if (!access.allowed) {
      logger.warn(`[realtimeManager] Permission gatekeeper blocked subscription to "${LogSanitizer.sanitizeString(key)}": ${access.reason}`);
      if (onError) {
        onError(new Error(access.reason || "Access denied to subscription"));
      }
      return () => {};
    }

    // 1. If auth is already ready, or in test environment, attach immediately
    const isTestEnv = typeof process !== "undefined" && (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST));
    if (auth.currentUser || isTestEnv) {
      return subscriptionRegistry.subscribe(key, queryInstance, onNext, onError);
    }

    // 2. Auth is null / pending initialization: Defer attaching until onAuthStateChanged resolves a truthy user
    logger.debug(`[realtimeManager] Subscription "${LogSanitizer.sanitizeString(key)}": Deferred until auth.currentUser is ready.`);
    let isCancelled = false;
    let registryUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !isCancelled) {
        logger.debug(`[realtimeManager] Auth confirmed for "${LogSanitizer.sanitizeString(key)}" (UID: ${LogSanitizer.maskUid(user.uid)}). Attaching stream.`);
        registryUnsubscribe = subscriptionRegistry.subscribe(key, queryInstance, onNext, onError);
      }
    });

    return () => {
      isCancelled = true;
      authUnsubscribe();
      if (registryUnsubscribe) {
        registryUnsubscribe();
      }
    };
  },

  getDiagnostics() {
    return subscriptionRegistry.getDiagnostics();
  },

  getStats() {
    return subscriptionRegistry.getStats();
  },

  cleanupUnusedListeners() {
    return subscriptionRegistry.cleanupUnusedListeners();
  },

  clearSnapshotCache(businessIdOrPattern?: string) {
    return subscriptionRegistry.clearSnapshotCache(businessIdOrPattern);
  },

  invalidate(key: string) {
    return subscriptionRegistry.invalidate(key);
  },

  purgeAll() {
    return subscriptionRegistry.purgeAll();
  }
};
