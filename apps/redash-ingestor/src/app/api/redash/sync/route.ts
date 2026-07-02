import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRedashIngestorApiPermission } from "../../../../lib/auth";
import { REDASH_INGESTOR_PERMISSIONS } from "../../../../lib/authCore";
import { syncAllEnabledSources, syncSourceByKey } from "../../../../services/syncService";
import { runWithSyncLock, SyncLockBusyError } from "../../../../services/syncLock";
import { runPostSyncAiForecastBatch } from "../../../../services/postSyncAiForecastService";

const bodySchema = z.object({
  sourceKey: z.string().min(1).optional()
});

export async function POST(request: NextRequest) {
  const auth = await requireRedashIngestorApiPermission(REDASH_INGESTOR_PERMISSIONS.sync);
  if (auth instanceof NextResponse) return auth;

  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsedBody = bodySchema.safeParse(rawBody);

    if (!parsedBody.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid sync request body" },
        { status: 400 }
      );
    }

    const body = parsedBody.data;
    const owner = `api:${Date.now()}`;

    const result = await runWithSyncLock(owner, async () => {
      if (body.sourceKey) {
        const run = await syncSourceByKey(body.sourceKey, "api");
        return { ok: true, mode: "single" as const, run };
      }

      const runs = await syncAllEnabledSources("api");
      return { ok: true, mode: "all" as const, runs };
    });

    if (result.mode === "all" && result.runs.length > 0 && result.runs.every((run) => run.status === "SUCCESS")) {
      return NextResponse.json({
        ...result,
        aiForecastBatch: await runPostSyncAiForecastBatch()
      });
    }

    return NextResponse.json({
      ...result,
      aiForecastBatch:
        result.mode === "all"
          ? {
              ok: false,
              skipped: true,
              reason: "Petyr AI forecast batch skipped because the Redash sync did not fully succeed."
            }
          : undefined
    });
  } catch (error) {
    if (error instanceof SyncLockBusyError) {
      return NextResponse.json(
        { ok: false, error: "A Redash sync is already running" },
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
