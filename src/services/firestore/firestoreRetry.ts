/**
 * Enterprise Firestore Retry & Resiliency Engine
 * 
 * Provides exponential backoff with full jitter for transient Firestore errors:
 * - "Overload, please retry with backoff." (RESOURCE_EXHAUSTED / 429)
 * - "UNAVAILABLE" / "deadline-exceeded" (503 / network timeout)
 * - "client is offline" / temporary WebChannel transport reconnects
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  tag?: string;
  onRetry?: (attempt: number, delayMs: number, error: any) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry">> = {
  maxRetries: 4,
  baseDelayMs: 300,
  maxDelayMs: 5000,
  tag: "FirestoreRetry",
};

/**
 * Determines whether a given Firestore error is transient and safe to retry.
 */
export function isRetriableFirestoreError(error: any): boolean {
  if (!error) return false;

  const message = (typeof error === "string" ? error : error?.message || "").toLowerCase();
  const code = (error?.code || "").toLowerCase();
  const name = (error?.name || "").toLowerCase();

  // Explicit Overload / Rate-limiting checks
  if (
    message.includes("overload") ||
    message.includes("retry with backoff") ||
    message.includes("resource-exhausted") ||
    message.includes("resource_exhausted") ||
    message.includes("quota exceeded") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    code.includes("resource-exhausted") ||
    code.includes("429")
  ) {
    return true;
  }

  // Transient Transport / Availability checks
  if (
    message.includes("unavailable") ||
    message.includes("client is offline") ||
    message.includes("failed to get document") ||
    message.includes("transport error") ||
    message.includes("deadline-exceeded") ||
    message.includes("aborted") ||
    message.includes("network error") ||
    message.includes("networkrequestfailed") ||
    code.includes("unavailable") ||
    code.includes("deadline-exceeded") ||
    code.includes("aborted") ||
    code.includes("503") ||
    code.includes("504") ||
    name.includes("abort")
  ) {
    return true;
  }

  return false;
}

/**
 * Calculates exponential backoff delay with full jitter (decorrelated jitter algorithm).
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number = 300,
  maxDelayMs: number = 5000
): number {
  // Exponential backoff: base * 2^attempt
  const expDelay = baseDelayMs * Math.pow(2, attempt);
  // Full jitter: random between baseDelay and calculated exponential delay
  const jitteredDelay = baseDelayMs + Math.random() * (expDelay - baseDelayMs);
  return Math.min(maxDelayMs, Math.max(baseDelayMs, Math.floor(jitteredDelay)));
}

/**
 * Executes a Promise-returning function with automated exponential backoff and jitter for transient Firestore errors.
 */
export async function withFirestoreRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= merged.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;

      // Fail immediately if this is NOT a transient/retriable error (e.g. permission-denied)
      if (!isRetriableFirestoreError(err) || attempt >= merged.maxRetries) {
        throw err;
      }

      const delayMs = calculateBackoffDelay(attempt, merged.baseDelayMs, merged.maxDelayMs);
      
      console.warn(
        `[${merged.tag}] Transient error encountered ("${err?.message || err}"). Retrying in ${delayMs}ms (attempt ${attempt + 1}/${merged.maxRetries})...`
      );

      if (merged.onRetry) {
        merged.onRetry(attempt + 1, delayMs, err);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
