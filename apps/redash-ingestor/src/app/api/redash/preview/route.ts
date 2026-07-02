import { NextRequest, NextResponse } from "next/server";
import { requireRedashIngestorApiPermission } from "../../../../lib/auth";
import { REDASH_INGESTOR_PERMISSIONS } from "../../../../lib/authCore";
import { prisma } from "../../../../lib/db";
import { buildRedashPreview } from "../../../../lib/redashPayload";

export async function GET(request: NextRequest) {
  const auth = await requireRedashIngestorApiPermission(REDASH_INGESTOR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  const sourceKey = request.nextUrl.searchParams.get("source");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam ?? 50) || 50, 1), 500);

  if (!sourceKey) {
    return NextResponse.json(
      { ok: false, error: "Missing required query parameter: source" },
      { status: 400 }
    );
  }

  const source = await prisma.redashSource.findUnique({
    where: { key: sourceKey }
  });

  if (!source) {
    return NextResponse.json({ ok: false, error: `Source not found: ${sourceKey}` }, { status: 404 });
  }

  const snapshot = await prisma.redashSnapshot.findFirst({
    where: { sourceId: source.id },
    orderBy: { fetchedAt: "desc" },
    select: {
      id: true,
      fetchedAt: true,
      rowsCount: true,
      queryResultId: true,
      payloadHash: true,
      payload: true
    }
  });

  if (!snapshot) {
    return NextResponse.json({
      ok: true,
      source: {
        key: source.key,
        name: source.name,
        redashQueryId: source.redashQueryId,
        enabled: source.enabled
      },
      snapshot: null,
      columns: [],
      rows: [],
      totalRowsInPayload: 0,
      limit
    });
  }

  const preview = buildRedashPreview(snapshot.payload, limit);

  return NextResponse.json({
    ok: true,
    source: {
      key: source.key,
      name: source.name,
      redashQueryId: source.redashQueryId,
      enabled: source.enabled
    },
    snapshot: {
      id: snapshot.id,
      fetchedAt: snapshot.fetchedAt,
      rowsCount: snapshot.rowsCount,
      queryResultId: snapshot.queryResultId,
      payloadHash: snapshot.payloadHash
    },
    columns: preview.columns,
    rows: preview.rows,
    totalRowsInPayload: preview.totalRowsInPayload,
    limit
  });
}
