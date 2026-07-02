import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  assertPostgresCliAvailable,
  createPetyrDatabaseBackupFileName,
  createPetyrDatabaseBackupStream
} from "@/services/petyrDatabaseTransferService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getConfiguredSecret() {
  const secret = process.env.APP_INTERNAL_SECRET?.trim() ?? "";
  return secret && secret !== "replace_me" ? secret : null;
}

function isAuthorized(request: Request) {
  const configuredSecret = getConfiguredSecret();
  return configuredSecret !== null && request.headers.get("x-app-secret") === configuredSecret;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  if (!getConfiguredSecret()) {
    return NextResponse.json(
      { error: "APP_INTERNAL_SECRET is not configured for protected Petyr database backup operations." },
      { status: 503 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await assertPostgresCliAvailable("pg_dump");
    const fileName = createPetyrDatabaseBackupFileName();

    return new Response(createPetyrDatabaseBackupStream(), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "application/sql; charset=utf-8",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to export PostgreSQL backup.",
        detail: formatError(error)
      },
      { status: 500 }
    );
  }
}
