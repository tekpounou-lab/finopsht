import { Employee } from "../../../types";
import { AssociateResolution } from "../types/quickbooks";

export class EmployeeResolutionEngine {
  
  // Dependency-free Levenshtein Distance
  private static levenshtein(a: string, b: string): number {
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    return matrix[a.length][b.length];
  }

  static resolveAssociates(
    uniqueNames: string[], 
    employees: Employee[]
  ): Map<string, AssociateResolution> {
    const resolutionMap = new Map<string, AssociateResolution>();

    for (const rawName of uniqueNames) {
      const normalizedRaw = String(rawName || '').trim().toLowerCase();
      
      // If rawName represents an unassigned placeholder, keep it unresolved so user can map it
      if (normalizedRaw === 'non assigné' || normalizedRaw === 'non assigne' || normalizedRaw === 'unassigned' || normalizedRaw === 'inconnu') {
        resolutionMap.set(rawName, {
          rawName,
          status: 'UNRESOLVED',
          matchedEmployeeId: null,
          matchedEmail: null,
          candidates: employees.slice(0, 5)
        });
        continue;
      }
      
      let bestMatch: Employee | null = null;
      let lowestDistance = Infinity;
      const scoredCandidates: { emp: Employee; score: number }[] = [];

      for (const emp of employees) {
        // Compare against multiple fields
        const targets = [
          (emp.name || "").toLowerCase(),
          (emp.name ? emp.name.split(" ")[0] : "").toLowerCase(), // First name isolation
          (emp.email || "").split("@")[0].toLowerCase() // Use email prefix if available
        ].filter(Boolean);

        let bestEmpScore = Infinity;
        for (const target of targets) {
          const distance = this.levenshtein(normalizedRaw, target);
          if (distance < bestEmpScore) bestEmpScore = distance;
        }

        scoredCandidates.push({ emp, score: bestEmpScore });

        if (bestEmpScore < lowestDistance) {
          lowestDistance = bestEmpScore;
          bestMatch = emp;
        }
      }

      // Sort candidates by closest match (lowest distance first)
      scoredCandidates.sort((a, b) => a.score - b.score);
      const topCandidates = scoredCandidates.slice(0, 5).map(sc => sc.emp);

      let status: 'EXACT' | 'HIGH_CONFIDENCE' | 'UNRESOLVED' = 'UNRESOLVED';
      if (lowestDistance === 0) status = 'EXACT';
      else if (lowestDistance <= 2) status = 'HIGH_CONFIDENCE';

      resolutionMap.set(rawName, {
        rawName,
        status,
        matchedEmployeeId: status !== 'UNRESOLVED' && bestMatch ? bestMatch.id : null,
        matchedEmail: status !== 'UNRESOLVED' && bestMatch ? bestMatch.email : null,
        candidates: topCandidates
      });
    }

    return resolutionMap;
  }
}
