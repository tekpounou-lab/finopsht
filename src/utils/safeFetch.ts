import { CSRFService } from "../services/security/CSRFService";
import { auth } from "../lib/firebase";

/**
 * Enterprise Safe Fetch JSON Utility
 * Enforces:
 * 1. Automatic injection of Anti-CSRF tokens for state-changing requests (POST, PUT, PATCH, DELETE).
 * 2. Injection of Firebase Auth ID token if currentUser exists.
 * 3. Injection of client session tracking headers.
 * 4. Safe parsing to prevent "Unexpected token '<'..." HTML SPA fallback parse errors.
 */
export async function safeFetchJson<T = any>(url: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || "GET").toUpperCase();
  const isStateChanging = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";

  const headers: Record<string, string> = {
    "X-Requested-With": "XMLHttpRequest",
    "X-Client-Session-Id": CSRFService.getSessionId(),
    ...(options?.headers as Record<string, string> || {})
  };

  if (isStateChanging) {
    headers["X-CSRF-Token"] = CSRFService.getCsrfToken();
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  // Attach Firebase Auth bearer token if user is signed in
  try {
    if (auth.currentUser) {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers["Authorization"] = `Bearer ${idToken}`;
      }
    }
  } catch {}

  let response: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // Increased to 60s for heavy analysis tasks
    
    response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
  } catch (netErr: any) {
    const errorMsg = netErr?.message || String(netErr);
    console.warn(`[safeFetchJson] Network connection issue for ${url}:`, errorMsg);
    
    if (netErr.name === 'AbortError') {
       throw new Error(`Erreur réseau (${url}) : Délai d'attente dépassé (Timeout)`);
    }
    
    throw new Error(`Erreur réseau (${url}) : ${errorMsg.includes("Failed to fetch") ? "Serveur momentanément indisponible ou problème de connexion" : errorMsg}`);
  }

  // Read rotated CSRF token from response headers if server issued a new one
  const newCsrfHeader = response.headers.get("x-csrf-token");
  if (newCsrfHeader) {
    CSRFService.setCsrfToken(newCsrfHeader);
  }

  const text = await response.text();
  const trimmed = text.trim();

  if (!response.ok) {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsedErr = JSON.parse(trimmed);
        throw new Error(parsedErr.error || parsedErr.message || `HTTP ${response.status}`);
      } catch (e: any) {
        if (e.message && !e.message.startsWith("HTTP")) throw e;
      }
    }
    throw new Error(`HTTP ${response.status}: ${trimmed.slice(0, 200)}`);
  }

  if (trimmed.startsWith("<")) {
    throw new Error(`Expected JSON response from ${url}, but received HTML.`);
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch (err: any) {
    throw new Error(`Failed to parse JSON response from ${url}: ${err?.message || err}`);
  }
}
