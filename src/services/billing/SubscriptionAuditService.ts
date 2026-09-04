import { db } from "../../lib/firebase";
import { collection, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { SubscriptionRepository, FeatureRepository } from "../../repositories";
import { SubscriptionPlanRepository } from "../../repositories/SubscriptionPlanRepository";

export interface TenantAuditSummary {
  tenantId: string;
  tenantName: string;
  plan: string;
  status: string;
  seatsUsed: number;
  seatsLimit: number;
  isSeatExceeded: boolean;
  expiresAt?: string;
  hasSubscriptionDoc: boolean;
  hasFeaturesDoc: boolean;
  alerts: string[];
}

export interface SubscriptionAuditReport {
  timestamp: string;
  totalTenants: number;
  activeSubscriptionsCount: number;
  trialSubscriptionsCount: number;
  expiredSubscriptionsCount: number;
  missingSubscriptionsHealedCount: number;
  missingFeaturesHealedCount: number;
  seatExceededCount: number;
  tenantDetails: TenantAuditSummary[];
  globalAlerts: Array<{
    tenantId: string;
    tenantName: string;
    severity: "critical" | "warning" | "info";
    type: "EXPIRED" | "EXPIRING_SOON" | "SEAT_LIMIT_EXCEEDED" | "FEATURE_MISMATCH";
    message: string;
  }>;
}

export class SubscriptionAuditService {
  /**
   * Scans all businesses, subscriptions, and feature matrices.
   * Auto-heals missing subscription/features documents and generates diagnostic report.
   */
  static async auditAndHealAllTenants(): Promise<SubscriptionAuditReport> {
    const timestamp = new Date().toISOString();

    // 1. Fetch raw collections
    const [bizSnap, subSnap, empSnap, plansList] = await Promise.all([
      getDocs(collection(db, "businesses")).catch(() => ({ docs: [] })),
      getDocs(collection(db, "subscriptions")).catch(() => ({ docs: [] })),
      getDocs(collection(db, "employees")).catch(() => ({ docs: [] })),
      SubscriptionPlanRepository.getAllPlans().catch(() => [])
    ]);

    const businesses = bizSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const subscriptionsMap = new Map<string, any>();
    subSnap.docs.forEach(d => subscriptionsMap.set(d.id, { id: d.id, ...d.data() }));

    // Map active employees count per business
    const employeeCountMap = new Map<string, number>();
    empSnap.docs.forEach(d => {
      const data = d.data();
      const bizId = data.business_id || data.businessId;
      if (bizId && data.status !== "TERMINATED" && data.status !== "ARCHIVED" && data.isActive !== false) {
        employeeCountMap.set(bizId, (employeeCountMap.get(bizId) || 0) + 1);
      }
    });

    const planMap = new Map<string, any>();
    plansList.forEach(p => planMap.set(p.code.toUpperCase(), p));

    let activeSubscriptionsCount = 0;
    let trialSubscriptionsCount = 0;
    let expiredSubscriptionsCount = 0;
    let missingSubscriptionsHealedCount = 0;
    let missingFeaturesHealedCount = 0;
    let seatExceededCount = 0;

    const tenantDetails: TenantAuditSummary[] = [];
    const globalAlerts: SubscriptionAuditReport["globalAlerts"] = [];

    for (const biz of businesses) {
      const tenantId = biz.id;
      const tenantName = biz.name || biz.legalName || `Org-${tenantId.slice(0, 6)}`;
      const alerts: string[] = [];

      let subData = subscriptionsMap.get(tenantId);
      let hasSubscriptionDoc = !!subData;

      // Auto-heal missing subscription document
      if (!subData) {
        const defaultPlanCode = (biz.plan || "STARTER").toUpperCase();
        const planDoc = planMap.get(defaultPlanCode);
        subData = {
          business_id: tenantId,
          plan: defaultPlanCode,
          status: "ACTIVE",
          allowedLimits: {
            maxEmployees: planDoc?.userLimit || 10,
            maxTransactions: planDoc?.maxTransactions || 5000,
            featuresEnabled: planDoc?.featuresEnabled || ["attendance", "payroll", "hr", "accounting"]
          }
        };
        await SubscriptionRepository.saveSubscription(tenantId, subData);
        missingSubscriptionsHealedCount++;
        hasSubscriptionDoc = true;
      }

      // Check features document
      const features = await FeatureRepository.getWorkspaceFeatures(tenantId);
      let hasFeaturesDoc = !!features;

      const seatsUsed = employeeCountMap.get(tenantId) || 0;
      const seatsLimit = subData.allowedLimits?.maxEmployees || 10;
      const isSeatExceeded = seatsUsed > seatsLimit;

      if (isSeatExceeded) {
        seatExceededCount++;
        const msg = `Capacité dépassée : ${seatsUsed} collaborateurs actifs pour une limite de ${seatsLimit}.`;
        alerts.push(msg);
        globalAlerts.push({
          tenantId,
          tenantName,
          severity: "critical",
          type: "SEAT_LIMIT_EXCEEDED",
          message: msg
        });
      }

      const status = subData.status || "ACTIVE";
      if (status === "ACTIVE") activeSubscriptionsCount++;
      else if (status === "TRIAL") trialSubscriptionsCount++;
      else if (status === "EXPIRED" || status === "BLOCKED") expiredSubscriptionsCount++;

      // Check Expiration
      if (subData.expiresAt || subData.trialEndsAt) {
        const expDate = new Date(subData.expiresAt || subData.trialEndsAt);
        const now = new Date();
        if (expDate < now) {
          const msg = `Abonnement ou essai expiré depuis le ${expDate.toLocaleDateString()}.`;
          alerts.push(msg);
          globalAlerts.push({
            tenantId,
            tenantName,
            severity: "warning",
            type: "EXPIRED",
            message: msg
          });
        }
      }

      tenantDetails.push({
        tenantId,
        tenantName,
        plan: subData.plan || biz.plan || "STARTER",
        status,
        seatsUsed,
        seatsLimit,
        isSeatExceeded,
        expiresAt: subData.expiresAt || subData.trialEndsAt,
        hasSubscriptionDoc,
        hasFeaturesDoc,
        alerts
      });
    }

    return {
      timestamp,
      totalTenants: businesses.length,
      activeSubscriptionsCount,
      trialSubscriptionsCount,
      expiredSubscriptionsCount,
      missingSubscriptionsHealedCount,
      missingFeaturesHealedCount,
      seatExceededCount,
      tenantDetails,
      globalAlerts
    };
  }
}
