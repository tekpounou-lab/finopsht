import { lazy, LazyExoticComponent, ComponentType } from "react";

/**
 * Resilient lazy loader for dynamic imports.
 * Retries failed dynamic module imports before falling back to a full page reload.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<any>,
  maxRetries = 2,
  intervalMs = 800
): LazyExoticComponent<T> {
  return lazy(async () => {
    let lastError: any;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const module = await factory();
        let component: any = module?.default;
        if (!component && typeof module === "object" && module !== null) {
          // Look for any exported function or object that could be a component
          const candidates = Object.entries(module).filter(([key, val]) => 
            key !== "__esModule" && (typeof val === "function" || (typeof val === "object" && val !== null))
          );
          const pascalCaseMatch = candidates.find(([key]) => /^[A-Z]/.test(key));
          component = pascalCaseMatch ? pascalCaseMatch[1] : (candidates[0] ? candidates[0][1] : module);
        }
        return { default: component as T };
      } catch (error) {
        lastError = error;
        console.warn(`[lazyWithRetry] Dynamic import failed (attempt ${i + 1}/${maxRetries + 1}):`, error);
        if (i < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs * (i + 1)));
        }
      }
    }

    // If all retries fail, trigger a controlled page reload if not recently reloaded
    const storageKey = "vite_chunk_reload_timestamp";
    const lastReload = sessionStorage.getItem(storageKey);
    const now = Date.now();
    if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
      sessionStorage.setItem(storageKey, now.toString());
      console.warn("[lazyWithRetry] All retries exhausted, reloading page to fetch fresh bundle...");
      window.location.reload();
    }

    throw lastError;
  });
}
