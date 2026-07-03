import type { NormalizedSignalResult } from "./types";

export function deduplicateSignalResults(results: NormalizedSignalResult[]) {
  const byKey = new Map<string, NormalizedSignalResult & { duplicateCount: number }>();

  for (const result of results) {
    const key = result.canonicalUrl || result.contentHash || result.eventSignature;
    const existing = byKey.get(key);

    if (existing) {
      existing.duplicateCount += 1;
      continue;
    }

    byKey.set(key, {
      ...result,
      duplicateCount: 1
    });
  }

  return [...byKey.values()];
}

