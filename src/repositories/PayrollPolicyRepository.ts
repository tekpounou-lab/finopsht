import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  PayrollPolicy,
  PayrollPolicySchema,
  PayrollPolicyInput,
} from "../types/payrollPolicy";
import { ForensicLogRepository } from "./ForensicLogRepository";
import { StaticDataCacheService } from "../services/cache/StaticDataCacheService";
import { resilientGetDocs, invalidateResilientQueriesByPrefix } from "../utils/resilientFirestore";
import { ExceptionOrchestrator } from "../modules/runtime/ExceptionOrchestrator";

export class PayrollPolicyRepository {
  private static getCollectionRef(businessId: string) {
    return collection(db, "businesses", businessId, "payrollPolicies");
  }

  private static getSafeStorage(): Storage | null {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
    return null;
  }

  /**
   * Retrieves all historical and active payroll policies for a business tenant.
   */
  public static async listPolicies(businessId: string, forceRefresh = false): Promise<PayrollPolicy[]> {
    if (!businessId) return [];

    return await StaticDataCacheService.getOrFetch(
      `payroll_policies_history:${businessId}`,
      async () => {
        try {
          const colRef = this.getCollectionRef(businessId);
          const snap = await resilientGetDocs(colRef, undefined, { forceRefresh });
          if (!snap || snap.empty) {
            // Check localStorage fallback for tenant ONLY
            const storage = this.getSafeStorage();
            if (storage) {
              try {
                let raw = storage.getItem(`finops_payroll_policy_${businessId}`);
                if (!raw) {
                  const latestRaw = storage.getItem("finops_payroll_policy_latest");
                  if (latestRaw) {
                    const parsedLatest = JSON.parse(latestRaw);
                    if (parsedLatest && (parsedLatest.businessId === businessId || parsedLatest.business_id === businessId)) {
                      raw = latestRaw;
                    }
                  }
                }
                if (raw) {
                  const p = JSON.parse(raw);
                  if (
                    p &&
                    typeof p === "object" &&
                    (p.businessId === businessId || p.business_id === businessId) &&
                    p.syncStatus !== "UNSYNCHRONIZED" &&
                    !p.isUnsynchronized &&
                    (p.id || p.policyId || p.frequency)
                  ) {
                    return [p];
                  }
                }
              } catch (e) {}
            }
            return [];
          }

          const docs = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as any[];

          return docs.sort((a, b) => {
            const verA = Number(a.version) || 0;
            const verB = Number(b.version) || 0;
            if (verB !== verA) return verB - verA;
            return (b.effectiveFrom || "").localeCompare(a.effectiveFrom || "");
          });
        } catch (err) {
          console.warn(`[PayrollPolicyRepository] Error listing policies for ${businessId}:`, err);
          const storage = this.getSafeStorage();
          if (storage) {
            try {
              let raw = storage.getItem(`finops_payroll_policy_${businessId}`);
              if (!raw) {
                const latestRaw = storage.getItem("finops_payroll_policy_latest");
                if (latestRaw) {
                  const parsedLatest = JSON.parse(latestRaw);
                  if (parsedLatest && (parsedLatest.businessId === businessId || parsedLatest.business_id === businessId)) {
                    raw = latestRaw;
                  }
                }
              }
              if (raw) {
                const p = JSON.parse(raw);
                if (
                  p &&
                  typeof p === "object" &&
                  (p.businessId === businessId || p.business_id === businessId) &&
                  p.syncStatus !== "UNSYNCHRONIZED" &&
                  !p.isUnsynchronized &&
                  (p.id || p.policyId || p.frequency)
                ) {
                  return [p];
                }
              }
            } catch (e) {}
          }
          return [];
        }
      },
      { category: "TAX_CONFIG", businessId, forceRefresh }
    );
  }

