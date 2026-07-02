import { Prisma, PrismaClient } from "@prisma/client";

const TARGET_YEAR = 2026;
const SOURCE = "One-shot 2026 Closed Revenue Backfill";
const USER = "petyr-one-shot-2026";
const CHUNK_SIZE = 500;
const SAFE_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

const REQUIRED_RELATIONS = [
  "redash_raw_master_campaigns_latest",
  "forecast_monthly",
  "forecast_annual",
  "forecast_save_session",
  "forecast_change_log"
];

const CAMPAIGN_COLUMNS = {
  companyName: "company_name",
  csmName: "csm",
  businessUnit: "budget_group",
  campaignValue: "campaign_value",
  campaignEndDate: "end_date",
  campaignStatus: "status"
};

const OWNERSHIP_COLUMNS = {
  companyName: "company_name",
  csmName: "csm_name",
  workspaceCreatedOn: "workspace_created_on",
  workspaceUpdatedOn: "workspace_updated_on"
};

const PETYR_BUSINESS_UNITS = [
  "AI",
  "Accessibility",
  "Community",
  "Experience",
  "Express",
  "FTE",
  "Other",
  "QA",
  "Security",
  "TA"
];

const INVALID_CAMPAIGN_STATUS_TOKENS = [
  "abort",
  "cancel",
  "cancell",
  "annull",
  "delete",
  "deleted",
  "void",
  "lost",
  "reject",
  "archive",
  "archiv",
  "invalid"
];

const PLANNING_ONLY_STATUS_TOKENS = [
  "draft",
  "planned",
  "planning",
  "pipeline",
  "tentative",
  "proposed",
  "setup",
  "recruiting"
];

const BUSINESS_UNIT_BY_KEY = new Map(
  PETYR_BUSINESS_UNITS.map((businessUnit) => [normalizeBusinessUnitKey(businessUnit), businessUnit])
);

const prisma = new PrismaClient();

