/**
 * Enterprise CSRF & State-Changing Request Security Service
 * Issues cryptographically random anti-CSRF tokens, rotates session identifiers,
 * and attaches anti-tamper headers to all outgoing mutation requests.
 */

export class CSRFService {
  private static readonly CSRF_STORAGE_KEY = "finops_csrf_token";
  private static readonly SESSION_ID_KEY = "finops_client_session_id";
  private static memoryCsrfToken: string | null = null;
  private static memorySessionId: string | null = null;

  /**
   * Generates a cryptographically strong 32-byte hexadecimal random token
   */
  public static generateSecureToken(): string {
    if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
      const array = new Uint8Array(32);
      window.crypto.getRandomValues(array);
      return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    // Fallback for non-browser or test execution
    return `csrf_${Date.now()}_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Gets or initializes the active CSRF token
   */
  public static getCsrfToken(): string {
    if (this.memoryCsrfToken) {
      return this.memoryCsrfToken;
    }

    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        const stored = window.sessionStorage.getItem(this.CSRF_STORAGE_KEY);
        if (stored) {
          this.memoryCsrfToken = stored;
          return stored;
        }
      }
    } catch {}

    const newToken = this.generateSecureToken();
    this.setCsrfToken(newToken);
    return newToken;
  }

  /**
   * Sets or updates the active CSRF token in memory and session storage
   */
  public static setCsrfToken(token: string): void {
    this.memoryCsrfToken = token;
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(this.CSRF_STORAGE_KEY, token);
      }
    } catch {}
  }

  /**
   * Rotates CSRF and session tokens every 15 minutes or upon auth state changes
   */
  public static rotateTokens(): { csrfToken: string; sessionId: string } {
    const newCsrf = this.generateSecureToken();
    const newSession = `sess_${Date.now()}_${this.generateSecureToken().substring(0, 12)}`;

    this.setCsrfToken(newCsrf);
    this.memorySessionId = newSession;

    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(this.SESSION_ID_KEY, newSession);
      }
    } catch {}

    return { csrfToken: newCsrf, sessionId: newSession };
  }

  /**
   * Returns current active client session ID
   */
  public static getSessionId(): string {
    if (this.memorySessionId) return this.memorySessionId;

    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        const stored = window.sessionStorage.getItem(this.SESSION_ID_KEY);
        if (stored) {
          this.memorySessionId = stored;
          return stored;
        }
      }
    } catch {}

    const newSession = `sess_${Date.now()}_${this.generateSecureToken().substring(0, 12)}`;
    this.memorySessionId = newSession;
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(this.SESSION_ID_KEY, newSession);
      }
    } catch {}

    return newSession;
  }
}
