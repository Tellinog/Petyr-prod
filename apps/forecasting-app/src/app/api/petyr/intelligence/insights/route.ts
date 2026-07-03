import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { listIntelligenceInsights } from "@/services/intelligence/intelligenceReadService";

export const dynamic = "force-dynamic";

function optionalParam(url: URL, key: string) {
  const value = url.searchParams.get(key)?.trim();
  return value || null;
}

export async function GET(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit"));
  const insights = await listIntelligenceInsights({
    csmName: optionalParam(url, "csmName"),
    companyName: optionalParam(url, "companyName"),
    businessUnit: optionalParam(url, "businessUnit"),
    insightType: optionalParam(url, "insightType"),
    urgency: optionalParam(url, "urgency"),
    limit: Number.isFinite(limit) ? limit : 50
  });

  return NextResponse.json({ insights }, { headers: { "Cache-Control": "no-store" } });
}
