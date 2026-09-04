import { EnterpriseResolverPipeline, SessionContext } from "./resolvers";
import { PermissionService } from "../PermissionService";
import { auth } from "../../lib/firebase";
import { CSRFService } from "../security/CSRFService";
import { SecurityAuditLogger } from "../security/SecurityAuditLogger";
import { LogSanitizer } from "../security/LogSanitizer";
import { logger } from "../observability/Logger";

type HealthChangeCallback = (newContext: SessionContext) => void;
type TerminateCallback = (reason: string) => void;

class SessionHealthServiceClass {
  private intervalId: any | null = null;
  private tokenRotationIntervalId: any | null = null;
  private lastContext: SessionContext | null = null;
  private isChecking = false;
  private consecutiveFailures = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly TOKEN_ROTATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  /**
   * Starts periodic background session health checks and token rotation
   */
  public startMonitoring(
    onChange: HealthChangeCallback,
    onTerminate: TerminateCallback,
    intervalMs: number = 5 * 60 * 1000 // default 5 minutes
  ) {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    if (this.tokenRotationIntervalId) {
      clearInterval(this.tokenRotationIntervalId);
    }

    const check = async () => {
      if (this.isChecking) return;
      this.isChecking = true;

      try {
        const user = auth.currentUser;
        if (!user) {
          onTerminate("Authentication session terminated or expired.");
          this.stopMonitoring();
          return;
        }

        const currentContext = await EnterpriseResolverPipeline.resolveSession(user);

        // Evaluate critical changes requiring session updates or terminations
        if (currentContext.identity.status === "UNAUTHENTICATED") {
          onTerminate("User identity revoked.");
          this.stopMonitoring();
          return;
        }

        if (
          currentContext.profile?.status === "ACCOUNT_SUSPENDED" ||
          currentContext.profile?.status === "ACCOUNT_DISABLED" ||
          currentContext.profile?.status === "ACCOUNT_LOCKED"
        ) {
          onTerminate(`User account state changed to: ${currentContext.profile.status}`);
          this.stopMonitoring();
          return;
        }

        if (currentContext.workspace?.status === "SUSPENDED" || currentContext.workspace?.status === "REJECTED") {
          onTerminate("Your company workspace tenancy has been suspended by system administrators.");
          this.stopMonitoring();
          return;
        }

        // Detect non-fatal changes (e.g. role modified, features changed, subscription plan upgraded)
        if (this.lastContext) {
          const roleChanged = this.lastContext.profile?.data?.role !== currentContext.profile?.data?.role;
          const subChanged = this.lastContext.subscription?.data?.plan !== currentContext.subscription?.data?.plan;
          const featuresChanged = JSON.stringify(this.lastContext.features?.matrix) !== JSON.stringify(currentContext.features?.matrix);
          const permissionsChanged = JSON.stringify(this.lastContext.permissions?.list) !== JSON.stringify(currentContext.permissions?.list);

          if (roleChanged || subChanged || featuresChanged || permissionsChanged) {
            logger.info("[SessionHealthService] Session changes detected. Synchronizing credentials...");
            
            // Re-initialize clientside permission service
            if (currentContext.profile?.data?.role && currentContext.permissions?.list && currentContext.features?.matrix) {
              PermissionService.init(
                currentContext.profile.data.role,
                currentContext.permissions.list,
                currentContext.features.matrix,
                currentContext.subscription?.data?.plan,
                currentContext.subscription?.status,
                currentContext.profile.data.business_id
              );
            }

            onChange(currentContext);
          }
        }

        this.lastContext = currentContext;
        this.consecutiveFailures = 0;
      } catch (error: any) {
        this.consecutiveFailures++;
        logger.warn(`[SessionHealthService] Session check failed (attempt ${this.consecutiveFailures}/${this.MAX_CONSECUTIVE_FAILURES}):`, error?.message || error);
        
        if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES && !navigator.onLine) {
          logger.warn("[SessionHealthService] Device offline; maintaining local session without revoking credentials.");
        }
      } finally {
        this.isChecking = false;
      }
    };

    // Initial health check
    check();
    this.intervalId = setInterval(check, intervalMs);

    // Start 15-minute Token Rotation cycle
    this.startTokenRotation();

    logger.info(`[SessionHealthService] Active Session monitoring started with interval of ${intervalMs}ms & token rotation every 15m.`);
  }

  /**
   * Rotates Firebase ID Token and Anti-CSRF session token every 15 minutes
   */
  public async rotateActiveSessionTokens(): Promise<boolean> {
    try {
      const user = auth.currentUser;
      if (!user) return false;

      // Force refresh the Firebase ID Token
      const newToken = await user.getIdToken(true);
      const { csrfToken } = CSRFService.rotateTokens();

      logger.info(`[SessionHealthService] Successfully rotated Firebase ID Token & Anti-CSRF Token for user ${LogSanitizer.maskUid(user.uid)}.`);

      SecurityAuditLogger.log({
        eventType: "TOKEN_ROTATION",
        business_id: this.lastContext?.profile?.data?.business_id || "GLOBAL",
        actor_uid: user.uid,
        actor_email: user.email,
        status: "SUCCESS",
        reason: "15-minute scheduled session token rotation completed",
        details: {
          hasNewToken: Boolean(newToken),
          hasCsrf: Boolean(csrfToken)
        }
      }).catch(() => {});

      return true;
    } catch (err: any) {
      logger.warn("[SessionHealthService] Token rotation deferred:", err?.message || err);
      return false;
    }
  }

  private startTokenRotation() {
    this.tokenRotationIntervalId = setInterval(() => {
      this.rotateActiveSessionTokens();
    }, this.TOKEN_ROTATION_INTERVAL_MS);
  }

  /**
   * Stop background checking and token rotation
   */
  public stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.tokenRotationIntervalId) {
      clearInterval(this.tokenRotationIntervalId);
      this.tokenRotationIntervalId = null;
    }
    this.lastContext = null;
    logger.info("[SessionHealthService] Active Session monitoring halted.");
  }
}

export const SessionHealthService = new SessionHealthServiceClass();
export default SessionHealthService;
