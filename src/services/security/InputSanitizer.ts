import { WhereFilterOp } from "firebase/firestore";

export interface SanitizedQueryFilter {
  field: string;
  operator: WhereFilterOp;
  value: any;
}

const ALLOWED_OPERATORS = new Set<WhereFilterOp>([
  "<",
  "<=",
  "==",
  "!=",
  ">=",
  ">",
  "array-contains",
  "in",
  "not-in",
  "array-contains-any"
]);

// Whitelisted collection prefixes and identifiers
const SAFE_FIELD_REGEX = /^[a-zA-Z0-9_\.]{1,64}$/;
const SAFE_COLLECTION_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-\.]{1,128}$/;

export class InputSanitizer {
  /**
   * Sanitizes and validates a business tenant ID.
   * Throws an error or returns a safe fallback if malformed or attempts traversal.
   */
  public static sanitizeBusinessId(businessId?: string | null): string {
    if (!businessId || typeof businessId !== "string") {
      return "TENANT_REJECTED_EMPTY";
    }

    const trimmed = businessId.trim();
    if (trimmed === "ALL" || trimmed === "GLOBAL" || trimmed === "SYSTEM" || trimmed === "biz_demo") {
      return trimmed;
    }

    // Strip control characters, quotes, SQL/NoSQL injections
    const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!sanitized || sanitized.length < 3 || sanitized.length > 64) {
      throw new Error(`[SECURITY_VIOLATION] Invalid businessId format: "${businessId.slice(0, 16)}"`);
    }

    return sanitized;
  }

  /**
   * Validates collection path against directory traversal or injection
   */
  public static sanitizeCollectionPath(path: string): string {
    if (!path || typeof path !== "string") {
      throw new Error("[SECURITY_VIOLATION] Missing or invalid collection path.");
    }

    const trimmed = path.trim();
    if (trimmed.includes("..") || trimmed.includes("//") || trimmed.startsWith("/")) {
      throw new Error(`[SECURITY_VIOLATION] Path traversal detected in collection path: "${trimmed}"`);
    }

    const segments = trimmed.split("/");
    for (const segment of segments) {
      if (!SAFE_COLLECTION_REGEX.test(segment)) {
        throw new Error(`[SECURITY_VIOLATION] Malformed collection segment: "${segment}"`);
      }
    }

    return trimmed;
  }

  /**
   * Sanitizes query filters to ensure only safe fields, operators, and values are queried
   */
  public static sanitizeQueryFilter(filter: any): SanitizedQueryFilter | null {
    if (!filter || typeof filter !== "object") return null;

    const { field, operator, value } = filter;

    if (typeof field !== "string" || !SAFE_FIELD_REGEX.test(field)) {
      console.warn(`[InputSanitizer] Rejected query filter with invalid field: "${field}"`);
      return null;
    }

    if (!ALLOWED_OPERATORS.has(operator)) {
      console.warn(`[InputSanitizer] Rejected query filter with unsupported operator: "${operator}"`);
      return null;
    }

    // Check for null/undefined/NaN values
    if (value === undefined || value === null || value === "undefined" || value === "null") {
      return null;
    }

    if (typeof value === "number" && isNaN(value)) {
      return null;
    }

    // Sanitize business_id comparisons specifically
    if ((field === "business_id" || field === "businessId") && operator === "==") {
      if (typeof value !== "string") return null;
      try {
        const sanitizedBiz = this.sanitizeBusinessId(value);
        return { field, operator, value: sanitizedBiz };
      } catch {
        return null;
      }
    }

    if (operator === "in" || operator === "not-in" || operator === "array-contains-any") {
      if (!Array.isArray(value) || value.length === 0 || value.length > 30) {
        return null;
      }
      const safeValues = value.filter(v => v !== null && v !== undefined && v !== "undefined" && v !== "null");
      if (safeValues.length === 0) return null;
      return { field, operator, value: safeValues };
    }

    return { field, operator, value };
  }

  /**
   * Cleans arbitrary user search string
   */
  public static sanitizeSearchInput(text?: string | null): string {
    if (!text || typeof text !== "string") return "";
    return text
      .replace(/[<>'"`;\\]/g, "") // Strip script/tag characters
      .trim()
      .slice(0, 256);
  }
}
