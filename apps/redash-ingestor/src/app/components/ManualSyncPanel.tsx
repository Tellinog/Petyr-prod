"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withRedashIngestorBasePath } from "@/lib/basePath";

type SourceOption = {
  key: string;
  name: string;
};

type SyncMessage = {
  kind: "success" | "error";
  text: string;
};

export function ManualSyncPanel({
  canSync,
  sources
}: {
  canSync: boolean;
  sources: SourceOption[];
}) {
  const router = useRouter();
  const [runningTarget, setRunningTarget] = useState<string | null>(null);
  const [message, setMessage] = useState<SyncMessage | null>(null);

  async function runSync(sourceKey?: string) {
    if (!canSync) {
      setMessage({
        kind: "error",
        text: "Il tuo accesso permette la consultazione, ma non il sync manuale."
      });
      return;
    }

    const target = sourceKey ?? "all";
    setRunningTarget(target);
    setMessage(null);

    try {
      const response = await fetch(withRedashIngestorBasePath("/api/redash/sync"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(sourceKey ? { sourceKey } : {})
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : `Sync failed with status ${response.status}`
        );
      }

      setMessage({
        kind: "success",
        text: sourceKey ? `Sync completato per ${sourceKey}.` : "Sync completato per tutte le sorgenti."
      });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setRunningTarget(null);
    }
  }

  return (
    <section className="card manual-sync-card">
      <div className="manual-sync-heading">
        <div>
          <h2>Sync manuale</h2>
          <p>Lancia una run controllata. Se una run e gia in corso, la richiesta viene bloccata.</p>
        </div>
        <button disabled={Boolean(runningTarget) || !canSync} onClick={() => runSync()} type="button">
          {runningTarget === "all" ? "Sync in corso..." : "Sync all"}
        </button>
      </div>

      <div className="source-buttons">
        {sources.map((source) => (
          <button
            disabled={Boolean(runningTarget) || !canSync}
            key={source.key}
            onClick={() => runSync(source.key)}
            type="button"
          >
            {runningTarget === source.key ? "Sync in corso..." : `Sync ${source.key}`}
          </button>
        ))}
      </div>

      {message ? <p className={`sync-message ${message.kind}`}>{message.text}</p> : null}
    </section>
  );
}
