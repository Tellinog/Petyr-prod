import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { getMappedDbColumn, getRedashPetyrSourceMapping } from "@/config/redashFieldMapping";
import { prisma } from "@/lib/db";
import {
  PETYR_BUSINESS_UNITS,
  PETYR_FORECAST_INTELLIGENCE_CACHE_BUSINESS_UNIT,
  normalizePetyrBusinessUnit,
  type PetyrBusinessUnit
} from "@/lib/petyr/constants";
import { PETYR_EXCEL_CURRENCY_NUM_FORMAT } from "@/lib/petyr/formatters";
import { startPetyrPerformanceTimer } from "@/lib/petyr/performance";
import {
  getCanonicalCompanyOwnershipPairs,
  normalizeCompanyOwnershipKey
} from "@/services/petyrCompanyOwnershipService";
import {
  importMonthlyForecastRecords,
  isMonthlyForecastImportColumn,
  type MonthlyForecastImportError,
  type MonthlyForecastImportInputRecord,
  type MonthlyForecastImportProblemRow,
  type MonthlyForecastImportResult,
  type MonthlyForecastImportWarning
} from "@/services/petyrMonthlyForecastImportService";

const EXCEL_IMPORT_SOURCE = "Admin Excel Import";
const DEFAULT_VALIDATION_STATUS = "Ready";
const SAFE_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const SYSTEM_COLUMNS = new Set(["snapshot_id", "row_index", "synced_at"]);

const MONTH_LABELS = [
  "01 - January",
  "02 - February",
  "03 - March",
  "04 - April",
  "05 - May",
  "06 - June",
  "07 - July",
  "08 - August",
  "09 - September",
  "10 - October",
  "11 - November",
  "12 - December"
] as const;

const FORECAST_INPUT_HEADERS = [
  { key: "csmName", label: "CSM", width: 24 },
  { key: "companyName", label: "Company", width: 34 },
  { key: "businessUnit", label: "Business Unit", width: 18 },
  { key: "year", label: "Year", width: 12 },
  { key: "month", label: "Month", width: 18 },
  { key: "previousMonthForecast", label: "Previous-month forecast", width: 22 },
  { key: "ongoingForecast", label: "Ongoing forecast", width: 18 },
  { key: "companyActiveStatus", label: "Company active status", width: 22 },
  { key: "note", label: "Note", width: 34 },
  { key: "closedRevenueReference", label: "Closed revenue reference, read-only", width: 28 },
  { key: "aiForecastReference", label: "AI forecast reference, read-only", width: 26 },
  { key: "validationStatus", label: "Validation status, read-only", width: 26 }
] as const;

type ForecastInputHeaderKey = (typeof FORECAST_INPUT_HEADERS)[number]["key"];

type RelationExistsRow = {
  exists: boolean;
};

type TableColumnRow = {
  column_name: string;
};

type ClosedRevenueReferenceRow = {
  companyName: string | null;
  businessUnit: string | null;
  revenueValue: string | null;
  endDate: string | null;
};

type ForecastInputRow = {
  csmName: string;
  companyName: string;
  businessUnit: PetyrBusinessUnit;
  year: number;
  month: number;
  previousMonthForecast: number | null;
  ongoingForecast: number | null;
  companyActiveStatus: string;
  note: string;
  closedRevenueReference: number | null;
  aiForecastReference: number | null;
  validationStatus: string;
};

type ReferenceCompanyRow = {
  csmName: string;
  companyName: string;
  branchName: string;
};

type ExportData = {
  rows: ForecastInputRow[];
  referenceCompanies: ReferenceCompanyRow[];
  warnings: string[];
};

function sqlIdentifier(identifier: string) {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }

  return Prisma.raw(`"${identifier}"`);
}

