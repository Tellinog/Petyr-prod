import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { config } from "../../../../lib/config";
import { syncSourceByKey } from "../../../../services/syncService";
import { runWithSyncLock, SyncLockBusyError } from "../../../../services/syncLock";

const PETYR_SOURCE_KEYS = [
  "master_campaigns",
  "master_agreements",
  "company_ownership"
] as const;

function hasValidInternalSecret(request: NextRequest) {
  const expected = config.APP_INTERNAL_SECRET;
  const provided = request.headers.get("x-app-secret")?.trim() ?? "";

  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

function triggeredBy(request: NextRequest) {
  const actorEmail = request.headers.get("x-petyr-actor-email")?.trim();
  return actorEmail ? `petyr-ui:${actorEmail.slice(0, 240)}` : "petyr-ui";
}

export async function POST(request: NextRequest) {
  if (!config.APP_INTERNAL_SECRET) {
    return NextResponse.json(
      { ok: false, error: "APP_INTERNAL_SECRET is not configured for the Petyr refresh flow." },
      { status: 503 }
    );
  }

  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const startedAt = new Date();

  try {
    const owner = `petyr-refresh:${Date.now()}`;
    const runs = await runWithSyncLock(owner, async () => {
      const sourceRuns = [];

      for (const sourceKey of PETYR_SOURCE_KEYS) {
        sourceRuns.push(
          await syncSourceByKey(sourceKey, triggeredBy(request), { forceRefresh: true })
        );
      }

      return sourceRuns;
    });

    const finishedAt = new Date();
    const summaries = runs.map((run, index) => ({
      sourceKey: PETYR_SOURCE_KEYS[index],
      status: run.status,
      rowsCount: run.rowsCount,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      errorMessage: run.errorMessage
    }));
    const failedSources = summaries.filter((run) => run.status !== "SUCCESS");

    return NextResponse.json(
      {
        ok: failedSources.length === 0,
        forcedRedashRefresh: true,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        sources: summaries,
        ...(failedSources.length > 0
          ? { error: "One or more Petyr Redash sources failed to refresh." }
          : {})
      },
      { status: failedSources.length === 0 ? 200 : 502 }
    );
  } catch (error) {
    if (error instanceof SyncLockBusyError) {
      return NextResponse.json(
        { ok: false, error: "A Redash refresh is already running." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
