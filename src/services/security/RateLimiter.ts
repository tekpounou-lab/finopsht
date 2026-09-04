/**
 * Enterprise Sliding Window Rate Limiter
 * Guards client-side Firestore queries and subscription registrations against runaway loops,
 * infinite re-renders, and rapid DDoS-like patterns.
 */

export class RateLimiter {
  private static instances = new Map<string, RateLimiter>();
  private timestamps: number[] = [];

  constructor(
    public maxRequests: number = 60,
    public windowMs: number = 60000 // 1 minute
  ) {}

  public static get(name: string, maxRequests = 60, windowMs = 60000): RateLimiter {
    let limiter = this.instances.get(name);
    if (!limiter) {
      limiter = new RateLimiter(maxRequests, windowMs);
      this.instances.set(name, limiter);
    } else {
      limiter.maxRequests = maxRequests;
      limiter.windowMs = windowMs;
    }
    return limiter;
  }

  /**
   * Evaluates if an action is allowed.
   * If allowed, records the action timestamp and returns true.
   * If rate limited, returns false.
   */
  public tryAcquire(): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    // Prune stale timestamps
    this.timestamps = this.timestamps.filter((ts) => ts > cutoff);

    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }

  /**
   * Returns current utilization count in the active window
   */
  public getCount(): number {
    const cutoff = Date.now() - this.windowMs;
    this.timestamps = this.timestamps.filter((ts) => ts > cutoff);
    return this.timestamps.length;
  }

  /**
   * Resets rate limiter memory
   */
  public reset(): void {
    this.timestamps = [];
  }
}
