"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type RefreshState = "idle" | "confirm" | "running" | "success" | "error";

export function PetyrSourceDataRefreshControl() {
  const [state, setState] = useState<RefreshState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function runRefresh() {
    setState("running");
    setMessage("Redash is refreshing the queries; Petyr will collect the new results immediately afterward. Allow 2–5 minutes.");

    try {
      const response = await fetch("/api/petyr/data-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        sources?: unknown[];
      };

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : `Refresh failed (HTTP ${response.status}).`
        );
      }

      setState("success");
      setMessage(
        `Refresh completed for ${payload.sources?.length ?? 3} sources. Petyr will reload with the new data.`
      );

      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  if (state === "confirm") {
    return (
      <div className="w-full max-w-md rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950 shadow-sm">
        <p className="font-semibold">Refresh data now?</p>
        <p className="mt-1 text-xs leading-5 text-blue-800">
          Redash will refresh its queries and Petyr will then collect the new results. This usually takes 2–5 minutes.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button className="h-9 rounded-xl px-3 py-1.5 text-xs" type="button" onClick={() => void runRefresh()}>
            Start refresh
          </Button>
          <Button className="h-9 rounded-xl px-3 py-1.5 text-xs" type="button" variant="outline" onClick={() => setState("idle")}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-md flex-col items-end gap-2">
      <Button
        className="rounded-full"
        disabled={state === "running" || state === "success"}
        type="button"
        variant="outline"
        onClick={() => {
          setMessage(null);
          setState("confirm");
        }}
      >
        {state === "running" ? "Refreshing data (2–5 min)…" : state === "success" ? "Data refreshed" : "Refresh data"}
      </Button>
      {message ? (
        <p
          aria-live="polite"
          className={
            state === "error"
              ? "max-w-md text-right text-xs leading-5 text-rose-700"
              : "max-w-md text-right text-xs leading-5 text-slate-600"
          }
          role={state === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
