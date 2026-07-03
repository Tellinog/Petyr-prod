import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getConfiguredAppInternalSecret, isAuthorizedAppInternalRequest } from "@/services/intelligence/intelligenceApiAuth";
import { getIntelligenceWorkerStatus, setIntelligenceWorkerEnabled } from "@/services/intelligence/intelligenceWorkerSettingsService";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  const status = await getIntelligenceWorkerStatus();
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  if (!getConfiguredAppInternalSecret()) {
    return NextResponse.json({ error: "APP_INTERNAL_SECRET is not configured for Intelligence worker changes." }, { status: 503 });
  }
  if (!isAuthorizedAppInternalRequest(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({})) as { enabled?: unknown };
  if (typeof payload.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
  }

  const status = await setIntelligenceWorkerEnabled(payload.enabled, auth.email);
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
