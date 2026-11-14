import {
  TransactionTypeItem,
  OperationalProfile,
  RecommendationResult,
  FlowBehavior
} from "../../types/transactionTypes";
import {
  CanonicalOperationalProfile,
  EXECUTIVE_RBAC_ROLES,
  RETIRED_OPERATIONAL_PROFILES,
  TELLER_ROLES,
  normalizeOperationalProfile,
  normalizeRole,
  validateRoleOperationalProfileCompatibility
} from "../../domains/rbac/operationalProfilePolicy";

export const DEFAULT_SYSTEM_TRANSACTION_TYPES: Omit<TransactionTypeItem, "business_id">[] = [
  {
    id: "tt_sys_1001",
    code: "1001",
    name: "Dépôt Cash Client",
    category: "Money Transfer",
    behavior: 1,
    currency: "ALL",
    allowedProfiles: ["teller"],
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
    allowedProfiles: ["teller"],
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
    allowedProfiles: ["vendeur", "polyvalent"],
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
    allowedProfiles: ["polyvalent"],
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
    allowedProfiles: ["teller"],
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
    allowedProfiles: ["teller"],
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
    allowedProfiles: ["teller"],
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
    allowedProfiles: [],
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
    allowedProfiles: ["teller"],
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
    allowedProfiles: ["teller"],
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
    allowedProfiles: [],
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
   * Resolves canonical operational profile strictly from explicit profile + RBAC role.
   * Fail-closed: returns null when missing, incompatible, executive/oversight, or unknown.
   */
  public static resolveOperationalProfile(
    role?: string,
    _position?: string,
    explicitProfile?: unknown
  ): CanonicalOperationalProfile | null {
    const normRole = normalizeRole(role);
    if (!normRole) return null;

    if (explicitProfile !== undefined && explicitProfile !== null && String(explicitProfile).trim() !== "") {
      const compat = validateRoleOperationalProfileCompatibility(normRole, explicitProfile, {
        allowLegacyBarberAlias: true,
        allowMissingForExecutiveOrOversight: false
      });
      return compat.valid ? compat.normalizedProfile : null;
    }

    if (TELLER_ROLES.has(normRole)) {
      return "teller";
    }

    // Executive RBAC roles, oversight roles, and EMPLOYEE without explicit operational_profile return null (fail-closed)
    return null;
  }

  /**
   * Checks whether the current RBAC role is authorized to switch context tabs in executive UI views.
   * Only executive RBAC roles can inspect different operational views.
   */
  public static canSwitchProfile(currentRole?: string): boolean {
    const roleUpper = normalizeRole(currentRole);
    return roleUpper !== null && EXECUTIVE_RBAC_ROLES.has(roleUpper);
  }

  /**
   * Checks whether a specific RBAC role can switch to a target canonical operational profile.
   */
  public static isProfileSwitchAllowed(
    currentRole: string | undefined,
    targetProfile: OperationalProfile | string,
    assignedProfile?: OperationalProfile | string | null
  ): boolean {
    const roleUpper = normalizeRole(currentRole);
    const cleanTarget = typeof targetProfile === "string" ? targetProfile.trim().toLowerCase() : "";
    if (!roleUpper || !cleanTarget || RETIRED_OPERATIONAL_PROFILES.has(cleanTarget)) {
      return false;
    }
    const canonicalTarget = normalizeOperationalProfile(cleanTarget, { allowLegacyBarberAlias: false });
    if (!canonicalTarget) return false;

    if (EXECUTIVE_RBAC_ROLES.has(roleUpper)) {
      return true;
    }
    if (TELLER_ROLES.has(roleUpper)) {
      return canonicalTarget === "teller";
    }
    const resolvedAssigned = assignedProfile
      ? normalizeOperationalProfile(assignedProfile, { role: roleUpper, allowLegacyBarberAlias: true })
      : null;
    return resolvedAssigned !== null && resolvedAssigned === canonicalTarget;
  }

  /**
   * Validates whether a transaction type and category are strictly permitted for an operational profile & RBAC role.
   * Fail-closed on missing, retired, or unknown profiles.
   */
  public static isOperationAllowedForProfile(
    typeItem: Partial<TransactionTypeItem> | undefined,
    profile: OperationalProfile | string | null | undefined,
    role?: string
  ): { isAllowed: boolean; reason?: string } {
    if (!typeItem) {
      return { isAllowed: false, reason: "Aucune opération métier sélectionnée." };
    }

    const normRole = normalizeRole(role);
    const category = typeItem.category;

    if (profile !== undefined && profile !== null && typeof profile === "string") {
      const trimmed = profile.trim().toLowerCase();
      if (RETIRED_OPERATIONAL_PROFILES.has(trimmed)) {
        return {
          isAllowed: false,
          reason: `Le pseudo-profil obsolète '${trimmed}' est interdit.`
        };
      }
    }

    if (normRole && EXECUTIVE_RBAC_ROLES.has(normRole)) {
      return { isAllowed: true };
    }

    const normProfile = normalizeOperationalProfile(profile, {
      role: normRole ?? "EMPLOYEE",
      allowLegacyBarberAlias: normRole === "EMPLOYEE"
    });

    if (!normProfile) {
      return {
        isAllowed: false,
        reason: "Profil opérationnel manquant, invalide ou non reconnu (accès refusé par défaut)."
      };
    }

    if (normRole && TELLER_ROLES.has(normRole) && normProfile !== "teller") {
      return {
        isAllowed: false,
        reason: `Un rôle caissier [${normRole}] ne peut utiliser que le profil 'teller'.`
      };
    }

    if (normRole === "EMPLOYEE" && normProfile === "teller") {
      return {
        isAllowed: false,
        reason: "Un collaborateur EMPLOYEE ne peut jamais exécuter d'opérations avec le profil 'teller'."
      };
    }

    switch (normProfile) {
      case "vendeur":
        if (category === "Sales") {
          return { isAllowed: true };
        }
        return {
          isAllowed: false,
          reason: `Le profil Vendeur est strictement limité aux Ventes. L'opération "${typeItem.name || typeItem.code || "Inconnue"}" (${category}) est interdite.`
        };

      case "polyvalent":
        if (category === "Sales" || category === "Services") {
          return { isAllowed: true };
        }
        return {
          isAllowed: false,
          reason: `Le profil Polyvalent (EMPLOYEE) est strictement limité aux Ventes et Services. Les opérations de caisse (${category}) sont interdites.`
        };

      case "teller":
        if (
          category === "Money Transfer" ||
          category === "Mobile Transfer" ||
          category === "Currency Exchange"
        ) {
          return { isAllowed: true };
        }
        if (
          (category === "Operating Expenses" || category === "Internal Transfers") &&
          (normRole === "HEAD_TELLER" || normRole === "MASTER_HEAD_TELLER")
        ) {
          return { isAllowed: true };
        }
        return {
          isAllowed: false,
          reason: `Le profil Caissier / Guichetier est réservé aux opérations de caisse (transferts et change de devises). La catégorie "${category}" est interdite.`
        };

      default:
        return { isAllowed: false, reason: "Profil opérationnel non reconnu." };
    }
  }

  /**
   * Filters transaction types strictly by canonical RH Operational Profile and RBAC role.
   * Fails closed (returns []) when profile is missing, retired, or unknown (unless explicit executive RBAC role).
   */
  public static filterTypesByProfile<T extends Partial<TransactionTypeItem>>(
    types: T[],
    profile?: OperationalProfile | string | null,
    role?: string
  ): T[] {
    const normRole = normalizeRole(role);

    if (profile !== undefined && profile !== null && typeof profile === "string") {
      const trimmed = profile.trim().toLowerCase();
      if (RETIRED_OPERATIONAL_PROFILES.has(trimmed)) {
        return [];
      }
    }

    if (normRole && EXECUTIVE_RBAC_ROLES.has(normRole)) {
      return types.filter((t) => t.isActive);
    }

    const normProfile = normalizeOperationalProfile(profile, {
      role: normRole ?? "EMPLOYEE",
      allowLegacyBarberAlias: normRole === "EMPLOYEE"
    });

    if (!normProfile) {
      return [];
    }

    return types.filter((type) => {
      if (!type.isActive) return false;
      return this.isOperationAllowedForProfile(type, normProfile, normRole ?? undefined).isAllowed;
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
