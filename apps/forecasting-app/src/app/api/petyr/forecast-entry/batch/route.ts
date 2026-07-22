import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getForecastEntryBatch } from "@/services/forecastEntryBatchService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const csmNames = searchParams.getAll("csmName").map((value) => value.trim()).filter(Boolean);
  const result = await getForecastEntryBatch({
    csmName: searchParams.get("csmName"),
    csmNames,
    preferredCsmName: auth.user.displayName,
    year: searchParams.get("year"),
    month: searchParams.get("month"),
    warmup: searchParams.get("warmup")
  });

  return NextResponse.json(result);
}
