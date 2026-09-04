// src/services/analytics/DepartmentAliasEngine.ts
import { Department, LedgerTransaction, DepartmentAlias } from "../../types";
import { DepartmentAliasRepository } from "../../repositories/AnalyticsRepository";

export class DepartmentAliasEngine {
  /**
   * Helper to calculate Levenshtein distance between two strings
   */
  private static getLevenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            Math.min(
              matrix[i][j - 1] + 1, // insertion
              matrix[i - 1][j] + 1  // deletion
            )
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Resolves a department from a raw alias string using DB mappings and fuzzy matching.
   */
  public static async resolveAlias(
    businessId: string,
    alias: string, 
    departments: Department[]
  ): Promise<Department | null> {
    if (!alias) return null;
    const cleanAlias = alias.trim().toLowerCase();

    // 1. Check persistent database mappings first
    try {
      const dbMapping = await DepartmentAliasRepository.findByAlias(businessId, cleanAlias);
      if (dbMapping) {
        const dept = departments.find((d) => d.id === dbMapping.departmentId);
        if (dept) return dept;
      }
    } catch (e) {
      console.error("[DepartmentAliasEngine] Error checking alias DB mapping:", e);
    }

    // 2. Substring & Exact matching
    for (const d of departments) {
      const cleanName = d.name.trim().toLowerCase();
      if (cleanName === cleanAlias || cleanName.includes(cleanAlias) || cleanAlias.includes(cleanName)) {
        return d;
      }
    }

    // 3. Fuzzy Levenshtein Distance matching
    let bestMatch: Department | null = null;
    let minDistance = 999;
    for (const d of departments) {
      const dist = this.getLevenshteinDistance(cleanAlias, d.name.trim().toLowerCase());
      if (dist < minDistance && dist <= 3) { // limit to max 3 edit distance
        minDistance = dist;
        bestMatch = d;
      }
    }

    return bestMatch;
  }

  /**
   * Registers a new persistent department alias mapping in the database.
   */
  public static async addAlias(
    businessId: string, 
    alias: string, 
    departmentId: string
  ): Promise<void> {
    const cleanAlias = alias.trim().toLowerCase();
    const mapping: DepartmentAlias = {
      id: `${businessId}_${cleanAlias.replace(/\s+/g, "_")}`,
      businessId,
      business_id: businessId,
      alias: cleanAlias,
      departmentId,
      createdAt: new Date().toISOString()
    };
    await DepartmentAliasRepository.save(mapping);
  }

  /**
   * Scans transactions for raw department names that are unrecognized,
   * suggesting high-probability mappings to existing departments.
   */
  public static async getSuggestedAliases(
    businessId: string,
    transactions: LedgerTransaction[], 
    departments: Department[]
  ): Promise<{ alias: string; departmentId: string; confidence: number }[]> {
    const unmappedAliases = new Set<string>();

    // 1. Gather all raw department aliases used in transactions
    for (const tx of transactions) {
      if ((tx.business_id || (tx as any).businessId) !== businessId) continue;
      
      const queryDept = tx.departmentId || tx.department_id || tx.department_code || tx.department_name;
      if (queryDept && typeof queryDept === "string" && queryDept.trim()) {
        const isDirectId = departments.some((d) => d.id === queryDept);
        if (!isDirectId) {
          unmappedAliases.add(queryDept.trim());
        }
      }
    }

    // 2. Exclude already mapped aliases
    const existingMappings = await DepartmentAliasRepository.fetchForBusiness(businessId);
    const mappedSet = new Set(existingMappings.map((m) => m.alias.toLowerCase()));

    const suggestions: { alias: string; departmentId: string; confidence: number }[] = [];

    // 3. For each unmapped alias, find a high-probability match
    for (const rawAlias of unmappedAliases) {
      if (mappedSet.has(rawAlias.toLowerCase())) continue;

      const cleanAlias = rawAlias.toLowerCase();
      let bestDept: Department | null = null;
      let highestConfidence = 0;

      for (const d of departments) {
        const cleanName = d.name.toLowerCase();
        let confidence = 0;

        if (cleanName === cleanAlias) {
          confidence = 0.99;
        } else if (cleanName.includes(cleanAlias) || cleanAlias.includes(cleanName)) {
          confidence = 0.85;
        } else {
          const dist = this.getLevenshteinDistance(cleanAlias, cleanName);
          if (dist === 1) {
            confidence = 0.75;
          } else if (dist === 2) {
            confidence = 0.50;
          } else if (dist === 3) {
            confidence = 0.25;
          }
        }

        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          bestDept = d;
        }
      }

      if (bestDept && highestConfidence >= 0.25) {
        suggestions.push({
          alias: rawAlias,
          departmentId: bestDept.id,
          confidence: highestConfidence
        });
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }
}
