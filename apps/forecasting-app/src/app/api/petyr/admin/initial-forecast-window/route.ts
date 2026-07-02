import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  getPetyrInitialForecastWindowOverrides,
  PetyrInitialForecastWindowOverrideValidationError,
  updatePetyrInitialForecastWindowOverride
} from "@/services/petyrInitialForecastWindowOverrideService";

export const dynamic = "force-dynamic";

function formatSettingsError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error";

  if (error.message.includes("does not exist")) {
    return "Petyr app settings table is missing. Apply the forecasting app Prisma schema before saving Forecast Initial window overrides.";
  }

  return error.message;
}

export async function GET() {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await getPetyrInitialForecastWindowOverrides());
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to read Forecast Initial window overrides",
        detail: formatSettingsError(error)
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  try {
    const payload = await request.json().catch(() => ({})) as {
      year?: unknown;
      unlocked?: unknown;
    };

    return NextResponse.json(await updatePetyrInitialForecastWindowOverride({
      year: payload.year,
      unlocked: payload.unlocked,
      updatedBy: auth.user.displayName || auth.user.email || "petyr-admin"
    }));
  } catch (error) {
    if (error instanceof PetyrInitialForecastWindowOverrideValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "Unable to save Forecast Initial window override",
        detail: formatSettingsError(error)
      },
      { status: 500 }
    );
  }
}
