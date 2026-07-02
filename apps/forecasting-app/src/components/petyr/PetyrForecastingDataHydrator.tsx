"use client";

import { useEffect, useMemo, useState } from "react";
import PetyrMVPRendering from "@/components/petyr/PetyrMVPRendering";
import { PetyrForecastEntryPreloader } from "@/components/petyr/PetyrForecastEntryPreloader";
import { resolvePreferredCsmName } from "@/lib/petyr/csmIdentity";
import type { PetyrApprovedRenderingData } from "@/types/petyrApprovedRendering";

type ForecastingView = "management" | "csm";
type LoadState = "loading" | "ready" | "error";

type PetyrForecastingDataHydratorProps = {
  initialData: PetyrApprovedRenderingData;
  activeView: ForecastingView;
  userDisplayName: string | null;
  canViewAdminTools: boolean;
  canManageObjectives: boolean;
  canWriteForecast: boolean;
};

function preferredCsm(data: PetyrApprovedRenderingData, userDisplayName: string | null) {
  return resolvePreferredCsmName(
    userDisplayName,
    data.csmCustomersBase.map((company) => company.csm)
  );
}

function renderingDataUrl(view: ForecastingView | "csm-scoped") {
  const params = new URLSearchParams({ view });
  return `/api/petyr/forecasting/rendering-data?${params.toString()}`;
}

export function PetyrForecastingDataHydrator({
  initialData,
  activeView,
  userDisplayName,
  canViewAdminTools,
  canManageObjectives,
  canWriteForecast
}: PetyrForecastingDataHydratorProps) {
  const [data, setData] = useState(initialData);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [backgroundPreloadEnabled, setBackgroundPreloadEnabled] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let scopedCsmHandle: ReturnType<typeof setTimeout> | null = null;

    setLoadState("loading");
    setBackgroundPreloadEnabled(false);

    void (async () => {
      try {
        const response = await fetch(renderingDataUrl("management"), {
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error("Unable to refresh Petyr forecasting data.");
        }

        const payload = (await response.json()) as PetyrApprovedRenderingData;
        setData(payload);
        setLoadState("ready");
        setBackgroundPreloadEnabled(true);

        if (!canViewAdminTools) return;

        scopedCsmHandle = setTimeout(() => {
          void (async () => {
            try {
              const csmResponse = await fetch(renderingDataUrl("csm-scoped"), {
                cache: "no-store",
                signal: controller.signal
              });

              if (!csmResponse.ok) return;

              const csmPayload = (await csmResponse.json()) as PetyrApprovedRenderingData;
              if (activeView === "csm") {
                setData(csmPayload);
              }
            } catch {
              // Scoped CSM hydration is best-effort; Management is already usable.
            }
          })();
        }, 250);
      } catch (error) {
        if (controller.signal.aborted) return;

        console.error(error);
        setLoadState("error");
      }
    })();

    return () => {
      controller.abort();
      if (scopedCsmHandle) clearTimeout(scopedCsmHandle);
    };
  }, [activeView, attempt, canViewAdminTools]);

  const preferredCsmName = useMemo(() => preferredCsm(data, userDisplayName), [data, userDisplayName]);

  return (
    <>
      <PetyrMVPRendering
        key={loadState === "ready" ? "ready:" + (preferredCsmName || "all") : "shell"}
        data={data}
        activeView={activeView}
        preferredCsmName={preferredCsmName}
        canViewAdminTools={canViewAdminTools}
        canViewCsmOverview={canViewAdminTools}
        canManageObjectives={canManageObjectives}
        renderingState={loadState}
        onRetryRenderingData={() => setAttempt((value) => value + 1)}
      />
      <PetyrForecastEntryPreloader csmName={preferredCsmName} enabled={canWriteForecast && backgroundPreloadEnabled} />
    </>
  );
}
