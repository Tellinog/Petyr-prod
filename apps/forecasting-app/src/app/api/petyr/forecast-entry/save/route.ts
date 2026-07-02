import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { ForecastEntrySaveError, saveForecastEntry } from "@/services/forecastEntryService";

export const dynamic = "force-dynamic";

function formatSaveError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error";

  if (error.message.includes("does not exist")) {
    return "Petyr forecast tables are missing. Apply the forecasting app Prisma schema before saving Forecast Entry.";
  }

  return error.message;
}

export async function POST(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.forecastWrite);
  if (auth instanceof NextResponse) return auth;

  try {
    const payload = await request.json();
    const result = await saveForecastEntry(payload);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForecastEntrySaveError) {
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
        error: "Unable to save Forecast Entry",
        detail: formatSaveError(error)
      },
      { status: 500 }
    );
  }
}
