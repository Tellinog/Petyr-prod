import { NextRequest, NextResponse } from "next/server";
import { requireRedashIngestorApiPermission } from "../../../../lib/auth";
import { REDASH_INGESTOR_PERMISSIONS } from "../../../../lib/authCore";
import { prisma } from "../../../../lib/db";

export async function GET(request: NextRequest) {
  const auth = await requireRedashIngestorApiPermission(REDASH_INGESTOR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  const sourceKey = request.nextUrl.searchParams.get("source");
  const includePayload = request.nextUrl.searchParams.get("includePayload") !== "false";

  if (!sourceKey) {
    return NextResponse.json(
      { ok: false, error: "Missing required query parameter: source" },
      { status: 400 }
    );
  }

  const source = await prisma.redashSource.findUnique({
    where: { key: sourceKey },
    select: {
      id: true,
      key: true,
      name: true,
      redashQueryId: true,
      parameters: true,
      maxAgeSeconds: true,
      enabled: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!source) {
    return NextResponse.json({ ok: false, error: `Source not found: ${sourceKey}` }, { status: 404 });
  }

  const snapshot = await prisma.redashSnapshot.findFirst({
    where: { sourceId: source.id },
    orderBy: { fetchedAt: "desc" },
    include: {
      run: true
    }
  });

  if (!snapshot) {
    return NextResponse.json({ ok: true, source, snapshot: null });
  }

  const response = {
    ok: true,
    source,
    snapshot: includePayload
      ? snapshot
      : {
          ...snapshot,
          payload: undefined
        }
  };

  return NextResponse.json(response);
}
