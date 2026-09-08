import { useState, useCallback } from "react";
import { BusinessAdministrationRepository } from "../services/business/BusinessAdministrationRepository";
import { BusinessSnapshotService } from "../services/business/BusinessSnapshotService";
import { SubscriptionService } from "../services/billing/SubscriptionService";
import { useBusinessContext } from "../contexts/BusinessContext";
import { Business, Branch, Department } from "../types";
import { isQuotaExceededError } from "../utils/resilientFirestore";

export function useBusinessAdmin() {
  const { currentBusiness } = useBusinessContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBusiness = useCallback(async () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("finops_subscription_updated"));
    }
  }, []);

  const businessId = currentBusiness?.id;

  const wrapAction = useCallback(async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await action();
      // After any admin action, attempt to refresh snapshot/modules.
      // Make this non-fatal so ancillary snapshot sync does not fail the primary admin action.
      if (businessId) {
        try {
          await BusinessSnapshotService.buildSnapshot(businessId);
          await refreshBusiness();
        } catch (snapshotErr: any) {
          console.warn("[BusinessAdmin] Non-critical snapshot refresh error:", snapshotErr);
        }
      }
    } catch (err: any) {
      console.error("[BusinessAdmin] Action failed:", err);
      const isQuota = isQuotaExceededError(err);
      setError(
        isQuota
          ? "Quota Firestore journalier atteint (Free tier read/write limit). Réessayez après réinitialisation ou passez au forfait payant."
          : (err.message || "Une erreur est survenue lors de l'opération.")
      );
      throw err;
    } finally {
      setLoading(false);
    }
  }, [businessId, refreshBusiness]);

  const updateProfile = async (data: Partial<Business>) => {
    if (!businessId) return;
    await wrapAction(() => BusinessAdministrationRepository.updateBusinessProfile(businessId, data));
  };

  const saveBranch = async (branch: Partial<Branch>) => {
    if (!businessId) return;
    await wrapAction(() => BusinessAdministrationRepository.saveBranch(businessId, branch));
  };

  const deleteBranch = async (id: string) => {
    await wrapAction(() => BusinessAdministrationRepository.deleteBranch(id));
  };

  const saveDepartment = async (dept: Partial<Department>) => {
    if (!businessId) return;
    await wrapAction(() => BusinessAdministrationRepository.saveDepartment(businessId, dept));
  };

  const deleteDepartment = async (id: string) => {
    await wrapAction(() => BusinessAdministrationRepository.deleteDepartment(id, businessId));
  };

  const updateSettings = async (data: any) => {
    if (!businessId) return;
    await wrapAction(() => BusinessAdministrationRepository.updateSettings(businessId, data));
  };

  const updateFeatures = async (features: any) => {
    if (!businessId) return;
    await wrapAction(() => BusinessAdministrationRepository.updateFeatures(businessId, features));
  };

  const upgradePlan = async (newPlanId: string) => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      await SubscriptionService.upgradePlan(businessId, newPlanId);
      await refreshBusiness();
    } catch (err: any) {
      console.error("[BusinessAdmin] upgradePlan failed:", err);
      setError(err.message || "Échec de la mise à niveau du forfait.");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    updateProfile,
    saveBranch,
    deleteBranch,
    saveDepartment,
    deleteDepartment,
    updateSettings,
    updateFeatures,
    upgradePlan
  };
}
