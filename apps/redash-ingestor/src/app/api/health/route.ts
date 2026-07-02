import { NextResponse } from "next/server";
import { requireRedashIngestorApiPermission } from "../../../lib/auth";
import { REDASH_INGESTOR_PERMISSIONS } from "../../../lib/authCore";
import { prisma } from "../../../lib/db";

export async function GET() {
  const auth = await requireRedashIngestorApiPermission(REDASH_INGESTOR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      database: "connected",
      time: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        database: "error",
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
