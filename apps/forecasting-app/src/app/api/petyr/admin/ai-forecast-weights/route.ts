import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  getPetyrAiForecastBaselineWeights,
  PetyrAiForecastWeightsValidationError,
  updatePetyrAiForecastBaselineWeights
} from "@/services/petyrAiForecastWeightsService";

export const dynamic = "force-dynamic";

function formatWeightsError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error";

  if (error.message.includes("does not exist")) {
    return "Petyr app settings table is missing. Apply the forecasting app Prisma schema before saving AI Forecast weights.";
  }

  return error.message;
}

export async function GET() {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await getPetyrAiForecastBaselineWeights());
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to read Petyr AI Forecast weights",
        detail: formatWeightsError(error)
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
      enabled?: unknown;
      historicalWeightedBaseline?: unknown;
      monthlySeasonality?: unknown;
      runRate?: unknown;
    };

    return NextResponse.json(await updatePetyrAiForecastBaselineWeights({
      enabled: payload.enabled,
      historicalWeightedBaseline: payload.historicalWeightedBaseline,
      monthlySeasonality: payload.monthlySeasonality,
      runRate: payload.runRate,
      updatedBy: "petyr-admin"
    }));
  } catch (error) {
    if (error instanceof PetyrAiForecastWeightsValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "Unable to save Petyr AI Forecast weights",
        detail: formatWeightsError(error)
      },
      { status: 500 }
    );
  }
}
