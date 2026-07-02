import { NextRequest, NextResponse } from "next/server";
import { requireRedashIngestorApiPermission } from "../../../../lib/auth";
import { REDASH_INGESTOR_PERMISSIONS } from "../../../../lib/authCore";
import { prisma } from "../../../../lib/db";
import {
  getRedashDbTablePreview,
  getRedashRawLatestTableName
} from "../../../../services/redashDbTablePreview";

export async function GET(request: NextRequest) {
  const auth = await requireRedashIngestorApiPermission(REDASH_INGESTOR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  const sourceKey = request.nextUrl.searchParams.get("source");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam ?? 25) || 25, 1), 100);

  if (!sourceKey) {
    return NextResponse.json(
      { ok: false, error: "Missing required query parameter: source" },
      { status: 400 }
    );
  }

  const source = await prisma.redashSource.findUnique({
    where: { key: sourceKey },
    select: {
      key: true,
      name: true,
      redashQueryId: true,
      enabled: true
    }
  });

  if (!source) {
    return NextResponse.json({ ok: false, error: `Source not found: ${sourceKey}` }, { status: 404 });
  }

  if (!getRedashRawLatestTableName(sourceKey)) {
    return NextResponse.json(
      { ok: false, error: `No materialized table configured for source: ${sourceKey}` },
      { status: 400 }
    );
  }

  const preview = await getRedashDbTablePreview(sourceKey, limit);

  return NextResponse.json({
    ok: true,
    source,
    ...preview
  });
}
