export const DEFAULT_RATE_LIMIT_RETRIES = 6;
export const DEFAULT_RATE_LIMIT_BASE_DELAY_MS = 2000;
export const DEFAULT_RATE_LIMIT_MAX_DELAY_MS = 60000;

export function parseRetryAfter(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : null;
}

export function calculateRateLimitDelay({
  retryAttempt,
  retryAfter,
  now = Date.now(),
  baseDelayMs = DEFAULT_RATE_LIMIT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_RATE_LIMIT_MAX_DELAY_MS
}) {
  const attempt = Math.max(1, Math.floor(Number(retryAttempt) || 1));
  const serverDelay = parseRetryAfter(retryAfter, now);
  const fallbackDelay = Math.max(0, Number(baseDelayMs) || 0) * 2 ** (attempt - 1);
  return Math.min(Math.max(1000, serverDelay ?? fallbackDelay), Math.max(1000, Number(maxDelayMs) || DEFAULT_RATE_LIMIT_MAX_DELAY_MS));
}

export function formatRetryDelay(milliseconds) {
  const totalSeconds = Math.max(1, Math.ceil((Number(milliseconds) || 0) / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export async function fetchWithRateLimitRetry(
  url,
  options = {},
  {
    fetchImpl = globalThis.fetch,
    signal = options.signal,
    maxRetries = DEFAULT_RATE_LIMIT_RETRIES,
    baseDelayMs = DEFAULT_RATE_LIMIT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_RATE_LIMIT_MAX_DELAY_MS,
    now = () => Date.now(),
    wait = abortableDelay,
    onRetry = () => {}
  } = {}
) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required');
  }

  const retries = Math.max(0, Math.floor(Number(maxRetries) || 0));
  for (let attempt = 0; ; attempt++) {
    const response = await fetchImpl(url, { ...options, signal });
    if (response.status !== 429 || attempt >= retries) {
      return response;
    }

    const retryAttempt = attempt + 1;
    const delayMs = calculateRateLimitDelay({
      retryAttempt,
      retryAfter: response.headers?.get?.('Retry-After'),
      now: now(),
      baseDelayMs,
      maxDelayMs
    });
    try {
      await response.body?.cancel?.();
    } catch {
      // The retry should continue even if the response body is already closed.
    }
    await onRetry({
      retryAttempt,
      maxRetries: retries,
      delayMs,
      status: response.status
    });
    await wait(delayMs, signal);
  }
}

export function abortableDelay(milliseconds, signal) {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      },
      Math.max(0, Number(milliseconds) || 0)
    );
    const onAbort = () => {
      clearTimeout(timeout);
      reject(createAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function createAbortError() {
  const error = new Error('Operation cancelled');
  error.name = 'AbortError';
  return error;
}

// True for fetch/AbortController aborts and this module's cancellations.
export function isAbortError(error) {
  return error?.name === 'AbortError' || error?.message === 'This operation was aborted' || error?.message === 'Operation cancelled';
}
