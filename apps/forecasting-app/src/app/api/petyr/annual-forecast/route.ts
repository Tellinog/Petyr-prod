import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getAnnualForecastData } from "@/services/annualForecastService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);

  const result = await getAnnualForecastData({
    companyName: searchParams.get("companyName"),
    csmName: searchParams.get("csmName"),
    year: searchParams.get("year"),
    isAdmin: searchParams.get("isAdmin")
  });

  return NextResponse.json(result);
}
