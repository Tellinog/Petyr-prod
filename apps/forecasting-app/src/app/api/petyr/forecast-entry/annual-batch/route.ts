import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getAnnualForecastEntryBatch } from "@/services/annualForecastEntryBatchService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const result = await getAnnualForecastEntryBatch({
    csmName: searchParams.get("csmName"),
    year: searchParams.get("year"),
    preferredCsmName: auth.user.displayName,
    warmup: searchParams.get("warmup")
  });

  return NextResponse.json(result);
}
