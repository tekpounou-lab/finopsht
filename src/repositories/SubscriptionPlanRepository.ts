import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { ForensicLogRepository } from "./ForensicLogRepository";

import {
  PaymentGatewayType,
  SubscriptionPlanDocument,
  DEFAULT_SUBSCRIPTION_PLANS
} from "../constants/subscriptionPlans";

export type { PaymentGatewayType, SubscriptionPlanDocument };
export { DEFAULT_SUBSCRIPTION_PLANS };

export class SubscriptionPlanRepository {
  private static collectionName = "subscription_plans";

  /**
   * Seeds default subscription plans into Firestore collection `subscription_plans` (Super Admin only).
   */
  static async seedDefaultPlans(): Promise<SubscriptionPlanDocument[]> {
    if (!auth?.currentUser) {
      handleFirestoreError(
        new Error("Missing or insufficient permissions: Super Admin authentication is required to seed subscription_plans."),
        OperationType.WRITE,
        this.collectionName
      );
    }

    for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
      try {
        const docRef = doc(db, this.collectionName, plan.id);
        await setDoc(docRef, {
          ...plan,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `${this.collectionName}/${plan.id}`);
      }
    }

    return [...DEFAULT_SUBSCRIPTION_PLANS].sort((a, b) => a.priceUsd - b.priceUsd);
  }

  /**
   * Fetches all subscription plans stored in Firestore `subscription_plans`.
   * Falls back read-only to DEFAULT_SUBSCRIPTION_PLANS when collection is empty without performing unauthorized client writes.
   */
  static async getAllPlans(): Promise<SubscriptionPlanDocument[]> {
    try {
      const snap = await getDocs(collection(db, this.collectionName));
      if (snap.empty) {
        return [...DEFAULT_SUBSCRIPTION_PLANS].sort((a, b) => a.priceUsd - b.priceUsd);
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
      return [...DEFAULT_SUBSCRIPTION_PLANS].sort((a, b) => a.priceUsd - b.priceUsd);
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

