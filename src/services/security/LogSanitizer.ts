/**
 * Enterprise PII & Credential Sanitizer
 * Masks user emails, UIDs, business IDs, tokens, passwords, and sensitive financial fields
 * to prevent data leakage into logs, telemetry, and consoles.
 */

// Regex patterns for sensitive data discovery
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g;
const JWT_REGEX = /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g;
const FIREBASE_API_KEY_REGEX = /\bAIza[0-9A-Za-z-_]{35}\b/g;
const BUSINESS_ID_REGEX = /\bbiz_[a-zA-Z0-9_-]{8,}\b/g;
const UID_REGEX = /\b(usr_|auth_|uid_)[a-zA-Z0-9_-]{8,}\b/g;

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "refreshtoken",
  "idtoken",
  "accesstoken",
  "secret",
  "apikey",
  "api_key",
  "clientsecret",
  "client_secret",
  "ssn",
  "nif",
  "cin",
  "bankaccount",
  "bank_account",
  "cardnumber",
  "creditcard",
  "cvv",
  "salary",
  "basesalary",
  "netpaid",
  "authorization"
]);

export class LogSanitizer {
  /**
   * Masks email address: e.g. "john.doe@example.com" -> "j***e@***.com"
   */
  public static maskEmail(email?: string | null): string {
    if (!email || typeof email !== "string") return "[ANONYMOUS]";
    const parts = email.split("@");
    if (parts.length !== 2) return "[REDACTED_EMAIL]";

    const [user, domain] = parts;
    const maskedUser = user.length <= 2 
      ? `${user[0] || "*"}***` 
      : `${user[0]}***${user[user.length - 1]}`;

    const domainParts = domain.split(".");
    const ext = domainParts.length > 1 ? domainParts[domainParts.length - 1] : "com";
    return `${maskedUser}@***.${ext}`;
  }

  /**
   * Masks User ID / UID: e.g. "0PeSc2zs48etISpuljIssQU0UKU2" -> "0PeS***UKU2"
   */
  public static maskUid(uid?: string | null): string {
    if (!uid || typeof uid !== "string") return "[NO_UID]";
    if (uid === "SYSTEM" || uid === "ANONYMOUS" || uid === "ALL" || uid === "GLOBAL") return uid;
    if (uid.length <= 8) return `${uid.substring(0, 2)}***`;
    return `${uid.substring(0, 4)}***${uid.substring(uid.length - 4)}`;
  }

  /**
   * Masks Business / Tenant ID: e.g. "biz_0PeSc2zs48etISpuljIssQU0UKU2" -> "biz_0PeS***UKU2"
   */
  public static maskBusinessId(bizId?: string | null): string {
    if (!bizId || typeof bizId !== "string") return "[NO_BIZ_ID]";
    if (bizId === "SYSTEM" || bizId === "GLOBAL" || bizId === "biz_demo" || bizId === "ALL") return bizId;
    if (bizId.startsWith("biz_")) {
      const core = bizId.substring(4);
      if (core.length <= 6) return `biz_${core.substring(0, 2)}***`;
      return `biz_${core.substring(0, 4)}***${core.substring(core.length - 4)}`;
    }
    return this.maskUid(bizId);
  }

  /**
   * Sanitizes arbitrary string by masking all emails, tokens, keys, and identifiers
   */
  public static sanitizeString(text: string): string {
    if (!text || typeof text !== "string") return "";

    return text
      .replace(EMAIL_REGEX, (match) => this.maskEmail(match))
      .replace(JWT_REGEX, "[REDACTED_JWT_TOKEN]")
      .replace(FIREBASE_API_KEY_REGEX, "[REDACTED_API_KEY]")
      .replace(BUSINESS_ID_REGEX, (match) => this.maskBusinessId(match));
  }

  /**
   * Recursively sanitizes any payload (objects, arrays, primitives)
   */
  public static sanitizePayload<T = any>(data: T, maxDepth = 6): T {
    if (data === null || data === undefined) return data;
    if (maxDepth <= 0) return "[MAX_DEPTH_REACHED]" as any;

    if (typeof data === "string") {
      return this.sanitizeString(data) as any;
    }

    if (typeof data === "number" || typeof data === "boolean") {
      return data;
    }

    if (data instanceof Error) {
      return {
        name: data.name,
        message: this.sanitizeString(data.message),
        stack: data.stack ? this.sanitizeString(data.stack) : undefined
      } as any;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizePayload(item, maxDepth - 1)) as any;
    }

    if (typeof data === "object") {
      const sanitizedObj: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase().replace(/[-_]/g, "");
        if (SENSITIVE_KEYS.has(lowerKey)) {
          sanitizedObj[key] = "[REDACTED_SENSITIVE_FIELD]";
        } else if (key === "email" || key === "userEmail" || key === "actorEmail" || key === "actor_email") {
          sanitizedObj[key] = typeof value === "string" ? this.maskEmail(value) : "[REDACTED_EMAIL]";
        } else if (key === "uid" || key === "user_uid" || key === "actor_uid" || key === "actorId") {
          sanitizedObj[key] = typeof value === "string" ? this.maskUid(value) : value;
        } else if (key === "business_id" || key === "businessId" || key === "target_business_id") {
          sanitizedObj[key] = typeof value === "string" ? this.maskBusinessId(value) : value;
        } else {
          sanitizedObj[key] = this.sanitizePayload(value, maxDepth - 1);
        }
      }
      return sanitizedObj as any;
    }

    return String(data) as any;
  }

  /**
   * Sanitizes variadic console arguments
   */
  public static sanitizeArgs(args: any[]): any[] {
    return args.map((arg) => {
      if (typeof arg === "string") {
        return this.sanitizeString(arg);
      }
      return this.sanitizePayload(arg);
    });
  }
}
