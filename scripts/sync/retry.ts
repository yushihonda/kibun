export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export function backoffDelay(
  attempt: number,
  baseDelayMs = 500,
  maxDelayMs = 10_000,
  random = Math.random,
): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.round(exponential * (0.5 + random() * 0.5));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 4,
    baseDelayMs = 500,
    maxDelayMs = 10_000,
    shouldRetry = () => true,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || !shouldRetry(error)) throw error;
      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs, random));
    }
  }
  throw lastError;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export const isRetryableHttpError = (error: unknown): boolean =>
  error instanceof TypeError ||
  (error instanceof HttpError && (error.status === 429 || error.status >= 500));
