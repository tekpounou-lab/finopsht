/**
 * Pure canonical subscription plan definitions shared between backend routes and client repository.
 */

export type PaymentGatewayType = "stripe" | "moncash" | "natcash" | "bank_transfer";

export interface SubscriptionPlanDocument {
  id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  priceUsd: number;
  priceHtg: number;
  extraUserPriceUsd?: number;
  extraUserPriceHtg?: number;
  billingCycle: "MONTHLY" | "ANNUAL" | "QUARTERLY";
  userLimit: number;
  maxBranches?: number;
  maxTransactions: number;
  maxStorageMB?: number;
  description: string;
  featuresEnabled: string[];
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  isPopular?: boolean;
  badgeText?: string;
  trialDays?: number;

  supportedGateways?: PaymentGatewayType[];
  stripePriceId?: string;
  stripeProductId?: string;
  moncashServiceId?: string;
  moncashMerchantCode?: string;
  natcashServiceId?: string;
  natcashMerchantCode?: string;

  createdAt?: any;
  updatedAt?: any;
}

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlanDocument[] = [
  {
    id: "STARTER",
    code: "STARTER",
    name: "Starter Plan",
    price: 49,
    currency: "USD",
    priceUsd: 49,
    priceHtg: 6400,
    extraUserPriceUsd: 5,
    extraUserPriceHtg: 650,
    billingCycle: "MONTHLY",
    userLimit: 10,
    maxBranches: 1,
    maxTransactions: 1000,
    maxStorageMB: 1000,
    description: "Idéal pour les TPE et startups débutant avec la paie et le pointage QR.",
    featuresEnabled: ["attendance", "payroll", "hr"],
    status: "ACTIVE",
    supportedGateways: ["stripe", "moncash", "natcash", "bank_transfer"],
    stripePriceId: "price_starter_usd_49",
    stripeProductId: "prod_finops_starter",
    moncashServiceId: "MC_STARTER_6400HTG",
    moncashMerchantCode: "FINOPS_MC_01",
    natcashServiceId: "NC_STARTER_6400HTG",
    natcashMerchantCode: "FINOPS_NC_01"
  },
  {
    id: "PROFESSIONAL",
    code: "PROFESSIONAL",
    name: "Professional Plan",
    price: 149,
    currency: "USD",
    priceUsd: 149,
    priceHtg: 19500,
    extraUserPriceUsd: 4,
    extraUserPriceHtg: 520,
    billingCycle: "MONTHLY",
    userLimit: 50,
    maxBranches: 3,
    maxTransactions: 5000,
    maxStorageMB: 5000,
    description: "Pour les PME en croissance : paie avancée, congés, comptabilité double-entrée et reporting.",
    featuresEnabled: ["attendance", "payroll", "hr", "accounting", "bi"],
    status: "ACTIVE",
    isPopular: true,
    badgeText: "Plus Populaire",
    supportedGateways: ["stripe", "moncash", "natcash", "bank_transfer"],
    stripePriceId: "price_pro_usd_149",
    stripeProductId: "prod_finops_pro",
    moncashServiceId: "MC_PRO_19500HTG",
    moncashMerchantCode: "FINOPS_MC_01",
    natcashServiceId: "NC_PRO_19500HTG",
    natcashMerchantCode: "FINOPS_NC_01"
  },
  {
    id: "BUSINESS",
    code: "BUSINESS",
    name: "Business Plan",
    price: 349,
    currency: "USD",
    priceUsd: 349,
    priceHtg: 45700,
    extraUserPriceUsd: 3,
    extraUserPriceHtg: 390,
    billingCycle: "MONTHLY",
    userLimit: 150,
    maxBranches: 10,
    maxTransactions: 20000,
    maxStorageMB: 25000,
    description: "Pour entreprises multi-départements avec assistant IA CFO et gestion multi-succursales.",
    featuresEnabled: ["attendance", "payroll", "hr", "accounting", "bi", "aiCfo", "multiBranch", "commissionEngine"],
    status: "ACTIVE",
    supportedGateways: ["stripe", "moncash", "natcash", "bank_transfer"],
    stripePriceId: "price_business_usd_349",
    stripeProductId: "prod_finops_business",
    moncashServiceId: "MC_BIZ_45700HTG",
    moncashMerchantCode: "FINOPS_MC_01",
    natcashServiceId: "NC_BIZ_45700HTG",
    natcashMerchantCode: "FINOPS_NC_01"
  },
  {
    id: "ENTERPRISE",
    code: "ENTERPRISE",
    name: "Enterprise Plan",
    price: 999,
    currency: "USD",
    priceUsd: 999,
    priceHtg: 130800,
    extraUserPriceUsd: 2,
    extraUserPriceHtg: 260,
    billingCycle: "MONTHLY",
    userLimit: 1000,
    maxBranches: 50,
    maxTransactions: 100000,
    maxStorageMB: 100000,
    description: "Grands comptes : isolation multi-tenant stricte, coffre-fort forensique SHA-256 et SLA dédié.",
    featuresEnabled: ["attendance", "payroll", "hr", "accounting", "bi", "aiCfo", "multiBranch", "auditVault", "customSla", "commissionEngine", "disasterRecovery"],
    status: "ACTIVE",
    badgeText: "Haute Disponibilité",
    supportedGateways: ["stripe", "moncash", "natcash", "bank_transfer"],
    stripePriceId: "price_enterprise_usd_999",
    stripeProductId: "prod_finops_enterprise",
    moncashServiceId: "MC_ENT_130800HTG",
    moncashMerchantCode: "FINOPS_MC_01",
    natcashServiceId: "NC_ENT_130800HTG",
    natcashMerchantCode: "FINOPS_NC_01"
  },
  {
    id: "CUSTOM",
    code: "CUSTOM",
    name: "Custom Corporate Plan",
    price: 2499,
    currency: "USD",
    priceUsd: 2499,
    priceHtg: 327000,
    extraUserPriceUsd: 1.5,
    extraUserPriceHtg: 195,
    billingCycle: "MONTHLY",
    userLimit: 10000,
    maxBranches: 200,
    maxTransactions: 500000,
    maxStorageMB: 500000,
    description: "Sur-mesure pour groupes industriels avec passerelles de paiement personnalisées et intégrations ERP.",
    featuresEnabled: ["attendance", "payroll", "hr", "accounting", "bi", "aiCfo", "multiBranch", "auditVault", "customSla", "dedicatedSupport", "commissionEngine", "disasterRecovery"],
    status: "ACTIVE",
    supportedGateways: ["stripe", "moncash", "natcash", "bank_transfer"],
    stripePriceId: "price_custom_usd_2499",
    stripeProductId: "prod_finops_custom",
    moncashServiceId: "MC_CUSTOM_327000HTG",
    moncashMerchantCode: "FINOPS_MC_01",
    natcashServiceId: "NC_CUSTOM_327000HTG",
    natcashMerchantCode: "FINOPS_NC_01"
  },
  {
    id: "TRIAL",
    code: "TRIAL",
    name: "Evaluation Trial (30 jours)",
    price: 0,
    currency: "USD",
    priceUsd: 0,
    priceHtg: 0,
    extraUserPriceUsd: 0,
    extraUserPriceHtg: 0,
    billingCycle: "MONTHLY",
    userLimit: 10,
    maxBranches: 1,
    maxTransactions: 500,
    maxStorageMB: 500,
    trialDays: 30,
    description: "Période d'évaluation complète sans engagement avec passerelles de test.",
    featuresEnabled: ["attendance", "payroll", "accounting", "hr", "bi", "aiCfo"],
    status: "ACTIVE",
    supportedGateways: ["stripe", "moncash", "natcash"]
  }
];
