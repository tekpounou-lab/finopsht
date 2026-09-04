import { RoleGovernancePolicy } from "./AICFOGovernanceTypes";

export const ROLE_GOVERNANCE_MATRIX: Record<string, RoleGovernancePolicy> = {
  OWNER: {
    role: "OWNER",
    maxClassificationAllowed: "RESTRICTED",
    allowedDataCategories: [
      "REVENUE",
      "EXPENSES",
      "PROFIT_MARGINS",
      "CASH_FLOW",
      "ACCOUNTS_PAYABLE",
      "ACCOUNTS_RECEIVABLE",
      "PAYROLL_COST",
      "INDIVIDUAL_SALARY",
      "BUDGET",
      "ATTENDANCE",
      "BRANCH_ANALYTICS",
      "ANOMALIES",
      "FORECASTS"
    ],
    restrictedFields: [],
    branchBound: false,
    departmentBound: false,
    individualSalaryVisible: true,
    companyProfitVisible: true,
    payrollTotalsVisible: true,
    allowedQueryExamples: [
      "Quel est le profit net consolidé du groupe ce mois ?",
      "Affiche la masse salariale par succursale.",
      "Analyse les anomalies de présence et les risques de fraude sur l'ensemble des branches."
    ],
    deniedQueryExamples: []
  },
  MANAGER: {
    role: "MANAGER",
    maxClassificationAllowed: "CONFIDENTIAL",
    allowedDataCategories: [
      "BRANCH_REVENUE",
      "BRANCH_EXPENSES",
      "BRANCH_CASH_FLOW",
      "DEPARTMENT_BUDGET",
      "AGGREGATED_PAYROLL_COST",
      "BRANCH_ATTENDANCE",
      "BRANCH_ANOMALIES"
    ],
    restrictedFields: [
      "INDIVIDUAL_SALARY",
      "OTHER_BRANCH_METRICS",
      "CONSOLIDATED_GROUP_PROFIT"
    ],
    branchBound: true,
    departmentBound: false,
    individualSalaryVisible: false,
    companyProfitVisible: false,
    payrollTotalsVisible: true, // Aggregated department/branch level only
    allowedQueryExamples: [
      "Quelle est la tendance des dépenses pour ma succursale ?",
      "Combien avons-nous dépensé en heures supplémentaires dans nos départements ?",
      "Quel est le taux de retard moyen de la succursale ?"
    ],
    deniedQueryExamples: [
      "Quel est le salaire individuel de John Smith ?",
      "Affiche le bénéfice net de la succursale concurrente Delmas.",
      "Quel est le profit net global du groupe FinOps ?"
    ]
  },
  SUPERVISOR: {
    role: "SUPERVISOR",
    maxClassificationAllowed: "INTERNAL",
    allowedDataCategories: [
      "TEAM_ATTENDANCE",
      "TEAM_OPERATIONAL_METRICS",
      "SHIFT_SCHEDULES",
      "OVERTIME_HOURS"
    ],
    restrictedFields: [
      "INDIVIDUAL_SALARY",
      "PAYROLL_COST",
      "COMPANY_FINANCIALS",
      "REVENUE",
      "PROFIT",
      "EXPENSES"
    ],
    branchBound: true,
    departmentBound: true,
    individualSalaryVisible: false,
    companyProfitVisible: false,
    payrollTotalsVisible: false,
    allowedQueryExamples: [
      "Quel est le taux de présence de mon équipe cette semaine ?",
      "Combien d'heures supplémentaires ont été demandées dans mon département ?",
      "Qui a des pointages suspects en attente de vérification ?"
    ],
    deniedQueryExamples: [
      "Quel est le coût global de la paie de l'entreprise ?",
      "Quel est le chiffre d'affaires du mois ?",
      "Combien gagne le manager ?"
    ]
  },
  HEAD_TELLER: {
    role: "HEAD_TELLER",
    maxClassificationAllowed: "INTERNAL",
    allowedDataCategories: [
      "CASH_OPERATIONS",
      "TELLER_TRANSACTIONS",
      "BRANCH_LEDGER_ENTRIES",
      "DAILY_CASH_RECONCILIATION"
    ],
    restrictedFields: [
      "PAYROLL",
      "INDIVIDUAL_SALARY",
      "COMPANY_PROFIT",
      "STRATEGIC_BUDGET"
    ],
    branchBound: true,
    departmentBound: true,
    individualSalaryVisible: false,
    companyProfitVisible: false,
    payrollTotalsVisible: false,
    allowedQueryExamples: [
      "Quel est le solde d'encaisse du guichet aujourd'hui ?",
      "Affiche les annulations de transactions au guichet principal.",
      "Y a-t-il des écarts de caisse enregistrés ce jour ?"
    ],
    deniedQueryExamples: [
      "Combien l'entreprise paie en salaires ?",
      "Affiche la liste des bulletins de paie.",
      "Quel est le bénéfice comptable annuel ?"
    ]
  },
  EMPLOYEE: {
    role: "EMPLOYEE",
    maxClassificationAllowed: "INTERNAL",
    allowedDataCategories: [
      "PERSONAL_PAYROLL",
      "PERSONAL_ATTENDANCE",
      "PERSONAL_SCHEDULE",
      "PERSONAL_LEAVE_BALANCE"
    ],
    restrictedFields: [
      "COMPANY_FINANCIALS",
      "OTHER_EMPLOYEE_DATA",
      "LEDGER",
      "BRANCH_METRICS",
      "PROFIT"
    ],
    branchBound: true,
    departmentBound: true,
    individualSalaryVisible: true, // Only for own salary
    companyProfitVisible: false,
    payrollTotalsVisible: false,
    allowedQueryExamples: [
      "Quel est le détail de ma dernière quinzaine ?",
      "Combien de jours de congé me reste-t-il ?",
      "Affiche l'historique de mes pointages du mois."
    ],
    deniedQueryExamples: [
      "Combien l'entreprise a gagné ce mois ?",
      "Quel est le salaire de mes collègues ?",
      "Combien dépense l'entreprise en paie globale ?"
    ]
  },
  SUPER_ADMIN: {
    role: "SUPER_ADMIN",
    maxClassificationAllowed: "INTERNAL",
    allowedDataCategories: [
      "SYSTEM_TELEMETRY",
      "AUDIT_TRAILS",
      "API_LATENCY",
      "INCIDENTS",
      "DATABASE_HEALTH"
    ],
    restrictedFields: [
      "BUSINESS_FINANCIAL_TRANSACTIONS",
      "BUSINESS_PAYROLL_DETAILS",
      "PRIVATE_CLIENT_LEDGER"
    ],
    branchBound: false,
    departmentBound: false,
    individualSalaryVisible: false,
    companyProfitVisible: false,
    payrollTotalsVisible: false,
    allowedQueryExamples: [
      "Quel est le taux de santé des services et le volume de logs ?",
      "Y a-t-il eu des erreurs système sur les 24 dernières heures ?",
      "Quel est l'état de la synchronisation hors-ligne ?"
    ],
    deniedQueryExamples: [
      "Affiche le solde bancaire et les bénéfices nets du client Enterprise.",
      "Montre-moi les salaires nominatifs des employés du client."
    ]
  }
};

export function getRoleGovernancePolicy(role: string): RoleGovernancePolicy {
  const normalized = (role || "").toUpperCase();
  if (normalized.includes("OWNER") || normalized.includes("DIRIGEANT") || normalized.includes("EXECUTIVE")) {
    return ROLE_GOVERNANCE_MATRIX.OWNER;
  }
  if (normalized.includes("MANAGER") || normalized.includes("ADMIN")) {
    return ROLE_GOVERNANCE_MATRIX.MANAGER;
  }
  if (normalized.includes("SUPERVISOR")) {
    return ROLE_GOVERNANCE_MATRIX.SUPERVISOR;
  }
  if (normalized.includes("TELLER") || normalized.includes("HEAD_TELLER") || normalized.includes("CAISSIER")) {
    return ROLE_GOVERNANCE_MATRIX.HEAD_TELLER;
  }
  if (normalized.includes("SUPER_ADMIN")) {
    return ROLE_GOVERNANCE_MATRIX.SUPER_ADMIN;
  }
  return ROLE_GOVERNANCE_MATRIX.EMPLOYEE;
}
