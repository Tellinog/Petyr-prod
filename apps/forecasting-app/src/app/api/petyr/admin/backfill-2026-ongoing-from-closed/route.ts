import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { runPetyr2026ClosedRevenueOngoingBackfill } from "@/services/petyrClosedRevenueOngoingBackfillService";

export const dynamic = "force-dynamic";

type BackfillPayload = {
  mode?: unknown;
  asOf?: unknown;
  confirmed?: unknown;
  requestedBy?: unknown;
};

function getConfiguredSecret() {
  const secret = process.env.APP_INTERNAL_SECRET?.trim() ?? "";
  return secret && secret !== "replace_me" ? secret : null;
}

function isAuthorized(request: Request) {
  const configuredSecret = getConfiguredSecret();
  return configuredSecret !== null && request.headers.get("x-app-secret") === configuredSecret;
}

function formatBackfillError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error";

  if (error.message.includes("does not exist") || error.message.includes("missing")) {
    return "Petyr forecast or Redash materialized tables are missing. Run Redash sync and apply the forecasting app Prisma schema before this operation.";
  }

  return error.message;
}

function normalizePayload(value: unknown): BackfillPayload {
  return value && typeof value === "object" ? (value as BackfillPayload) : {};
}

function normalizeMode(value: unknown) {
  return value === "apply" ? "apply" : "dry-run";
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  if (!getConfiguredSecret()) {
    return NextResponse.json(
      {
        error: "APP_INTERNAL_SECRET is not configured for protected Petyr backfill operations."
      },
      { status: 503 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = normalizePayload(await request.json().catch(() => ({})));
    const mode = normalizeMode(payload.mode);

    if (mode === "apply" && payload.confirmed !== true) {
      return NextResponse.json(
        {
          error: "Apply requires explicit confirmation after reviewing the dry-run preview."
        },
        { status: 400 }
      );
    }

    const result = await runPetyr2026ClosedRevenueOngoingBackfill({
      apply: mode === "apply",
      asOf: normalizeOptionalString(payload.asOf),
      requestedBy: normalizeOptionalString(payload.requestedBy) ?? "petyr-admin-2026-backfill"
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to run 2026 closed revenue to Ongoing Forecast backfill",
        detail: formatBackfillError(error)
      },
      { status: 500 }
    );
  }
}
