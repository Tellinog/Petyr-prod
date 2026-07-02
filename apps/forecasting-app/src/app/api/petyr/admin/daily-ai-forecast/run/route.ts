import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { runPetyrNightlyDeterministicAiForecast } from "@/services/petyrNightlyDeterministicAiForecastService";

export const dynamic = "force-dynamic";

type RelationHealthRow = {
  relationName: string;
  exists: boolean;
  rowCount: number | null;
  severity: "required" | "warning";
};

type DailyAiForecastPreflightDiagnostics = {
  missingForecastRelations: string[];
  warningForecastRelations: string[];
  missingRedashRelations: string[];
  emptyRedashRelations: string[];
  relationStatus: RelationHealthRow[];
  notes: string[];
};

const FORECAST_RELATIONS: Array<{ name: string; severity: "required" | "warning" }> = [
  { name: "forecast_monthly", severity: "required" },
  { name: "forecast_annual", severity: "required" },
  { name: "ai_forecast_cache", severity: "required" },
  { name: "company_forecast_status", severity: "required" },
  { name: "app_setting", severity: "warning" }
];

const REDASH_RELATIONS: Array<{ name: string; severity: "required" | "warning"; checkEmpty: boolean }> = [
  { name: "redash_raw_master_campaigns_latest", severity: "required", checkEmpty: true },
  { name: "redash_raw_master_agreements_latest", severity: "required", checkEmpty: true },
  { name: "redash_raw_company_ownership_latest", severity: "required", checkEmpty: true },
  { name: "redash_column_mapping", severity: "warning", checkEmpty: false }
];

function getConfiguredSecret() {
  const secret = process.env.APP_INTERNAL_SECRET?.trim() ?? "";
  return secret && secret !== "replace_me" ? secret : null;
}

function isAuthorized(request: Request) {
  const configuredSecret = getConfiguredSecret();
  return configuredSecret !== null && request.headers.get("x-app-secret") === configuredSecret;
}

function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error";
  return error.message.replace(/postgresql:\/\/\S+/gi, "[redacted-database-url]");
}

function errorClass(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return `PrismaClientKnownRequestError:${error.code}`;
  if (error instanceof Prisma.PrismaClientInitializationError) return "PrismaClientInitializationError";
  if (error instanceof Prisma.PrismaClientValidationError) return "PrismaClientValidationError";
  if (error instanceof Error) return error.name || "Error";
  return typeof error;
}

async function relationExists(relationName: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass(${relationName}) IS NOT NULL AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function relationRowCount(relationName: string) {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "count"
    FROM ${Prisma.raw(`"${relationName}"`)}
  `);

  return Number(rows[0]?.count ?? 0);
}

async function inspectRelation(input: {
  name: string;
  severity: "required" | "warning";
  checkEmpty?: boolean;
}): Promise<RelationHealthRow> {
  const exists = await relationExists(input.name);
  const rowCount = exists && input.checkEmpty ? await relationRowCount(input.name) : null;

  return {
    relationName: input.name,
    exists,
    rowCount,
    severity: input.severity
  };
}

async function getDailyAiForecastPreflightDiagnostics(): Promise<DailyAiForecastPreflightDiagnostics> {
  const relationStatus = [
    ...(await Promise.all(FORECAST_RELATIONS.map((relation) => inspectRelation(relation)))),
    ...(await Promise.all(REDASH_RELATIONS.map((relation) => inspectRelation(relation))))
  ];

  const missingForecastRelations = relationStatus
    .filter((row) => FORECAST_RELATIONS.some((relation) => relation.name === row.relationName && relation.severity === "required"))
    .filter((row) => !row.exists)
    .map((row) => row.relationName);
  const warningForecastRelations = relationStatus
    .filter((row) => FORECAST_RELATIONS.some((relation) => relation.name === row.relationName && relation.severity === "warning"))
    .filter((row) => !row.exists)
    .map((row) => row.relationName);
  const missingRedashRelations = relationStatus
    .filter((row) => REDASH_RELATIONS.some((relation) => relation.name === row.relationName))
    .filter((row) => !row.exists)
    .map((row) => row.relationName);
  const emptyRedashRelations = relationStatus
    .filter((row) => REDASH_RELATIONS.some((relation) => relation.name === row.relationName && relation.checkEmpty))
    .filter((row) => row.exists && row.rowCount === 0)
    .map((row) => row.relationName);
  const notes = [
    "forecast_monthly and forecast_annual legacy ai_forecast_value columns are snapshots used when CSM forecasts are saved; Daily AI Forecast writes numeric suggestions to ai_forecast_cache.",
    "app_setting and redash_column_mapping are warnings here because Petyr has documented fallbacks, but missing or empty Redash latest tables can lead to zero selected companies or zero deterministic candidates."
  ];

  return {
    missingForecastRelations,
    warningForecastRelations,
    missingRedashRelations,
    emptyRedashRelations,
    relationStatus,
    notes
  };
}

function formatRunError(error: unknown, preflightDiagnostics: DailyAiForecastPreflightDiagnostics | null) {
  if (!(error instanceof Error)) return "Unknown error";

  if (error.message.includes("does not exist") || error.message.includes("missing")) {
    const missing = [
      ...(preflightDiagnostics?.missingForecastRelations ?? []),
      ...(preflightDiagnostics?.missingRedashRelations ?? [])
    ];

    if (missing.length > 0) {
      return `Petyr Daily AI Forecast cannot run because required database relations are missing: ${missing.join(", ")}. Apply the forecasting app Prisma schema and confirm Redash materialized data.`;
    }
  }

  return safeErrorMessage(error);
}

export async function POST(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  if (!getConfiguredSecret()) {
    return NextResponse.json(
      {
        error: "APP_INTERNAL_SECRET is not configured for protected Petyr Daily AI Forecast operations."
      },
      { status: 503 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json().catch(() => ({})) as { mode?: unknown; confirmed?: unknown };

    if (payload.mode !== undefined && payload.mode !== "all_active") {
      return NextResponse.json({ error: "Only all_active Daily AI Forecast runs are supported." }, { status: 400 });
    }

    if (payload.confirmed !== true) {
      return NextResponse.json({ error: "Daily AI Forecast run requires explicit confirmation." }, { status: 400 });
    }

    const preflightDiagnostics = await getDailyAiForecastPreflightDiagnostics();
    const result = await runPetyrNightlyDeterministicAiForecast({ runSource: "manual" });

    return NextResponse.json(
      {
        ...result,
        mode: "all_active",
        source: "petyr-admin-manual-run",
        preflightDiagnostics
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    const preflightDiagnostics = await getDailyAiForecastPreflightDiagnostics().catch(() => null);

    return NextResponse.json(
      {
        error: "Unable to run Petyr Daily AI Forecast",
        detail: formatRunError(error, preflightDiagnostics),
        missingForecastRelations: preflightDiagnostics?.missingForecastRelations ?? [],
        missingRedashRelations: preflightDiagnostics?.missingRedashRelations ?? [],
        emptyRedashRelations: preflightDiagnostics?.emptyRedashRelations ?? [],
        warningForecastRelations: preflightDiagnostics?.warningForecastRelations ?? [],
        originalErrorClass: errorClass(error),
        safeOriginalMessage: safeErrorMessage(error),
        preflightDiagnostics
      },
      { status: 500 }
    );
  }
}
