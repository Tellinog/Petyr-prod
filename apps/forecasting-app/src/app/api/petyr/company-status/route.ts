import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  CompanyForecastStatusError,
  saveCompanyForecastStatus
} from "@/services/companyForecastStatusService";

export const dynamic = "force-dynamic";

function formatSaveError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error";

  if (error.message.includes("does not exist")) {
    return "Petyr forecast status tables are missing. Apply the forecasting app Prisma schema before saving company status.";
  }

  return error.message;
}

export async function POST(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.forecastWrite);
  if (auth instanceof NextResponse) return auth;

  try {
    const payload = await request.json();
    const result = await saveCompanyForecastStatus({
      ...payload,
      updatedBy: auth.user.displayName || auth.user.email
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CompanyForecastStatusError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: "Unable to save company forecast status",
        detail: formatSaveError(error)
      },
      { status: 500 }
    );
  }
}
