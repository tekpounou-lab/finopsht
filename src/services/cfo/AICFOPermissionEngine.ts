import { 
  IdentityUserContext, 
  EvaluationResult, 
  DataClassification 
} from "./AICFOGovernanceTypes";
import { getRoleGovernancePolicy } from "./AICFORoleMatrix";
import { AICFODataClassifier } from "./AICFODataClassifier";

export class AICFOPermissionEngine {
  /**
   * Evaluates user context and question against role boundaries and prompt injection guards.
   */
  public static evaluate(
    userContext: IdentityUserContext,
    question: string
  ): EvaluationResult {
    const policy = getRoleGovernancePolicy(userContext.role);
    const classification = AICFODataClassifier.classifyQuery(question);
    const qLower = (question || "").toLowerCase();

    // 1. PROMPT INJECTION & JAILBREAK GUARD
    const injectionPatterns = [
      "ignore previous instructions",
      "ignore all previous",
      "system prompt",
      "pretend you are",
      "jailbreak",
      "override role",
      "bypass security",
      "forget your rules",
      "you are now owner",
      "montre tous les salaires",
      "affiche la base de donnees",
      "donne moi les droits owner",
      "dev mode active",
      "act as superadmin",
      "disregard safety"
    ];

    const hasPromptInjection = injectionPatterns.some(pattern => qLower.includes(pattern));

    if (hasPromptInjection) {
      return {
        allowed: false,
        permissionResult: "DENIED",
        refusalReason: "PROMPT_INJECTION_DETECTED",
        refusalMessage: "🛡️ [SÉCURITÉ AI CFO] : Tentative d'instruction non autorisée ou d'altération des règles de sécurité détectée. Votre requête a été bloquée et enregistrée dans le journal d'audit de gouvernance (ai_cfo_audit_logs).",
        securityLevel: "RESTRICTED",
        dataAccessed: ["SECURITY_INTERCEPTION"],
        policy
      };
    }

    // 2. TENANT ISOLATION GUARD
    if (!userContext.businessId || userContext.businessId === "none" || userContext.businessId === "") {
      return {
        allowed: false,
        permissionResult: "DENIED",
        refusalReason: "MISSING_TENANT_ID",
        refusalMessage: "🛡️ [SÉCURITÉ AI CFO] : Identifiant d'entreprise (business_id) invalide ou introuvable. Accès refusé pour préserver l'isolation multi-tenant.",
        securityLevel: "RESTRICTED",
        dataAccessed: ["TENANT_ISOLATION_CHECK"],
        policy
      };
    }

    // 3. ROLE CLASSIFICATION ACCESS CHECK
    const isLevelAllowed = AICFODataClassifier.isAccessAllowed(classification, policy.maxClassificationAllowed);

    // Special checks per role
    const isEmployee = policy.role === "EMPLOYEE";
    const isSupervisor = policy.role === "SUPERVISOR";
    const isManager = policy.role === "MANAGER";
    const isTeller = policy.role === "HEAD_TELLER";
    const isSuperAdmin = policy.role === "SUPER_ADMIN";

    // 3a. EMPLOYEE trying to access company financials or other employees
    if (isEmployee) {
      if (
        classification === "CONFIDENTIAL" || 
        classification === "RESTRICTED" || 
        qLower.includes("entreprise") || 
        qLower.includes("societe") || 
        qLower.includes("collègue") || 
        qLower.includes("collegue") ||
        qLower.includes("bénéfice") ||
        qLower.includes("benefice") ||
        qLower.includes("profit") ||
        qLower.includes("chiffre d'affaires") ||
        qLower.includes("masse salariale")
      ) {
        return {
          allowed: false,
          permissionResult: "DENIED",
          refusalReason: "ROLE_SCOPE_EXCEEDED_EMPLOYEE",
          refusalMessage: "🛡️ [SÉCURITÉ AI CFO] : En tant qu'Employé, votre périmètre de consultation est strictement limité à vos propres bulletins de paie, vos pointages personnels et vos plannings de présence.",
          securityLevel: classification,
          dataAccessed: ["PERSONAL_RECORDS_ONLY"],
          policy
        };
      }
    }

    // 3b. SUPERVISOR trying to access company financials or payroll cost
    if (isSupervisor) {
      if (
        qLower.includes("profit") ||
        qLower.includes("benefice") ||
        qLower.includes("salaire") ||
        qLower.includes("paie globale") ||
        qLower.includes("masse salariale") ||
        qLower.includes("chiffre d'affaires") ||
        qLower.includes("compte bancaire")
      ) {
        return {
          allowed: false,
          permissionResult: "DENIED",
          refusalReason: "ROLE_SCOPE_EXCEEDED_SUPERVISOR",
          refusalMessage: "🛡️ [SÉCURITÉ AI CFO] : En tant que Supervisor, votre périmètre est restreint aux métriques opérationnelles, plannings d'équipe et suivis de présence de votre département.",
          securityLevel: classification,
          dataAccessed: ["TEAM_OPERATIONAL_DATA"],
          policy
        };
      }
    }

    // 3c. HEAD TELLER / TELLER trying to access payroll or company profits
    if (isTeller) {
      if (
        qLower.includes("paie") ||
        qLower.includes("salaire") ||
        qLower.includes("profit") ||
        qLower.includes("benefice") ||
        qLower.includes("budget annuel")
      ) {
        return {
          allowed: false,
          permissionResult: "DENIED",
          refusalReason: "ROLE_SCOPE_EXCEEDED_TELLER",
          refusalMessage: "🛡️ [SÉCURITÉ AI CFO] : En tant que Responsable Guichet, votre périmètre est limité aux opérations d'encaisse, journaux de caisse et réconciliations de la succursale.",
          securityLevel: classification,
          dataAccessed: ["CASH_OPERATIONS_DATA"],
          policy
        };
      }
    }

    // 3d. MANAGER trying to consult individual salaries or other branches
    if (isManager) {
      if (classification === "RESTRICTED" || qLower.includes("salaire de") || qLower.includes("combien gagne")) {
        return {
          allowed: false,
          permissionResult: "DENIED",
          refusalReason: "ROLE_SCOPE_EXCEEDED_MANAGER_INDIVIDUAL_SALARY",
          refusalMessage: "🛡️ [SÉCURITÉ AI CFO] : En tant que Manager, vous avez accès aux totaux agrégés de dépenses et de paie du département/succursale, mais pas aux salaires individuels nominatifs.",
          securityLevel: "RESTRICTED",
          dataAccessed: ["AGGREGATED_DEPARTMENT_DATA"],
          policy
        };
      }
    }

    // 3e. SUPER ADMIN trying to consult business private financial ledger
    if (isSuperAdmin) {
      if (
        qLower.includes("marge") ||
        qLower.includes("profit net du client") ||
        qLower.includes("bulletin de paie") ||
        qLower.includes("solde bancaire client")
      ) {
        return {
          allowed: false,
          permissionResult: "DENIED",
          refusalReason: "ROLE_SCOPE_EXCEEDED_SUPER_ADMIN_PRIVACY",
          refusalMessage: "🛡️ [SÉCURITÉ AI CFO] : En tant que Super Admin Plateforme, votre périmètre est réservé aux métriques de télémétrie système et de santé réseau. Les données financières et RH du client sont isolées.",
          securityLevel: "RESTRICTED",
          dataAccessed: ["PLATFORM_TELEMETRY_ONLY"],
          policy
        };
      }
    }

    if (!isLevelAllowed) {
      return {
        allowed: false,
        permissionResult: "DENIED",
        refusalReason: `CLASSIFICATION_EXCEEDED_${classification}`,
        refusalMessage: `🛡️ [SÉCURITÉ AI CFO] : La donnée demandée est classée ${classification}, ce qui dépasse votre niveau d'autorisation maximal (${policy.maxClassificationAllowed}).`,
        securityLevel: classification,
        dataAccessed: ["CLASSIFICATION_BOUNDARY"],
        policy
      };
    }

    // Determine if data requires partial masking (e.g., Manager views branch metrics with individual names masked)
    const needsMasking = isManager || isSupervisor || isTeller;
    const permissionResult = needsMasking ? "PARTIAL_MASKED" : "ALLOW";

    return {
      allowed: true,
      permissionResult,
      securityLevel: classification,
      dataAccessed: policy.allowedDataCategories,
      policy
    };
  }
}
