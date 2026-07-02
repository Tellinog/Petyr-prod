import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { AnnualForecastError, consolidateAnnualForecast } from "@/services/annualForecastService";

export const dynamic = "force-dynamic";

function formatAnnualForecastError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error";

  if (error.message.includes("does not exist")) {
    return "Petyr forecast tables are missing. Apply the forecasting app Prisma schema before consolidating annual forecasts.";
  }

  return error.message;
}

export async function POST(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.forecastWrite);
  if (auth instanceof NextResponse) return auth;

  try {
    const payload = await request.json();
    const result = await consolidateAnnualForecast(payload);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AnnualForecastError) {
      return NextResponse.json(
        {
          error: error.message,
          mode: error.mode ?? null
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        error: "Unable to consolidate annual forecast",
        detail: formatAnnualForecastError(error)
      },
      { status: 500 }
    );
  }
}
