export type PlanTier = "starter" | "business" | "enterprise";

export interface PlanDetails {
  id: PlanTier;
  name: string;
  priceHtg: number;
  priceUsd: number;
  employeeLimit: number;
  branchLimit: number;
  features: string[];
  disabledModules: string[];
}

export const SAAS_PLANS: Record<PlanTier, PlanDetails> = {
  starter: {
    id: "starter",
    name: "Starter Local",
    priceHtg: 0,
    priceUsd: 0,
    employeeLimit: 5,
    branchLimit: 1,
    features: [
      "Up to 5 employees / 5 anplwaye max",
      "QR Attendance / Pwentaj QR debaz",
      "Basic Dashboard / Tablo de bò",
      "Basic Payroll / Payroll senp",
      "Basic Leaves / Demann konje"
    ],
    disabledModules: ["analytics", "ledger", "forensic", "reliability", "aicfo"]
  },
  business: {
    id: "business",
    name: "Business Croissance",
    priceHtg: 2500,
    priceUsd: 20,
    employeeLimit: 50,
    branchLimit: 3,
    features: [
      "Up to 50 employees / 50 anplwaye max",
      "Advanced Payroll / Payroll avanse",
      "Local ERP Ledger / Kont ak Tranzaksyon",
      "Multi-departments / Depatman miltip",
      "Business Intelligence / Analytics",
      "AI CFO Lite (Limited prompts) / AI CFO limite"
    ],
    disabledModules: ["reliability", "forensic"]
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise Multi-Site",
    priceHtg: -1, // Custom / Sur mesure
    priceUsd: -1,
    employeeLimit: 9999, // Unlimited
    branchLimit: 9999, // Unlimited
    features: [
      "Unlimited branches & employees",
      "Advanced AI CFO Gemini (Unlimited)",
      "Reliability Console & DLQ Recovery",
      "Forensic & Crytographic Audit Trace",
      "Workforce Contracts Generation",
      "Premium 24/7 dedicated support"
    ],
    disabledModules: [] // Full access
  }
};

/**
 * High-Density SaaS Subscription Gatekeeping Engine
 */
export const BillingEngine = {
  getPlan: (tier: PlanTier): PlanDetails => {
    return SAAS_PLANS[tier] || SAAS_PLANS.starter;
  },

  /**
   * Evaluates whether a module is gated for the current SaaS tier
   */
  isModuleDisabled: (tier: PlanTier, moduleId: string): boolean => {
    const plan = SAAS_PLANS[tier] || SAAS_PLANS.starter;
    return plan.disabledModules.includes(moduleId);
  },

  /**
   * Validates if adding another employee aligns with database constraints
   */
  canAddEmployee: (tier: PlanTier, currentCount: number): boolean => {
    const plan = SAAS_PLANS[tier];
    return currentCount < plan.employeeLimit;
  },

  /**
   * Validates if creating another branch aligns with subscription bounds
   */
  canCreateBranch: (tier: PlanTier, currentCount: number): boolean => {
    const plan = SAAS_PLANS[tier];
    return currentCount < plan.branchLimit;
  },

  /**
   * Evaluates feature authorization level
   */
  hasFeatureAccess: (tier: PlanTier, featureKey: string): boolean => {
    if (tier === "enterprise") return true;
    if (tier === "business") {
      return !["reliability_console", "forensic_cryptography", "unlimited_cfo"].includes(featureKey);
    }
    // Starter access only
    return ["qr_attendance", "basic_payroll", "basic_leaves", "basic_dashboard"].includes(featureKey);
  }
};
