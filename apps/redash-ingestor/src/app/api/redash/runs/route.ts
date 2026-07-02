import { NextRequest, NextResponse } from "next/server";
import { requireRedashIngestorApiPermission } from "../../../../lib/auth";
import { REDASH_INGESTOR_PERMISSIONS } from "../../../../lib/authCore";
import { prisma } from "../../../../lib/db";

export async function GET(request: NextRequest) {
  const auth = await requireRedashIngestorApiPermission(REDASH_INGESTOR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  const sourceKey = request.nextUrl.searchParams.get("source");
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "20");

  const runs = await prisma.redashSyncRun.findMany({
    where: sourceKey
      ? {
          source: {
            key: sourceKey
          }
        }
      : {},
    orderBy: { startedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: {
      source: {
        select: {
          id: true,
          key: true,
          name: true,
          redashQueryId: true,
          enabled: true
        }
      }
    }
  });

  return NextResponse.json({ ok: true, runs });
}
