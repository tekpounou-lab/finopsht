import {
  TransactionTypeItem,
  OperationalProfile,
  RecommendationResult,
  FlowBehavior
} from "../../types/transactionTypes";

export const DEFAULT_SYSTEM_TRANSACTION_TYPES: Omit<TransactionTypeItem, "business_id">[] = [
  {
    id: "tt_sys_1001",
    code: "1001",
    name: "Dépôt Cash Client",
    category: "Money Transfer",
    behavior: 1,
    currency: "ALL",
    allowedProfiles: ["teller", "polyvalent", "head_teller", "manager", "owner"],
    isSystemDefault: true,
    isProtected: false,
    isActive: true,
    debit_account_code: "1111",
    debit_account_name: "Caisse Physique (Trésorerie)",
    credit_account_code: "1200",
    credit_account_name: "Comptes de Dépôt / Créances Clients",
    description: "Réception de liquidités au guichet pour crédit de compte client.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "tt_sys_2001",
    code: "2001",
    name: "Retrait Cash Client",
    category: "Money Transfer",
    behavior: -1,
    currency: "ALL",
    allowedProfiles: ["teller", "polyvalent", "head_teller", "manager", "owner"],
    isSystemDefault: true,
    isProtected: false,
    isActive: true,
    debit_account_code: "1200",
    debit_account_name: "Comptes de Dépôt / Créances Clients",
    credit_account_code: "1111",
    credit_account_name: "Caisse Physique (Trésorerie)",
    description: "Décaissement de liquidités au guichet au profit du client.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "tt_sys_3001",
    code: "3001",
    name: "Vente de Marchandises (Comptant)",
    category: "Sales",
    behavior: 1,
    currency: "ALL",
    allowedProfiles: ["vendeur", "polyvalent", "head_teller", "manager", "owner"],
    isSystemDefault: true,
    isProtected: false,
    isActive: true,
    debit_account_code: "1111",
    debit_account_name: "Caisse Physique (Trésorerie)",
    credit_account_code: "4000",
    credit_account_name: "Produits de Ventes de Marchandises",
    description: "Encaissement direct issu d'une vente de marchandises.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "tt_sys_3101",
    code: "3101",
    name: "Prestation de Service",
    category: "Services",
    behavior: 1,
    currency: "ALL",
    allowedProfiles: ["vendeur", "polyvalent", "head_teller", "manager", "owner"],
    isSystemDefault: true,
    isProtected: false,
    isActive: true,
    debit_account_code: "1111",
    debit_account_name: "Caisse Physique (Trésorerie)",
    credit_account_code: "4100",
    credit_account_name: "Produits des Prestations de Services",
    description: "Facturation et encaissement direct de services.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "tt_sys_4001",
    code: "4001",
    name: "Envoi Transfert d'Argent",
    category: "Money Transfer",
    behavior: 1,
    currency: "ALL",
    allowedProfiles: ["teller", "polyvalent", "head_teller", "manager", "owner"],
    isSystemDefault: true,
    isProtected: false,
    isActive: true,
    debit_account_code: "1111",
    debit_account_name: "Caisse Physique (Trésorerie)",
    credit_account_code: "2400",
    credit_account_name: "Compte d'Attente Transferts à Payer",
    description: "Encaissement des fonds expédiés par l'expéditeur.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "tt_sys_4002",
    code: "4002",
    name: "Paiement Transfert d'Argent",
    category: "Money Transfer",
    behavior: -1,
    currency: "ALL",
    allowedProfiles: ["teller", "polyvalent", "head_teller", "manager", "owner"],
    isSystemDefault: true,
    isProtected: false,
    isActive: true,
    debit_account_code: "2400",
    debit_account_name: "Compte d'Attente Transferts à Payer",
    credit_account_code: "1111",
    credit_account_name: "Caisse Physique (Trésorerie)",
    description: "Paiement en espèces au bénéficiaire d'un transfert.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "tt_sys_5001",
    code: "5001",
    name: "Recharge Mobile / Top-up",
    category: "Mobile Transfer",
    behavior: 1,
    currency: "ALL",
    allowedProfiles: ["teller", "polyvalent", "head_teller", "manager", "owner"],
    isSystemDefault: true,
    isProtected: false,
    isActive: true,
    debit_account_code: "1111",
    debit_account_name: "Caisse Physique (Trésorerie)",
    credit_account_code: "4200",
    credit_account_name: "Produits de Ventes de Crédits Mobiles",
    description: "Vente de recharges électroniques et minutes de communication.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "tt_sys_6001",
    code: "6001",
    name: "Dépense d'Exploitation Courante",
    category: "Operating Expenses",
    behavior: -1,
    currency: "ALL",
    allowedProfiles: ["head_teller", "manager", "owner"],
    isSystemDefault: true,
    isProtected: false,
    isActive: true,
    debit_account_code: "6010",
    debit_account_name: "Charges d'Exploitation et Fournitures",
    credit_account_code: "1111",
    credit_account_name: "Caisse Physique (Trésorerie)",
    description: "Décaissement immédiat pour menues dépenses de fonctionnement.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "tt_sys_80001",
    code: "80001",
    name: "Achat / Change de Devises",
    category: "Currency Exchange",
    behavior: 1,
    currency: "ALL",
    allowedProfiles: ["teller", "polyvalent", "head_teller", "manager", "owner"],
    isSystemDefault: true,
    isProtected: false,
    isActive: true,
    debit_account_code: "1121",
    debit_account_name: "Caisse Devise Étrangère (USD)",
    credit_account_code: "1111",
    credit_account_name: "Caisse Monnaie Nationale (HTG)",
    description: "Achat ou vente de devises avec ajustement de taux de change.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "tt_sys_1910",
    code: "1910",
    name: "Transfert Interne Caisse / Coffre",
    category: "Internal Transfers",
    behavior: 0,
    currency: "ALL",
    allowedProfiles: ["head_teller", "manager", "owner"],
    isSystemDefault: true,
    isProtected: true, // System reserved
    isActive: true,
    debit_account_code: "1910",
    debit_account_name: "Compte de Virement Interne de Fonds",
    credit_account_code: "1111",
    credit_account_name: "Caisse Physique (Trésorerie)",
    description: "Compte système réservé pour mouvements de fonds internes.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "tt_sys_2910",
    code: "2910",
    name: "Compte de Clearing / Compensation",
    category: "Clearing",
    behavior: 0,
    currency: "ALL",
    allowedProfiles: ["manager", "owner"],
    isSystemDefault: true,
    isProtected: true, // System reserved
    isActive: true,
    debit_account_code: "2910",
    debit_account_name: "Compte de Clearing Interne",
    credit_account_code: "2910",
    credit_account_name: "Compte de Clearing Interne",
    description: "Compte système réservé au nivellement et à la compensation.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  }
];

export class TransactionMappingEngine {
  /**
   * Filters transaction types by the RH Operational Profile of the employee.
   * Rules:
   * - vendedor: Sales, Services
   * - teller: Money Transfer, Mobile Transfer, Currency Exchange
   * - polyvalent: Sales, Services, Money Transfer, Mobile Transfer, Currency Exchange
   * - head_teller: All operational categories + Operating Expenses + Internal Transfers
   * - manager / owner: Full access
   */
  /**
   * Resolves an operational profile from an organizational role or position title.
   */
  public static resolveOperationalProfile(
    role?: string,
    position?: string
  ): OperationalProfile {
    const roleUpper = (role || "").toUpperCase();
    const posLower = (position || "").toLowerCase();

    if (
      roleUpper === "OWNER" ||
      roleUpper === "ADMIN" ||
      roleUpper === "SUPER_ADMIN" ||
      roleUpper === "MANAGER"
    ) {
      return "polyvalent";
    }

    if (
      roleUpper === "HEAD_TELLER" ||
      posLower.includes("chef caissier") ||
      posLower.includes("head teller") ||
      posLower.includes("responsable guichet")
    ) {
      return "head_teller";
    }

    if (
      roleUpper === "JUNIOR_TELLER" ||
      roleUpper === "SENIOR_TELLER" ||
      posLower.includes("guichetier") ||
      posLower.includes("caissier") ||
      posLower.includes("teller")
    ) {
      return "teller";
    }

    if (
      posLower.includes("vendeur") ||
      posLower.includes("commercial") ||
      posLower.includes("sales") ||
      posLower.includes("représentant")
    ) {
      return "vendeur";
    }

    // Default least-privilege profile for general staff
    return "vendeur";
  }

  /**
   * Checks whether the current role is authorized to switch operational profile tabs in the UI.
   * Only supervisors, managers, owners, and head tellers can switch context.
   */
  public static canSwitchProfile(currentRole?: string): boolean {
    const roleUpper = (currentRole || "").toUpperCase();
    return ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "HEAD_TELLER"].includes(roleUpper);
  }

  /**
   * Checks whether a specific operational profile can switch to a target profile.
   */
  public static isProfileSwitchAllowed(
    currentRole: string | undefined,
    targetProfile: OperationalProfile
  ): boolean {
    const roleUpper = (currentRole || "").toUpperCase();
    if (["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"].includes(roleUpper)) {
      return true;
    }
    if (roleUpper === "HEAD_TELLER") {
      return ["vendeur", "teller", "head_teller"].includes(targetProfile);
    }
    const assigned = this.resolveOperationalProfile(currentRole);
    return assigned === targetProfile;
  }

  /**
   * Validates whether a transaction type and category are strictly permitted for an operational profile.
   */
  public static isOperationAllowedForProfile(
    typeItem: Partial<TransactionTypeItem> | undefined,
    profile: OperationalProfile | string
  ): { isAllowed: boolean; reason?: string } {
    if (!typeItem) {
      return { isAllowed: false, reason: "Aucune opération métier sélectionnée." };
    }

    const normProfile = (profile || "vendeur").toLowerCase().trim() as OperationalProfile;

    if (normProfile === "owner" || normProfile === "manager") {
      return { isAllowed: true };
    }

    if (typeItem.allowedProfiles && typeItem.allowedProfiles.includes(normProfile)) {
      return { isAllowed: true };
    }

    const category = typeItem.category;

    switch (normProfile) {
      case "vendeur":
        if (category === "Sales" || category === "Services") {
          return { isAllowed: true };
        }
        return {
          isAllowed: false,
          reason: `Le profil Vendeur est strictement limité aux Ventes et Prestations de Services. L'opération "${typeItem.name || typeItem.code || 'Inconnue'}" (${category}) est interdite.`
        };

      case "teller":
        if (
          category === "Money Transfer" ||
          category === "Mobile Transfer" ||
          category === "Currency Exchange"
        ) {
          return { isAllowed: true };
        }
        return {
          isAllowed: false,
          reason: `Le profil Caissier / Guichetier est limité aux transferts et changes de devises. Les Ventes, Services et Dépenses d'exploitation sont interdits pour ce profil.`
        };

      case "polyvalent":
        if (
          category === "Sales" ||
          category === "Services" ||
          category === "Money Transfer" ||
          category === "Mobile Transfer" ||
          category === "Currency Exchange"
        ) {
          return { isAllowed: true };
        }
        return {
          isAllowed: false,
          reason: `Le profil Polyvalent n'est pas autorisé à exécuter des opérations de la catégorie "${category}".`
        };

      case "head_teller":
        if (category !== "Clearing") {
          return { isAllowed: true };
        }
        return {
          isAllowed: false,
          reason: `Le profil Chef Caissier ne peut pas exécuter d'opérations de Clearing / Compensation générale (réservé à la direction).`
        };

      default:
        return { isAllowed: false, reason: "Profil opérationnel non reconnu." };
    }
  }

  /**
   * Filters transaction types by the RH Operational Profile of the employee.
   * Rules:
   * - vendedor: Sales, Services
   * - teller: Money Transfer, Mobile Transfer, Currency Exchange
   * - polyvalent: Sales, Services, Money Transfer, Mobile Transfer, Currency Exchange
   * - head_teller: All operational categories + Operating Expenses + Internal Transfers
   * - manager / owner: Full access
   */
  public static filterTypesByProfile<T extends Partial<TransactionTypeItem>>(
    types: T[],
    profile?: OperationalProfile | string
  ): T[] {
    if (!profile) return types.filter((t) => t.isActive);

    const normProfile = profile.toLowerCase().trim() as OperationalProfile;

    if (normProfile === "owner" || normProfile === "manager") {
      return types.filter((t) => t.isActive);
    }

    return types.filter((type) => {
      if (!type.isActive) return false;

      if (type.allowedProfiles && type.allowedProfiles.includes(normProfile)) {
        return true;
      }

      switch (normProfile) {
        case "vendeur":
          return type.category === "Sales" || type.category === "Services";
        case "teller":
          return (
            type.category === "Money Transfer" ||
            type.category === "Mobile Transfer" ||
            type.category === "Currency Exchange"
          );
        case "polyvalent":
          return (
            type.category === "Sales" ||
            type.category === "Services" ||
            type.category === "Money Transfer" ||
            type.category === "Mobile Transfer" ||
            type.category === "Currency Exchange"
          );
        case "head_teller":
          return (
            type.category !== "Clearing" ||
            type.allowedProfiles?.includes("head_teller")
          );
        default:
          return true;
      }
    });
  }

  /**
   * Validates Sales & Services accounting rule:
   * Debit MUST be Class 1 (Asset/Treasury/Receivable)
   * Credit MUST be Class 4 or 7 (Revenue/Product)
   */
  public static validateSalesAndServicesRule(
    category: string,
    debitCode: string,
    creditCode: string
  ): { isValid: boolean; error?: string } {
    if (category === "Sales" || category === "Services") {
      const isDebitClass1 = debitCode.startsWith("1");
      const isCreditClass4Or7 = creditCode.startsWith("4") || creditCode.startsWith("7");

      if (!isDebitClass1) {
        return {
          isValid: false,
          error: `Pour les Ventes et Services, le compte débité (${debitCode}) doit obligatoirement appartenir aux actifs de trésorerie ou créances (Classe 1).`
        };
      }
      if (!isCreditClass4Or7) {
        return {
          isValid: false,
          error: `Pour les Ventes et Services, le compte crédité (${creditCode}) doit obligatoirement être un compte de produit d'exploitation (Classe 4 ou 7).`
        };
      }
    }
    return { isValid: true };
  }

  /**
   * Dynamic Cash Account Substitution:
   * When an operation touches physical cash (class 11xx), the engine injects
   * the exact account code for the till currency (1111 for HTG, 1121 for USD)
   * and attaches till_id. Only physical cash accounts receive a till_id.
   */
  public static resolveDynamicCashAccounts(params: {
    debitAccountCode: string;
    creditAccountCode: string;
    tillCurrency: "HTG" | "USD";
    tillId?: string;
  }): {
    debitAccountCode: string;
    creditAccountCode: string;
    debitTillId?: string;
    creditTillId?: string;
  } {
    const { debitAccountCode, creditAccountCode, tillCurrency, tillId } = params;

    let finalDebitCode = debitAccountCode;
    let finalCreditCode = creditAccountCode;
    let debitTillId: string | undefined = undefined;
    let creditTillId: string | undefined = undefined;

    // Is physical cash (starts with 11)
    if (finalDebitCode.startsWith("11")) {
      finalDebitCode = tillCurrency === "USD" ? "1121" : "1111";
      debitTillId = tillId;
    }

    if (finalCreditCode.startsWith("11")) {
      finalCreditCode = tillCurrency === "USD" ? "1121" : "1111";
      creditTillId = tillId;
    }

    return {
      debitAccountCode: finalDebitCode,
      creditAccountCode: finalCreditCode,
      debitTillId,
      creditTillId
    };
  }

  /**
   * Calculates cash flow direction (behavior):
   * +1: Cash In (Entrée)
   * -1: Cash Out (Sortie)
   *  0: Neutral (Sans mouvement)
   */
  public static calculateFlowBehavior(
    debitCode: string,
    creditCode: string
  ): { behavior: FlowBehavior; label: string } {
    const touchesCashDebit = debitCode.startsWith("11") || debitCode === "1000" || debitCode === "1001";
    const touchesCashCredit = creditCode.startsWith("11") || creditCode === "1000" || creditCode === "1001";

    if (touchesCashDebit && !touchesCashCredit) {
      return { behavior: 1, label: "Entrée en caisse (+1)" };
    }
    if (!touchesCashDebit && touchesCashCredit) {
      return { behavior: -1, label: "Sortie de caisse (-1)" };
    }
    return { behavior: 0, label: "Sans mouvement de caisse (0)" };
  }

  /**
   * Recommendation Algorithm:
   * Analyzes account code and name to auto-suggest transaction types & mappings.
   */
  public static recommendTransactionType(
    accountCode: string,
    accountName: string
  ): RecommendationResult {
    const code = accountCode.trim();
    const nameLower = accountName.toLowerCase().trim();

    if (code.startsWith("4") || nameLower.includes("vente") || nameLower.includes("marchandise")) {
      return {
        recommendedCode: "3001",
        recommendedName: "Vente de Marchandises",
        recommendedCategory: "Sales",
        recommendedBehavior: 1,
        suggestedDebitCode: "1111",
        suggestedDebitName: "Caisse Physique (Trésorerie)",
        suggestedCreditCode: code,
        suggestedCreditName: accountName,
        confidence: 0.95,
        reasoning: "Compte de produit/vente détecté (Classe 4). Recommandation: Débit Caisse (1111) / Crédit Ventes."
      };
    }

    if (nameLower.includes("service") || nameLower.includes("prestation") || nameLower.includes("honoraires")) {
      return {
        recommendedCode: "3101",
        recommendedName: "Prestation de Service",
        recommendedCategory: "Services",
        recommendedBehavior: 1,
        suggestedDebitCode: "1111",
        suggestedDebitName: "Caisse Physique (Trésorerie)",
        suggestedCreditCode: code.startsWith("4") ? code : "4100",
        suggestedCreditName: accountName,
        confidence: 0.9,
        reasoning: "Intitulé relatif aux prestations de services. Recommandation: Débit Caisse / Crédit Produits de Services."
      };
    }

    if (code.startsWith("6") || nameLower.includes("charge") || nameLower.includes("fourniture") || nameLower.includes("loyer") || nameLower.includes("dépense")) {
      return {
        recommendedCode: "6001",
        recommendedName: "Dépense d'Exploitation Courante",
        recommendedCategory: "Operating Expenses",
        recommendedBehavior: -1,
        suggestedDebitCode: code,
        suggestedDebitName: accountName,
        suggestedCreditCode: "1111",
        suggestedCreditName: "Caisse Physique (Trésorerie)",
        confidence: 0.92,
        reasoning: "Compte de charges d'exploitation (Classe 6). Recommandation: Débit Charges / Crédit Caisse."
      };
    }

    if (nameLower.includes("transfert") || nameLower.includes("envoi") || nameLower.includes("réception")) {
      return {
        recommendedCode: "4001",
        recommendedName: "Envoi Transfert d'Argent",
        recommendedCategory: "Money Transfer",
        recommendedBehavior: 1,
        suggestedDebitCode: "1111",
        suggestedDebitName: "Caisse Physique (Trésorerie)",
        suggestedCreditCode: "2400",
        suggestedCreditName: "Compte d'Attente Transferts à Payer",
        confidence: 0.85,
        reasoning: "Mot clé de transfert détecté. Recommandation: Débit Caisse / Crédit Compte d'attente transferts."
      };
    }

    if (nameLower.includes("devise") || nameLower.includes("usd") || nameLower.includes("change")) {
      return {
        recommendedCode: "80001",
        recommendedName: "Achat / Change de Devises",
        recommendedCategory: "Currency Exchange",
        recommendedBehavior: 1,
        suggestedDebitCode: "1121",
        suggestedDebitName: "Caisse Devise Étrangère (USD)",
        suggestedCreditCode: "1111",
        suggestedCreditName: "Caisse Monnaie Nationale (HTG)",
        confidence: 0.88,
        reasoning: "Opération de change/devise détectée. Recommandation: Débit Caisse USD (1121) / Crédit Caisse HTG (1111)."
      };
    }

    return {
      recommendedCode: "1001",
      recommendedName: "Transaction Générale Caisse",
      recommendedCategory: "Other",
      recommendedBehavior: 1,
      suggestedDebitCode: "1111",
      suggestedDebitName: "Caisse Physique (Trésorerie)",
      suggestedCreditCode: code || "1200",
      suggestedCreditName: accountName || "Compte Général",
      confidence: 0.5,
      reasoning: "Type générique recommandé. Modifiez les comptes si nécessaire."
    };
  }
}
