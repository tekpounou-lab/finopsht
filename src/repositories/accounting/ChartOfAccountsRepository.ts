import { db } from "../../lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  deleteDoc
} from "firebase/firestore";
import { ForensicLogRepository } from "../ForensicLogRepository";
import { EventBus } from "../../modules/runtime/EventBus";

export type AccountClassId = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type SmartAccountUsage = "business" | "journal" | "header" | "system";

export interface ChartOfAccountItem {
  id: string;
  businessId: string;
  code: string; // 4 to 8 digits decimal
  name: string;
  classId: AccountClassId; // 1..9
  className: string;
  type: "HEADER" | "POSTING"; // HEADER = parent/grouping, POSTING = leaf account
  currency?: "HTG" | "USD" | "ANY"; // Mandatory for sensitive accounts (10xx, 11xx, 129x, 19xx, 29xx)
  normalBalance: "DEBIT" | "CREDIT";
  smartUsage: SmartAccountUsage;
  isActive: boolean;
  isSystemAccount?: boolean;
  description?: string;
  parentCode?: string;
  updatedAt?: string;
  createdAt?: string;
}

export type StarterPackType = "GENERAL_COMMERCE" | "MICROFINANCE_TRANSFERS" | "SERVICES_SALONS";

export const ACCOUNT_CLASS_NAMES: Record<AccountClassId, { name: string; normalBalance: "DEBIT" | "CREDIT" }> = {
  "1": { name: "Classe 1 — Actifs (Assets)", normalBalance: "DEBIT" },
  "2": { name: "Classe 2 — Passifs (Liabilities)", normalBalance: "CREDIT" },
  "3": { name: "Classe 3 — Capitaux Propres (Equity)", normalBalance: "CREDIT" },
  "4": { name: "Classe 4 — Produits (Revenue)", normalBalance: "CREDIT" },
  "5": { name: "Classe 5 — Achats & Coût des Ventes (COGS)", normalBalance: "DEBIT" },
  "6": { name: "Classe 6 — Charges d'Exploitation (Expenses)", normalBalance: "DEBIT" },
  "7": { name: "Classe 7 — Charges Financières & Autres", normalBalance: "DEBIT" },
  "8": { name: "Classe 8 — Comptes Spéciaux / Extraordinaires", normalBalance: "DEBIT" },
  "9": { name: "Classe 9 — Comptes Analytiques & Stocks", normalBalance: "DEBIT" }
};

/**
 * Checks if an account code belongs to a sensitive liquidity/clearing category
 * requiring mandatory explicit currency (HTG or USD).
 */
export function isSensitiveLiquidityAccount(code: string): boolean {
  return (
    code.startsWith("10") || // Coffres & caisses
    code.startsWith("11") || // Banques
    code.startsWith("129") || // Compensation ventes
    code.startsWith("19") || // Transit virements
    code.startsWith("29") // Clearing & transit écarts
  );
}

/**
 * Automatically classifies accounts into smart usage categories:
 * - business: Counter / daily business operations
 * - journal: Miscellaneous & manual accountant journal entries
 * - header: Grouping / summary account
 * - system: Technical accounts (closures, payroll, retained earnings)
 */
export function classifySmartUsage(
  type: "HEADER" | "POSTING",
  code: string,
  name: string
): SmartAccountUsage {
  if (type === "HEADER") return "header";

  const upper = name.toUpperCase();

  // System accounts
  if (
    code === "2910" ||
    code === "1910" ||
    code.startsWith("39") ||
    upper.includes("REPORT À NOUVEAU") ||
    upper.includes("RÉSULTAT DE L'EXERCICE") ||
    upper.includes("CLÔTURE")
  ) {
    return "system";
  }

  // Daily counter business operations
  if (
    code.startsWith("10") ||
    code.startsWith("11") ||
    code.startsWith("12") ||
    code.startsWith("40") ||
    code.startsWith("41") ||
    code.startsWith("42") ||
    code.startsWith("50") ||
    code.startsWith("60") ||
    upper.includes("CAISSE") ||
    upper.includes("BANQUE") ||
    upper.includes("VENTE") ||
    upper.includes("PRESTATION") ||
    upper.includes("TRANSFERT") ||
    upper.includes("COMMISSION") ||
    upper.includes("ACHAT")
  ) {
    return "business";
  }

  return "journal";
}

