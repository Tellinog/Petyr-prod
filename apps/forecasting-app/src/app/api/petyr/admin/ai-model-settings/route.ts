import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  getPetyrAiModelSetting,
  OpenRouterModelValidationError,
  updatePetyrAiModelSetting
} from "@/services/petyrAiModelSettingsService";

export const dynamic = "force-dynamic";

function formatSettingsError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error";

  if (error.message.includes("does not exist")) {
    return "Petyr app settings table is missing. Apply the forecasting app Prisma schema before saving AI settings.";
  }

  return error.message;
}

export async function GET() {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await getPetyrAiModelSetting());
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to read Petyr AI model settings",
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
    const payload = (await request.json()) as { model?: unknown };

    if (typeof payload.model !== "string") {
      return NextResponse.json({ error: "Model must be a string." }, { status: 400 });
    }

    return NextResponse.json(await updatePetyrAiModelSetting(payload.model));
  } catch (error) {
    if (error instanceof OpenRouterModelValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "Unable to save Petyr AI model settings",
        detail: formatSettingsError(error)
      },
      { status: 500 }
    );
  }
}
