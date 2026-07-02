import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getForecastEntryData } from "@/services/forecastEntryService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);

  const result = await getForecastEntryData({
    companyName: searchParams.get("companyName"),
    csmName: searchParams.get("csmName"),
    preferredCsmName: auth.user.displayName,
    year: searchParams.get("year"),
    month: searchParams.get("month")
  });

  return NextResponse.json(result);
}
