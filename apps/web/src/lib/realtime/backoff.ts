/**
 * Exponential backoff with multiplicative jitter (§5.5).
 * Backoff formula: min(30,000, 500 * 2^attempt) * (0.8 + rng() * 0.4)
 */

export const MIN_BACKOFF_MS = 500;
export const MAX_BACKOFF_MS = 30_000;
export const JITTER_FACTOR = 0.2; // +/- 20% jitter [0.8, 1.2]

/**
 * Computes backoff duration in milliseconds for a given retry attempt.
 *
 * @param attempt - 0-indexed attempt counter
 * @param rng - deterministic PRNG function returning [0, 1), defaults to Math.random
 */
export function computeBackoffMs(attempt: number, rng: () => number = Math.random): number {
  if (attempt < 0) {
    attempt = 0;
  }
  // Exponential growth clamped at MAX_BACKOFF_MS (30 seconds)
  const baseDelay = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * Math.pow(2, attempt));

  // Multiplicative uniform jitter in range [1 - JITTER_FACTOR, 1 + JITTER_FACTOR] = [0.8, 1.2]
  const randomValue = rng();
  const jitterMultiplier = 1.0 - JITTER_FACTOR + randomValue * (2 * JITTER_FACTOR);

  return Math.round(baseDelay * jitterMultiplier);
}