  /**
   * Resolves the effective policy for a given business ID and target date (YYYY-MM-DD).
   */
  public static async getEffectivePolicy(
    businessId: string,
    targetDate?: string,
    forceRefresh = false
  ): Promise<PayrollPolicy | null> {
    if (!businessId) return null;

    const dateStr = targetDate || new Date().toISOString().split("T")[0];

    const policies = await this.listPolicies(businessId, forceRefresh);
    if (policies.length === 0) {
      const storage = this.getSafeStorage();
      if (storage) {
        try {
          let raw = storage.getItem(`finops_payroll_policy_${businessId}`);
          if (!raw) {
            const latestRaw = storage.getItem("finops_payroll_policy_latest");
            if (latestRaw) {
              const parsedLatest = JSON.parse(latestRaw);
              if (parsedLatest && (parsedLatest.businessId === businessId || parsedLatest.business_id === businessId)) {
                raw = latestRaw;
              }
            }
          }
          if (raw) {
            const p = JSON.parse(raw);
            if (
              p &&
              typeof p === "object" &&
              (p.businessId === businessId || p.business_id === businessId) &&
              p.syncStatus !== "UNSYNCHRONIZED" &&
              !p.isUnsynchronized
            ) {
              return p;
            }
          }
        } catch (e) {}
      }
      return null;
    }

    // Filter by effectiveFrom <= dateStr and (!effectiveTo or effectiveTo > dateStr)
    const matches = policies.filter((p) => {
      const from = p.effectiveFrom;
      const to = p.effectiveTo;
      if (from > dateStr) return false;
      if (to && to <= dateStr) return false;
      return true;
    });

    if (matches.length > 0) {
      // Sort candidates: latest effectiveFrom first, then highest version
      matches.sort((a, b) => {
        if (b.effectiveFrom !== a.effectiveFrom) {
          return b.effectiveFrom.localeCompare(a.effectiveFrom);
        }
        return (b.version || 0) - (a.version || 0);
      });
      return matches[0];
    }

    // Fallback to latest active policy if no date match
    const active = policies.find((p) => p.status === "ACTIVE");
    return active || policies[0] || null;
  }

