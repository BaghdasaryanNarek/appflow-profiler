/**
 * RFC 9457 Problem Details error definitions and type guards.
 */

export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  retryAfterMs?: number;
  [key: string]: unknown;
}

/**
 * Typed error class representing RFC 9457 ``application/problem+json`` responses.
 */
export class ApiProblemError extends Error {
  override readonly name = "ApiProblemError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly retryAfterMs?: number;
  readonly raw?: unknown;

  constructor(problem: ProblemDetails, raw?: unknown) {
    const message = problem.detail ? `${problem.title}: ${problem.detail}` : problem.title;
    super(message);
    this.type = problem.type ?? "about:blank";
    this.title = problem.title;
    this.status = problem.status;
    if (problem.detail !== undefined) {
      this.detail = problem.detail;
    }
    if (problem.instance !== undefined) {
      this.instance = problem.instance;
    }
    if (problem.retryAfterMs !== undefined) {
      this.retryAfterMs = problem.retryAfterMs;
    }
    this.raw = raw;
  }
}

/**
 * Type guard checking if an error is an RFC 9457 ApiProblemError.
 */
export function isApiProblemError(error: unknown): error is ApiProblemError {
  return error instanceof ApiProblemError;
}
