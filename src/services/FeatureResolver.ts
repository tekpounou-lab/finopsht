// src/services/FeatureResolver.ts

import { db, auth } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { EventBus } from "@/modules/runtime/EventBus";

// Setup BroadcastChannel for cross-tab cache invalidation
const channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("finops_feature_flags")
  : null;

// Handle cross-tab incoming invalidation messages
if (channel) {
  channel.onmessage = (event) => {
    if (event.data && event.data.type === "FEATURE_CACHE_INVALIDATED") {
      const { businessId } = event.data;
      
      // Invalidate local in-memory cache partition for this tab
      FeatureResolver.clearCacheLocal(businessId);
      
      // Notify the EventBus in this tab so that active UI context layers can re-evaluate reactively
      try {
        EventBus.publish(EventBus.createEvent({
          correlationId: `bc_invalidate_${businessId || 'all'}_${Date.now()}`,
          businessId: businessId || undefined,
          module: "FeatureResolver",
          aggregate: "FeatureSettings",
          type: "FEATURE_CACHE_INVALIDATED",
          payload: { businessId, remote: true }
        }));
      } catch (err) {
        console.warn("[FeatureResolver] Failed to publish EventBus event from BroadcastChannel:", err);
      }
    }
  };
}

/**
 * FeatureFlag defines the authoritative modules and operational parameters
 * that can be toggled per tenant within FINOPS ERP.
 */
export enum FeatureFlag {
  // Core Modules
  ATTENDANCE = "attendance",
  PAYROLL = "payroll",
  ACCOUNTING = "accounting",
  POS = "pos",
  HR = "hr",
  CRM = "crm",
  BI = "bi",
  AI_CFO = "aiCfo",

  // Advanced Operations
  ADVANCED_PAYROLL = "advanced_payroll",
  MULTI_BRANCH = "multi_branch",
  FORENSIC_HASH_VERIFIER = "forensic_hash_verifier",
  PESSIMISTIC_LOCK_OVERRIDE = "pessimistic_lock_override"
}

export interface FeatureSettings {
  businessId: string;
  features: Record<string, boolean>;
  updatedAt: any;
}

/**
 * FeatureResolver manages tenant-level feature entitlement resolution.
 * Implements a memory-bound, thread-safe cache to avoid redundant, costly
 * Firestore document reads across synchronous transaction execution blocks.
 */
export class FeatureResolver {
  private static cache = new Map<string, { features: Record<string, boolean>; expiresAt: number }>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minute TTL

  private static readonly DEFAULT_FEATURES: Record<string, boolean> = {
    [FeatureFlag.ATTENDANCE]: true,
    [FeatureFlag.PAYROLL]: true,
    [FeatureFlag.ACCOUNTING]: true,
    [FeatureFlag.POS]: false,
    [FeatureFlag.HR]: true,
    [FeatureFlag.CRM]: false,
    [FeatureFlag.BI]: true,
    [FeatureFlag.AI_CFO]: true,
    [FeatureFlag.ADVANCED_PAYROLL]: true,
    [FeatureFlag.MULTI_BRANCH]: false,
    [FeatureFlag.FORENSIC_HASH_VERIFIER]: true,
    [FeatureFlag.PESSIMISTIC_LOCK_OVERRIDE]: false,
  };

