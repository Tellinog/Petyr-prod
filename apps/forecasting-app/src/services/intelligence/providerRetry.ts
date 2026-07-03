export type ProviderRetryOptions<T> = {
  maxAttempts?: number;
  baseDelayMs?: number;
  execute: () => Promise<T>;
  onFailedAttempt?: (input: { attempt: number; willRetry: boolean; durationMs: number; error: unknown }) => Promise<void> | void;
  beforeAttempt?: (attempt: number) => Promise<void> | void;
  sleep?: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getStatusFromError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\bstatus\s+(\d{3})\b/i);
  return match ? Number(match[1]) : null;
}

export function isRetryableProviderError(error: unknown) {
  if (error instanceof SyntaxError) return true;
  const status = getStatusFromError(error);
  if (status === null) return true;
  if (status === 408 || status === 409 || status === 425 || status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

export async function runProviderWithRetry<T>(options: ProviderRetryOptions<T>) {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 750);
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await options.beforeAttempt?.(attempt);
    const startedAt = Date.now();

    try {
      return await options.execute();
    } catch (error) {
      lastError = error;
      const willRetry = attempt < maxAttempts && isRetryableProviderError(error);
      await options.onFailedAttempt?.({
        attempt,
        willRetry,
        durationMs: Date.now() - startedAt,
        error
      });
      if (!willRetry) break;
      await sleep(baseDelayMs * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Provider request failed."));
}
