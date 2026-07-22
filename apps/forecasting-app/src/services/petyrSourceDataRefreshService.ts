const DEFAULT_REDASH_INGESTOR_INTERNAL_URL =
  "http://redash-ingestor:3000/redash-ingestor";

type PetyrSourceRefreshRun = {
  sourceKey: string;
  status: string;
  rowsCount: number | null;
  startedAt: string;
  finishedAt: string | null;
};

export type PetyrSourceRefreshResult = {
  ok: boolean;
  forcedRedashRefresh?: boolean;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  sources?: PetyrSourceRefreshRun[];
  error?: string;
};

function getInternalRefreshConfig() {
  const appSecret = process.env.APP_INTERNAL_SECRET?.trim() ?? "";
  const ingestorBaseUrl =
    process.env.REDASH_INGESTOR_INTERNAL_URL?.trim().replace(/\/+$/, "") ||
    DEFAULT_REDASH_INGESTOR_INTERNAL_URL;

  if (!appSecret) {
    throw new Error("APP_INTERNAL_SECRET is not configured for Petyr source refresh.");
  }

  return { appSecret, ingestorBaseUrl };
}

export async function refreshPetyrSourceData(actorEmail: string): Promise<PetyrSourceRefreshResult> {
  const { appSecret, ingestorBaseUrl } = getInternalRefreshConfig();
  const safeActorEmail = actorEmail.replace(/[^A-Za-z0-9@._+\-]/g, "").slice(0, 240);
  const response = await fetch(`${ingestorBaseUrl}/api/redash/petyr-refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-app-secret": appSecret,
      "x-petyr-actor-email": safeActorEmail
    },
    body: "{}",
    cache: "no-store"
  });
  const internalPayload = (await response.json().catch(() => ({}))) as PetyrSourceRefreshResult & {
    sources?: Array<PetyrSourceRefreshRun & { errorMessage?: string | null }>;
  };
  const payload: PetyrSourceRefreshResult = {
    ...internalPayload,
    sources: internalPayload.sources?.map((source) => ({
      sourceKey: source.sourceKey,
      status: source.status,
      rowsCount: source.rowsCount,
      startedAt: source.startedAt,
      finishedAt: source.finishedAt
    }))
  };

  if (!response.ok) {
    console.error("Petyr source refresh command failed", {
      status: response.status,
      error: payload.error ?? "Unknown Redash Ingestor error"
    });
    const error = response.status === 409
      ? "A data refresh is already running. Please try again after it finishes."
      : "Unable to refresh Petyr data. Please try again or contact support.";

    return { ...payload, ok: false, error };
  }

  return payload;
}
