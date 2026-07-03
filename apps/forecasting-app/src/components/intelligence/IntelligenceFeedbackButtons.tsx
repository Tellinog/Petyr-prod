"use client";

import { useState } from "react";

export default function IntelligenceFeedbackButtons({ insightId }: { insightId: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(ratingUsefulness: "useful" | "not_useful", ratingAccuracy: "accurate" | "unclear") {
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/petyr/intelligence/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          insightId,
          ratingUsefulness,
          ratingAccuracy
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.error === "string" ? payload.error : "Feedback could not be saved.");
      }

      setStatus("Feedback saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Feedback could not be saved.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
        disabled={loading}
        onClick={() => submit("useful", "accurate")}
        type="button"
      >
        Useful
      </button>
      <button
        className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        disabled={loading}
        onClick={() => submit("not_useful", "unclear")}
        type="button"
      >
        Not useful
      </button>
      {status ? <span className="text-slate-500">{status}</span> : null}
    </div>
  );
}