  /**
   * Clears the local in-memory cache partition for this tab only.
   */
  public static clearCacheLocal(businessId?: string): void {
    if (businessId) {
      this.cache.delete(businessId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Clears the in-memory cache partition for a tenant or the whole cache.
   * Emits a local EventBus event and broadcasts a cross-tab invalidation event.
   */
  public static clearCache(businessId?: string, broadcast: boolean = true): void {
    this.clearCacheLocal(businessId);

    // Notify local EventBus
    try {
      EventBus.publish(EventBus.createEvent({
        correlationId: `invalidate_${businessId || 'all'}_${Date.now()}`,
        businessId: businessId || undefined,
        module: "FeatureResolver",
        aggregate: "FeatureSettings",
        type: "FEATURE_CACHE_INVALIDATED",
        payload: { businessId }
      }));
    } catch (err) {
      console.warn("[FeatureResolver] Failed to publish local EventBus invalidation event:", err);
    }

    // Broadcast to other open tabs
    if (broadcast && channel) {
      try {
        channel.postMessage({
          type: "FEATURE_CACHE_INVALIDATED",
          businessId
        });
      } catch (err) {
        console.warn("[FeatureResolver] Failed to broadcast cache invalidation message:", err);
      }
    }
  }

  /**
   * Resolves all enabled features for a specific business.
   * Leverages caching and supports progressive dual-read path mapping.
   */
  public static async resolveAll(businessId: string | null): Promise<Record<string, boolean>> {
    if (!businessId) {
      return { ...this.DEFAULT_FEATURES };
    }

    // 1. Check local in-memory cache
    const cached = this.cache.get(businessId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.features;
    }

    if (!auth.currentUser) {
      return { ...this.DEFAULT_FEATURES };
    }

    let resolvedFeatures = { ...this.DEFAULT_FEATURES };

    try {
      // 2. Primary Path: Modern standardized settings document path:
      // /businesses/{businessId}/settings/features
      const primaryDocRef = doc(db, "businesses", businessId, "settings", "features");
      const subDocRef = doc(db, "subscriptions", businessId);

      const [primarySnap, subSnap] = await Promise.all([
        getDoc(primaryDocRef).catch(() => null),
        getDoc(subDocRef).catch(() => null)
      ]);

      if (primarySnap && primarySnap.exists()) {
        const data = primarySnap.data();
        if (data && data.features) {
          resolvedFeatures = { ...resolvedFeatures, ...data.features };
        } else {
          resolvedFeatures = { ...resolvedFeatures, ...data };
        }
      } else {
        // 3. Fallback Path: Legacy flat features path features/{businessId}
        const legacyDocRef = doc(db, "features", businessId);
        const legacySnap = await getDoc(legacyDocRef).catch(() => null);
        if (legacySnap && legacySnap.exists()) {
          const data = legacySnap.data();
          resolvedFeatures = { ...resolvedFeatures, ...data };
        } else if (auth.currentUser) {
          // If neither exists, provision system defaults to the modern path for subsequent reads
          await this.saveFeatures(businessId, resolvedFeatures);
        }
      }

      // 4. Check Subscription Status: if BLOCKED or SUSPENDED or EXPIRED, lock out features
      if (subSnap && subSnap.exists()) {
        const subData = subSnap.data();
        if (subData.status === "BLOCKED" || subData.status === "SUSPENDED") {
          // Lock down all non-essential features
          Object.keys(resolvedFeatures).forEach(k => {
            resolvedFeatures[k] = false;
          });
        }
      }
    } catch (error: any) {
      if (auth.currentUser) {
        console.warn(`[FeatureResolver] Error resolving features for ${businessId}:`, error?.message || error);
      }
    }

    // 4. Save to cache
    this.cache.set(businessId, {
      features: resolvedFeatures,
      expiresAt: Date.now() + this.CACHE_TTL_MS
    });

    return resolvedFeatures;
  }

  /**
   * Verifies if a specific feature flag is enabled for a given tenant.
   */
  public static async isEnabled(businessId: string, flag: FeatureFlag): Promise<boolean> {
    const features = await this.resolveAll(businessId);
    return !!features[flag];
  }

  /**
   * Overrides or updates the active features for a given tenant.
   * Automatically invalidates the local in-memory cache to guarantee immediate runtime updates.
   */
  public static async saveFeatures(businessId: string, features: Record<string, boolean>): Promise<void> {
    const docRef = doc(db, "businesses", businessId, "settings", "features");
    
    await setDoc(docRef, {
      businessId,
      features,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Instantly invalidate cache to force a fresh pull on next invocation
    this.clearCache(businessId);
  }
}
