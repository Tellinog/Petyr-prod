import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { restorePetyrDatabaseBackup } from "@/services/petyrDatabaseTransferService";

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

export async function POST(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  if (!getConfiguredSecret()) {
    return NextResponse.json(
      { error: "APP_INTERNAL_SECRET is not configured for protected Petyr database restore operations." },
      { status: 503 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const confirmed = formData.get("confirmed");
    const file = formData.get("file");

    if (confirmed !== "true") {
      return NextResponse.json({ error: "Restore requires explicit confirmation." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing .sql backup file." }, { status: 400 });
    }

    const result = await restorePetyrDatabaseBackup(file);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to import PostgreSQL backup.",
        detail: formatError(error)
      },
      { status: 500 }
    );
  }
}
