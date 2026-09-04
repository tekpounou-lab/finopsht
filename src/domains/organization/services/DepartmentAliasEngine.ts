import { Department } from "../../../types";

export interface DepartmentMatchResult {
  rawInput: string;
  department: Department | null;
  confidence: "EXACT_ID" | "EXACT_CODE" | "EXACT_NAME" | "ALIAS_MATCH" | "FUZZY_MATCH" | "UNMAPPED";
  matchedBy?: string;
}

export interface BulkMatchSummary {
  results: Record<string, DepartmentMatchResult>;
  mappedCount: number;
  unmappedCount: number;
  unmappedLabels: string[];
}

export class DepartmentAliasEngine {
  /**
   * Normalizes a string for clean comparative matching.
   */
  public static normalizeString(str: string): string {
    if (!str) return "";
    return str
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip accents
      .replace(/[^a-z0-9]/g, ""); // strip spaces and special characters
  }

  /**
   * Resolves a query string against existing departments using SSOT rules:
   * 1. Exact Department ID match
   * 2. Exact Department Code match
   * 3. Exact Department Name match
   * 4. Registered Alias match (from `department.aliases`)
   * 5. Canonical / Fuzzy match (normalizing Barber Shop -> Salon de coiffure, Nail Studio -> Onglerie, etc.)
   */
  public static resolveDepartment(departments: Department[], query: string | undefined | null): Department | undefined {
    const result = this.resolveDepartmentWithDetails(departments, query);
    return result.department || undefined;
  }

  /**
   * Resolves a query string with match confidence metadata.
   */
  public static resolveDepartmentWithDetails(departments: Department[], query: string | undefined | null): DepartmentMatchResult {
    if (!query || !query.trim()) {
      return { rawInput: query || "", department: null, confidence: "UNMAPPED" };
    }

    const raw = query.trim();
    const normalized = this.normalizeString(raw);
    const upperRaw = raw.toUpperCase();

    // 1. Direct ID match
    const byId = departments.find(d => d.id === raw || d.id.toLowerCase() === raw.toLowerCase());
    if (byId) {
      return { rawInput: raw, department: byId, confidence: "EXACT_ID", matchedBy: byId.id };
    }

    // 2. Direct Code match
    const byCode = departments.find(d => d.code && (d.code.trim().toUpperCase() === upperRaw || this.normalizeString(d.code) === normalized));
    if (byCode) {
      return { rawInput: raw, department: byCode, confidence: "EXACT_CODE", matchedBy: byCode.code };
    }

    // 3. Exact Name match
    const byName = departments.find(d => this.normalizeString(d.name) === normalized);
    if (byName) {
      return { rawInput: raw, department: byName, confidence: "EXACT_NAME", matchedBy: byName.name };
    }

    // 4. Registered Alias match
    for (const dept of departments) {
      if (dept.aliases && Array.isArray(dept.aliases)) {
        const matchedAlias = dept.aliases.find(a => this.normalizeString(a) === normalized);
        if (matchedAlias) {
          return { rawInput: raw, department: dept, confidence: "ALIAS_MATCH", matchedBy: matchedAlias };
        }
      }
    }

    // 5. Hardcoded Canonical Enterprise Alias Fallbacks
    // (e.g. "Barber Shop" -> "Salon de coiffure" / d_b_k; "Nail Studio" -> "Onglerie"; "Logistique" -> "Opération")
    if (normalized.includes("barber") || normalized.includes("hair") || normalized.includes("coiffure")) {
      const match = departments.find(d => d.id === "d_b_k" || (d.code && d.code.toUpperCase() === "BAR") || this.normalizeString(d.name).includes("coiffure") || this.normalizeString(d.name).includes("barber"));
      if (match) return { rawInput: raw, department: match, confidence: "FUZZY_MATCH", matchedBy: "Canonical Barber/Coiffure Alias" };
    }

    if (normalized.includes("nail") || normalized.includes("onglerie") || normalized.includes("manicure")) {
      const match = departments.find(d => d.id === "d_nail" || (d.code && d.code.toUpperCase() === "NAIL") || this.normalizeString(d.name).includes("onglerie") || this.normalizeString(d.name).includes("nail"));
      if (match) return { rawInput: raw, department: match, confidence: "FUZZY_MATCH", matchedBy: "Canonical Nail/Onglerie Alias" };
    }

    if (normalized.includes("admin") || normalized.includes("fin") || normalized.includes("direction") || normalized.includes("supervision")) {
      const match = departments.find(d => d.id === "d_admin" || (d.code && d.code.toUpperCase() === "FIN") || this.normalizeString(d.name).includes("admin"));
      if (match) return { rawInput: raw, department: match, confidence: "FUZZY_MATCH", matchedBy: "Canonical Admin/Fin Alias" };
    }

    if (normalized.includes("logistic") || normalized.includes("securite") || normalized.includes("oper") || normalized.includes("ops")) {
      const match = departments.find(d => d.id === "d_oper" || (d.code && d.code.toUpperCase() === "OPS") || this.normalizeString(d.name).includes("oper"));
      if (match) return { rawInput: raw, department: match, confidence: "FUZZY_MATCH", matchedBy: "Canonical Ops/Logistics Alias" };
    }

    if (normalized.includes("sale") || normalized.includes("mkt") || normalized.includes("vente") || normalized.includes("boissons") || normalized.includes("drink")) {
      const match = departments.find(d => d.id === "d_sales" || (d.code && d.code.toUpperCase() === "MKT") || this.normalizeString(d.name).includes("vente") || this.normalizeString(d.name).includes("boisson"));
      if (match) return { rawInput: raw, department: match, confidence: "FUZZY_MATCH", matchedBy: "Canonical Sales/Ventes/Boissons Alias" };
    }

    if (normalized.includes("hr") || normalized.includes("rh") || normalized.includes("personnel")) {
      const match = departments.find(d => d.id === "d_hr" || (d.code && d.code.toUpperCase() === "HR") || this.normalizeString(d.name).includes("ressource"));
      if (match) return { rawInput: raw, department: match, confidence: "FUZZY_MATCH", matchedBy: "Canonical HR/Personnel Alias" };
    }

    return { rawInput: raw, department: null, confidence: "UNMAPPED" };
  }

