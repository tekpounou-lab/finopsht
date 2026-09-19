import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  Timestamp 
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { ForensicLogRepository } from "./ForensicLogRepository";
import { TreasuryClassification } from "../domains/cash/classification/TreasuryClassification";

export type PaymentMethodCategory =
  | "CASH"
  | "BANK"
  | "BANK_TRANSFER"
  | "MOBILE_MONEY"
  | "CARD"
  | "CHECK"
  | "WIRE"
  | "CREDIT"
  | "OTHER";

export type AccountingEffect = "TREASURY" | "NON_CASH";

export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  description?: string;
  category: PaymentMethodCategory;
  accountingEffect: AccountingEffect;
  treasuryAccountCode?: string | null;
  supportedDirections: Array<"INFLOW" | "OUTFLOW">;
  status: "ACTIVE" | "INACTIVE";
  scope: "GLOBAL" | "TENANT";
  business_id?: string | null;
  sortOrder: number;
  metadata?: Record<string, any>;
  createdAt?: any;
  updatedAt?: any;
  createdBy: string;
  updatedBy: string;
}

export interface PaymentMethodSnapshot {
  paymentMethodId: string;
  code: string;
  name: string;
  accountingEffect: AccountingEffect;
  treasuryAccountCode?: string | null;
}

