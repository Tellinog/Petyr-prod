import ExcelJS from "exceljs";
import { PETYR_EXCEL_CURRENCY_NUM_FORMAT, PETYR_EXCEL_PERCENT_NUM_FORMAT } from "@/lib/petyr/formatters";
import { formatBusinessUnitDisplayName } from "@/lib/petyr/businessUnitDisplay";
import {
  companyRevenueLifecycleLabel,
  type PetyrCompanyRevenueLifecycleStatus
} from "@/lib/petyr/companyRevenueLifecycle";
import { startPetyrPerformanceTimer } from "@/lib/petyr/performance";
import { getAnnualForecastEntryBatch } from "@/services/annualForecastEntryBatchService";
import { getForecastEntryBatch } from "@/services/forecastEntryBatchService";
import { getPetyrApprovedRenderingDataForView } from "@/services/petyrApprovedRenderingAdapter";
import type {
  BranchRow,
  BusinessUnitRow,
  ManagementRow,
  MonthlyMetric,
  ProgressMetrics
} from "@/types/petyrApprovedRendering";

type WorksheetColumn = {
  header: string;
  key: string;
  width: number;
};

type WorksheetValue = string | number | null | undefined;
type WorksheetRecord = Record<string, WorksheetValue>;
type RevenueLifecycleFilterValue = "all" | PetyrCompanyRevenueLifecycleStatus;
export type ManagementForecastExportScope = "monthly-aggregate" | "business-unit" | "single-csm";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WORKBOOK_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export { WORKBOOK_CONTENT_TYPE as PETYR_FORECASTING_EXPORT_CONTENT_TYPE };

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
}

function safeSheetName(value: string) {
  const cleaned = value.replace(/[\[\]\*\/\\\?\:]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "Sheet").slice(0, 31);
}

function keyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function addRowsSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  columns: WorksheetColumn[],
  rows: WorksheetRecord[],
  options: { moneyKeys?: string[]; percentKeys?: string[] } = {}
) {
  const sheet = workbook.addWorksheet(safeSheetName(sheetName));
  sheet.columns = columns;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(rows.length + 1, 1), column: columns.length }
  };
  styleHeaderRow(sheet.getRow(1));

  const moneyKeys = new Set(options.moneyKeys ?? []);
  const percentKeys = new Set(options.percentKeys ?? []);

  for (const row of rows) {
    const worksheetRow = sheet.addRow(row);
    for (const key of moneyKeys) {
      worksheetRow.getCell(key).numFmt = PETYR_EXCEL_CURRENCY_NUM_FORMAT;
    }
    for (const key of percentKeys) {
      worksheetRow.getCell(key).numFmt = PETYR_EXCEL_PERCENT_NUM_FORMAT;
    }
  }

  return sheet;
}

function addInfoSheet(workbook: ExcelJS.Workbook, title: string, rows: Array<[string, string]>) {
  const sheet = workbook.addWorksheet("Info");
  sheet.columns = [{ width: 34 }, { width: 110 }];
  sheet.addRow([title]);
  sheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
  sheet.addRow([]);
  sheet.addRows(rows);

  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.getCell(1).font = { bold: true, color: { argb: "FF334155" } };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }
}

function addDiagnosticsSheet(workbook: ExcelJS.Workbook, diagnostics: string[]) {
  if (diagnostics.length === 0) return;

  addRowsSheet(
    workbook,
    "Diagnostics",
    [
      { header: "Severity", key: "severity", width: 18 },
      { header: "Message", key: "message", width: 110 }
    ],
    diagnostics.map((message) => ({ severity: "info", message }))
  );
}

