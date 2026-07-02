import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  PetyrAiForecastCompanyPreviewError,
  generatePetyrAiForecastCompanyPreview
} from "@/services/petyrAiForecastCompanyPreviewService";

export const dynamic = "force-dynamic";

function getConfiguredSecret() {
  const secret = process.env.APP_INTERNAL_SECRET?.trim() ?? "";
  return secret && secret !== "replace_me" ? secret : null;
}

function isAuthorized(request: Request) {
  const configuredSecret = getConfiguredSecret();
  return configuredSecret !== null && request.headers.get("x-app-secret") === configuredSecret;
}

function formatPreviewError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error";

  if (error.message.includes("does not exist")) {
    return "Petyr forecast tables are missing. Apply the forecasting app Prisma schema before generating an AI Forecast preview.";
  }

  return error.message;
}

export async function POST(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.forecastWrite);
  if (auth instanceof NextResponse) return auth;

  if (!getConfiguredSecret()) {
    return NextResponse.json(
      {
        error: "APP_INTERNAL_SECRET is not configured for protected Petyr AI Forecast company preview."
      },
      { status: 503 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawPayload = await request.json().catch(() => ({}));
    const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};

    return NextResponse.json(await generatePetyrAiForecastCompanyPreview(payload), {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    if (error instanceof PetyrAiForecastCompanyPreviewError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: "Unable to generate Petyr AI Forecast company preview",
        detail: formatPreviewError(error)
      },
      { status: 500 }
    );
  }
}