async function relationExists(relationName: string) {
  const rows = await prisma.$queryRaw<RelationExistsRow[]>`
    SELECT to_regclass(${relationName}) IS NOT NULL AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function getTableColumnNames(tableName: string) {
  const rows = await prisma.$queryRaw<TableColumnRow[]>`
    SELECT "column_name"
    FROM information_schema.columns
    WHERE "table_schema" = current_schema()
      AND "table_name" = ${tableName}
    ORDER BY "ordinal_position" ASC
  `;

  return new Set(rows.map((row) => row.column_name).filter((columnName) => !SYSTEM_COLUMNS.has(columnName)));
}

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : Number(value.toString());
}

function activeStatusForExport(value: boolean | null | undefined) {
  if (value === true) return "active";
  if (value === false) return "inactive";
  return "";
}

function normalizeCellValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || "";
}

function parseNumber(value: string | null | undefined) {
  if (!value) return 0;

  let normalized = String(value).trim().replace(/\s+/g, "").replace(/EUR|€/gi, "");

  if (/^-?\d+,\d+$/.test(normalized)) {
    normalized = normalized.replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  } else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeBusinessUnit(value: string | null | undefined): PetyrBusinessUnit {
  return normalizePetyrBusinessUnit(value).businessUnit;
}

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function formatCountMap(map: Map<string, number>) {
  const sorted = [...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const visible = sorted.slice(0, 8).map(([value, count]) => `${value} (${count})`);
  const suffix = sorted.length > visible.length ? `, and ${sorted.length - visible.length} more` : "";

  return `${visible.join(", ")}${suffix}`;
}

function forecastKey(companyName: string, businessUnit: string, month: number, forecastType?: string) {
  return [normalizeCompanyOwnershipKey(companyName), businessUnit, month, forecastType ?? ""].join("\u0000");
}

function companyBusinessUnitMonthKey(companyName: string, businessUnit: string, month: number) {
  return forecastKey(companyName, businessUnit, month);
}

async function getClosedRevenueReferences(year: number, companyNames: string[]) {
  const source = getRedashPetyrSourceMapping("master_campaigns");
  const warnings: string[] = [];
  const values = new Map<string, number>();

  if (!(await relationExists(source.tableName))) {
    warnings.push(`${source.tableName} is missing, so Closed revenue reference cells are blank.`);
    return { values, warnings };
  }

  const columnNames = await getTableColumnNames(source.tableName);
  const companyColumn = getMappedDbColumn(source.sourceKey, "companyName");
  const businessUnitColumn = getMappedDbColumn(source.sourceKey, "businessUnit");
  const revenueColumn = getMappedDbColumn(source.sourceKey, "campaignValue");
  const endDateColumn = getMappedDbColumn(source.sourceKey, "campaignEndDate");

  if (!companyColumn || !businessUnitColumn || !revenueColumn || !endDateColumn) {
    warnings.push("Master campaigns mapping is incomplete, so Closed revenue reference cells are blank.");
    return { values, warnings };
  }

  for (const column of [companyColumn, businessUnitColumn, revenueColumn, endDateColumn]) {
    if (!columnNames.has(column)) {
      warnings.push(`Master campaigns column "${column}" is missing, so Closed revenue reference cells are blank.`);
      return { values, warnings };
    }
  }

  const companyKeys = new Set(companyNames.map(normalizeCompanyOwnershipKey));
  let missingBusinessUnitCount = 0;
  const unknownBusinessUnitCounts = new Map<string, number>();
  const unofficialBusinessUnitCounts = new Map<string, number>();
  const rows = await prisma.$queryRaw<ClosedRevenueReferenceRow[]>`
    SELECT
      NULLIF(BTRIM(${sqlIdentifier(companyColumn)}), '') AS "companyName",
      NULLIF(BTRIM(${sqlIdentifier(businessUnitColumn)}), '') AS "businessUnit",
      ${sqlIdentifier(revenueColumn)} AS "revenueValue",
      ${sqlIdentifier(endDateColumn)} AS "endDate"
    FROM ${sqlIdentifier(source.tableName)}
    WHERE NULLIF(BTRIM(${sqlIdentifier(companyColumn)}), '') IS NOT NULL
  `;

  for (const row of rows) {
    const companyName = normalizeCellValue(row.companyName);
    if (!companyKeys.has(normalizeCompanyOwnershipKey(companyName))) continue;

    const endDate = parseDate(row.endDate);
    if (!endDate || endDate.getFullYear() !== year) continue;

    const month = endDate.getMonth() + 1;
    const normalizedBusinessUnit = normalizePetyrBusinessUnit(row.businessUnit);
    const businessUnit = normalizedBusinessUnit.businessUnit;

    if (normalizedBusinessUnit.reason === "missing") {
      missingBusinessUnitCount += 1;
    } else if (normalizedBusinessUnit.reason === "unknown") {
      incrementCount(unknownBusinessUnitCounts, normalizedBusinessUnit.originalValue || "Unknown");
    } else if (normalizedBusinessUnit.reason === "unofficial") {
      incrementCount(unofficialBusinessUnitCounts, normalizedBusinessUnit.originalValue);
    }

    const key = companyBusinessUnitMonthKey(companyName, businessUnit, month);
    values.set(key, roundMoney((values.get(key) ?? 0) + parseNumber(row.revenueValue)));
  }

  const unknownBusinessUnitCount = [...unknownBusinessUnitCounts.values()].reduce((sum, value) => sum + value, 0);
  const unofficialBusinessUnitCount = [...unofficialBusinessUnitCounts.values()].reduce((sum, value) => sum + value, 0);
  const fallbackBusinessUnitCount = missingBusinessUnitCount + unknownBusinessUnitCount + unofficialBusinessUnitCount;

  if (missingBusinessUnitCount > 0) {
    warnings.push(`${missingBusinessUnitCount} Closed revenue reference row(s) had missing Business Unit and were normalized to Other.`);
  }

  if (unknownBusinessUnitCount > 0) {
    warnings.push(`${unknownBusinessUnitCount} Closed revenue reference row(s) had unknown Business Unit values (${formatCountMap(unknownBusinessUnitCounts)}) and were normalized to Other.`);
  }

  if (unofficialBusinessUnitCount > 0) {
    warnings.push(`${unofficialBusinessUnitCount} Closed revenue reference row(s) had Business Unit values outside the official list (${formatCountMap(unofficialBusinessUnitCounts)}) and were normalized to Other.`);
  }

  if (fallbackBusinessUnitCount > 0) {
    warnings.push(`Business Unit fallback to Other was active for ${fallbackBusinessUnitCount} Closed revenue reference row(s).`);
  }

  return { values, warnings };
}

async function loadExportData(input: { year: number; csmName?: string | null }): Promise<ExportData> {
  const csmFilter = normalizeCellValue(input.csmName);
  const csmFilterKey = csmFilter ? normalizeCompanyOwnershipKey(csmFilter) : null;
  const ownershipPairs = (await getCanonicalCompanyOwnershipPairs())
    .filter((pair) => !csmFilterKey || normalizeCompanyOwnershipKey(pair.csmName) === csmFilterKey)
    .sort((left, right) => {
      const csmComparison = left.csmName.localeCompare(right.csmName);
      if (csmComparison !== 0) return csmComparison;

      return left.companyName.localeCompare(right.companyName);
    });
  const companyNames = ownershipPairs.map((pair) => pair.companyName);
  const referenceCompanies = ownershipPairs.map((pair) => ({
    csmName: pair.csmName,
    companyName: pair.companyName,
    branchName: pair.branchName ?? ""
  }));

  if (companyNames.length === 0) {
    return {
      rows: [],
      referenceCompanies,
      warnings: csmFilter ? [`No Company Ownership rows match CSM "${csmFilter}".`] : []
    };
  }

  const [monthlyForecasts, aiForecasts, companyStatuses, closedRevenue] = await Promise.all([
    prisma.forecastMonthly.findMany({
      where: { year: input.year, companyName: { in: companyNames } },
      orderBy: [{ csmName: "asc" }, { companyName: "asc" }, { businessUnit: "asc" }, { month: "asc" }]
    }),
    prisma.aiForecastCache.findMany({
      where: {
        year: input.year,
        companyName: { in: companyNames },
        status: "success",
        month: { gte: 1, lte: 12 },
        NOT: { businessUnit: PETYR_FORECAST_INTELLIGENCE_CACHE_BUSINESS_UNIT }
      },
      orderBy: [{ generatedAt: "desc" }]
    }),
    prisma.companyForecastStatus.findMany({
      where: { companyName: { in: companyNames } }
    }),
    getClosedRevenueReferences(input.year, companyNames)
  ]);

  const monthlyByKey = new Map<string, (typeof monthlyForecasts)[number]>();
  const aiByKey = new Map<string, number>();
  const statusByCompany = new Map(
    companyStatuses.map((status) => [normalizeCompanyOwnershipKey(status.companyName), activeStatusForExport(status.isActive)])
  );

  for (const row of monthlyForecasts) {
    monthlyByKey.set(forecastKey(row.companyName, normalizeBusinessUnit(row.businessUnit), row.month, row.forecastType), row);

    if (row.aiForecastValue !== null) {
      const key = companyBusinessUnitMonthKey(row.companyName, normalizeBusinessUnit(row.businessUnit), row.month);
      if (!aiByKey.has(key)) aiByKey.set(key, decimalToNumber(row.aiForecastValue) ?? 0);
    }
  }

  for (const row of aiForecasts) {
    const key = companyBusinessUnitMonthKey(row.companyName, normalizeBusinessUnit(row.businessUnit), row.month);
    if (!aiByKey.has(key)) aiByKey.set(key, decimalToNumber(row.forecastValue) ?? 0);
  }

  const rows: ForecastInputRow[] = [];

  for (const pair of ownershipPairs) {
    for (const businessUnit of PETYR_BUSINESS_UNITS) {
      for (let month = 1; month <= 12; month += 1) {
        const previousMonthForecast = monthlyByKey.get(forecastKey(pair.companyName, businessUnit, month, "previous_month"));
        const ongoingForecast = monthlyByKey.get(forecastKey(pair.companyName, businessUnit, month, "ongoing"));
        const referenceKey = companyBusinessUnitMonthKey(pair.companyName, businessUnit, month);

        rows.push({
          csmName: pair.csmName,
          companyName: pair.companyName,
          businessUnit,
          year: input.year,
          month,
          previousMonthForecast: decimalToNumber(previousMonthForecast?.value),
          ongoingForecast: decimalToNumber(ongoingForecast?.value),
          companyActiveStatus: statusByCompany.get(normalizeCompanyOwnershipKey(pair.companyName)) ?? "",
          note: "",
          closedRevenueReference: closedRevenue.values.get(referenceKey) ?? null,
          aiForecastReference: aiByKey.get(referenceKey) ?? null,
          validationStatus: DEFAULT_VALIDATION_STATUS
        });
      }
    }
  }

  return { rows, referenceCompanies, warnings: closedRevenue.warnings };
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
}

function styleReadOnlyCell(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
  cell.font = { color: { argb: "FF1D4ED8" } };
}

function addInstructionsSheet(workbook: ExcelJS.Workbook, year: number, warnings: string[]) {
  const sheet = workbook.addWorksheet("Instructions");
  sheet.columns = [{ width: 34 }, { width: 110 }];

  sheet.addRow(["Petyr Excel forecast import/export"]);
  sheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
  sheet.addRow([]);
  sheet.addRows([
    ["What to fill", `Use Forecast Input to update CSM forecast fields for ${year}. Fill Previous-month forecast, Ongoing forecast, Company active status and Note when needed.`],
    ["What not to modify", "Do not edit CSM, Company, Business Unit, Year or Month unless you are correcting a validation issue before import."],
    ["Read-only references", "Closed revenue reference and AI forecast reference are reference-only. They are ignored during import and never update Redash or AI forecast data."],
    ["Forecast grain", "Forecasts are saved for Company + Business Unit + Month + Year."],
    ["Validation", "Import validation errors and warnings are shown in the admin import result."],
    ["Access", "Manager/CSM access rules will be regulated later. For now, use this only in the internal Petyr admin workflow."]
  ]);

  if (warnings.length > 0) {
    sheet.addRow([]);
    sheet.addRow(["Export warnings", warnings.join(" ")]);
  }

  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.getCell(1).font = { bold: true, color: { argb: "FF334155" } };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }
}

function addForecastInputSheet(workbook: ExcelJS.Workbook, rows: ForecastInputRow[]) {
  const sheet = workbook.addWorksheet("Forecast Input");

  sheet.columns = FORECAST_INPUT_HEADERS.map((header) => ({
    header: header.label,
    key: header.key,
    width: header.width
  }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(rows.length + 1, 1), column: FORECAST_INPUT_HEADERS.length }
  };
  styleHeaderRow(sheet.getRow(1));

  for (const row of rows) {
    const worksheetRow = sheet.addRow({
      ...row,
      month: MONTH_LABELS[row.month - 1]
    } satisfies Record<ForecastInputHeaderKey, string | number | null>);

    worksheetRow.getCell("previousMonthForecast").numFmt = PETYR_EXCEL_CURRENCY_NUM_FORMAT;
    worksheetRow.getCell("ongoingForecast").numFmt = PETYR_EXCEL_CURRENCY_NUM_FORMAT;
    worksheetRow.getCell("closedRevenueReference").numFmt = PETYR_EXCEL_CURRENCY_NUM_FORMAT;
    worksheetRow.getCell("aiForecastReference").numFmt = PETYR_EXCEL_CURRENCY_NUM_FORMAT;
    worksheetRow.getCell("note").alignment = { wrapText: true, vertical: "top" };
    styleReadOnlyCell(worksheetRow.getCell("closedRevenueReference"));
    styleReadOnlyCell(worksheetRow.getCell("aiForecastReference"));
    styleReadOnlyCell(worksheetRow.getCell("validationStatus"));
  }

  const lastDataRow = Math.max(rows.length + 1, 2);
  for (let rowNumber = 2; rowNumber <= lastDataRow; rowNumber += 1) {
    sheet.getCell(`C${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`'Reference - Business Units'!$A$2:$A$${PETYR_BUSINESS_UNITS.length + 1}`]
    };
    sheet.getCell(`D${rowNumber}`).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: false,
      formulae: [2000, 2100]
    };
    sheet.getCell(`E${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${MONTH_LABELS.join(",")}"`]
    };
    sheet.getCell(`F${rowNumber}`).dataValidation = {
      type: "decimal",
      operator: "greaterThanOrEqual",
      allowBlank: true,
      formulae: [0]
    };
    sheet.getCell(`G${rowNumber}`).dataValidation = {
      type: "decimal",
      operator: "greaterThanOrEqual",
      allowBlank: true,
      formulae: [0]
    };
    sheet.getCell(`H${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"active,inactive"']
    };
  }
}

function addBusinessUnitsSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("Reference - Business Units");
  sheet.columns = [{ header: "Official Business Unit", key: "businessUnit", width: 28 }];
  styleHeaderRow(sheet.getRow(1));

  for (const businessUnit of PETYR_BUSINESS_UNITS) {
    sheet.addRow({ businessUnit });
  }
}

function addCompaniesSheet(workbook: ExcelJS.Workbook, rows: ReferenceCompanyRow[]) {
  const sheet = workbook.addWorksheet("Reference - Companies");
  sheet.columns = [
    { header: "CSM", key: "csmName", width: 24 },
    { header: "Company", key: "companyName", width: 38 },
    { header: "Branch", key: "branchName", width: 24 }
  ];
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(rows.length + 1, 1), column: 3 }
  };
  styleHeaderRow(sheet.getRow(1));

  for (const row of rows) {
    sheet.addRow(row);
  }
}

function addValidationRulesSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("Validation Rules");
  sheet.columns = [{ width: 34 }, { width: 110 }];
  sheet.addRow(["Rule", "Details"]);
  styleHeaderRow(sheet.getRow(1));
  sheet.addRows([
    ["Business Unit", `Must be one of: ${PETYR_BUSINESS_UNITS.join(", ")}.`],
    ["Year", "Must be numeric."],
    ["Month", "Must be 1-12. The template uses labels such as 01 - January."],
    ["Forecast values", "Previous-month forecast and Ongoing forecast must be numeric and greater than or equal to 0 when provided."],
    ["Closed revenue", "Closed revenue reference is not importable and is ignored during import."],
    ["AI forecast", "AI forecast reference is not importable and is ignored during import."],
    ["Company and CSM", "Company must exist in Company Ownership. The canonical CSM from Company Ownership is used for persistence."],
    ["Note", "A note can accompany real imported changes, but a note-only row is ignored and does not create an import."]
  ]);
}

export async function buildMonthlyForecastWorkbookXlsx(input: { year: number; csmName?: string | null }) {
  const finishPerformance = startPetyrPerformanceTimer("exportMonthlyForecastWorkbookXlsx", {
    year: input.year,
    hasCsmName: Boolean(input.csmName?.trim())
  });

  try {
    const data = await loadExportData(input);
    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Petyr Admin";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.properties.date1904 = false;

    addInstructionsSheet(workbook, input.year, data.warnings);
    addForecastInputSheet(workbook, data.rows);
    addBusinessUnitsSheet(workbook);
    addCompaniesSheet(workbook, data.referenceCompanies);
    addValidationRulesSheet(workbook);

    const buffer = await workbook.xlsx.writeBuffer();
    finishPerformance({
      status: "success",
      rowCount: data.rows.length,
      warnings: data.warnings.length,
      referenceCompanies: data.referenceCompanies.length
    });

    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  } catch (error) {
    finishPerformance({ status: "failed" });
    throw error;
  }
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const HEADER_ALIASES = new Map<string, string>([
  ["csm", "csmName"],
  ["csmname", "csmName"],
  ["company", "companyName"],
  ["companyname", "companyName"],
  ["businessunit", "businessUnit"],
  ["year", "year"],
  ["month", "month"],
  ["previousmonthforecast", "previousMonthForecast"],
  ["previousmonthforecasteur", "previousMonthForecast"],
  ["ongoingforecast", "ongoingForecast"],
  ["ongoingforecasteur", "ongoingForecast"],
  ["companyactivestatus", "companyActiveStatus"],
  ["note", "note"],
  ["closedrevenuereferencereadonly", "closedRevenueReference"],
  ["closedrevenuereference", "closedRevenueReference"],
  ["aiforecastreferencereadonly", "aiForecastReference"],
  ["aiforecastreference", "aiForecastReference"],
  ["validationstatusreadonly", "validationStatus"],
  ["validationstatus", "validationStatus"]
]);

const READ_ONLY_IMPORT_HEADERS = new Set(["closedRevenueReference", "aiForecastReference", "validationStatus"]);

function getCellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value).trim();

  if ("result" in value && value.result !== undefined && value.result !== null) {
    return String(value.result).trim();
  }

  if ("text" in value && typeof value.text === "string") {
    return value.text.trim();
  }

  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((item) => item.text).join("").trim();
  }

  return cell.text.trim();
}

function buildExcelFailure(input: {
  fileName?: string;
  totalRows?: number;
  importableRows?: number;
  startedAt?: number;
  errors: MonthlyForecastImportError[];
  warnings?: MonthlyForecastImportWarning[];
  problemRows?: MonthlyForecastImportProblemRow[];
}): MonthlyForecastImportResult {
  return {
    ok: false,
    source: EXCEL_IMPORT_SOURCE,
    fileName: input.fileName,
    totalRows: input.totalRows ?? 0,
    importableRows: input.importableRows ?? 0,
    changedRows: 0,
    unchangedRows: 0,
    importedRows: 0,
    skippedRows: input.totalRows ?? 0,
    forecastUpserts: 0,
    companyStatusUpserts: 0,
    changeLogRows: 0,
    csmCorrections: 0,
    saveSessionId: null,
    saveSessionIds: [],
    durationMs: Date.now() - (input.startedAt ?? Date.now()),
    errors: input.errors,
    warnings: input.warnings ?? [],
    problemRows: input.problemRows ?? []
  };
}

function hasPotentialImportValue(record: MonthlyForecastImportInputRecord) {
  return Boolean(
    record.previousMonthForecast.trim() ||
      record.ongoingForecast.trim() ||
      record.companyActiveStatus.trim()
  );
}

function buildProblemRows(
  recordsByRow: Map<number, MonthlyForecastImportInputRecord>,
  errors: MonthlyForecastImportError[]
) {
  const messagesByRow = new Map<number, string[]>();

  for (const error of errors) {
    if (error.row < 2) continue;

    const messages = messagesByRow.get(error.row) ?? [];
    messages.push(`${error.field}: ${error.message}`);
    messagesByRow.set(error.row, messages);
  }

  return [...messagesByRow.entries()].slice(0, 10).map<MonthlyForecastImportProblemRow>(([row, messages]) => {
    const record = recordsByRow.get(row);

    return {
      row,
      values: record
        ? {
            csmName: record.csmName,
            companyName: record.companyName,
            businessUnit: record.businessUnit,
            year: record.year,
            month: record.month,
            previousMonthForecast: record.previousMonthForecast,
            ongoingForecast: record.ongoingForecast,
            companyActiveStatus: record.companyActiveStatus,
            note: record.note
          }
        : {},
      messages
    };
  });
}

export async function importMonthlyForecastWorkbookXlsx(
  buffer: Buffer,
  options: { fileName?: string } = {}
): Promise<MonthlyForecastImportResult> {
  const startedAt = Date.now();
  const finishPerformance = startPetyrPerformanceTimer("importMonthlyForecastWorkbookXlsx");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (error) {
    finishPerformance({ status: "failed" });
    throw error;
  }

  const sheet = workbook.getWorksheet("Forecast Input");
  const warnings: MonthlyForecastImportWarning[] = [
    {
      message:
        "Closed revenue reference, AI forecast reference and Validation status columns are read-only references and were ignored during import."
    }
  ];

  if (!sheet) {
    const result = buildExcelFailure({
      fileName: options.fileName,
      startedAt,
      errors: [{ row: 1, field: "sheet", message: 'Workbook must include a "Forecast Input" sheet.' }],
      warnings
    });
    finishPerformance({ status: "failed", rowCount: result.totalRows, errors: result.errors.length });
    return result;
  }

  const headerIndexes = new Map<string, number>();
  const unknownHeaders: string[] = [];
  const headerRow = sheet.getRow(1);

  headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const headerText = getCellText(cell);
    const mappedHeader = HEADER_ALIASES.get(normalizeHeader(headerText));

    if (!mappedHeader) {
      unknownHeaders.push(headerText);
      return;
    }

    if (READ_ONLY_IMPORT_HEADERS.has(mappedHeader)) return;
    if (isMonthlyForecastImportColumn(mappedHeader)) headerIndexes.set(mappedHeader, columnNumber);
  });

  const headerErrors: MonthlyForecastImportError[] = [];

  for (const column of [
    "companyName",
    "csmName",
    "businessUnit",
    "year",
    "month",
    "previousMonthForecast",
    "ongoingForecast",
    "companyActiveStatus",
    "note"
  ]) {
    if (!headerIndexes.has(column)) {
      headerErrors.push({ row: 1, field: column, message: `Missing required Forecast Input column for ${column}.` });
    }
  }

  if (unknownHeaders.length > 0) {
    warnings.push({
      field: "headers",
      message: `Ignored unrecognized Forecast Input column(s): ${unknownHeaders.join(", ")}.`
    });
  }

  if (headerErrors.length > 0) {
    const result = buildExcelFailure({
      fileName: options.fileName,
      totalRows: Math.max(sheet.actualRowCount - 1, 0),
      startedAt,
      errors: headerErrors,
      warnings
    });
    finishPerformance({ status: "failed", rowCount: result.totalRows, errors: result.errors.length });
    return result;
  }

  const records: MonthlyForecastImportInputRecord[] = [];
  const recordsByRow = new Map<number, MonthlyForecastImportInputRecord>();
  let totalRowsRead = 0;

  for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const record = {
      rowNumber,
      companyName: getCellText(row.getCell(headerIndexes.get("companyName") ?? 1)),
      csmName: getCellText(row.getCell(headerIndexes.get("csmName") ?? 1)),
      businessUnit: getCellText(row.getCell(headerIndexes.get("businessUnit") ?? 1)),
      year: getCellText(row.getCell(headerIndexes.get("year") ?? 1)),
      month: getCellText(row.getCell(headerIndexes.get("month") ?? 1)),
      previousMonthForecast: getCellText(row.getCell(headerIndexes.get("previousMonthForecast") ?? 1)),
      ongoingForecast: getCellText(row.getCell(headerIndexes.get("ongoingForecast") ?? 1)),
      companyActiveStatus: getCellText(row.getCell(headerIndexes.get("companyActiveStatus") ?? 1)),
      note: getCellText(row.getCell(headerIndexes.get("note") ?? 1))
    };

    const hasAnyValue = Object.entries(record).some(
      ([key, value]) => key !== "rowNumber" && typeof value === "string" && value.trim() !== ""
    );
    if (!hasAnyValue) continue;
    totalRowsRead += 1;

    if (!hasPotentialImportValue(record)) continue;

    records.push(record);
    recordsByRow.set(rowNumber, record);
  }

  const result = await importMonthlyForecastRecords(records, {
    fileName: options.fileName,
    source: EXCEL_IMPORT_SOURCE,
    emptyFieldName: "xlsx",
    totalRows: totalRowsRead,
    startedAt,
    warnings,
    buildProblemRows: (errors) => buildProblemRows(recordsByRow, errors)
  });
  finishPerformance({
    status: result.ok ? "success" : "failed",
    rowCount: result.totalRows,
    importableRows: result.importableRows,
    changedRows: result.changedRows,
    importedRows: result.importedRows,
    skippedRows: result.skippedRows,
    errors: result.errors.length,
    warnings: result.warnings?.length ?? 0
  });

  return result;
}
