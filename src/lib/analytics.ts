import { 
  getAnalytics, 
  isSupported, 
  logEvent, 
  setAnalyticsCollectionEnabled, 
  setUserId, 
  setUserProperties, 
  Analytics 
} from "firebase/analytics";
import { app } from "./firebase";

let analyticsInstance: Analytics | null = null;
let initPromise: Promise<Analytics | null> | null = null;

/**
 * Initializes Firebase GA4 Analytics safely with runtime browser & cookie/IndexedDB support checks.
 */
export async function initAnalytics(): Promise<Analytics | null> {
  if (analyticsInstance) return analyticsInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (typeof window === "undefined") {
        return null;
      }

      const supported = await isSupported();
      if (supported) {
        analyticsInstance = getAnalytics(app);
        console.log("%c[Firebase Analytics] %cGA4 Initialized", "color: #06b6d4; font-weight: bold;", "color: #10b981; font-weight: bold;");
        return analyticsInstance;
      } else {
        console.warn("[Firebase Analytics] GA4 is not supported in this runtime environment (SSR/iframe/cookies disabled).");
        return null;
      }
    } catch (err) {
      console.warn("[Firebase Analytics] Graceful fallback - failed to initialize GA4:", err);
      return null;
    }
  })();

  return initPromise;
}

/**
 * Formats raw event names into strict GA4 compliant names (snake_case, max 40 chars, alphanumeric + underscores).
 */
export function formatGA4EventName(rawName: string): string {
  if (!rawName) return "custom_event";
  
  let formatted = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!formatted || !/^[a-z]/.test(formatted)) {
    formatted = "ev_" + formatted;
  }

  return formatted.substring(0, 40);
}

/**
 * Sanitizes parameter maps for GA4 logEvent to prevent invalid type serialization errors.
 */
export function sanitizeGA4Params(params?: Record<string, any>): Record<string, string | number | boolean> {
  if (!params) return {};
  const sanitized: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    
    // Format key to valid GA4 param name
    const validKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").substring(0, 40);
    
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      sanitized[validKey] = typeof value === "string" ? value.substring(0, 100) : value;
    } else if (typeof value === "object") {
      try {
        sanitized[validKey] = JSON.stringify(value).substring(0, 100);
      } catch {
        sanitized[validKey] = String(value).substring(0, 100);
      }
    } else {
      sanitized[validKey] = String(value).substring(0, 100);
    }
  }

  return sanitized;
}

/**
 * Centralized safe event dispatcher for Firebase GA4 Analytics.
 */
export async function sendEvent(eventName: string, params?: Record<string, any>): Promise<boolean> {
  try {
    const analytics = await initAnalytics();
    if (!analytics) {
      return false;
    }

    const ga4Name = formatGA4EventName(eventName);
    const sanitizedParams = sanitizeGA4Params(params);

    logEvent(analytics, ga4Name, sanitizedParams);

    if (import.meta.env?.DEV || import.meta.env?.VITE_ENABLE_MOCK_LOGS === "true") {
      console.log(
        `%c[GA4-Event] %c${ga4Name}`,
        "color: #8b5cf6; font-weight: bold;",
        "color: #ec4899; font-weight: bold;",
        sanitizedParams
      );
    }

    return true;
  } catch (err) {
    console.warn(`[Firebase Analytics] Failed to send event '${eventName}':`, err);
    return false;
  }
}

/**
 * Configures analytics collection consent (opt-in / opt-out) without crashing if consent is revoked.
 */
export async function setAnalyticsConsent(granted: boolean): Promise<boolean> {
  try {
    const analytics = await initAnalytics();
    if (!analytics) return false;

    setAnalyticsCollectionEnabled(analytics, granted);
    console.log(`[Firebase Analytics] Collection consent set to: ${granted}`);
    return true;
  } catch (err) {
    console.warn("[Firebase Analytics] Failed to set analytics consent:", err);
    return false;
  }
}

/**
 * Sets user ID and user properties in GA4 for user session attribution.
 */
export async function setAnalyticsUser(userId: string | null, properties?: Record<string, any>): Promise<boolean> {
  try {
    const analytics = await initAnalytics();
    if (!analytics) return false;

    if (userId) {
      setUserId(analytics, userId);
    }

    if (properties) {
      const sanitizedProps = sanitizeGA4Params(properties);
      setUserProperties(analytics, sanitizedProps);
    }

    return true;
  } catch (err) {
    console.warn("[Firebase Analytics] Failed to set user properties:", err);
    return false;
  }
}

/**
 * Tracks route / page view events in GA4.
 */
export async function trackPageView(pagePath: string, pageTitle?: string): Promise<boolean> {
  const title = pageTitle || (typeof document !== "undefined" ? document.title : "FINOPS ERP");
  return sendEvent("page_view", {
    page_path: pagePath,
    page_title: title,
    page_location: typeof window !== "undefined" ? window.location.href : pagePath,
  });
}

/**
 * Reset module state for unit tests.
 */
export function resetAnalyticsForTesting() {
  analyticsInstance = null;
  initPromise = null;
}

