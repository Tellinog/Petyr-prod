const PETYR_READ_CACHE_TTL_MS = 60_000;

type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const readCache = new Map<string, CacheEntry<unknown>>();

export async function getPetyrCachedRead<T>(key: string, loader: () => Promise<T>, options: { ttlMs?: number } = {}) {
  const ttlMs = options.ttlMs ?? PETYR_READ_CACHE_TTL_MS;

  if (ttlMs <= 0) {
    return {
      cacheHit: false,
      value: await loader()
    };
  }

  const now = Date.now();
  const existing = readCache.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    return {
      cacheHit: true,
      value: await existing.promise
    };
  }

  const promise = loader();
  readCache.set(key, {
    expiresAt: now + ttlMs,
    promise
  });

  try {
    return {
      cacheHit: false,
      value: await promise
    };
  } catch (error) {
    if (readCache.get(key)?.promise === promise) {
      readCache.delete(key);
    }
    throw error;
  }
}

export function invalidatePetyrReadCache(predicate?: (key: string) => boolean) {
  for (const key of readCache.keys()) {
    if (!predicate || predicate(key)) {
      readCache.delete(key);
    }
  }
}

export const getForecastEntryCachedRead = getPetyrCachedRead;
export const invalidateForecastEntryReadCache = invalidatePetyrReadCache;
