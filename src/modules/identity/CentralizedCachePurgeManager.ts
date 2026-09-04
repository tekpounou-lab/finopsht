import { realtimeManager } from "../../services/firestore/realtimeManager";
import { subscriptionRegistry } from "../../services/firestore/subscriptionRegistry";
import { DashboardQueryService } from "../../services/query/DashboardQueryService";
import { EmployeeQueryService } from "../../services/query/EmployeeQueryService";
import { SecurityAuditLogger } from "../../services/security/SecurityAuditLogger";

export class CentralizedCachePurgeManager {
  private static lastKnownUid: string | null = null;
  private static isPurging = false;

  /**
   * Synchronously and completely purges all in-memory caches, active Firestore
   * listeners, local and session storage keys, and resets state across the ERP.
   */
  static purgeAllCaches(options: {
    previousUid?: string | null;
    newUid?: string | null;
    reason?: string;
  } = {}): void {
    if (this.isPurging) return;
    this.isPurging = true;

    try {
      const prevUid = options.previousUid || this.lastKnownUid || "UNKNOWN";
      const nextUid = options.newUid || "NONE";
      console.log(`[CentralizedCachePurgeManager] PURGING ALL TENANT CACHES (${prevUid} -> ${nextUid}). Reason: ${options.reason || "AUTH_CHANGE"}`);

      // 1. Purge all Firestore realtime listeners and snapshot memory
      try {
        realtimeManager.purgeAll();
      } catch (e) {
        console.warn("[CentralizedCachePurgeManager] realtimeManager.purgeAll warning:", e);
      }

      try {
        subscriptionRegistry.purgeAll();
      } catch (e) {
        console.warn("[CentralizedCachePurgeManager] subscriptionRegistry.purgeAll warning:", e);
      }

      // 2. Invalidate query service memory caches
      try {
        DashboardQueryService.invalidateCache();
      } catch (e) {
        console.warn("[CentralizedCachePurgeManager] DashboardQueryService.invalidateCache warning:", e);
      }

      try {
        EmployeeQueryService.invalidateCache();
      } catch (e) {
        console.warn("[CentralizedCachePurgeManager] EmployeeQueryService.invalidateCache warning:", e);
      }

      // 3. Purge all browser storage associated with any identity or tenant
      if (typeof window !== "undefined") {
        try {
          const sessionKeysToPurge: string[] = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && (key.startsWith("finops_") || key.startsWith("biz_") || key.includes("identity") || key.includes("tenant"))) {
              sessionKeysToPurge.push(key);
            }
          }
          sessionKeysToPurge.forEach((k) => sessionStorage.removeItem(k));

          const localKeysToPurge: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith("finops_identity_cache_") || key.startsWith("finops_active_") || key.includes("onboarding_draft_"))) {
              localKeysToPurge.push(key);
            }
          }
          localKeysToPurge.forEach((k) => localStorage.removeItem(k));
        } catch (storageErr) {
          console.warn("[CentralizedCachePurgeManager] Storage cleanup warning:", storageErr);
        }
      }

      // 4. Log the session purge event with SecurityAuditLogger
      SecurityAuditLogger.logAuthStateChange({
        action: "SESSION_PURGE",
        actorUid: options.newUid || options.previousUid || null,
        details: {
          previousUid: prevUid,
          newUid: nextUid,
          reason: options.reason || "AUTH_USER_CHANGE"
        }
      }).catch((e) => console.warn("[CentralizedCachePurgeManager] Audit log deferred:", e));

      this.lastKnownUid = options.newUid || null;
    } finally {
      this.isPurging = false;
    }
  }

  /**
   * Tracks the active UID and triggers automatic purge if a switch is detected
   */
  static handleAuthUserTransition(currentUid: string | null): boolean {
    if (this.lastKnownUid !== null && this.lastKnownUid !== currentUid) {
      console.log(`[CentralizedCachePurgeManager] Detected auth user transition: ${this.lastKnownUid} -> ${currentUid}`);
      this.purgeAllCaches({
        previousUid: this.lastKnownUid,
        newUid: currentUid,
        reason: "AUTH_USER_SWITCH"
      });
      return true; // Purge was triggered
    }
    this.lastKnownUid = currentUid;
    return false;
  }
}
