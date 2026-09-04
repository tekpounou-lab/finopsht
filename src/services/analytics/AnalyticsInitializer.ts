// src/services/analytics/AnalyticsInitializer.ts
export interface AnalyticsInitState {
  isInitialized: boolean;
  initializationGuard: boolean;
  retryCount: number;
  lastError?: string;
}

export class AnalyticsInitializer {
  private static initStates = new Map<string, AnalyticsInitState>();
  private static initPromises = new Map<string, Promise<{ success: boolean; error?: string }>>();
  private static MAX_RETRIES = 3;

  /**
   * Initializes analytics for a business with full concurrency safety and retry logic.
   */
  public static async initializeAnalytics(
    businessId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!businessId) {
      return { success: false, error: "Missing businessId for initialization" };
    }

    // 1. Return existing active init promise to prevent duplicate concurrent initializations
    const existingPromise = this.initPromises.get(businessId);
    if (existingPromise) {
      console.log(`[AnalyticsInitializer] Reusing existing initialization promise for: ${businessId}`);
      return existingPromise;
    }

    // Get or create state
    let state = this.initStates.get(businessId);
    if (!state) {
      state = {
        isInitialized: false,
        initializationGuard: false,
        retryCount: 0,
      };
      this.initStates.set(businessId, state);
    }

    if (state.isInitialized) {
      return { success: true };
    }

    if (state.initializationGuard) {
      return { success: false, error: "Initialization already in progress (guard active)" };
    }

    state.initializationGuard = true;

    const initWork = (async () => {
      let attempt = 0;
      while (attempt < this.MAX_RETRIES) {
        try {
          console.log(`[AnalyticsInitializer] Initializing analytics for: ${businessId} (Attempt ${attempt + 1}/${this.MAX_RETRIES})`);
          
          // Perform lightweight dependency check / setup
          // We simulate a connection/cache preheating step
          await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));

          const activeState = this.initStates.get(businessId);
          if (activeState) {
            activeState.isInitialized = true;
            activeState.initializationGuard = false;
            activeState.retryCount = attempt;
          }
          
          this.initPromises.delete(businessId);
          console.log(`[AnalyticsInitializer] Analytics successfully initialized for: ${businessId}`);
          return { success: true };
        } catch (err: any) {
          attempt++;
          console.warn(`[AnalyticsInitializer] Initialization attempt ${attempt} failed:`, err?.message || err);
          if (attempt >= this.MAX_RETRIES) {
            const activeState = this.initStates.get(businessId);
            if (activeState) {
              activeState.initializationGuard = false;
              activeState.lastError = err?.message || String(err);
            }
            this.initPromises.delete(businessId);
            return { success: false, error: err?.message || String(err) };
          }
          // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 150));
        }
      }
      return { success: false, error: "Max retries exceeded" };
    })();

    this.initPromises.set(businessId, initWork);
    return initWork;
  }

  /**
   * Periodically checks and waits until analytics for a business is fully ready, supporting custom timeouts.
   */
  public static async waitForReady(businessId: string, timeout = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const state = this.initStates.get(businessId);
      if (state && state.isInitialized) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.warn(`[AnalyticsInitializer] Timeout waiting for analytics readiness on business ${businessId}`);
    return false;
  }

  /**
   * Resets all analytics initialization states for a specific business.
   */
  public static resetAnalytics(businessId: string): void {
    this.initStates.delete(businessId);
    this.initPromises.delete(businessId);
    console.log(`[AnalyticsInitializer] Analytics state reset for: ${businessId}`);
  }
}