export const DEFAULT_PAYMENT_METHODS: Omit<PaymentMethod, "createdAt" | "updatedAt">[] = [
  {
    id: "pm_cash",
    code: "CASH",
    name: "Espèces (CASH)",
    description: "Règlements en argent liquide ou caisse physique.",
    category: "CASH",
    accountingEffect: "TREASURY",
    treasuryAccountCode: "1000",
    supportedDirections: ["INFLOW", "OUTFLOW"],
    status: "ACTIVE",
    scope: "GLOBAL",
    sortOrder: 1,
    createdBy: "SYSTEM",
    updatedBy: "SYSTEM"
  },
  {
    id: "pm_bank_transfer",
    code: "BANK_TRANSFER",
    name: "Virement Bancaire",
    description: "Virement direct d'un compte bancaire à un autre.",
    category: "BANK_TRANSFER",
    accountingEffect: "TREASURY",
    treasuryAccountCode: "1010",
    supportedDirections: ["INFLOW", "OUTFLOW"],
    status: "ACTIVE",
    scope: "GLOBAL",
    sortOrder: 2,
    createdBy: "SYSTEM",
    updatedBy: "SYSTEM"
  },
  {
    id: "pm_bank",
    code: "BANK",
    name: "Banque (Standard)",
    description: "Opérations de guichet ou chèques de banque généraux.",
    category: "BANK",
    accountingEffect: "TREASURY",
    treasuryAccountCode: "1010",
    supportedDirections: ["INFLOW", "OUTFLOW"],
    status: "ACTIVE",
    scope: "GLOBAL",
    sortOrder: 3,
    createdBy: "SYSTEM",
    updatedBy: "SYSTEM"
  },
  {
    id: "pm_check",
    code: "CHECK",
    name: "Chèque",
    description: "Paiement par chèque physique ou certifié.",
    category: "CHECK",
    accountingEffect: "TREASURY",
    treasuryAccountCode: "1010",
    supportedDirections: ["INFLOW", "OUTFLOW"],
    status: "ACTIVE",
    scope: "GLOBAL",
    sortOrder: 4,
    createdBy: "SYSTEM",
    updatedBy: "SYSTEM"
  },
  {
    id: "pm_moncash",
    code: "MONCASH",
    name: "MonCash",
    description: "Portefeuille mobile MonCash (Sogebank).",
    category: "MOBILE_MONEY",
    accountingEffect: "TREASURY",
    treasuryAccountCode: "1020",
    supportedDirections: ["INFLOW", "OUTFLOW"],
    status: "ACTIVE",
    scope: "GLOBAL",
    sortOrder: 5,
    createdBy: "SYSTEM",
    updatedBy: "SYSTEM"
  },
  {
    id: "pm_natcash",
    code: "NATCASH",
    name: "Natcash",
    description: "Portefeuille mobile Natcash (Natcom).",
    category: "MOBILE_MONEY",
    accountingEffect: "TREASURY",
    treasuryAccountCode: "1020",
    supportedDirections: ["INFLOW", "OUTFLOW"],
    status: "ACTIVE",
    scope: "GLOBAL",
    sortOrder: 6,
    createdBy: "SYSTEM",
    updatedBy: "SYSTEM"
  },
  {
    id: "pm_card",
    code: "CARD",
    name: "Carte de Crédit / Débit",
    description: "Transaction par carte bancaire.",
    category: "CARD",
    accountingEffect: "TREASURY",
    treasuryAccountCode: "1010",
    supportedDirections: ["INFLOW", "OUTFLOW"],
    status: "ACTIVE",
    scope: "GLOBAL",
    sortOrder: 7,
    createdBy: "SYSTEM",
    updatedBy: "SYSTEM"
  },
  {
    id: "pm_wire",
    code: "WIRE",
    name: "Virement International (Wire)",
    description: "Virement de fonds international ou Swift.",
    category: "WIRE",
    accountingEffect: "TREASURY",
    treasuryAccountCode: "1010",
    supportedDirections: ["INFLOW", "OUTFLOW"],
    status: "ACTIVE",
    scope: "GLOBAL",
    sortOrder: 8,
    createdBy: "SYSTEM",
    updatedBy: "SYSTEM"
  },
  {
    id: "pm_mobile_money",
    code: "MOBILE_MONEY",
    name: "Mobile Money (Général)",
    description: "Autres solutions de paiement mobile.",
    category: "MOBILE_MONEY",
    accountingEffect: "TREASURY",
    treasuryAccountCode: "1020",
    supportedDirections: ["INFLOW", "OUTFLOW"],
    status: "ACTIVE",
    scope: "GLOBAL",
    sortOrder: 9,
    createdBy: "SYSTEM",
    updatedBy: "SYSTEM"
  },
  {
    id: "pm_credit",
    code: "CREDIT",
    name: "Crédit (Non-Cash)",
    description: "Achat à crédit, comptes fournisseurs ou payables (Non-Cash).",
    category: "CREDIT",
    accountingEffect: "NON_CASH",
    treasuryAccountCode: null,
    supportedDirections: ["INFLOW", "OUTFLOW"],
    status: "ACTIVE",
    scope: "GLOBAL",
    sortOrder: 10,
    createdBy: "SYSTEM",
    updatedBy: "SYSTEM"
  },
  {
    id: "pm_other",
    code: "OTHER",
    name: "Autre",
    description: "Autres méthodes de paiement indéterminées.",
    category: "OTHER",
    accountingEffect: "TREASURY",
    treasuryAccountCode: "1000",
    supportedDirections: ["INFLOW", "OUTFLOW"],
    status: "ACTIVE",
    scope: "GLOBAL",
    sortOrder: 11,
    createdBy: "SYSTEM",
    updatedBy: "SYSTEM"
  }
];

// Runtime caching layer to keep retrieval extremely fast
let cachedPaymentMethods: PaymentMethod[] | null = null;