  /**
   * Creates a new versioned PayrollPolicy document and updates active status atomically.
   */
  public static async saveAndActivatePolicy(
    businessId: string,
    rawInput: PayrollPolicyInput,
    actor: { id: string; email?: string; role?: string },
    options?: { baseVersion?: number }
  ): Promise<PayrollPolicy> {
    if (!businessId || !businessId.trim() || businessId === "BIZ_MAIN") {
      throw new Error("TENANT_UNRESOLVED: businessId is required to persist payroll policy. Substitution with BIZ_MAIN is forbidden.");
    }

    // 1. Validate Input via Zod
    const effectiveFromDate = rawInput.effectiveFrom || new Date().toISOString().split("T")[0];
    const validatedInput = PayrollPolicySchema.parse({
      ...rawInput,
      businessId,
      business_id: businessId,
      effectiveFrom: effectiveFromDate,
    });

    // 2. Load existing policy history to compute next version
    const existingPolicies = await this.listPolicies(businessId, true);
    const currentActive = existingPolicies.find((p) => p.status === "ACTIVE");

    // Concurrency detection: if baseVersion was provided and currentActive has moved ahead
    if (options?.baseVersion !== undefined && currentActive?.version && currentActive.version !== options.baseVersion) {
      throw new Error(
        `CONCURRENT_MODIFICATION_DETECTED: La politique a été modifiée par un autre utilisateur (version actuelle: v${currentActive.version}, version attendue: v${options.baseVersion}). Veuillez recharger la page.`
      );
    }

    // Idempotency: avoid creating duplicate identical versions if nothing changed
    if (currentActive) {
      const isIdentical =
        currentActive.frequency === validatedInput.frequency &&
        currentActive.currency === validatedInput.currency &&
        currentActive.standardHoursPerCycle === validatedInput.standardHoursPerCycle &&
        currentActive.attendanceToleranceHours === validatedInput.attendanceToleranceHours &&
        currentActive.workingDaysBasis === validatedInput.workingDaysBasis &&
        currentActive.overtime?.normalRate === validatedInput.overtime?.normalRate &&
        currentActive.overtime?.holidayRate === validatedInput.overtime?.holidayRate &&
        currentActive.penalties?.lateFixedCents === validatedInput.penalties?.lateFixedCents &&
        currentActive.penalties?.absencePerDayCents === validatedInput.penalties?.absencePerDayCents &&
        currentActive.socialContributions?.enabled === validatedInput.socialContributions?.enabled &&
        currentActive.socialContributions?.cnssOna?.employeeRate === validatedInput.socialContributions?.cnssOna?.employeeRate &&
        currentActive.socialContributions?.cnssOna?.employerRate === validatedInput.socialContributions?.cnssOna?.employerRate &&
        currentActive.socialContributions?.ofatmaCns?.employeeRate === validatedInput.socialContributions?.ofatmaCns?.employeeRate &&
        currentActive.socialContributions?.ofatmaCns?.employerRate === validatedInput.socialContributions?.ofatmaCns?.employerRate &&
        currentActive.commissions?.defaultSalesRate === validatedInput.commissions?.defaultSalesRate &&
        currentActive.survivalFloor?.enabled === validatedInput.survivalFloor?.enabled &&
        currentActive.survivalFloor?.minimumNetHTG === validatedInput.survivalFloor?.minimumNetHTG &&
        currentActive.attendance?.excludeWithoutRecords === validatedInput.attendance?.excludeWithoutRecords &&
        currentActive.resolution?.mode === validatedInput.resolution?.mode;

      if (isIdentical) {
        return currentActive;
      }
    }

    const nextVersion = currentActive ? (currentActive.version || 1) + 1 : 1;
    const policyId = `pol_${businessId}_v${nextVersion}_${Date.now()}`;
    const nowIso = new Date().toISOString();

    const newPolicy: PayrollPolicy = {
      ...validatedInput,
      id: policyId,
      policyId,
      businessId,
      business_id: businessId,
      version: nextVersion,
      versionLabel: `v${nextVersion}.0.0-canonical`,
      status: "ACTIVE",
      effectiveFrom: effectiveFromDate,
      effectiveTo: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: actor.id || "usr_admin",
      updatedBy: actor.id || "usr_admin",
    };

    // 3. Perform Atomic Batch Persistence
    const batch = writeBatch(db);

    // Supersede previous active policy if existing
    if (currentActive && currentActive.id) {
      const prevRef = doc(db, "businesses", businessId, "payrollPolicies", currentActive.id);
      batch.update(prevRef, {
        status: "SUPERSEDED",
        effectiveTo: effectiveFromDate,
        updatedAt: nowIso,
        updatedBy: actor.id || "usr_admin",
      });
    }

    // Insert new policy doc in businesses/{businessId}/payrollPolicies/{policyId}
    const newPolicyRef = doc(db, "businesses", businessId, "payrollPolicies", policyId);
    batch.set(newPolicyRef, newPolicy);

    // Sync to legacy settings pointers for 100% backward compatibility
    const legacyPoliciesRef = doc(db, "businesses", businessId, "settings", "payroll_policies");
    batch.set(
      legacyPoliciesRef,
      {
        policyId,
        version: newPolicy.versionLabel,
        effectiveFrom: effectiveFromDate,
        frequency: newPolicy.frequency,
        currency: newPolicy.currency,
        standardHoursPerCycle: newPolicy.standardHoursPerCycle,
        standardQuinzaineHours: newPolicy.standardHoursPerCycle,
        attendanceToleranceHours: newPolicy.attendanceToleranceHours,
        workingDaysBasis: newPolicy.workingDaysBasis,
        enableTaxes: newPolicy.socialContributions.enabled,
        enable_social_taxes: newPolicy.socialContributions.enabled,
        onaEmployeeRate: newPolicy.socialContributions.cnssOna.employeeRate,
        onaEmployerRate: newPolicy.socialContributions.cnssOna.employerRate,
        ofatmaEmployeeRate: newPolicy.socialContributions.ofatmaCns.employeeRate,
        ofatmaEmployerRate: newPolicy.socialContributions.ofatmaCns.employerRate,
        enableSurvivalFloor: newPolicy.survivalFloor.enabled,
        enable_survival_floor: newPolicy.survivalFloor.enabled,
        survivalFloor: newPolicy.survivalFloor.minimumNetHTG,
        survivalFloorHTG: newPolicy.survivalFloor.minimumNetHTG,
        overtimeRate150: newPolicy.overtime.normalRate,
        overtimeRate200: newPolicy.overtime.holidayRate,
        latePenaltyCents: newPolicy.penalties.lateFixedCents,
        absencePenaltyCents: newPolicy.penalties.absencePerDayCents,
        defaultCommissionRate: newPolicy.commissions.defaultSalesRate,
        requireAttendanceForPayroll: newPolicy.attendance.excludeWithoutRecords,
        resolutionMode: newPolicy.resolution.mode,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const legacyTaxRef = doc(db, "businesses", businessId, "settings", "tax_config");
    batch.set(
      legacyTaxRef,
      {
        enableTaxes: newPolicy.socialContributions.enabled,
        cnssRateEmployee: newPolicy.socialContributions.cnssOna.employeeRate,
        cnssRateEmployer: newPolicy.socialContributions.cnssOna.employerRate,
        cnsRateEmployee: newPolicy.socialContributions.ofatmaCns.employeeRate,
        cnsRateEmployer: newPolicy.socialContributions.ofatmaCns.employerRate,
        survivalFloorHTG: newPolicy.survivalFloor.minimumNetHTG,
        currency: newPolicy.currency,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    try {
      await batch.commit();
    } catch (batchErr: any) {
      ExceptionOrchestrator.handle(batchErr, {
        businessId,
        actorId: actor.id || "usr_admin",
        module: "PAYROLL",
        operation: "SAVE_POLICY_BATCH_COMMIT",
        severity: "HIGH",
      });

      const storage = this.getSafeStorage();
      if (storage) {
        try {
          const unsyncedPolicy = {
            ...newPolicy,
            status: "DRAFT" as const,
            syncStatus: "UNSYNCHRONIZED",
            isUnsynchronized: true,
            error: batchErr?.message || "Batch commit failed",
          };
          storage.setItem(`finops_payroll_policy_draft_${businessId}`, JSON.stringify(unsyncedPolicy));
        } catch (e) {}
      }

      throw new Error(`FIRESTORE_PERSISTENCE_FAILED: Échec de l'enregistrement distant de la politique de paie dans Firestore (${batchErr?.message || "Erreur"}).`);
    }

    // 4. Write Forensic Audit Trail Log
    try {
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: businessId,
        actorId: actor.id || "usr_admin",
        userName: actor.email || actor.id || "usr_admin",
        userRole: actor.role || "ADMIN",
        action: "PAYROLL_POLICY_UPDATED",
        details: `Politique de paie activée v${nextVersion} (${newPolicy.versionLabel}). EffectiveFrom: ${effectiveFromDate}. Mode: ${newPolicy.resolution.mode}.`,
        beforeState: currentActive || null,
        afterState: newPolicy,
        timestamp: nowIso,
      });
      await ForensicLogRepository.writeForensicLog(log);
    } catch (logErr) {
      console.warn("[PayrollPolicyRepository] Failed to write forensic log:", logErr);
    }

    // 5. Invalidate Caches & Local Resilient Memory
    await StaticDataCacheService.invalidateKey(`payroll_policies:${businessId}`);
    await StaticDataCacheService.invalidateKey(`payroll_policies_history:${businessId}`);
    await StaticDataCacheService.invalidateKey(`tax_config:${businessId}`);
    invalidateResilientQueriesByPrefix(`businesses/${businessId}/payrollPolicies`);
    invalidateResilientQueriesByPrefix(`payrollPolicies`);
    invalidateResilientQueriesByPrefix(`business_settings`);

    // 6. Synchronize to localStorage immediate client cache
    const storage = this.getSafeStorage();
    if (storage) {
      try {
        storage.setItem(`finops_payroll_policy_${businessId}`, JSON.stringify(newPolicy));
        storage.setItem("finops_payroll_policy_latest", JSON.stringify(newPolicy));
      } catch (e) {}
    }

    return newPolicy;
  }
}
