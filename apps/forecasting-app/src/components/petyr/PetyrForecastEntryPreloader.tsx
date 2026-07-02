"use client";

import { useEffect } from "react";

function runWhenIdle(callback: () => void) {
  return setTimeout(callback, 500);
}

function buildWarmupUrl(path: string, csmName: string | null) {
  const params = new URLSearchParams({ warmup: "1" });
  if (csmName) params.set("csmName", csmName);

  return `${path}?${params.toString()}`;
}

export function PetyrForecastEntryPreloader({
  csmName,
  enabled
}: {
  csmName: string | null;
  enabled: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    const handle = runWhenIdle(() => {
      void (async () => {
        const startedAt = performance.now();

        try {
          await Promise.all([
            fetch(buildWarmupUrl("/api/petyr/forecast-entry/batch", csmName), {
              cache: "no-store",
              signal: controller.signal
            }),
            fetch(buildWarmupUrl("/api/petyr/forecast-entry/annual-batch", csmName), {
              cache: "no-store",
              signal: controller.signal
            })
          ]);

          console.info("Petyr Forecast Entry warmup complete", {
            durationMs: Math.round(performance.now() - startedAt)
          });
        } catch {
          // Warmup is best-effort and must never affect the visible workspace.
        }
      })();
    });

    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [csmName, enabled]);

  return null;
}