async function workbookBuffer(workbook: ExcelJS.Workbook) {
  workbook.creator = "Petyr";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

function annualMonthLimit(year: number) {
  const now = new Date();
  return year === now.getFullYear() ? now.getMonth() + 1 : 12;
}

export async function buildForecastEntryMonthlyExportWorkbookXlsx(input: {
  year: number;
  csmName?: string | null;
  preferredCsmName?: string | null;
}) {
  const finishPerformance = startPetyrPerformanceTimer("exportForecastEntryMonthlyWorkbookXlsx", {
    year: input.year,
    hasCsmName: Boolean(input.csmName?.trim())
  });

  try {
    const workbook = new ExcelJS.Workbook();
    const maxMonth = annualMonthLimit(input.year);
    const monthResults = await Promise.all(
      Array.from({ length: maxMonth }, (_, index) =>
        getForecastEntryBatch({
          csmName: input.csmName,
          preferredCsmName: input.preferredCsmName,
          year: input.year,
          month: index + 1
        })
      )
    );
    const selectedCsm = monthResults[0]?.data.selectedCsm ?? input.csmName ?? "";

    addInfoSheet(workbook, "Petyr Monthly Forecast Entry export", [
      ["CSM", selectedCsm || "Selected by Petyr"],
      ["Year", String(input.year)],
      ["Months", `1-${maxMonth}. For the current year the export stops at the current month.`],
      ["Grain", "One row per Company + Business Unit for each exported month."],
      ["Notes", "Closed revenue and AI Forecast are read-only reference values. The export does not write data."]
    ]);

    const monthlyColumns: WorksheetColumn[] = [
      { header: "CSM", key: "csmName", width: 24 },
      { header: "Company", key: "companyName", width: 38 },
      { header: "Active", key: "active", width: 14 },
      { header: "Business Unit", key: "businessUnit", width: 20 },
      { header: "Entry mode", key: "entryMode", width: 24 },
      { header: "Previous-month forecast", key: "previousMonthForecast", width: 24 },
      { header: "Ongoing forecast", key: "ongoingForecast", width: 20 },
      { header: "Closed revenue", key: "closedRevenue", width: 20 },
      { header: "AI Forecast", key: "aiForecast", width: 18 },
      { header: "AI confidence", key: "aiConfidence", width: 16 },
      { header: "AI model version", key: "aiModelVersion", width: 28 },
      { header: "AI generated at", key: "aiGeneratedAt", width: 24 }
    ];

    const diagnostics: string[] = [];
    for (const result of monthResults) {
      diagnostics.push(...result.diagnostics);
      const rows: WorksheetRecord[] = result.data.companies.flatMap((company) =>
        company.businessUnits.map((cell) => ({
          csmName: company.csmName,
          companyName: company.companyName,
          active: company.isForecastActive ? "active" : "inactive",
          businessUnit: formatBusinessUnitDisplayName(cell.businessUnit),
          entryMode: result.data.entryMode.label,
          previousMonthForecast: cell.previousMonthForecast.value,
          ongoingForecast: cell.ongoingForecast.value,
          closedRevenue: cell.closedRevenue,
          aiForecast: cell.aiForecast.value,
          aiConfidence: cell.aiForecast.confidenceScore,
          aiModelVersion: cell.aiForecast.modelVersion,
          aiGeneratedAt: cell.aiForecast.generatedAt
        }))
      );

      addRowsSheet(workbook, `${String(result.data.month).padStart(2, "0")} ${MONTH_LABELS[result.data.month - 1]}`, monthlyColumns, rows, {
        moneyKeys: ["previousMonthForecast", "ongoingForecast", "closedRevenue", "aiForecast"]
      });
    }

    addDiagnosticsSheet(workbook, [...new Set(diagnostics)]);
    const buffer = await workbookBuffer(workbook);
    finishPerformance({ status: "success", rowCount: monthResults.reduce((sum, result) => sum + result.data.companies.length, 0), months: maxMonth });
    return buffer;
  } catch (error) {
    finishPerformance({ status: "failed" });
    throw error;
  }
}

export async function buildForecastEntryAnnualExportWorkbookXlsx(input: {
  year: number;
  csmNames?: string[];
  preferredCsmName?: string | null;
}) {
  const finishPerformance = startPetyrPerformanceTimer("exportForecastEntryAnnualWorkbookXlsx", {
    year: input.year,
    csmCount: input.csmNames?.length ?? 0
  });

  try {
    const result = await getAnnualForecastEntryBatch({
      csmNames: input.csmNames,
      preferredCsmName: input.preferredCsmName,
      year: input.year
    });
    const workbook = new ExcelJS.Workbook();

    addInfoSheet(workbook, "Petyr Annual Forecast Entry export", [
      ["CSM", result.data.selectedCsms.join(", ")],
      ["Year", String(result.data.selectedYear)],
      ["Initial Forecast columns", "Business Unit Initial Forecast columns are always exported, even when hidden in the current Annual Forecast Entry UI."],
      ["Notes", "The export is read-only and does not write forecast, closed revenue, AI or Redash data."]
    ]);

    const dynamicColumns = result.data.businessUnits.flatMap<WorksheetColumn>((businessUnit) => {
      const label = formatBusinessUnitDisplayName(businessUnit);
      const key = keyPart(businessUnit);
      return [
        { header: `${label} Ongoing Forecast`, key: `${key}Ongoing`, width: 22 },
        { header: `${label} Initial Business Unit Forecast`, key: `${key}Initial`, width: 28 },
        { header: `${label} AI Forecast`, key: `${key}Ai`, width: 18 }
      ];
    });
    const columns: WorksheetColumn[] = [
      { header: "CSM", key: "csmName", width: 24 },
      { header: "Company", key: "companyName", width: 38 },
      { header: "Active", key: "active", width: 14 },
      { header: "Forecast Initial", key: "initialForecast", width: 20 },
      { header: "Forecast Ongoing", key: "fcOngoing", width: 20 },
      { header: "Confidence", key: "confidence", width: 16 },
      ...dynamicColumns,
      { header: "Closed revenue YTD", key: "revenue", width: 20 },
      { header: "Planned This Year", key: "planned", width: 20 },
      { header: "Closed revenue ratio", key: "revenuePct", width: 18 },
      { header: "Planned ratio", key: "plannedPct", width: 18 },
      { header: "Uncovered ratio", key: "uncoveredPct", width: 18 }
    ];
    const moneyKeys = [
      "initialForecast",
      "fcOngoing",
      "revenue",
      "planned",
      ...result.data.businessUnits.flatMap((businessUnit) => {
        const key = keyPart(businessUnit);
        return [`${key}Ongoing`, `${key}Initial`, `${key}Ai`];
      })
    ];

    const rows = result.data.companies.map<WorksheetRecord>((company) => {
      const row: WorksheetRecord = {
        csmName: company.csmName,
        companyName: company.companyName,
        active: company.isForecastActive ? "active" : "inactive",
        initialForecast: company.initialForecast,
        fcOngoing: company.fcOngoing,
        confidence: company.ongoingConfidence,
        revenue: company.revenue,
        planned: company.planned,
        revenuePct: company.revenuePct === null ? null : company.revenuePct / 100,
        plannedPct: company.plannedPct === null ? null : company.plannedPct / 100,
        uncoveredPct: company.uncoveredPct === null ? null : company.uncoveredPct / 100
      };

      for (const cell of company.businessUnits) {
        const key = keyPart(cell.businessUnit);
        row[`${key}Ongoing`] = cell.savedForecast.value;
        row[`${key}Initial`] = cell.initialForecast.value;
        row[`${key}Ai`] = cell.aiForecast.value;
      }

      return row;
    });

    addRowsSheet(workbook, "Annual Forecast Entry", columns, rows, {
      moneyKeys,
      percentKeys: ["revenuePct", "plannedPct", "uncoveredPct"]
    });
    addDiagnosticsSheet(workbook, result.diagnostics);

    const buffer = await workbookBuffer(workbook);
    finishPerformance({ status: "success", rowCount: rows.length });
    return buffer;
  } catch (error) {
    finishPerformance({ status: "failed" });
    throw error;
  }
}

function monthlyTotal(items: MonthlyMetric[], key: keyof Pick<MonthlyMetric, "forecastMese" | "forecastOngoing" | "forecastAI" | "real">) {
  return items.reduce((sum, item) => sum + item[key], 0);
}

function buildProgressMetrics(monthly: MonthlyMetric[], yearlyObjective?: number | null): ProgressMetrics {
  const ytdMonthCount = new Date().getMonth() + 1;
  const ytd = monthly.slice(0, ytdMonthCount);
  const workedYtd = monthlyTotal(ytd, "real");
  const forecastMeseYtd = monthlyTotal(ytd, "forecastMese");
  const forecastYear = monthlyTotal(monthly, "forecastMese");
  const denominator = yearlyObjective && yearlyObjective > 0 ? yearlyObjective : null;

  return {
    workedPct: denominator ? (workedYtd / denominator) * 100 : null,
    workedAndPlannedPct: null,
    initialForecast: null,
    ongoingForecast: null,
    workedYtd,
    plannedFuture: null,
    workedAndPlanned: null,
    forecastMeseYtd,
    forecastYear
  };
}

function emptyMonthlyMetrics() {
  return MONTH_LABELS.map((month) => ({
    month,
    forecastMese: 0,
    forecastOngoing: 0,
    forecastAI: 0,
    real: 0
  }));
}

function selectRevenueLifecycleAggregate<T extends {
  monthly: MonthlyMetric[];
  metrics?: ProgressMetrics;
  yearlyObjective?: number | null;
  revenueLifecycleBreakdowns?: Partial<Record<PetyrCompanyRevenueLifecycleStatus, {
    monthly: MonthlyMetric[];
    metrics?: ProgressMetrics;
  }>>;
}>(row: T, filter: RevenueLifecycleFilterValue) {
  if (filter === "all") {
    return {
      monthly: row.monthly,
      metrics: row.metrics ?? buildProgressMetrics(row.monthly, row.yearlyObjective)
    };
  }

  const breakdown = row.revenueLifecycleBreakdowns?.[filter];
  const monthly = breakdown?.monthly ?? emptyMonthlyMetrics();

  return {
    monthly,
    metrics: breakdown?.metrics ?? buildProgressMetrics(monthly, row.yearlyObjective)
  };
}

function managementScopeLabel(scope: ManagementForecastExportScope) {
  if (scope === "monthly-aggregate") return "Monthly Aggregate Branch";
  if (scope === "business-unit") return "Business Unit View";
  return "Single CSM View";
}

function managementColumns(scope: ManagementForecastExportScope): WorksheetColumn[] {
  const firstColumn = scope === "single-csm"
    ? { header: "CSM", key: "name", width: 28 }
    : scope === "business-unit"
      ? { header: "Business Unit", key: "name", width: 24 }
      : { header: "Branch", key: "name", width: 24 };
  const columns: WorksheetColumn[] = [
    firstColumn,
    { header: "Company Type Filter", key: "companyTypeFilter", width: 24 },
    { header: "Year", key: "year", width: 12 },
    { header: "Month", key: "month", width: 12 },
    { header: "Previous-month forecast", key: "previousMonthForecast", width: 24 },
    { header: "Ongoing forecast", key: "ongoingForecast", width: 20 },
    { header: "AI Forecast", key: "aiForecast", width: 18 },
    { header: "Closed revenue", key: "closedRevenue", width: 20 },
    { header: "Initial Forecast", key: "initialForecast", width: 20 },
    { header: "Annual Ongoing Forecast", key: "annualOngoingForecast", width: 24 },
    { header: "Closed revenue YTD", key: "closedRevenueYtd", width: 20 },
    { header: "Closed revenue + planned", key: "closedRevenueAndPlanned", width: 24 },
    { header: "Closed revenue %", key: "closedRevenuePct", width: 18 },
    { header: "Closed revenue + planned %", key: "closedRevenueAndPlannedPct", width: 24 }
  ];

  if (scope !== "single-csm") {
    columns.splice(4, 0, { header: "Yearly Objective", key: "yearlyObjective", width: 20 });
  }

  return columns;
}

function managementRows(
  rows: Array<BranchRow | BusinessUnitRow | ManagementRow>,
  input: { scope: ManagementForecastExportScope; year: number; lifecycleFilter: RevenueLifecycleFilterValue }
) {
  return rows.flatMap<WorksheetRecord>((row) => {
    const selected = selectRevenueLifecycleAggregate(row, input.lifecycleFilter);
    const metrics = selected.metrics;
    const name = "csm" in row ? row.csm : row.label;
    const yearlyObjective = "yearlyObjective" in row ? row.yearlyObjective : null;
    const companyTypeFilter = input.lifecycleFilter === "all" ? "All company types" : companyRevenueLifecycleLabel(input.lifecycleFilter);

    return selected.monthly.map((month) => ({
      name,
      companyTypeFilter,
      year: input.year,
      month: month.month,
      yearlyObjective,
      previousMonthForecast: month.forecastMese,
      ongoingForecast: month.forecastOngoing,
      aiForecast: month.forecastAI,
      closedRevenue: month.real,
      initialForecast: metrics.initialForecast,
      annualOngoingForecast: metrics.ongoingForecast,
      closedRevenueYtd: metrics.workedYtd,
      closedRevenueAndPlanned: metrics.workedAndPlanned,
      closedRevenuePct: metrics.workedPct === null ? null : metrics.workedPct / 100,
      closedRevenueAndPlannedPct: metrics.workedAndPlannedPct === null ? null : metrics.workedAndPlannedPct / 100
    }));
  });
}

export async function buildManagementForecastExportWorkbookXlsx(input: {
  year: number;
  scope: ManagementForecastExportScope;
  lifecycleFilter?: RevenueLifecycleFilterValue;
}) {
  const lifecycleFilter = input.lifecycleFilter ?? "all";
  const finishPerformance = startPetyrPerformanceTimer("exportManagementForecastWorkbookXlsx", {
    year: input.year,
    scope: input.scope,
    lifecycleFilter
  });

  try {
    const data = await getPetyrApprovedRenderingDataForView("management", input.year);
    const workbook = new ExcelJS.Workbook();
    const rows = input.scope === "monthly-aggregate"
      ? managementRows(data.branchRows, { scope: input.scope, year: data.year, lifecycleFilter })
      : input.scope === "business-unit"
        ? managementRows(data.businessUnitRows, { scope: input.scope, year: data.year, lifecycleFilter })
        : managementRows(data.managementRows, { scope: input.scope, year: data.year, lifecycleFilter });

    addInfoSheet(workbook, `Petyr ${managementScopeLabel(input.scope)} export`, [
      ["Year", String(data.year)],
      ["Scope", managementScopeLabel(input.scope)],
      ["Company Type Filter", lifecycleFilter === "all" ? "All company types" : companyRevenueLifecycleLabel(lifecycleFilter)],
      ["Grain", "One row per visible aggregate and month."],
      ["Notes", "The export is read-only and uses the same PostgreSQL-backed Management read model as the UI."]
    ]);
    addRowsSheet(workbook, managementScopeLabel(input.scope), managementColumns(input.scope), rows, {
      moneyKeys: [
        "yearlyObjective",
        "previousMonthForecast",
        "ongoingForecast",
        "aiForecast",
        "closedRevenue",
        "initialForecast",
        "annualOngoingForecast",
        "closedRevenueYtd",
        "closedRevenueAndPlanned"
      ],
      percentKeys: ["closedRevenuePct", "closedRevenueAndPlannedPct"]
    });
    addDiagnosticsSheet(workbook, data.diagnostics.map((diagnostic) => `[${diagnostic.severity}] ${diagnostic.message}`));

    const buffer = await workbookBuffer(workbook);
    finishPerformance({ status: "success", rowCount: rows.length });
    return buffer;
  } catch (error) {
    finishPerformance({ status: "failed" });
    throw error;
  }
}
