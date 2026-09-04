import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { ForensicLogRepository } from "../repositories/ForensicLogRepository";
import { EventBus } from "../modules/runtime/EventBus";
import { SuperAdminActor } from "../repositories/SuperAdminRepository";
import { STATUTORY_TAX_RATES, PercentageRateSchema } from "../constants/finance";

export interface GlobalTaxRates {
  onaEmployeeRate: number; // e.g. 0.06 (6%)
  onaEmployerRate: number; // e.g. 0.06 (6%)
  ofatmaRate: number;     // e.g. 0.02 (2%)
  cnsRate: number;        // e.g. 0.01 (1%)
  effectiveDate: string;
  version: string;
}

export const DEFAULT_GLOBAL_TAX_RATES: GlobalTaxRates = {
  onaEmployeeRate: STATUTORY_TAX_RATES.ONA.EMPLOYEE_RATE,
  onaEmployerRate: STATUTORY_TAX_RATES.ONA.EMPLOYER_RATE,
  ofatmaRate: STATUTORY_TAX_RATES.OFATMA.EMPLOYEE_RATE,
  cnsRate: 0.01,
  effectiveDate: "2026-01-01",
  version: "1.0.0"
};

export const SystemTaxConfigurationService = {
  /**
   * Reads current global tax configuration.
   */
  async getGlobalTaxRates(): Promise<GlobalTaxRates> {
    try {
      const ref = doc(db, "system_config", "global_tax_rates");
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        return DEFAULT_GLOBAL_TAX_RATES;
      }
      return { ...DEFAULT_GLOBAL_TAX_RATES, ...snap.data() } as GlobalTaxRates;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, "system_config/global_tax_rates");
      return DEFAULT_GLOBAL_TAX_RATES;
    }
  },

  /**
   * Updates system-wide tax rates (SuperAdmin action).
   */
  async updateGlobalTaxRates(
    newRates: Partial<GlobalTaxRates>,
    reason: string,
    actor: SuperAdminActor
  ): Promise<GlobalTaxRates> {
    if (!reason || reason.trim().length < 10) {
      throw new Error("SuperAdmin Error: Justification of at least 10 characters is required to update global tax configuration.");
    }

    // Semantic validation on rates
    if (newRates.onaEmployeeRate !== undefined) {
      PercentageRateSchema.parse(newRates.onaEmployeeRate);
    }
    if (newRates.onaEmployerRate !== undefined) {
      PercentageRateSchema.parse(newRates.onaEmployerRate);
    }
    if (newRates.ofatmaRate !== undefined) {
      PercentageRateSchema.parse(newRates.ofatmaRate);
    }
    if (newRates.cnsRate !== undefined) {
      PercentageRateSchema.parse(newRates.cnsRate);
    }

    const currentRates = await this.getGlobalTaxRates();
    const updatedRates: GlobalTaxRates = {
      ...currentRates,
      ...newRates,
      effectiveDate: newRates.effectiveDate || new Date().toISOString().split("T")[0],
      version: `1.${Date.now()}`
    };

    // 1. Audit log
    const forensicLog = await ForensicLogRepository.createAndSignLog({
      business_id: "SUPER_ADMIN_SYSTEM",
      action: "SYSTEM_TAX_CONFIG_UPDATED",
      actorId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      userEmail: actor.email,
      timestamp: new Date().toISOString(),
      details: `[GLOBAL TAX CONFIG UPDATE] Tax rates updated by ${actor.email}. Reason: ${reason}`,
      beforeState: currentRates,
      afterState: updatedRates
    });

    await ForensicLogRepository.writeForensicLog(forensicLog);

    // 2. Persist in system_config collection
    const ref = doc(db, "system_config", "global_tax_rates");
    await setDoc(ref, {
      ...updatedRates,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // 3. Emit event
    EventBus.publish(EventBus.createEvent({
      correlationId: `evt_tax_cfg_${Date.now()}`,
      businessId: "SYSTEM",
      actorId: actor.uid,
      module: "PAYROLL",
      aggregate: "SYSTEM_CONFIG",
      type: "SYSTEM_TAX_CONFIG_UPDATED",
      payload: {
        rates: updatedRates,
        reason,
        actorId: actor.uid
      }
    }));

    return updatedRates;
  }
};
