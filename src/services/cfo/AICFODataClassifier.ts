import { DataClassification } from "./AICFOGovernanceTypes";

export class AICFODataClassifier {
  /**
   * Classify a user question into a security data classification level.
   */
  public static classifyQuery(question: string): DataClassification {
    const q = (question || "").toLowerCase();

    // 1. RESTRICTED: Individual salaries, employee-specific compensation, private contract details
    if (
      q.includes("salaire de") ||
      q.includes("combien gagne") ||
      q.includes("bulletin de") ||
      q.includes("fiche de paie de") ||
      q.includes("contrat de") ||
      q.includes("gagne combien") ||
      q.includes("remuneration de") ||
      q.includes("salary of")
    ) {
      return "RESTRICTED";
    }

    // 2. CONFIDENTIAL: Company profit, net margin, total payroll expense, consolidated ledger, cross-branch financial comparison
    if (
      q.includes("profit net") ||
      q.includes("benefice net") ||
      q.includes("marge nette") ||
      q.includes("masse salariale") ||
      q.includes("cout total de la paie") ||
      q.includes("chiffre d'affaires total") ||
      q.includes("bilan financier") ||
      q.includes("compte de resultat") ||
      q.includes("net profit") ||
      q.includes("total payroll") ||
      q.includes("fraude") ||
      q.includes("anomalie de depenses")
    ) {
      return "CONFIDENTIAL";
    }

    // 3. INTERNAL: Branch metrics, team attendance, operational cash flow, department budget, inventory
    if (
      q.includes("presence") ||
      q.includes("retard") ||
      q.includes("heures sup") ||
      q.includes("heures supplementaires") ||
      q.includes("pointage") ||
      q.includes("encaisse") ||
      q.includes("guichet") ||
      q.includes("succursale") ||
      q.includes("budget") ||
      q.includes("depenses") ||
      q.includes("recettes") ||
      q.includes("caisse")
    ) {
      return "INTERNAL";
    }

    // 4. PUBLIC: General system definitions, help queries, currency conversion, policy rules
    return "PUBLIC";
  }

  /**
   * Compare classification levels.
   */
  public static isAccessAllowed(
    queryLevel: DataClassification,
    userMaxLevel: DataClassification
  ): boolean {
    const levels: Record<DataClassification, number> = {
      PUBLIC: 1,
      INTERNAL: 2,
      CONFIDENTIAL: 3,
      RESTRICTED: 4
    };

    return levels[queryLevel] <= levels[userMaxLevel];
  }
}
