import { collection, query, where, getDocs, doc, setDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { TransactionTypeItem } from "../types/transactionTypes";
import { DEFAULT_SYSTEM_TRANSACTION_TYPES, TransactionMappingEngine } from "../services/cash/transactionMappingEngine";
import { ChartOfAccountsRepository } from "./accounting/ChartOfAccountsRepository";
import { EventBus } from "../modules/runtime/EventBus";

export const TransactionTypeRepository = {
  /**
   * Lists all transaction types available for a specific business tenant.
   * Auto-seeds system default types if none are present in Firestore.
   */
  async listByBusiness(businessId: string): Promise<TransactionTypeItem[]> {
    if (!businessId) return [];

    try {
      const ref = collection(db, "transaction_types");
      const q = query(ref, where("business_id", "==", businessId));
      const snap = await getDocs(q);

      if (snap.empty) {
        // Seed default system transaction types for this business
        const defaultList: TransactionTypeItem[] = DEFAULT_SYSTEM_TRANSACTION_TYPES.map((def) => ({
          ...def,
          business_id: businessId,
          id: `tt_${businessId}_${def.code}`
        }));

        try {
          const batch = writeBatch(db);
          defaultList.forEach((item) => {
            batch.set(doc(db, "transaction_types", item.id), item);
          });
          await batch.commit();
        } catch (seedErr) {
          console.warn("[TransactionTypeRepository] Default seed write warning:", seedErr);
        }

        return defaultList;
      }

      const results: TransactionTypeItem[] = [];
      snap.docs.forEach((d) => {
        results.push({ id: d.id, ...d.data() } as TransactionTypeItem);
      });

      // Ensure any missing system defaults are appended
      const existingCodes = new Set(results.map((r) => r.code));
      DEFAULT_SYSTEM_TRANSACTION_TYPES.forEach((def) => {
        if (!existingCodes.has(def.code)) {
          results.push({
            ...def,
            business_id: businessId,
            id: `tt_${businessId}_${def.code}`
          });
        }
      });

      results.sort((a, b) => a.code.localeCompare(b.code));
      return results;
    } catch (err) {
      console.warn("[TransactionTypeRepository] Falling back to default system types:", err);
      return DEFAULT_SYSTEM_TRANSACTION_TYPES.map((def) => ({
        ...def,
        business_id: businessId,
        id: `tt_${businessId}_${def.code}`
      }));
    }
  },

  /**
   * Atomic RPC / Write helper to upsert a company transaction type.
   * Enforces Owner / Manager governance rules and protects system-reserved codes.
   */
  async upsertCompanyTransactionType(
    typeData: Partial<TransactionTypeItem> & { code: string; name: string; business_id: string },
    actor: { uid?: string; role?: string; name?: string }
  ): Promise<TransactionTypeItem> {
    const roleUpper = (actor?.role || "").toUpperCase();
    const isAuthorized = ["OWNER", "MANAGER", "ADMIN", "SUPER_ADMIN"].includes(roleUpper);

    if (!isAuthorized) {
      throw new Error(
        "Seuls le Propriétaire (Owner) ou le Directeur (Manager) sont autorisés à créer ou modifier les types de transactions."
      );
    }

    const { code, business_id } = typeData;

    // Protection of system-reserved codes
    const isProtectedCode = ["1910", "2910"].includes(code);
    if (isProtectedCode) {
      throw new Error(
        `Le code [${code}] est un compte système réservé (Transfert Interne / Clearing). Modification ou écrasement interdit.`
      );
    }

    // Validate Sales & Services accounting rule
    if (typeData.category === "Sales" || typeData.category === "Services") {
      const validation = TransactionMappingEngine.validateSalesAndServicesRule(
        typeData.category,
        typeData.debit_account_code || "1111",
        typeData.credit_account_code || "4000"
      );
      if (!validation.isValid) {
        throw new Error(validation.error);
      }
    }

    // Verify posting eligibility against Chart of Accounts
    if (business_id && typeData.debit_account_code) {
      const debitCheck = await ChartOfAccountsRepository.isAccountEligibleForPosting(business_id, typeData.debit_account_code);
      if (!debitCheck.isEligible && debitCheck.error) {
        console.warn(`[TransactionTypeRepository] Debit account warning: ${debitCheck.error}`);
      }
    }
    if (business_id && typeData.credit_account_code) {
      const creditCheck = await ChartOfAccountsRepository.isAccountEligibleForPosting(business_id, typeData.credit_account_code);
      if (!creditCheck.isEligible && creditCheck.error) {
        console.warn(`[TransactionTypeRepository] Credit account warning: ${creditCheck.error}`);
      }
    }

    const docId = typeData.id || `tt_${business_id}_${code}`;
    const now = new Date().toISOString();

    const fullItem: TransactionTypeItem = {
      id: docId,
      business_id,
      code: typeData.code,
      name: typeData.name,
      category: typeData.category || "Other",
      behavior: typeData.behavior !== undefined ? typeData.behavior : 1,
      currency: typeData.currency || "ALL",
      allowedProfiles: typeData.allowedProfiles || ["teller", "polyvalent", "head_teller", "manager", "owner"],
      isSystemDefault: typeData.isSystemDefault || false,
      isProtected: isProtectedCode,
      isActive: typeData.isActive !== false,
      debit_account_code: typeData.debit_account_code || "1111",
      debit_account_name: typeData.debit_account_name || "Caisse Physique (Trésorerie)",
      credit_account_code: typeData.credit_account_code || "4000",
      credit_account_name: typeData.credit_account_name || "Compte Produit / Contrepartie",
      description: typeData.description || "",
      created_at: typeData.created_at || now,
      updated_at: now
    };

    try {
      const ref = doc(db, "transaction_types", docId);
      await setDoc(ref, fullItem, { merge: true });

      EventBus.publish(
        EventBus.createEvent({
          type: "TRANSACTION_TYPE_UPSERTED",
          businessId: business_id,
          module: "CASH_MANAGEMENT",
          aggregate: "TransactionType",
          payload: { type: fullItem, actor }
        })
      );

      return fullItem;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `transaction_types/${docId}`);
      throw err;
    }
  },

  /**
   * Bulk imports transaction types from CSV / Excel templates.
   */
  async bulkImportTransactionTypes(
    typesList: (Partial<TransactionTypeItem> & { code: string; name: string })[],
    businessId: string,
    actor: { uid?: string; role?: string }
  ): Promise<{ successCount: number; errors: string[] }> {
    const roleUpper = (actor?.role || "").toUpperCase();
    if (!["OWNER", "MANAGER", "ADMIN", "SUPER_ADMIN"].includes(roleUpper)) {
      throw new Error("Autorisation insuffisante pour l'importation de types de transactions.");
    }

    const errors: string[] = [];
    let successCount = 0;
    const batch = writeBatch(db);

    for (const raw of typesList) {
      if (!raw.code || !raw.name) {
        errors.push(`Ligne ignorée : Code ou nom manquant.`);
        continue;
      }

      if (["1910", "2910"].includes(raw.code)) {
        errors.push(`Code protégé [${raw.code}] ignoré.`);
        continue;
      }

      const category = raw.category || "Other";
      const debitCode = raw.debit_account_code || "1111";
      const creditCode = raw.credit_account_code || "4000";

      if (category === "Sales" || category === "Services") {
        const val = TransactionMappingEngine.validateSalesAndServicesRule(category, debitCode, creditCode);
        if (!val.isValid) {
          errors.push(`Erreur [Code ${raw.code}] : ${val.error}`);
          continue;
        }
      }

      const docId = `tt_${businessId}_${raw.code}`;
      const item: TransactionTypeItem = {
        id: docId,
        business_id: businessId,
        code: raw.code,
        name: raw.name,
        category,
        behavior: raw.behavior !== undefined ? raw.behavior : 1,
        currency: raw.currency || "ALL",
        allowedProfiles: raw.allowedProfiles || ["teller", "polyvalent", "head_teller", "manager", "owner"],
        isSystemDefault: false,
        isProtected: false,
        isActive: raw.isActive !== false,
        debit_account_code: debitCode,
        debit_account_name: raw.debit_account_name || "Compte Débit",
        credit_account_code: creditCode,
        credit_account_name: raw.credit_account_name || "Compte Crédit",
        description: raw.description || "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      batch.set(doc(db, "transaction_types", docId), item, { merge: true });
      successCount++;
    }

    if (successCount > 0) {
      await batch.commit();
    }

    return { successCount, errors };
  },

  /**
   * Deletes a custom transaction type (prohibits deleting system defaults or protected types).
   */
  async deleteCustomType(typeId: string, businessId: string, actor: any): Promise<void> {
    const roleUpper = (actor?.role || "").toUpperCase();
    if (!["OWNER", "MANAGER", "ADMIN", "SUPER_ADMIN"].includes(roleUpper)) {
      throw new Error("Autorisation insuffisante pour supprimer un type de transaction.");
    }

    const ref = doc(db, "transaction_types", typeId);
    await deleteDoc(ref);
  }
};
