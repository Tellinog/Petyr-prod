import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { runPetyrAiPreviewBacktest } from "@/services/petyrAiPreviewBacktestService";

export const dynamic = "force-dynamic";

type BacktestPayload = {
  asOf?: unknown;
  year?: unknown;
  months?: unknown;
  selection?: unknown;
  limit?: unknown;
};

function getConfiguredSecret() {
  const secret = process.env.APP_INTERNAL_SECRET?.trim() ?? "";
  return secret && secret !== "replace_me" ? secret : null;
}

function isAuthorized(request: Request) {
  const configuredSecret = getConfiguredSecret();
  return configuredSecret !== null && request.headers.get("x-app-secret") === configuredSecret;
}

function normalizePayload(value: unknown): BacktestPayload {
  return value && typeof value === "object" ? (value as BacktestPayload) : {};
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeMonths(value: unknown) {
  return Array.isArray(value)
    ? value.map((month) => Number(month)).filter((month) => Number.isInteger(month))
    : null;
}

function formatBacktestError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error";

  if (error.message.includes("does not exist") || error.message.includes("missing")) {
    return "Petyr Redash materialized tables are missing. Run Redash sync and apply the forecasting app Prisma schema before this backtest.";
  }

  return error.message;
}

export async function POST(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  if (!getConfiguredSecret()) {
    return NextResponse.json(
      {
        error: "APP_INTERNAL_SECRET is not configured for protected Petyr AI preview backtest operations."
      },
      { status: 503 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = normalizePayload(await request.json().catch(() => ({})));
    const selection = payload.selection === "top_revenue" || payload.selection === undefined ? "top_revenue" : null;

    if (!selection) {
      return NextResponse.json({ error: "Only top_revenue selection is supported." }, { status: 400 });
    }

    const result = await runPetyrAiPreviewBacktest({
      asOf: normalizeOptionalString(payload.asOf),
      year: normalizeOptionalNumber(payload.year),
      months: normalizeMonths(payload.months),
      selection,
      limit: normalizeOptionalNumber(payload.limit)
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to run Petyr AI preview backtest",
        detail: formatBacktestError(error)
      },
      { status: 500 }
    );
  }
}
