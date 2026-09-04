export interface ResolverFlags {
  identityResolver: boolean;
  workspaceResolver: boolean;
  invitationResolver: boolean;
  navigationEngine: boolean;
  permissionEngine: boolean;
  analyticsBootstrap: boolean;
  canaryPercentile: number; // 0 to 100
  pilotOrganizations: string[]; // company IDs
  instantRollback: boolean; // if true, bypasses all new features and runs in fallback legacy mode
}

const DEFAULT_FLAGS: ResolverFlags = {
  identityResolver: true,
  workspaceResolver: true,
  invitationResolver: true,
  navigationEngine: true,
  permissionEngine: true,
  analyticsBootstrap: true,
  canaryPercentile: 100, // 100% rollout by default
  pilotOrganizations: ["demo-enterprise", "pilot-co", "finops-corp"],
  instantRollback: false
};

class FeatureFlagConfigServiceClass {
  private flags: ResolverFlags;

  constructor() {
    this.flags = this.loadFlags();
  }

  private loadFlags(): ResolverFlags {
    try {
      const stored = localStorage.getItem("finops_resolver_flags");
      if (stored) {
        return { ...DEFAULT_FLAGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn("[ResolverFeatureFlag] Failed to load resolver flags:", e);
    }
    return { ...DEFAULT_FLAGS };
  }

  public saveFlags(flags: Partial<ResolverFlags>) {
    this.flags = { ...this.flags, ...flags };
    try {
      localStorage.setItem("finops_resolver_flags", JSON.stringify(this.flags));
      console.log("[ResolverFeatureFlag] Saved new resolver configurations:", this.flags);
    } catch (e) {
      console.error("[ResolverFeatureFlag] Failed to store resolver flags:", e);
    }
  }

  public getFlags(): ResolverFlags {
    return { ...this.flags };
  }

  /**
   * Deterministically evaluates if a specific feature phase is enabled for a given user or company context.
   * Supports Dark Launches, Pilot organizations, Canary rollout, and Instant Rollback.
   */
  public isResolverPhaseEnabled(
    phase: keyof Omit<ResolverFlags, "canaryPercentile" | "pilotOrganizations" | "instantRollback">,
    context: { userId?: string; email?: string; businessId?: string | null }
  ): boolean {
    // 1. Instant Rollback check (Emergency Override)
    if (this.flags.instantRollback) {
      console.warn(`[ResolverFeatureFlag] INSTANT ROLLBACK ACTIVE. Forcing Legacy mode for phase: ${phase}`);
      return false;
    }

    // 2. Specific feature phase toggle check
    const isPhaseConfigured = this.flags[phase] !== false;
    if (!isPhaseConfigured) {
      return false;
    }

    // 3. Pilot organizations check
    if (context.businessId && this.flags.pilotOrganizations.includes(context.businessId)) {
      console.log(`[ResolverFeatureFlag] PILOT BUSINESS MATCHED: "${context.businessId}". Enabling phase: ${phase}`);
      return true;
    }

    // 4. Pilot users list by email
    if (context.email && context.email.endsWith("@finops.com")) {
      return true; // Internal tester dark-launch bypass
    }

    // 5. Canary release check (deterministic hashing based on UID or businessId)
    const hashTarget = context.userId || context.businessId || "anonymous";
    const hashValue = this.hashStringToInt(hashTarget) % 100;
    const isCanaryCleared = hashValue < this.flags.canaryPercentile;

    if (!isCanaryCleared) {
      console.warn(`[ResolverFeatureFlag] CANARY ROLLOUT EXCLUSION. Target hash: ${hashValue}% exceeds Rollout threshold: ${this.flags.canaryPercentile}%. Running fallback for: ${phase}`);
      return false;
    }

    return true;
  }

  private hashStringToInt(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

export const FeatureFlagConfigService = new FeatureFlagConfigServiceClass();