/**
 * Starter Pack Default Charts of Accounts
 */
const STARTER_PACKS: Record<StarterPackType, Omit<ChartOfAccountItem, "id" | "businessId">[]> = {
  GENERAL_COMMERCE: [
    // Class 1
    { code: "1000", name: "CAISSES ET COFFRES", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "HEADER", normalBalance: "DEBIT", smartUsage: "header", isActive: true },
    { code: "1010", name: "Caisse HTG Guichet", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "POSTING", currency: "HTG", normalBalance: "DEBIT", smartUsage: "business", isActive: true },
    { code: "1020", name: "Caisse USD Guichet", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "POSTING", currency: "USD", normalBalance: "DEBIT", smartUsage: "business", isActive: true },
    { code: "1100", name: "BANQUES", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "HEADER", normalBalance: "DEBIT", smartUsage: "header", isActive: true },
    { code: "1110", name: "Banque HTG Principale", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "POSTING", currency: "HTG", normalBalance: "DEBIT", smartUsage: "business", isActive: true },
    { code: "1120", name: "Banque USD Commerciale", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "POSTING", currency: "USD", normalBalance: "DEBIT", smartUsage: "business", isActive: true },
    { code: "1200", name: "CREANCES ET STOCKS", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "HEADER", normalBalance: "DEBIT", smartUsage: "header", isActive: true },
    { code: "1210", name: "Clients - Créances Commerciales", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "POSTING", currency: "HTG", normalBalance: "DEBIT", smartUsage: "business", isActive: true },
    { code: "1295", name: "Compensation Ventes & Cartes", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "POSTING", currency: "HTG", normalBalance: "DEBIT", smartUsage: "business", isActive: true },
    { code: "1910", name: "Transit Virement Interne de Fonds", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "POSTING", currency: "ANY", normalBalance: "DEBIT", smartUsage: "system", isActive: true },

    // Class 2
    { code: "2000", name: "DETTES ET PASSIFS", classId: "2", className: ACCOUNT_CLASS_NAMES["2"].name, type: "HEADER", normalBalance: "CREDIT", smartUsage: "header", isActive: true },
    { code: "2010", name: "Fournisseurs - Dettes Commerciales", classId: "2", className: ACCOUNT_CLASS_NAMES["2"].name, type: "POSTING", currency: "HTG", normalBalance: "CREDIT", smartUsage: "business", isActive: true },
    { code: "2200", name: "Cotisations Sociales à Payer (ONA / OFATMA / IRI)", classId: "2", className: ACCOUNT_CLASS_NAMES["2"].name, type: "POSTING", currency: "HTG", normalBalance: "CREDIT", smartUsage: "journal", isActive: true },
    { code: "2910", name: "Compte d'Attente Écarts de Caisse", classId: "2", className: ACCOUNT_CLASS_NAMES["2"].name, type: "POSTING", currency: "ANY", normalBalance: "CREDIT", smartUsage: "system", isActive: true },

    // Class 3
    { code: "3000", name: "CAPITAUX PROPRES", classId: "3", className: ACCOUNT_CLASS_NAMES["3"].name, type: "HEADER", normalBalance: "CREDIT", smartUsage: "header", isActive: true },
    { code: "3010", name: "Capital Social Subscribed", classId: "3", className: ACCOUNT_CLASS_NAMES["3"].name, type: "POSTING", normalBalance: "CREDIT", smartUsage: "journal", isActive: true },
    { code: "3100", name: "Report à Nouveau / Résultat Cumulé", classId: "3", className: ACCOUNT_CLASS_NAMES["3"].name, type: "POSTING", normalBalance: "CREDIT", smartUsage: "system", isActive: true },

    // Class 4
    { code: "4000", name: "PRODUITS ET VENTES", classId: "4", className: ACCOUNT_CLASS_NAMES["4"].name, type: "HEADER", normalBalance: "CREDIT", smartUsage: "header", isActive: true },
    { code: "4010", name: "Ventes de Marchandises HTG", classId: "4", className: ACCOUNT_CLASS_NAMES["4"].name, type: "POSTING", currency: "HTG", normalBalance: "CREDIT", smartUsage: "business", isActive: true },
    { code: "4020", name: "Ventes de Marchandises USD", classId: "4", className: ACCOUNT_CLASS_NAMES["4"].name, type: "POSTING", currency: "USD", normalBalance: "CREDIT", smartUsage: "business", isActive: true },
    { code: "4120", name: "Gains de Change FX", classId: "4", className: ACCOUNT_CLASS_NAMES["4"].name, type: "POSTING", normalBalance: "CREDIT", smartUsage: "system", isActive: true },

    // Class 5 & 6
    { code: "5000", name: "ACHATS DE MARCHANDISES", classId: "5", className: ACCOUNT_CLASS_NAMES["5"].name, type: "HEADER", normalBalance: "DEBIT", smartUsage: "header", isActive: true },
    { code: "5010", name: "Achats Stock Marchandises", classId: "5", className: ACCOUNT_CLASS_NAMES["5"].name, type: "POSTING", normalBalance: "DEBIT", smartUsage: "business", isActive: true },
    { code: "6000", name: "CHARGES D'EXPLOITATION", classId: "6", className: ACCOUNT_CLASS_NAMES["6"].name, type: "HEADER", normalBalance: "DEBIT", smartUsage: "header", isActive: true },
    { code: "6010", name: "Salaires & Remunérations RH", classId: "6", className: ACCOUNT_CLASS_NAMES["6"].name, type: "POSTING", normalBalance: "DEBIT", smartUsage: "business", isActive: true },
    { code: "6020", name: "Loyers & Charges Locatives", classId: "6", className: ACCOUNT_CLASS_NAMES["6"].name, type: "POSTING", normalBalance: "DEBIT", smartUsage: "journal", isActive: true },
    { code: "6120", name: "Pertes de Change FX", classId: "6", className: ACCOUNT_CLASS_NAMES["6"].name, type: "POSTING", normalBalance: "DEBIT", smartUsage: "system", isActive: true }
  ],

  MICROFINANCE_TRANSFERS: [
    { code: "1000", name: "CAISSES DU GUICHET", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "HEADER", normalBalance: "DEBIT", smartUsage: "header", isActive: true },
    { code: "1010", name: "Caisse HTG Microfinance", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "POSTING", currency: "HTG", normalBalance: "DEBIT", smartUsage: "business", isActive: true },
    { code: "1020", name: "Caisse USD Microfinance", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "POSTING", currency: "USD", normalBalance: "DEBIT", smartUsage: "business", isActive: true },
    { code: "1250", name: "Portefeuille Microcrédits Clients", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "POSTING", currency: "HTG", normalBalance: "DEBIT", smartUsage: "business", isActive: true },
    { code: "1910", name: "Transit Transferts d'Argent", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "POSTING", currency: "ANY", normalBalance: "DEBIT", smartUsage: "system", isActive: true },
    { code: "2400", name: "Dépôts Épargne Membres / Clients", classId: "2", className: ACCOUNT_CLASS_NAMES["2"].name, type: "POSTING", currency: "HTG", normalBalance: "CREDIT", smartUsage: "business", isActive: true },
    { code: "2910", name: "Compte de Transit Écarts & Compensation", classId: "2", className: ACCOUNT_CLASS_NAMES["2"].name, type: "POSTING", currency: "ANY", normalBalance: "CREDIT", smartUsage: "system", isActive: true },
    { code: "4200", name: "Commissions Transferts & Envois", classId: "4", className: ACCOUNT_CLASS_NAMES["4"].name, type: "POSTING", currency: "HTG", normalBalance: "CREDIT", smartUsage: "business", isActive: true },
    { code: "4250", name: "Intérêts Perçus sur Microcrédits", classId: "4", className: ACCOUNT_CLASS_NAMES["4"].name, type: "POSTING", currency: "HTG", normalBalance: "CREDIT", smartUsage: "business", isActive: true },
    { code: "6010", name: "Frais Généraux & Opérationnels", classId: "6", className: ACCOUNT_CLASS_NAMES["6"].name, type: "POSTING", normalBalance: "DEBIT", smartUsage: "business", isActive: true }
  ],

  SERVICES_SALONS: [
    { code: "1000", name: "CAISSE DE SALON", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "HEADER", normalBalance: "DEBIT", smartUsage: "header", isActive: true },
    { code: "1010", name: "Caisse HTG Salon / Guichet", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "POSTING", currency: "HTG", normalBalance: "DEBIT", smartUsage: "business", isActive: true },
    { code: "1020", name: "Caisse USD Salon / Guichet", classId: "1", className: ACCOUNT_CLASS_NAMES["1"].name, type: "POSTING", currency: "USD", normalBalance: "DEBIT", smartUsage: "business", isActive: true },
    { code: "4100", name: "Produits Prestations de Services Coiffure & Soins", classId: "4", className: ACCOUNT_CLASS_NAMES["4"].name, type: "POSTING", currency: "HTG", normalBalance: "CREDIT", smartUsage: "business", isActive: true },
    { code: "4200", name: "Ventes de Produits Cosmétiques", classId: "4", className: ACCOUNT_CLASS_NAMES["4"].name, type: "POSTING", currency: "HTG", normalBalance: "CREDIT", smartUsage: "business", isActive: true },
    { code: "5020", name: "Achats Produits & fournitures Coiffure", classId: "5", className: ACCOUNT_CLASS_NAMES["5"].name, type: "POSTING", normalBalance: "DEBIT", smartUsage: "business", isActive: true },
    { code: "6030", name: "Commissions Employés Coiffure", classId: "6", className: ACCOUNT_CLASS_NAMES["6"].name, type: "POSTING", normalBalance: "DEBIT", smartUsage: "business", isActive: true }
  ]
};

