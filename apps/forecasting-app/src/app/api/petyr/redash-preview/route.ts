import { NextResponse } from "next/server";
import { getLatestRedashPreview } from "@/services/redashSnapshotService";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const limit = Number(searchParams.get("limit") ?? "25");

  if (!source) {
    return NextResponse.json({ error: "Missing source query parameter" }, { status: 400 });
  }

  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25;
  const result = await getLatestRedashPreview(source, safeLimit);

  if (!result) {
    return NextResponse.json({ error: `Unknown source: ${source}` }, { status: 404 });
  }

  return NextResponse.json(result);
}
