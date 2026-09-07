import { db, auth } from "../../lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { SubscriptionPlanRepository } from "../../repositories/SubscriptionPlanRepository";
import { SubscriptionRepository, FeatureRepository } from "../../repositories";
import { ForensicLogRepository } from "../../repositories/ForensicLogRepository";
import { PermissionService } from "../PermissionService";
import { BusinessResolver } from "../business/BusinessResolver";
import { FeatureResolver } from "../FeatureResolver";
import { EventBus } from "../../modules/runtime/EventBus";
import { finopsEventOrchestrator } from "../finopsEventOrchestrator";

export interface UpgradePlanActor {
  uid?: string;
  name?: string;
  email?: string;
  role?: string;
  businessId?: string;
}

export class SubscriptionService {
  /**
   * Upgrades or updates the subscription plan for a specific business workspace.
   * Validates permissions (OWNER for own workspace or SUPER_ADMIN),
   * updates businesses, subscriptions, and settings collections,
   * syncs features, invalidates caches, emits events, and creates a forensic audit log.
   */
  static async upgradePlan(
    businessId: string,
    newPlanId: string,
    actorContext?: UpgradePlanActor,
    options?: { customUserLimit?: number }
  ): Promise<{ success: boolean; message: string; subscription: any }> {
    if (!businessId) {
      throw new Error("L'identifiant de l'entreprise (businessId) est obligatoire.");
    }
    if (!newPlanId) {
      throw new Error("Le plan sélectionné est invalide.");
    }

    const upperPlanId = newPlanId.toUpperCase();
    const currentUid = actorContext?.uid || auth.currentUser?.uid || "SYSTEM";
    const currentRole = (actorContext?.role || PermissionService.getRole() || "EMPLOYEE").toUpperCase();
    const currentEmail = actorContext?.email || auth.currentUser?.email || "";
    const currentName = actorContext?.name || auth.currentUser?.displayName || "Utilisateur";

    // 1. Multi-Tenant Authorization Check
    const isSuperAdmin = currentRole === "SUPER_ADMIN";
    const isOwner = currentRole === "OWNER";

    if (!isSuperAdmin && !isOwner) {
      throw new Error("Permission refusée : Seuls le Propriétaire (OWNER) ou le Super Admin peuvent modifier l'abonnement.");
    }

    // Tenant boundary validation for OWNER
    if (isOwner && !isSuperAdmin) {
      const activeBizId = actorContext?.businessId || PermissionService.getBusinessId();
      if (activeBizId && activeBizId !== businessId) {
        throw new Error("Permission refusée : Vous n'êtes pas autorisé à modifier l'abonnement d'un autre workspace.");
      }
    }

    // 2. Fetch Target Plan details
    const planDoc = await SubscriptionPlanRepository.getPlanById(upperPlanId);
    if (!planDoc) {
      throw new Error(`Le plan d'abonnement "${upperPlanId}" n'a pas été trouvé dans le catalogue.`);
    }

    const userLimit = options?.customUserLimit ?? planDoc.userLimit ?? 10;
    const featuresEnabled = planDoc.featuresEnabled || ["attendance", "payroll", "hr", "accounting"];

    // Get previous state for audit log
    let previousPlan = "FREE_TIER";
    try {
      const bizSnap = await getDoc(doc(db, "businesses", businessId));
      if (bizSnap.exists()) {
        previousPlan = bizSnap.data()?.plan || bizSnap.data()?.subscription?.plan || "FREE_TIER";
      }
    } catch (e) {
      console.warn("[SubscriptionService] Could not fetch previous plan:", e);
    }

    const nowIso = new Date().toISOString();

    // 3. Update Firestore documents
    // a) Update businesses/{businessId}
    const bizRef = doc(db, "businesses", businessId);
    await updateDoc(bizRef, {
      plan: upperPlanId,
      "subscription.plan": upperPlanId,
      "subscription.status": "ACTIVE",
      "subscription.userLimit": userLimit,
      "subscription.updatedAt": nowIso,
      seats: userLimit,
      updatedAt: serverTimestamp()
    }).catch(async () => {
      // If updateDoc fails because subscription nested object is missing, set with merge
      await setDoc(bizRef, {
        plan: upperPlanId,
        subscription: {
          plan: upperPlanId,
          status: "ACTIVE",
          userLimit,
          updatedAt: nowIso
        },
        seats: userLimit,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });

    // b) Update subscriptions/{businessId} via SubscriptionRepository
    const updatedSub = await SubscriptionRepository.syncSubscriptionWithPlan(businessId, upperPlanId, userLimit);

    // c) Update business_settings/{businessId}
    const settingsRef = doc(db, "business_settings", businessId);
    await setDoc(settingsRef, {
      subscription: {
        plan: upperPlanId,
        status: "ACTIVE",
        userLimit,
        updatedAt: nowIso
      },
      updatedAt: serverTimestamp()
    }, { merge: true });

    // d) Features are already synced inside syncSubscriptionWithPlan, but ensure explicit call
    await FeatureRepository.syncFeaturesWithPlan(businessId, featuresEnabled);

    // 4. Cache Invalidation
    FeatureResolver.clearCache(businessId);
    BusinessResolver.invalidateCache(businessId);

    // 5. Event Emissions
    try {
      EventBus.publish(EventBus.createEvent({
        correlationId: `sub_upgrade_${businessId}_${Date.now()}`,
        businessId,
        module: "IDENTITY",
        aggregate: "SUBSCRIPTION",
        type: "SubscriptionChanged",
        payload: {
          plan: upperPlanId,
          status: "ACTIVE",
          userLimit,
          featuresEnabled
        }
      }));

      finopsEventOrchestrator.emit("AUTHORIZATION", businessId, {
        action: "SUBSCRIPTION_UPDATED",
        business_id: businessId,
        plan: upperPlanId,
        actor: currentUid
      });
    } catch (evtErr) {
      console.warn("[SubscriptionService] Event notification failure:", evtErr);
    }

    // 6. Forensic Audit Logging
    try {
      const forensicLog = await ForensicLogRepository.createAndSignLog({
        business_id: businessId,
        action: "UPGRADE_SUBSCRIPTION_PLAN",
        userId: currentUid,
        actorId: currentUid,
        userName: currentName,
        userRole: currentRole,
        userEmail: currentEmail,
        timestamp: nowIso,
        ipAddress: "127.0.0.1",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "Node/SubscriptionService",
        details: `Passage au plan ${upperPlanId} (Limite: ${userLimit} collaborateurs) pour le workspace ${businessId}.`,
        beforeState: JSON.stringify({ plan: previousPlan }),
        afterState: JSON.stringify({ plan: upperPlanId, userLimit, featuresEnabled })
      });
      await ForensicLogRepository.writeForensicLog(forensicLog);
    } catch (logErr) {
      console.error("[SubscriptionService] Forensic logging error:", logErr);
    }

    return {
      success: true,
      message: `Abonnement mis à jour avec succès vers le plan ${upperPlanId}.`,
      subscription: updatedSub
    };
  }
}
