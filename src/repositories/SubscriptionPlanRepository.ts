import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { ForensicLogRepository } from "./ForensicLogRepository";

export type PaymentGatewayType = "stripe" | "moncash" | "natcash" | "bank_transfer";

export interface SubscriptionPlanDocument {
  id: string; // e.g. "STARTER", "PROFESSIONAL", "BUSINESS", "ENTERPRISE", "CUSTOM", "TRIAL" or custom UUID
  code: string;
  name: string;
  price: number; // Primary display price (typically USD)
  currency: string; // "USD" | "HTG"
  priceUsd: number;
  priceHtg: number;
  extraUserPriceUsd?: number; // Price per extra collaborator/seat per month
  extraUserPriceHtg?: number; // Price in Gourdes per extra seat
  billingCycle: "MONTHLY" | "ANNUAL" | "QUARTERLY";
  userLimit: number; // Collaborator / Employee seat capacity (e.g., 10, 30, 50, 150, 1000)
  maxBranches?: number;
  maxTransactions: number;
  maxStorageMB?: number;
  description: string;
  featuresEnabled: string[];
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  isPopular?: boolean;
  badgeText?: string;
  trialDays?: number;

  // Payment Gateways Integration Metadata (Ready for Stripe, MonCash, Natcash)
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
    userLimit: 10, // Default 10 collaborateurs (superadmin can change to 30, 50, etc.)
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

export class SubscriptionPlanRepository {
  private static collectionName = "subscription_plans";

  /**
   * Seeds default subscription plans into Firestore collection `subscription_plans` if not already present.
   */
  static async seedDefaultPlans(): Promise<SubscriptionPlanDocument[]> {
    console.log("[SubscriptionPlanRepository] Seeding subscription plans in Firestore...");
    
    for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
      try {
        const docRef = doc(db, this.collectionName, plan.id);
        await setDoc(docRef, {
          ...plan,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.error(`[SubscriptionPlanRepository] Failed to seed plan ${plan.id}:`, err);
      }
    }

    return DEFAULT_SUBSCRIPTION_PLANS;
  }

  /**
   * Fetches all subscription plans stored in Firestore `subscription_plans`.
   * Automatically seeds if collection is empty.
   */
  static async getAllPlans(): Promise<SubscriptionPlanDocument[]> {
    try {
      const snap = await getDocs(collection(db, this.collectionName));
      if (snap.empty) {
        return await this.seedDefaultPlans();
      }

      const plans: SubscriptionPlanDocument[] = [];
      snap.forEach((d) => {
        const data = d.data() as SubscriptionPlanDocument;
        plans.push({
          ...data,
          id: d.id,
          priceUsd: data.priceUsd ?? data.price ?? 0,
          priceHtg: data.priceHtg ?? ((data.price || 0) * 131),
          userLimit: data.userLimit ?? 10,
          supportedGateways: data.supportedGateways ?? ["stripe", "moncash", "natcash", "bank_transfer"]
        });
      });

      // Sort by price ascending
      plans.sort((a, b) => a.priceUsd - b.priceUsd);

      return plans;
    } catch (error) {
      console.warn("[SubscriptionPlanRepository] Error fetching subscription_plans, fallback to defaults:", error);
      handleFirestoreError(error, OperationType.LIST, this.collectionName);
      return DEFAULT_SUBSCRIPTION_PLANS;
    }
  }

  /**
   * Fetches a single plan by code/id.
   */
  static async getPlanById(planId: string): Promise<SubscriptionPlanDocument | null> {
    try {
      const docSnap = await getDoc(doc(db, this.collectionName, planId));
      if (docSnap.exists()) {
        const data = docSnap.data() as SubscriptionPlanDocument;
        return {
          ...data,
          id: docSnap.id,
          priceUsd: data.priceUsd ?? data.price ?? 0,
          priceHtg: data.priceHtg ?? ((data.price || 0) * 131),
          userLimit: data.userLimit ?? 10
        };
      }
      return DEFAULT_SUBSCRIPTION_PLANS.find(p => p.id === planId) || null;
    } catch (error) {
      console.warn(`[SubscriptionPlanRepository] Error fetching plan ${planId}:`, error);
      return DEFAULT_SUBSCRIPTION_PLANS.find(p => p.id === planId) || null;
    }
  }

  /**
   * Creates or updates a subscription plan in Firestore `subscription_plans` with forensic audit logging.
   */
  static async savePlan(
    plan: SubscriptionPlanDocument,
    actor?: { uid: string; email: string; name: string }
  ): Promise<void> {
    try {
      const planId = plan.id || plan.code || `PLAN_${Date.now()}`;
      const sanitizedPlan: SubscriptionPlanDocument = {
        ...plan,
        id: planId,
        price: Number(plan.priceUsd ?? plan.price ?? 0),
        priceUsd: Number(plan.priceUsd ?? plan.price ?? 0),
        priceHtg: Number(plan.priceHtg ?? (Number(plan.priceUsd || 0) * 131)),
        userLimit: Number(plan.userLimit || 10),
        maxTransactions: Number(plan.maxTransactions || 1000),
        maxBranches: Number(plan.maxBranches || 1),
        maxStorageMB: Number(plan.maxStorageMB || 1000),
        extraUserPriceUsd: Number(plan.extraUserPriceUsd || 0),
        extraUserPriceHtg: Number(plan.extraUserPriceHtg || 0),
        supportedGateways: plan.supportedGateways || ["stripe", "moncash", "natcash", "bank_transfer"]
      };

      const docRef = doc(db, this.collectionName, planId);
      await setDoc(docRef, {
        ...sanitizedPlan,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Forensic Audit Log
      if (actor) {
        const forensic = await ForensicLogRepository.createAndSignLog({
          business_id: "GLOBAL_SUPERADMIN",
          action: "UPDATE_SUBSCRIPTION_PLAN",
          userId: actor.uid,
          actorId: actor.uid,
          userName: actor.name || "Super Admin",
          userRole: "SUPER_ADMIN",
          userEmail: actor.email,
          timestamp: new Date().toISOString(),
          ipAddress: "127.0.0.1",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "Node/SuperAdmin",
          details: `Plan ${sanitizedPlan.name} (${planId}) mis à jour : Limite ${sanitizedPlan.userLimit} collaborateurs, $${sanitizedPlan.priceUsd}/mois (${sanitizedPlan.priceHtg} HTG). Passerelles: ${sanitizedPlan.supportedGateways?.join(", ")}`,
          afterState: JSON.stringify(sanitizedPlan)
        });
        await ForensicLogRepository.writeForensicLog(forensic);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${this.collectionName}/${plan.id}`);
    }
  }

  /**
   * Deletes or archives a subscription plan.
   */
  static async deletePlan(
    planId: string,
    actor?: { uid: string; email: string; name: string }
  ): Promise<void> {
    try {
      const docRef = doc(db, this.collectionName, planId);
      await deleteDoc(docRef);

      if (actor) {
        const forensic = await ForensicLogRepository.createAndSignLog({
          business_id: "GLOBAL_SUPERADMIN",
          action: "DELETE_SUBSCRIPTION_PLAN",
          userId: actor.uid,
          actorId: actor.uid,
          userName: actor.name || "Super Admin",
          userRole: "SUPER_ADMIN",
          userEmail: actor.email,
          timestamp: new Date().toISOString(),
          ipAddress: "127.0.0.1",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "Node/SuperAdmin",
          details: `Plan ${planId} supprimé du catalogue Firestore par le Super Admin.`
        });
        await ForensicLogRepository.writeForensicLog(forensic);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${this.collectionName}/${planId}`);
    }
  }
}