  /**
   * Adds a new alias string to a department's aliases array (if not already present).
   */
  public static addAlias(department: Department, alias: string): Department {
    const cleanAlias = alias.trim();
    if (!cleanAlias) return department;

    const existingAliases = department.aliases || [];
    const alreadyExists = existingAliases.some(a => this.normalizeString(a) === this.normalizeString(cleanAlias));

    if (alreadyExists) return department;

    return {
      ...department,
      aliases: [...existingAliases, cleanAlias]
    };
  }

  /**
   * Removes an alias from a department.
   */
  public static removeAlias(department: Department, alias: string): Department {
    if (!department.aliases) return department;
    const norm = this.normalizeString(alias);
    return {
      ...department,
      aliases: department.aliases.filter(a => this.normalizeString(a) !== norm)
    };
  }

  /**
   * Runs bulk matching over a list of raw department string labels.
   */
  public static bulkMatch(departments: Department[], rawLabels: string[]): BulkMatchSummary {
    const results: Record<string, DepartmentMatchResult> = {};
    let mappedCount = 0;
    let unmappedCount = 0;
    const unmappedLabels: string[] = [];

    const uniqueLabels = Array.from(new Set(rawLabels.filter(Boolean).map(l => l.trim())));

    for (const label of uniqueLabels) {
      const match = this.resolveDepartmentWithDetails(departments, label);
      results[label] = match;
      if (match.department) {
        mappedCount++;
      } else {
        unmappedCount++;
        unmappedLabels.push(label);
      }
    }

    return {
      results,
      mappedCount,
      unmappedCount,
      unmappedLabels
    };
  }
}
