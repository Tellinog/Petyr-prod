import { config } from "./config";

type RedashJob = {
  id: string;
  status?: number;
  query_result_id?: number;
  error?: string;
};

type RedashQueryResult = {
  id?: number;
  query_result?: {
    id?: number;
    data?: {
      rows?: unknown[];
      columns?: unknown[];
    };
    retrieved_at?: string;
  };
};

type ExecuteQueryResponse = {
  job?: RedashJob;
  query_result?: RedashQueryResult["query_result"];
};

export type RedashExecutionResult = {
  queryResultId?: number;
  rowsCount: number;
  payload: unknown;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRedashUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const base = config.REDASH_BASE_URL.replace(/\/$/, "");
  const url = new URL(`${base}${path}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function redashRequest<T>(
  path: string,
  options: RequestInit = {},
  apiKey?: string,
  query?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const effectiveApiKey = apiKey || config.REDASH_API_KEY;
  const url = buildRedashUrl(path, query);

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (config.REDASH_AUTH_MODE === "query") {
    url.searchParams.set("api_key", effectiveApiKey);
  } else {
    headers.set("Authorization", `Key ${effectiveApiKey}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    cache: "no-store"
  });

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Redash request failed ${response.status} ${response.statusText}: ${text.slice(0, 700)}`
    );
  }

  if (!contentType.includes("application/json")) {
    throw new Error(`Redash did not return JSON. Response starts with: ${text.slice(0, 300)}`);
  }

  return JSON.parse(text) as T;
}

function extractRowsCount(payload: unknown): number {
  const result = payload as RedashQueryResult;
  return result.query_result?.data?.rows?.length ?? 0;
}

function extractQueryResultId(payload: unknown): number | undefined {
  const result = payload as RedashQueryResult;
  return result.query_result?.id ?? result.id;
}

async function waitForJob(job: RedashJob, apiKey?: string): Promise<number> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < config.SYNC_JOB_TIMEOUT_MS) {
    const latest = await redashRequest<{ job: RedashJob }>(`/api/jobs/${job.id}`, {}, apiKey);

    if (latest.job.error) {
      throw new Error(`Redash job failed: ${latest.job.error}`);
    }

    if (latest.job.query_result_id) {
      return latest.job.query_result_id;
    }

    // In many Redash versions: 3 = success, 4 = failure, 5 = cancelled.
    if (latest.job.status === 4 || latest.job.status === 5) {
      throw new Error(`Redash job ended with status ${latest.job.status}`);
    }

    await sleep(config.SYNC_POLL_INTERVAL_MS);
  }

  throw new Error(`Redash job timeout after ${config.SYNC_JOB_TIMEOUT_MS}ms`);
}

export async function executeRedashQuery(input: {
  queryId: number;
  parameters?: Record<string, unknown>;
  maxAgeSeconds?: number;
  apiKey?: string | null;
}): Promise<RedashExecutionResult> {
  const parameters = input.parameters ?? {};
  const maxAge = input.maxAgeSeconds ?? config.SYNC_MAX_AGE_SECONDS;
  const apiKey = input.apiKey ?? undefined;

  const initial = await redashRequest<ExecuteQueryResponse>(
    `/api/queries/${input.queryId}/results`,
    {
      method: "POST",
      body: JSON.stringify({
        max_age: maxAge,
        parameters
      })
    },
    apiKey
  );

  if (initial.query_result) {
    const payload: RedashQueryResult = { query_result: initial.query_result };
    return {
      queryResultId: initial.query_result.id,
      rowsCount: extractRowsCount(payload),
      payload
    };
  }

  if (!initial.job) {
    throw new Error(`Unexpected Redash response: ${JSON.stringify(initial).slice(0, 700)}`);
  }

  const queryResultId = await waitForJob(initial.job, apiKey);

  const payload = await redashRequest<RedashQueryResult>(
    `/api/query_results/${queryResultId}.json`,
    {},
    apiKey
  );

  return {
    queryResultId,
    rowsCount: extractRowsCount(payload),
    payload
  };
}

export function normalizeRedashRows(payload: unknown): unknown[] {
  const result = payload as RedashQueryResult;
  return result.query_result?.data?.rows ?? [];
}