export const PaymentMethodRepository = {
  /**
   * Clears the runtime caches to trigger refetch.
   */
  clearCache(): void {
    cachedPaymentMethods = null;
  },

  /**
   * Validate that if accountingEffect is "TREASURY" and a treasuryAccountCode is specified,
   * it must correspond to a valid Class 10 treasury asset account.
   */
  validateTreasuryAccount(method: Partial<PaymentMethod>): void {
    if (method.accountingEffect === "TREASURY" && method.treasuryAccountCode) {
      const classification = TreasuryClassification.classify({
        accountCode: method.treasuryAccountCode,
        accountName: method.name
      });
      // Class 10 assets start with 10 (Bank/Cash). Heuristics exclude Receivables (12), Advances (13), etc.
      // If the classification says it is NOT treasury, reject it.
      if (!classification.isTreasury) {
        throw new Error(
          `Configuration Error: The account code "${method.treasuryAccountCode}" does not qualify as a valid Class 10 Treasury asset account. Reason: ${classification.reason}`
        );
      }
    }
  },

  /**
   * Saves a payment method definition. Performs strict accounting validation.
   * Records ForensicLog audit traces for SuperAdmin mutations.
   */
  async savePaymentMethod(
    method: PaymentMethod,
    actor: { uid: string; email: string; name: string }
  ): Promise<void> {
    if (!method.id) {
      throw new Error("Payment Method id is required.");
    }
    if (!method.code || !method.name) {
      throw new Error("Payment Method code and name are required.");
    }

    // Force uppercase code
    method.code = method.code.toUpperCase().trim();

    // Accounting validation: fail-closed if invalid Class 10
    this.validateTreasuryAccount(method);

    const path = `payment_methods/${method.id}`;
    try {
      const docRef = doc(db, "payment_methods", method.id);
      const snap = await getDoc(docRef);
      const beforeState = snap.exists() ? snap.data() : null;

      const payload = {
        ...method,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid
      };
      if (!beforeState) {
        payload.createdAt = serverTimestamp();
        payload.createdBy = actor.uid;
      }

      await setDoc(docRef, payload, { merge: true });
      this.clearCache();

      // Record ForensicLog audit traces for any changes
      const timestamp = new Date().toISOString();
      const action = beforeState ? "PAYMENT_METHOD_UPDATED" : "PAYMENT_METHOD_CREATED";
      const details = `[SuperAdmin Registry] Payment Method ${method.name} (${method.code}) ${beforeState ? "updated" : "created"}. Category: ${method.category}, Effect: ${method.accountingEffect}`;
      
      const forensicLog = await ForensicLogRepository.createAndSignLog({
        business_id: method.business_id || "GLOBAL_SYSTEM",
        action,
        actorId: actor.uid,
        userName: actor.name,
        userRole: "SUPER_ADMIN",
        userEmail: actor.email,
        timestamp,
        details,
        beforeState,
        afterState: method
      });
      await ForensicLogRepository.writeForensicLog(forensicLog);

    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  /**
   * Logically deactivates a payment method instead of hard deletion to maintain referential history.
   */
  async deactivatePaymentMethod(
    id: string,
    actor: { uid: string; email: string; name: string }
  ): Promise<void> {
    const path = `payment_methods/${id}`;
    try {
      const docRef = doc(db, "payment_methods", id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        throw new Error(`Payment method [${id}] not found.`);
      }
      const beforeState = snap.data() as PaymentMethod;
      const afterState = { ...beforeState, status: "INACTIVE" as const, updatedAt: new Date().toISOString(), updatedBy: actor.uid };

      await setDoc(docRef, { status: "INACTIVE", updatedAt: serverTimestamp(), updatedBy: actor.uid }, { merge: true });
      this.clearCache();

      const forensicLog = await ForensicLogRepository.createAndSignLog({
        business_id: beforeState.business_id || "GLOBAL_SYSTEM",
        action: "PAYMENT_METHOD_DEACTIVATED",
        actorId: actor.uid,
        userName: actor.name,
        userRole: "SUPER_ADMIN",
        userEmail: actor.email,
        timestamp: new Date().toISOString(),
        details: `[SuperAdmin Registry] Payment Method ${beforeState.name} (${beforeState.code}) deactivated.`,
        beforeState,
        afterState
      });
      await ForensicLogRepository.writeForensicLog(forensicLog);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  /**
   * Fetches all registered payment methods (both GLOBAL and TENANT-specific matching businessId).
   */
  async getAllMethods(businessId?: string | null): Promise<PaymentMethod[]> {
    if (cachedPaymentMethods && !businessId) {
      return cachedPaymentMethods;
    }

    const path = "payment_methods";
    try {
      const q = query(collection(db, "payment_methods"), orderBy("sortOrder", "asc"));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentMethod));

      // Seed defaults if empty
      if (list.length === 0) {
        await this.seedDefaultPaymentMethods();
        return await this.getAllMethods(businessId);
      }

      cachedPaymentMethods = list;

      if (businessId) {
        // Enforce strict tenant boundary: return GLOBAL systems + TENANT methods specifically matching businessId
        return list.filter(m => m.scope === "GLOBAL" || (m.scope === "TENANT" && m.business_id === businessId));
      }

      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      // Fail-safe fallbacks (guarantees local list if network is down)
      const list = DEFAULT_PAYMENT_METHODS as PaymentMethod[];
      if (businessId) {
        return list.filter(m => m.scope === "GLOBAL" || (m.scope === "TENANT" && m.business_id === businessId));
      }
      return list;
    }
  },

  /**
   * Seed standard global payment methods.
   */
  async seedDefaultPaymentMethods(): Promise<void> {
    const actor = { uid: "SYSTEM", email: "system@finops.corp", name: "System Bootstrapper" };
    for (const def of DEFAULT_PAYMENT_METHODS) {
      const method: PaymentMethod = {
        ...def,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as PaymentMethod;
      try {
        await setDoc(doc(db, "payment_methods", method.id), method);
      } catch (err) {
        console.warn(`Failed to seed payment method ${method.code}:`, err);
      }
    }
    this.clearCache();
  },

  /**
   * Resolves a payment method by its unique identifier.
   */
  async resolveById(id?: string | null, businessId?: string | null): Promise<PaymentMethod | null> {
    if (!id) return null;
    const methods = await this.getAllMethods(businessId);
    const found = methods.find(m => m.id === id);
    if (!found) return null;

    // Tenant safety check
    if (found.scope === "TENANT" && businessId && found.business_id !== businessId) {
      return null;
    }
    return found;
  },

  /**
   * Resolves a payment method by its code (e.g. "CASH", "BANK_TRANSFER").
   */
  async resolveByCode(code?: string | null, businessId?: string | null): Promise<PaymentMethod | null> {
    if (!code) return null;
    const upper = code.trim().toUpperCase();
    const methods = await this.getAllMethods(businessId);
    const found = methods.find(m => m.code === upper);
    if (!found) return null;

    // Tenant safety check
    if (found.scope === "TENANT" && businessId && found.business_id !== businessId) {
      return null;
    }
    return found;
  },

  /**
   * Returns active payment methods for a specific business context.
   */
  async listActive(businessId?: string | null): Promise<PaymentMethod[]> {
    const methods = await this.getAllMethods(businessId);
    return methods.filter(m => m.status === "ACTIVE");
  },

  /**
   * Validates if a payment method is active and supports a given direction.
   */
  async validateForDirection(methodId: string, direction: "INFLOW" | "OUTFLOW", businessId?: string | null): Promise<boolean> {
    const method = await this.resolveById(methodId, businessId);
    if (!method || method.status !== "ACTIVE") return false;
    return method.supportedDirections.includes(direction);
  },

  /**
   * Helper to resolve the accounting effect ("TREASURY" or "NON_CASH") of a payment method code or ID.
   * Guarantees fallback to IGNORED / null if missing or unknown.
   */
  async resolveAccountingEffect(methodIdOrCode?: string | null, businessId?: string | null): Promise<AccountingEffect | null> {
    if (!methodIdOrCode) return null;
    // Try resolving by ID first, then by code
    let method = await this.resolveById(methodIdOrCode, businessId);
    if (!method) {
      method = await this.resolveByCode(methodIdOrCode, businessId);
    }
    if (!method || method.status !== "ACTIVE") {
      return null; // Unknown / Missing / Inactive payment methods must never default to Cash or Treasury
    }
    return method.accountingEffect;
  },

  /**
   * Resolves treasury account configured for the payment method.
   */
  async resolveTreasuryAccount(methodIdOrCode?: string | null, businessId?: string | null): Promise<string | null> {
    if (!methodIdOrCode) return null;
    let method = await this.resolveById(methodIdOrCode, businessId);
    if (!method) {
      method = await this.resolveByCode(methodIdOrCode, businessId);
    }
    if (!method || method.status !== "ACTIVE") return null;
    return method.treasuryAccountCode || null;
  }
};