function usage() {
  return [
    "Usage:",
    "  npm run backfill:2026-ongoing-from-closed -- [--apply] [--as-of=YYYY-MM-DD]",
    "",
    "Default mode is dry-run. Pass --apply to write forecast_monthly previous_month + ongoing rows and forecast_annual Ongoing Forecast rows.",
    "This command is intentionally restricted to the one-time 2026 closed-revenue alignment."
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    apply: false,
    asOf: new Date(),
    help: false
  };

  for (const arg of argv) {
    if (arg === "--apply") {
      args.apply = true;
      continue;
    }

    if (arg === "--dry-run") {
      args.apply = false;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg.startsWith("--as-of=")) {
      const value = arg.slice("--as-of=".length);
      const parsed = parseDate(value);
      if (!parsed) {
        throw new Error(`Invalid --as-of date "${value}". Use YYYY-MM-DD.`);
      }
      args.asOf = parsed;
      continue;
    }

    if (arg.startsWith("--year=")) {
      const year = Number(arg.slice("--year=".length));
      if (year !== TARGET_YEAR) {
        throw new Error("This one-shot backfill is restricted to 2026 and must not be reused for other years.");
      }
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function sqlIdentifier(identifier) {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeCellValue(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || "";
}

function normalizeBusinessUnitKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeBusinessUnit(value) {
  const originalValue = normalizeCellValue(value);
  if (!originalValue) {
    return { businessUnit: "Other", reason: "missing", originalValue };
  }

  const official = BUSINESS_UNIT_BY_KEY.get(normalizeBusinessUnitKey(originalValue));
  if (official) {
    return { businessUnit: official, reason: "official", originalValue };
  }

  if (normalizeBusinessUnitKey(originalValue) === "unknown") {
    return { businessUnit: "Other", reason: "unknown", originalValue };
  }

  return { businessUnit: "Other", reason: "unofficial", originalValue };
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let normalized = String(value).trim();
  if (!normalized) return 0;

  const negative = normalized.startsWith("(") && normalized.endsWith(")");
  normalized = normalized.replace(/[^\d,.\-]/g, "");

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const fractionalLength = normalized.length - lastComma - 1;
    normalized = fractionalLength === 3 ? normalized.replace(/,/g, "") : normalized.replace(",", ".");
  } else if (lastDot >= 0) {
    const fractionalLength = normalized.length - lastDot - 1;
    if (fractionalLength === 3) normalized = normalized.replace(/\./g, "");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;

  return negative ? -parsed : parsed;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const europeanMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (europeanMatch) {
    const [, day, month, year] = europeanMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const isoMatch = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(trimmed);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const timestamp = Date.parse(trimmed);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function decimalToNumber(value) {
  return value === null || value === undefined ? null : Number(value.toString());
}

function decimalToLogValue(value) {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value).toFixed(2);
}

function isInvalidCampaignStatus(status) {
  return INVALID_CAMPAIGN_STATUS_TOKENS.some((token) => status.includes(token));
}

function isPlanningOnlyCampaignStatus(status) {
  return PLANNING_ONLY_STATUS_TOKENS.some((token) => status.includes(token));
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function relationExists(relationName) {
  const rows = await prisma.$queryRaw`
    SELECT to_regclass(${relationName}) IS NOT NULL AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function getTableColumnNames(tableName) {
  const rows = await prisma.$queryRaw`
    SELECT "column_name"
    FROM information_schema.columns
    WHERE "table_schema" = current_schema()
      AND "table_name" = ${tableName}
    ORDER BY "ordinal_position" ASC
  `;

  return new Set(rows.map((row) => row.column_name));
}

async function requireRelations() {
  for (const relation of REQUIRED_RELATIONS) {
    if (!(await relationExists(relation))) {
      throw new Error(`${relation} is missing. Run the Redash sync and Petyr schema sync before this backfill.`);
    }
  }
}

async function requireColumns(tableName, columns) {
  const available = await getTableColumnNames(tableName);
  const missing = columns.filter((column) => !available.has(column));

  if (missing.length > 0) {
    throw new Error(`${tableName} is missing required column(s): ${missing.join(", ")}.`);
  }

  return available;
}

async function readCampaignRows() {
  await requireColumns("redash_raw_master_campaigns_latest", Object.values(CAMPAIGN_COLUMNS));

  const sql = `
    SELECT
      NULLIF(BTRIM(${sqlIdentifier(CAMPAIGN_COLUMNS.companyName)}::text), '') AS "companyName",
      NULLIF(BTRIM(${sqlIdentifier(CAMPAIGN_COLUMNS.csmName)}::text), '') AS "campaignCsmName",
      NULLIF(BTRIM(${sqlIdentifier(CAMPAIGN_COLUMNS.businessUnit)}::text), '') AS "businessUnit",
      ${sqlIdentifier(CAMPAIGN_COLUMNS.campaignValue)}::text AS "revenueValue",
      ${sqlIdentifier(CAMPAIGN_COLUMNS.campaignEndDate)}::text AS "endDate",
      NULLIF(BTRIM(${sqlIdentifier(CAMPAIGN_COLUMNS.campaignStatus)}::text), '') AS "campaignStatus",
      "row_index"::integer AS "rowIndex"
    FROM "redash_raw_master_campaigns_latest"
    WHERE NULLIF(BTRIM(${sqlIdentifier(CAMPAIGN_COLUMNS.companyName)}::text), '') IS NOT NULL
  `;

  return prisma.$queryRawUnsafe(sql);
}

function ownershipTime(value) {
  return parseDate(value)?.getTime() ?? 0;
}

function compareOwnershipCandidate(candidate, existing) {
  const updatedDiff = ownershipTime(candidate.workspaceUpdatedOn) - ownershipTime(existing.workspaceUpdatedOn);
  if (updatedDiff !== 0) return updatedDiff;

  const createdDiff = ownershipTime(candidate.workspaceCreatedOn) - ownershipTime(existing.workspaceCreatedOn);
  if (createdDiff !== 0) return createdDiff;

  return candidate.csmName.localeCompare(existing.csmName);
}

async function readOwnershipMap() {
  if (!(await relationExists("redash_raw_company_ownership_latest"))) {
    return { byCompanyKey: new Map(), available: false };
  }

  const available = await getTableColumnNames("redash_raw_company_ownership_latest");
  const required = [OWNERSHIP_COLUMNS.companyName, OWNERSHIP_COLUMNS.csmName];
  const missing = required.filter((column) => !available.has(column));

  if (missing.length > 0) {
    return { byCompanyKey: new Map(), available: false, warning: `redash_raw_company_ownership_latest is missing column(s): ${missing.join(", ")}.` };
  }

  const workspaceCreatedSelection = available.has(OWNERSHIP_COLUMNS.workspaceCreatedOn)
    ? `${sqlIdentifier(OWNERSHIP_COLUMNS.workspaceCreatedOn)}::text`
    : "NULL::text";
  const workspaceUpdatedSelection = available.has(OWNERSHIP_COLUMNS.workspaceUpdatedOn)
    ? `${sqlIdentifier(OWNERSHIP_COLUMNS.workspaceUpdatedOn)}::text`
    : "NULL::text";
  const sql = `
    SELECT DISTINCT
      NULLIF(BTRIM(${sqlIdentifier(OWNERSHIP_COLUMNS.companyName)}::text), '') AS "companyName",
      NULLIF(BTRIM(${sqlIdentifier(OWNERSHIP_COLUMNS.csmName)}::text), '') AS "csmName",
      ${workspaceCreatedSelection} AS "workspaceCreatedOn",
      ${workspaceUpdatedSelection} AS "workspaceUpdatedOn"
    FROM "redash_raw_company_ownership_latest"
    WHERE NULLIF(BTRIM(${sqlIdentifier(OWNERSHIP_COLUMNS.companyName)}::text), '') IS NOT NULL
  `;
  const rows = await prisma.$queryRawUnsafe(sql);
  const byCompanyKey = new Map();

  for (const row of rows) {
    const companyName = normalizeCellValue(row.companyName);
    if (!companyName) continue;

    const candidate = {
      companyName,
      csmName: normalizeCellValue(row.csmName) || "Unassigned",
      workspaceCreatedOn: row.workspaceCreatedOn,
      workspaceUpdatedOn: row.workspaceUpdatedOn
    };
    const key = normalizeKey(companyName);
    const existing = byCompanyKey.get(key);

    if (!existing || compareOwnershipCandidate(candidate, existing) > 0) {
      byCompanyKey.set(key, candidate);
    }
  }

  return { byCompanyKey, available: byCompanyKey.size > 0 };
}

function aggregateClosedRevenue(rows, ownershipMap, asOf) {
  const monthlyAggregates = new Map();
  const missingOwnershipKeys = new Set();
  const stats = {
    campaignRowsRead: rows.length,
    includedCampaignRows: 0,
    skippedMissingDate: 0,
    skippedFutureOrOtherYear: 0,
    skippedInvalidStatus: 0,
    skippedPlanningStatus: 0,
    missingOwnershipCampaignRows: 0,
    missingOwnershipAggregates: 0,
    businessUnitFallbackCounts: new Map(),
    negativeMonthlyAggregateKeys: 0,
    negativeAnnualAggregateKeys: 0
  };

  for (const row of rows) {
    const status = normalizeCellValue(row.campaignStatus).toLowerCase();
    const campaignDate = parseDate(row.endDate);

    if (!campaignDate) {
      stats.skippedMissingDate += 1;
      continue;
    }

    if (campaignDate.getFullYear() !== TARGET_YEAR || campaignDate.getTime() > asOf.getTime()) {
      stats.skippedFutureOrOtherYear += 1;
      continue;
    }

    if (isInvalidCampaignStatus(status)) {
      stats.skippedInvalidStatus += 1;
      continue;
    }

    if (isPlanningOnlyCampaignStatus(status)) {
      stats.skippedPlanningStatus += 1;
      continue;
    }

    const sourceCompanyName = normalizeCellValue(row.companyName);
    if (!sourceCompanyName) continue;

    const ownership = ownershipMap.byCompanyKey.get(normalizeKey(sourceCompanyName));
    const companyName = ownership?.companyName ?? sourceCompanyName;
    const csmName = ownership?.csmName ?? (normalizeCellValue(row.campaignCsmName) || "Unassigned");
    const normalizedBusinessUnit = normalizeBusinessUnit(row.businessUnit);
    const businessUnit = normalizedBusinessUnit.businessUnit;
    const month = campaignDate.getMonth() + 1;
    const key = [normalizeKey(companyName), businessUnit, TARGET_YEAR, month].join("\u0000");
    const existing = monthlyAggregates.get(key);

    if (!ownership) {
      stats.missingOwnershipCampaignRows += 1;
      missingOwnershipKeys.add(normalizeKey(companyName));
    }

    if (normalizedBusinessUnit.reason !== "official") {
      increment(stats.businessUnitFallbackCounts, normalizedBusinessUnit.reason);
    }

    stats.includedCampaignRows += 1;

    if (existing) {
      existing.value = roundMoney(existing.value + parseNumber(row.revenueValue));
      existing.campaignRows += 1;
    } else {
      monthlyAggregates.set(key, {
        companyName,
        csmName,
        businessUnit,
        year: TARGET_YEAR,
        month,
        value: roundMoney(parseNumber(row.revenueValue)),
        campaignRows: 1
      });
    }
  }

  stats.missingOwnershipAggregates = missingOwnershipKeys.size;

  const monthly = [];
  for (const aggregate of monthlyAggregates.values()) {
    aggregate.value = roundMoney(aggregate.value);
    if (aggregate.value < 0) {
      stats.negativeMonthlyAggregateKeys += 1;
      continue;
    }
    monthly.push(aggregate);
  }

  const annualByKey = new Map();
  for (const row of monthly) {
    const key = [normalizeKey(row.companyName), row.businessUnit, TARGET_YEAR].join("\u0000");
    const existing = annualByKey.get(key);

    if (existing) {
      existing.value = roundMoney(existing.value + row.value);
      existing.campaignRows += row.campaignRows;
      existing.months.push(row.month);
    } else {
      annualByKey.set(key, {
        companyName: row.companyName,
        csmName: row.csmName,
        businessUnit: row.businessUnit,
        year: TARGET_YEAR,
        value: row.value,
        campaignRows: row.campaignRows,
        months: [row.month]
      });
    }
  }

  const annual = [];
  for (const aggregate of annualByKey.values()) {
    aggregate.value = roundMoney(aggregate.value);
    aggregate.months = [...new Set(aggregate.months)].sort((left, right) => left - right);
    if (aggregate.value < 0) {
      stats.negativeAnnualAggregateKeys += 1;
      continue;
    }
    annual.push(aggregate);
  }

  monthly.sort(compareAggregateRows);
  annual.sort(compareAggregateRows);

  return { monthly, annual, stats };
}

function compareAggregateRows(left, right) {
  return (
    left.companyName.localeCompare(right.companyName) ||
    left.businessUnit.localeCompare(right.businessUnit) ||
    (left.month ?? 0) - (right.month ?? 0)
  );
}

async function readExistingForecasts() {
  const [monthlyRows, annualRows] = await Promise.all([
    prisma.forecastMonthly.findMany({
      where: {
        year: TARGET_YEAR,
        forecastType: { in: ["previous_month", "ongoing"] }
      }
    }),
    prisma.forecastAnnual.findMany({
      where: {
        year: TARGET_YEAR
      }
    })
  ]);
  const monthlyByKey = new Map();
  const annualByKey = new Map();

  for (const row of monthlyRows) {
    const key = [normalizeKey(row.companyName), row.businessUnit, row.year, row.month, row.forecastType].join("\u0000");
    monthlyByKey.set(key, row);
  }

  for (const row of annualRows) {
    const key = [normalizeKey(row.companyName), row.businessUnit, row.year].join("\u0000");
    annualByKey.set(key, row);
  }

  return { monthlyByKey, annualByKey };
}

function buildMonthlyChanges(aggregates, existingByKey) {
  const changes = [];
  const targetForecastTypes = [
    { forecastType: "previous_month", fieldName: "previousMonthForecast" },
    { forecastType: "ongoing", fieldName: "ongoingForecast" }
  ];

  for (const aggregate of aggregates) {
    if (aggregate.value === 0) continue;

    for (const target of targetForecastTypes) {
      const key = [
        normalizeKey(aggregate.companyName),
        aggregate.businessUnit,
        aggregate.year,
        aggregate.month,
        target.forecastType
      ].join("\u0000");
      const existing = existingByKey.get(key) ?? null;
      const existingValue = decimalToNumber(existing?.value);

      if (existingValue !== aggregate.value) {
        changes.push({
          ...aggregate,
          forecastType: target.forecastType,
          fieldName: target.fieldName,
          existing,
          nextValue: new Prisma.Decimal(aggregate.value.toFixed(2)),
          previousValue: existingValue
        });
      }
    }
  }

  return changes;
}

function buildAnnualChanges(aggregates, existingByKey) {
  const changes = [];

  for (const aggregate of aggregates) {
    if (aggregate.value === 0) continue;

    const key = [normalizeKey(aggregate.companyName), aggregate.businessUnit, aggregate.year].join("\u0000");
    const existing = existingByKey.get(key) ?? null;
    const existingValue = decimalToNumber(existing?.value);

    if (existingValue !== aggregate.value) {
      changes.push({
        ...aggregate,
        month: 12,
        fieldName: "annualOngoingForecast",
        existing,
        nextValue: new Prisma.Decimal(aggregate.value.toFixed(2)),
        previousValue: existingValue
      });
    }
  }

  return changes;
}

function buildChangeLogRows(saveSessionId, changes) {
  return changes.map((change) => ({
    saveSessionId,
    companyName: change.companyName,
    businessUnit: change.businessUnit,
    fieldName: change.fieldName,
    previousValue: decimalToLogValue(change.existing?.value),
    newValue: change.nextValue.toFixed(2),
    aiForecastValueAtSave: change.existing?.aiForecastValue ?? null,
    createdBy: USER
  }));
}

async function applyMonthlyChanges(changes, asOf) {
  const saveSessionIds = [];
  let forecastUpserts = 0;
  let changeLogRows = 0;
  const changesByForecastType = new Map();

  for (const change of changes) {
    changesByForecastType.set(change.forecastType, [...(changesByForecastType.get(change.forecastType) ?? []), change]);
  }

  for (const forecastTypeChanges of changesByForecastType.values()) {
    for (const chunk of chunkArray(forecastTypeChanges, CHUNK_SIZE)) {
      const written = await prisma.$transaction(async (tx) => {
      const first = chunk[0];
      const saveSession = await tx.forecastSaveSession.create({
        data: {
          companyName: SOURCE,
          csmName: USER,
          source: SOURCE,
          year: TARGET_YEAR,
          month: first.month,
          forecastType: first.forecastType,
          note: `One-time ${TARGET_YEAR} DB alignment: copied monthly closed revenue as ${first.forecastType} forecast through ${asOf.toISOString().slice(0, 10)}.`,
          companyActiveStatus: true,
          createdBy: USER
        }
      });

      for (const change of chunk) {
        await tx.forecastMonthly.upsert({
          where: {
            companyName_businessUnit_year_month_forecastType: {
              companyName: change.companyName,
              businessUnit: change.businessUnit,
              year: TARGET_YEAR,
              month: change.month,
              forecastType: change.forecastType
            }
          },
          create: {
            companyName: change.companyName,
            csmName: change.csmName,
            businessUnit: change.businessUnit,
            year: TARGET_YEAR,
            month: change.month,
            forecastType: change.forecastType,
            value: change.nextValue,
            status: "saved",
            createdBy: USER,
            updatedBy: USER
          },
          update: {
            csmName: change.csmName,
            value: change.nextValue,
            status: "saved",
            updatedBy: USER
          }
        });
      }

      const logs = buildChangeLogRows(saveSession.id, chunk);
      await tx.forecastChangeLog.createMany({ data: logs });

      return {
        saveSessionId: saveSession.id,
        forecastUpserts: chunk.length,
        changeLogRows: logs.length
      };
    }, { maxWait: 10000, timeout: 120000 });

      saveSessionIds.push(written.saveSessionId);
      forecastUpserts += written.forecastUpserts;
      changeLogRows += written.changeLogRows;
    }
  }

  return { saveSessionIds, forecastUpserts, changeLogRows };
}

async function applyAnnualChanges(changes, asOf) {
  const saveSessionIds = [];
  let forecastUpserts = 0;
  let changeLogRows = 0;

  for (const chunk of chunkArray(changes, CHUNK_SIZE)) {
    const written = await prisma.$transaction(async (tx) => {
      const saveSession = await tx.forecastSaveSession.create({
        data: {
          companyName: SOURCE,
          csmName: USER,
          source: SOURCE,
          year: TARGET_YEAR,
          month: 12,
          forecastType: "ongoing",
          note: `One-time ${TARGET_YEAR} DB alignment: copied closed revenue YTD as annual Ongoing Forecast through ${asOf.toISOString().slice(0, 10)}.`,
          companyActiveStatus: true,
          createdBy: USER
        }
      });

      for (const change of chunk) {
        await tx.forecastAnnual.upsert({
          where: {
            companyName_businessUnit_year: {
              companyName: change.companyName,
              businessUnit: change.businessUnit,
              year: TARGET_YEAR
            }
          },
          create: {
            companyName: change.companyName,
            csmName: change.csmName,
            businessUnit: change.businessUnit,
            year: TARGET_YEAR,
            value: change.nextValue,
            status: "draft",
            note: `One-time ${TARGET_YEAR} closed revenue alignment through ${asOf.toISOString().slice(0, 10)}.`,
            createdBy: USER,
            updatedBy: USER
          },
          update: {
            csmName: change.csmName,
            value: change.nextValue,
            status: change.existing?.status ?? "draft",
            note: `One-time ${TARGET_YEAR} closed revenue alignment through ${asOf.toISOString().slice(0, 10)}.`,
            updatedBy: USER
          }
        });
      }

      const logs = buildChangeLogRows(saveSession.id, chunk);
      await tx.forecastChangeLog.createMany({ data: logs });

      return {
        saveSessionId: saveSession.id,
        forecastUpserts: chunk.length,
        changeLogRows: logs.length
      };
    }, { maxWait: 10000, timeout: 120000 });

    saveSessionIds.push(written.saveSessionId);
    forecastUpserts += written.forecastUpserts;
    changeLogRows += written.changeLogRows;
  }

  return { saveSessionIds, forecastUpserts, changeLogRows };
}

function previewChanges(changes) {
  return changes.slice(0, 10).map((change) => ({
    companyName: change.companyName,
    csmName: change.csmName,
    businessUnit: change.businessUnit,
    year: change.year,
    month: change.month,
    fieldName: change.fieldName,
    previousValue: change.previousValue,
    nextValue: change.value,
    campaignRows: change.campaignRows
  }));
}

function statsForJson(stats) {
  return {
    ...stats,
    businessUnitFallbackCounts: Object.fromEntries(stats.businessUnitFallbackCounts)
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  await requireRelations();

  const [campaignRows, ownershipMap, existing] = await Promise.all([
    readCampaignRows(),
    readOwnershipMap(),
    readExistingForecasts()
  ]);
  const { monthly, annual, stats } = aggregateClosedRevenue(campaignRows, ownershipMap, args.asOf);
  const monthlyChanges = buildMonthlyChanges(monthly, existing.monthlyByKey);
  const annualChanges = buildAnnualChanges(annual, existing.annualByKey);
  const monthlyPreviousMonthChanges = monthlyChanges.filter((change) => change.forecastType === "previous_month");
  const monthlyOngoingChanges = monthlyChanges.filter((change) => change.forecastType === "ongoing");
  const summary = {
    ok: true,
    mode: args.apply ? "apply" : "dry-run",
    year: TARGET_YEAR,
    asOf: args.asOf.toISOString(),
    source: SOURCE,
    campaignRowsRead: stats.campaignRowsRead,
    includedCampaignRows: stats.includedCampaignRows,
    monthlyClosedRevenueAggregates: monthly.length,
    annualClosedRevenueAggregates: annual.length,
    changedMonthlyPreviousMonthRows: monthlyPreviousMonthChanges.length,
    changedMonthlyOngoingRows: monthlyOngoingChanges.length,
    changedAnnualOngoingRows: annualChanges.length,
    skipped: {
      missingDate: stats.skippedMissingDate,
      futureOrOtherYear: stats.skippedFutureOrOtherYear,
      invalidStatus: stats.skippedInvalidStatus,
      planningOnlyStatus: stats.skippedPlanningStatus,
      negativeMonthlyAggregates: stats.negativeMonthlyAggregateKeys,
      negativeAnnualAggregates: stats.negativeAnnualAggregateKeys
    },
    warnings: [
      ownershipMap.warning,
      !ownershipMap.available ? "Company Ownership was unavailable or empty; campaign CSM fallback was used where possible." : null,
      stats.missingOwnershipCampaignRows > 0
        ? `${stats.missingOwnershipCampaignRows} included campaign row(s), across ${stats.missingOwnershipAggregates} company aggregate(s), had no matching Company Ownership row; campaign CSM fallback was used.`
        : null,
      stats.businessUnitFallbackCounts.size > 0
        ? `Business Unit fallback to Other was used: ${JSON.stringify(Object.fromEntries(stats.businessUnitFallbackCounts))}.`
        : null,
      stats.negativeMonthlyAggregateKeys > 0
        ? `${stats.negativeMonthlyAggregateKeys} monthly aggregate(s) were negative and were skipped because monthly forecast values must be non-negative.`
        : null,
      stats.negativeAnnualAggregateKeys > 0
        ? `${stats.negativeAnnualAggregateKeys} annual aggregate(s) were negative and were skipped because annual forecast values must be non-negative.`
        : null
    ].filter(Boolean),
    stats: statsForJson(stats),
    preview: {
      monthly: previewChanges(monthlyChanges),
      annual: previewChanges(annualChanges)
    }
  };

  if (args.apply) {
    summary.write = {
      monthly: monthlyChanges.length > 0
        ? await applyMonthlyChanges(monthlyChanges, args.asOf)
        : { forecastUpserts: 0, changeLogRows: 0, saveSessionIds: [] },
      annual: annualChanges.length > 0
        ? await applyAnnualChanges(annualChanges, args.asOf)
        : { forecastUpserts: 0, changeLogRows: 0, saveSessionIds: [] }
    };
  } else {
    summary.write = {
      monthly: { forecastUpserts: 0, changeLogRows: 0, saveSessionIds: [] },
      annual: { forecastUpserts: 0, changeLogRows: 0, saveSessionIds: [] }
    };
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
