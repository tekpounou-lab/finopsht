export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number; // consecutive failures before tripping
  cooldownMs: number; // time to wait in OPEN state before transitioning to HALF_OPEN
}

class CircuitBreaker {
  private state: CircuitBreakerState = "CLOSED";
  private config: CircuitBreakerConfig;
  private consecutiveFailures = 0;
  private lastStateChange: number = Date.now();

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  public getState(): CircuitBreakerState {
    this.checkCooldown();
    return this.state;
  }

  public canCall(): boolean {
    const currentState = this.getState();
    return currentState === "CLOSED" || currentState === "HALF_OPEN";
  }

  public onSuccess() {
    this.consecutiveFailures = 0;
    if (this.state === "HALF_OPEN" || this.state === "OPEN") {
      console.log(`[Resilience SRE] Circuit Breaker recovered back to CLOSED state.`);
      this.state = "CLOSED";
      this.lastStateChange = Date.now();
    }
  }

  public onFailure() {
    this.consecutiveFailures++;
    console.warn(`[Resilience SRE] Consecutive failure logged: ${this.consecutiveFailures}/${this.config.failureThreshold}`);
    
    if (this.state === "HALF_OPEN" || (this.state === "CLOSED" && this.consecutiveFailures >= this.config.failureThreshold)) {
      console.error(`[Resilience SRE] !!! Circuit Breaker TRIPPED to OPEN state !!!`);
      this.state = "OPEN";
      this.lastStateChange = Date.now();
    }
  }

  private checkCooldown() {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastStateChange;
      if (elapsed >= this.config.cooldownMs) {
        console.warn(`[Resilience SRE] Cooldown elapsed. Transitioning Circuit Breaker to HALF_OPEN state.`);
        this.state = "HALF_OPEN";
        this.lastStateChange = Date.now();
      }
    }
  }
}

export const ResilienceEngine = {
  // Singleton breakers for key modules
  identityBreaker: new CircuitBreaker({ failureThreshold: 6, cooldownMs: 15000 }),
  workspaceBreaker: new CircuitBreaker({ failureThreshold: 6, cooldownMs: 15000 }),

  /**
   * Executes a task with exponential backoff and optional jitter.
   */
  async withRetry<T>(
    task: () => Promise<T>,
    retries = 4,
    initialDelayMs = 300,
    maxDelayMs = 8000
  ): Promise<T> {
    let attempt = 0;
    while (attempt <= retries) {
      try {
        return await task();
      } catch (error) {
        attempt++;
        if (attempt > retries) {
          throw error;
        }
        
        // Exponential backoff calculation with 20% randomized jitter
        const delay = Math.min(
          initialDelayMs * Math.pow(2, attempt) * (0.9 + Math.random() * 0.2),
          maxDelayMs
        );
        console.warn(`[Resilience SRE] Attempt ${attempt} failed. Retrying in ${Math.round(delay)}ms... Error: ${error instanceof Error ? error.message : error}`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    throw new Error("Retry attempts exhausted");
  },

  /**
   * Executes a promise-returning function protected by a Circuit Breaker.
   */
  async withCircuitBreaker<T>(
    breaker: CircuitBreaker,
    operation: () => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    if (!breaker.canCall()) {
      console.warn(`[Resilience SRE] Circuit Breaker is OPEN. Executing Graceful Degradation / Local Cache fallback.`);
      return await fallback();
    }

    try {
      const result = await operation();
      breaker.onSuccess();
      return result;
    } catch (err) {
      breaker.onFailure();
      console.warn(`[Resilience SRE] Operation failed under breaker protection. Executing fallback...`);
      return await fallback();
    }
  },

  /**
   * Local persistence helper for offline/cached states.
   */
  getCachedState<T>(key: string): T | null {
    try {
      const data = localStorage.getItem(`finops_cache_${key}`);
      if (data) {
        return JSON.parse(data) as T;
      }
    } catch (e) {
      console.warn("[Resilience SRE] Failed to read from localStorage cache:", e);
    }
    return null;
  },

  setCachedState<T>(key: string, value: T): void {
    try {
      localStorage.setItem(`finops_cache_${key}`, JSON.stringify(value));
    } catch (e) {
      console.warn("[Resilience SRE] Failed to write to localStorage cache:", e);
    }
  }
};
