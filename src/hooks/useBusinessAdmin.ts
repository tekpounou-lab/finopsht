import { useState, useCallback } from "react";
import { BusinessAdministrationRepository } from "../services/business/BusinessAdministrationRepository";
import { BusinessSnapshotService } from "../services/business/BusinessSnapshotService";
import { useBusinessContext } from "../contexts/BusinessContext";
import { Business, Branch, Department } from "../types";

export function useBusinessAdmin() {
  const { currentBusiness } = useBusinessContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBusiness = useCallback(async () => {
    // Implement refresh if needed, for now just a stub or reload
    window.location.reload();
  }, []);

  const businessId = currentBusiness?.id;

  const wrapAction = useCallback(async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await action();
      // After any admin action, we should rebuild the snapshot to ensure all modules are synced
      if (businessId) {
        await BusinessSnapshotService.buildSnapshot(businessId);
        await refreshBusiness();
      }
    } catch (err: any) {
      console.error("[BusinessAdmin] Action failed:", err);
      setError(err.message || "Une erreur est survenue lors de l'opération.");
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

  return {
    loading,
    error,
    updateProfile,
    saveBranch,
    deleteBranch,
    saveDepartment,
    deleteDepartment,
    updateSettings,
    updateFeatures
  };
}
