import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { listIntelligenceInsights } from "@/services/intelligence/intelligenceReadService";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ insightId: string }> }) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  const { insightId } = await context.params;
  const insights = await listIntelligenceInsights({ limit: 100 });
  const insight = insights.find((item) => item.id === insightId);

  if (!insight) {
    return NextResponse.json({ error: "Insight not found" }, { status: 404 });
  }

  return NextResponse.json({ insight }, { headers: { "Cache-Control": "no-store" } });
}
