import { prisma } from "../src/lib/db";
import {
  PETYR_AI_PREVIEW_BACKTEST_DEFAULT_AS_OF,
  PETYR_AI_PREVIEW_BACKTEST_DEFAULT_LIMIT,
  PETYR_AI_PREVIEW_BACKTEST_DEFAULT_MONTHS,
  PETYR_AI_PREVIEW_BACKTEST_DEFAULT_YEAR,
  runPetyrAiPreviewBacktest
} from "../src/services/petyrAiPreviewBacktestService";

type Args = {
  asOf: string;
  year: number;
  months: number[];
  limit: number;
  topRevenue: boolean;
  help: boolean;
};

function usage() {
  return [
    "Usage:",
    "  npm run backtest:ai-preview -- --as-of=2026-03-15 --year=2026 --months=5,6 --top-revenue --limit=10",
    "",
    "Runs a read-only deterministic Petyr AI preview backtest.",
    "Defaults: --as-of=2026-03-15 --year=2026 --months=5,6 --top-revenue --limit=10.",
    "The command does not call OpenRouter and does not write database rows."
  ].join("\n");
}

function parseMonths(value: string) {
  const months = value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);

  if (months.length === 0) throw new Error("At least one valid month is required.");
  return [...new Set(months)].sort((left, right) => left - right);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    asOf: PETYR_AI_PREVIEW_BACKTEST_DEFAULT_AS_OF,
    year: PETYR_AI_PREVIEW_BACKTEST_DEFAULT_YEAR,
    months: [...PETYR_AI_PREVIEW_BACKTEST_DEFAULT_MONTHS],
    limit: PETYR_AI_PREVIEW_BACKTEST_DEFAULT_LIMIT,
    topRevenue: true,
    help: false
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg === "--top-revenue") {
      args.topRevenue = true;
      continue;
    }

    if (arg.startsWith("--as-of=")) {
      args.asOf = arg.slice("--as-of=".length);
      continue;
    }

    if (arg.startsWith("--year=")) {
      const year = Number(arg.slice("--year=".length));
      if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error(`Invalid --year value "${year}".`);
      args.year = year;
      continue;
    }

    if (arg.startsWith("--months=")) {
      args.months = parseMonths(arg.slice("--months=".length));
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const limit = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit must be an integer between 1 and 100.");
      args.limit = limit;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.topRevenue) throw new Error("Only --top-revenue company selection is supported by this backtest.");
  return args;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null) return "n/a";
  return new Intl.NumberFormat("it-IT", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const result = await runPetyrAiPreviewBacktest({
    asOf: args.asOf,
    year: args.year,
    months: args.months,
    selection: "top_revenue",
    limit: args.limit
  });

  console.log("Petyr AI Preview Backtest");
  console.log(`As of: ${result.asOf}`);
  console.log(`Year: ${result.year}`);
  console.log(`Target months: ${result.months.join(", ")}`);
  console.log(`Selection: top ${result.limit} companies by ${result.year} closed revenue through ${result.asOf}`);
  console.log("Mode: read-only deterministic preview; OpenRouter is not called; no database writes are performed.");
  console.log("");

  if (result.selectedCompanies.length === 0) {
    console.log("No companies with positive closed revenue were found for the selected as-of date.");
    return;
  }

  console.table(result.selectedCompanies.map((row) => ({
    Rank: row.rank,
    Company: row.companyName,
    "Closed revenue through as-of": formatMoney(row.closedRevenueThroughAsOf)
  })));

  if (result.rows.length === 0) {
    console.log("No forecast/actual rows were available for the selected companies and months.");
    return;
  }

  console.table(result.rows.map((row) => ({
    Company: row.companyName,
    BU: row.businessUnit,
    Month: row.month,
    "AI preview": formatMoney(row.predictedValue),
    "Closed revenue": formatMoney(row.actualClosedRevenue),
    "Abs error": formatMoney(row.absoluteError),
    "% error": formatPercent(row.percentageError)
  })));

  console.table([...result.monthlyAggregates, result.totalAggregate].map((row) => ({
    Scope: row.scope,
    Rows: row.rows,
    "AI preview": formatMoney(row.predictedValue),
    "Closed revenue": formatMoney(row.actualClosedRevenue),
    "Abs error": formatMoney(row.absoluteError),
    "% error": formatPercent(row.percentageError)
  })));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