export class ChartOfAccountsRepository {
  private static readonly COLLECTION_NAME = "chart_of_accounts";

  /**
   * Validates account code hierarchy & class matching:
   * First digit must strictly match classId (e.g. Code "1010" -> Class 1).
   */
  public static validateAccountCode(code: string, classId: AccountClassId): { isValid: boolean; error?: string } {
    if (!code || code.length < 4 || code.length > 8) {
      return { isValid: false, error: "Le code comptable doit comporter entre 4 et 8 chiffres." };
    }

    if (!/^\d+$/.test(code)) {
      return { isValid: false, error: "Le code comptable doit être une suite numérique décimale." };
    }

    if (code.charAt(0) !== classId) {
      return {
        isValid: false,
        error: `Le premier chiffre du code [${code}] ne correspond pas à la classe sélectionnée [Classe ${classId}].`
      };
    }

    return { isValid: true };
  }

  /**
   * Retrieves all accounts defined for a business.
   * If empty, seeds the General Commerce starter pack automatically.
   */
  public static async getAccountsByBusiness(businessId: string): Promise<ChartOfAccountItem[]> {
    if (!db) {
      // In-memory fallback
      return STARTER_PACKS.GENERAL_COMMERCE.map((item, idx) => ({
        ...item,
        id: `acc_${businessId}_${item.code}`,
        businessId
      }));
    }

    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where("businessId", "==", businessId)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        // Auto-seed default starter pack
        return await this.seedStarterPack(businessId, "GENERAL_COMMERCE", { uid: "SYSTEM" });
      }

      const list: ChartOfAccountItem[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as ChartOfAccountItem);
      });

      return list.sort((a, b) => a.code.localeCompare(b.code));
    } catch (err) {
      console.warn("[ChartOfAccountsRepository] Error fetching accounts, returning fallback pack:", err);
      return STARTER_PACKS.GENERAL_COMMERCE.map((item, idx) => ({
        ...item,
        id: `acc_${businessId}_${item.code}`,
        businessId
      }));
    }
  }

  /**
   * Saves or updates an account item for a business.
   * Enforces code validation, mandatory currency for sensitive liquidity accounts,
   * and smart usage classification.
   */
  public static async upsertAccount(
    businessId: string,
    account: Partial<ChartOfAccountItem> & { code: string; name: string; classId: AccountClassId; type: "HEADER" | "POSTING" },
    actor: { uid: string; name?: string; role?: string }
  ): Promise<ChartOfAccountItem> {
    const codeVal = this.validateAccountCode(account.code, account.classId);
    if (!codeVal.isValid) {
      throw new Error(codeVal.error);
    }

    if (account.type === "POSTING" && isSensitiveLiquidityAccount(account.code) && (!account.currency || account.currency === "ANY")) {
      throw new Error(
        `Le compte sensible [${account.code} - ${account.name}] exige une devise explicite (HTG ou USD) pour l'étanchéité bidevise.`
      );
    }

    const docId = `acc_${businessId}_${account.code}`;
    const now = new Date().toISOString();
    const classInfo = ACCOUNT_CLASS_NAMES[account.classId];

    const fullItem: ChartOfAccountItem = {
      id: docId,
      businessId,
      code: account.code,
      name: account.name,
      classId: account.classId,
      className: classInfo.name,
      type: account.type,
      currency: account.currency || (account.type === "POSTING" ? "HTG" : "ANY"),
      normalBalance: account.normalBalance || classInfo.normalBalance,
      smartUsage: classifySmartUsage(account.type, account.code, account.name),
      isActive: account.isActive !== false,
      isSystemAccount: account.isSystemAccount || false,
      description: account.description || "",
      parentCode: account.parentCode || `${account.code.substring(0, 2)}00`,
      createdAt: account.createdAt || now,
      updatedAt: now
    };

    if (db) {
      const ref = doc(db, this.COLLECTION_NAME, docId);
      await setDoc(ref, fullItem, { merge: true });

      // Audit Log
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: businessId,
        actorId: actor.uid,
        userName: actor.name || "Manager",
        userRole: actor.role || "MANAGER",
        action: "CHART_OF_ACCOUNTS_ITEM_SAVED",
        details: `Compte [${fullItem.code} - ${fullItem.name}] enregistré (${fullItem.type}, Devise: ${fullItem.currency}).`,
        afterState: fullItem,
        timestamp: now
      });
      await ForensicLogRepository.writeForensicLog(log);
    }

    EventBus.publish(
      EventBus.createEvent({
        type: "CHART_OF_ACCOUNTS_UPDATED",
        businessId,
        module: "FINANCE",
        aggregate: "ChartOfAccounts",
        payload: { item: fullItem, actor }
      })
    );

    return fullItem;
  }

  /**
   * Seeds a pre-configured sector starter pack for a business tenant.
   */
  public static async seedStarterPack(
    businessId: string,
    packType: StarterPackType,
    actor: { uid: string; name?: string; role?: string }
  ): Promise<ChartOfAccountItem[]> {
    const pack = STARTER_PACKS[packType] || STARTER_PACKS.GENERAL_COMMERCE;
    const items: ChartOfAccountItem[] = [];

    for (const raw of pack) {
      const created = await this.upsertAccount(
        businessId,
        {
          ...raw,
          businessId
        },
        actor
      );
      items.push(created);
    }

    return items;
  }

  /**
   * Checks if an account code exists and is eligible for posting (must be a leaf POSTING account).
   */
  public static async isAccountEligibleForPosting(businessId: string, accountCode: string): Promise<{ isEligible: boolean; error?: string; account?: ChartOfAccountItem }> {
    const accounts = await this.getAccountsByBusiness(businessId);
    const found = accounts.find((a) => a.code === accountCode);

    if (!found) {
      return { isEligible: false, error: `Le compte [${accountCode}] n'existe pas dans le Plan Comptable.` };
    }

    if (!found.isActive) {
      return { isEligible: false, error: `Le compte [${accountCode} - ${found.name}] est inactif.` };
    }

    if (found.type === "HEADER") {
      return { isEligible: false, error: `Le compte [${accountCode} - ${found.name}] est un compte de regroupement (Header) et ne peut pas recevoir d'écritures directes.` };
    }

    return { isEligible: true, account: found };
  }
}
