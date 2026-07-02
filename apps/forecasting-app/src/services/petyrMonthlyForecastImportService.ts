import { Prisma, type CompanyForecastStatus, type ForecastMonthly } from "@prisma/client";
import { PETYR_BUSINESS_UNITS, type PetyrBusinessUnit } from "@/lib/petyr/constants";
import { prisma } from "@/lib/db";
import {
  getCanonicalCompanyOwnershipIndex,
  normalizeCompanyOwnershipKey,
  PetyrCompanyOwnershipError,
  resolveCanonicalCompanyOwnership
} from "@/services/petyrCompanyOwnershipService";

const CSV_IMPORT_SOURCE = "Admin CSV Import";
const IMPORT_USER = "petyr-admin";
const CHANGED_ROW_CHUNK_SIZE = 500;
const DB_READ_CHUNK_SIZE = 1000;

const REQUIRED_COLUMNS = [
  "companyName",
  "csmName",
  "businessUnit",
  "year",
  "month",
  "previousMonthForecast",
  "ongoingForecast",
  "companyActiveStatus",
  "note"
] as const;

const BUSINESS_UNITS = new Set<string>(PETYR_BUSINESS_UNITS);
const REQUIRED_COLUMN_SET = new Set<string>(REQUIRED_COLUMNS);

type ForecastType = "previous_month" | "ongoing";

type CsvRow = {
  lineNumber: number;
  values: string[];
};

type RawImportRow = Record<(typeof REQUIRED_COLUMNS)[number], string>;

type ParsedImportRow = {
  rowNumber: number;
  companyName: string;
  csmName: string;
  businessUnit: PetyrBusinessUnit;
  year: number;
  month: number;
  previousMonthForecast: Prisma.Decimal | null;
  ongoingForecast: Prisma.Decimal | null;
  companyActiveStatus: boolean | null;
  note: string;
};

export type MonthlyForecastImportError = {
  row: number;
  field: string;
  message: string;
};

export type MonthlyForecastImportWarning = {
  row?: number;
  field?: string;
  message: string;
};

export type MonthlyForecastImportProblemRow = {
  row: number;
  values: Partial<RawImportRow>;
  messages: string[];
};

export type MonthlyForecastImportResult = {
  ok: boolean;
  source: string;
  fileName?: string;
  totalRows: number;
  importableRows: number;
  changedRows: number;
  unchangedRows: number;
  importedRows: number;
  skippedRows: number;
  forecastUpserts: number;
  companyStatusUpserts: number;
  changeLogRows: number;
  csmCorrections: number;
  saveSessionId: string | null;
  saveSessionIds?: string[];
  durationMs: number;
  message?: string;
  errors: MonthlyForecastImportError[];
  warnings?: MonthlyForecastImportWarning[];
  problemRows?: MonthlyForecastImportProblemRow[];
};

export type MonthlyForecastImportInputRecord = RawImportRow & {
  rowNumber: number;
};

type ImportCounters = {
  importedRowNumbers: Set<number>;
  forecastUpserts: number;
  companyStatusUpserts: number;
  changeLogRows: number;
};

type ParsedImportResult = {
  rows: ParsedImportRow[];
  totalRows: number;
  importableRows: number;
  errors: MonthlyForecastImportError[];
};

type ForecastValueChange = {
  forecastType: ForecastType;
  fieldName: "previousMonthForecast" | "ongoingForecast";
  value: Prisma.Decimal;
  existing: ForecastMonthly | null;
};

type CompanyStatusChange = {
  isActive: boolean;
  reason: string | null;
  existing: CompanyForecastStatus | null;
  statusChanged: boolean;
};

type PreparedImportRowChange = {
  row: ParsedImportRow;
  forecastChanges: ForecastValueChange[];
  statusChange: CompanyStatusChange | null;
};

function trimByteOrderMark(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function parseCsvRows(csv: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let field = "";
  let row: string[] = [];
  let rowStartLine = 1;
  let currentLine = 1;
  let inQuotes = false;

  function pushRow() {
    rows.push({ lineNumber: rowStartLine, values: [...row, field] });
    row = [];
    field = "";
    rowStartLine = currentLine;
  }

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const nextCharacter = csv[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      currentLine += 1;
      pushRow();
      continue;
    }

    if (character === "\n" || character === "\r") {
      currentLine += 1;
    }

    field += character;
  }

  if (field || row.length > 0 || csv.length === 0) {
    pushRow();
  }

  return rows.filter((csvRow) => csvRow.values.some((value) => value.trim() !== ""));
}

function normalizeHeader(value: string, index: number) {
  const trimmed = value.trim();
  return index === 0 ? trimByteOrderMark(trimmed) : trimmed;
}

function parseDecimal(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let normalized = trimmed.replace(/\s+/g, "").replace(/EUR|€/gi, "");

  if (/^-?\d+,\d+$/.test(normalized)) {
    normalized = normalized.replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  } else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;

  return new Prisma.Decimal(normalized);
}

function parseMonth(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;

  const displayMonth = /^(\d{1,2})\s*-/.exec(trimmed);
  return Number(displayMonth?.[1] ?? trimmed);
}

function parseBoolean(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase();
  if (["true", "yes", "y", "1", "active", "attiva", "attivo"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "inactive", "nonactive", "not active", "inattiva", "inattivo"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function decimalToLogValue(value: Prisma.Decimal | null | undefined) {
  return value ? value.toFixed(2) : null;
}

function booleanToLogValue(value: boolean | null | undefined) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function isDecimalChanged(existingValue: Prisma.Decimal | null | undefined, nextValue: Prisma.Decimal) {
  return !existingValue || !existingValue.equals(nextValue);
}

function forecastImportKey(companyName: string, businessUnit: string, year: number, month: number, forecastType: ForecastType) {
  return [normalizeCompanyOwnershipKey(companyName), businessUnit, year, month, forecastType].join("\u0000");
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function isNegativeDecimal(value: Prisma.Decimal | null) {
  return Boolean(value?.lessThan(0));
}

function buildHeaderIndexes(headers: string[]) {
  const indexes = new Map<string, number>();

  headers.forEach((header, index) => {
    indexes.set(normalizeHeader(header, index), index);
  });

  return indexes;
}

function validateHeaders(headerRow: CsvRow | undefined) {
  const errors: MonthlyForecastImportError[] = [];

  if (!headerRow) {
    return {
      headers: [],
      indexes: new Map<string, number>(),
      errors: [{ row: 1, field: "csv", message: "CSV file is empty." }]
    };
  }

  const headers = headerRow.values.map(normalizeHeader);
  const indexes = buildHeaderIndexes(headers);

  for (const column of REQUIRED_COLUMNS) {
    if (!indexes.has(column)) {
      errors.push({ row: headerRow.lineNumber, field: column, message: `Missing required column "${column}".` });
    }
  }

  return { headers, indexes, errors };
}

function rowToRecord(row: CsvRow, indexes: Map<string, number>) {
  return REQUIRED_COLUMNS.reduce<RawImportRow>((record, column) => {
    const columnIndex = indexes.get(column);
    record[column] = columnIndex === undefined ? "" : row.values[columnIndex]?.trim() ?? "";
    return record;
  }, {} as RawImportRow);
}

function validateDataRow(row: CsvRow, record: RawImportRow, expectedColumnCount: number) {
  const errors: MonthlyForecastImportError[] = [];
  const companyName = record.companyName.trim();
  const csmName = record.csmName.trim();
  const businessUnit = record.businessUnit.trim();
  const parsedYear = Number(record.year.trim());
  const parsedMonth = parseMonth(record.month);
  const previousMonthForecast = parseDecimal(record.previousMonthForecast);
  const ongoingForecast = parseDecimal(record.ongoingForecast);
  const companyActiveStatus = parseBoolean(record.companyActiveStatus);
  const note = record.note.trim();

  if (!companyName) {
    errors.push({ row: row.lineNumber, field: "companyName", message: "companyName is required." });
  }

  if (!BUSINESS_UNITS.has(businessUnit)) {
    errors.push({
      row: row.lineNumber,
      field: "businessUnit",
      message: `businessUnit must be one of: ${PETYR_BUSINESS_UNITS.join(", ")}.`
    });
  }

  if (!Number.isInteger(parsedYear)) {
    errors.push({ row: row.lineNumber, field: "year", message: "year must be numeric." });
  }

  if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    errors.push({ row: row.lineNumber, field: "month", message: "month must be a number from 1 to 12." });
  }

  if (record.previousMonthForecast.trim() && !previousMonthForecast) {
    errors.push({
      row: row.lineNumber,
      field: "previousMonthForecast",
      message: "previousMonthForecast must be numeric when provided."
    });
  }

  if (isNegativeDecimal(previousMonthForecast)) {
    errors.push({
      row: row.lineNumber,
      field: "previousMonthForecast",
      message: "previousMonthForecast must be greater than or equal to 0."
    });
  }

  if (record.ongoingForecast.trim() && !ongoingForecast) {
    errors.push({ row: row.lineNumber, field: "ongoingForecast", message: "ongoingForecast must be numeric when provided." });
  }

  if (isNegativeDecimal(ongoingForecast)) {
    errors.push({
      row: row.lineNumber,
      field: "ongoingForecast",
      message: "ongoingForecast must be greater than or equal to 0."
    });
  }

  if (companyActiveStatus === undefined) {
    errors.push({
      row: row.lineNumber,
      field: "companyActiveStatus",
      message: "companyActiveStatus must be true/false, yes/no, active/inactive, or 1/0 when provided."
    });
  }

  if (row.values.length > expectedColumnCount) {
    errors.push({
      row: row.lineNumber,
      field: "csv",
      message: "Row has more values than expected. Quote values that contain commas."
    });
  }

  if (errors.length > 0) return { row: null, errors };

  return {
    row: {
      rowNumber: row.lineNumber,
      companyName,
      csmName,
      businessUnit: businessUnit as PetyrBusinessUnit,
      year: parsedYear,
      month: parsedMonth,
      previousMonthForecast,
      ongoingForecast,
      companyActiveStatus: companyActiveStatus === undefined ? null : companyActiveStatus,
      note
    },
    errors
  };
}

function parseMonthlyForecastImportCsv(csv: string): ParsedImportResult {
  const csvRows = parseCsvRows(csv);
  const { headers, indexes, errors } = validateHeaders(csvRows[0]);

  if (errors.length > 0) {
    return { rows: [], totalRows: Math.max(csvRows.length - 1, 0), importableRows: 0, errors };
  }

  const rows: ParsedImportRow[] = [];
  const dataRows = csvRows.slice(1);

  for (const csvRow of dataRows) {
    const record = rowToRecord(csvRow, indexes);
    const validated = validateDataRow(csvRow, record, headers.length);

    errors.push(...validated.errors);
    if (validated.row) rows.push(validated.row);
  }

  if (dataRows.length === 0) {
    errors.push({ row: 2, field: "csv", message: "CSV must include at least one data row." });
  }

  return { rows, totalRows: dataRows.length, importableRows: rows.filter(hasImportableValues).length, errors };
}

function parseMonthlyForecastImportRecords(
  records: MonthlyForecastImportInputRecord[],
  emptyFieldName: string,
  totalRows = records.length
): ParsedImportResult {
  const rows: ParsedImportRow[] = [];
  const errors: MonthlyForecastImportError[] = [];

  for (const record of records) {
    const rawRecord = REQUIRED_COLUMNS.reduce<RawImportRow>((normalizedRecord, column) => {
      normalizedRecord[column] = record[column]?.trim() ?? "";
      return normalizedRecord;
    }, {} as RawImportRow);
    const validated = validateDataRow(
      { lineNumber: record.rowNumber, values: REQUIRED_COLUMNS.map((column) => rawRecord[column]) },
      rawRecord,
      REQUIRED_COLUMNS.length
    );

    errors.push(...validated.errors);
    if (validated.row) rows.push(validated.row);
  }

  if (records.length === 0 && totalRows === 0) {
    errors.push({
      row: 2,
      field: emptyFieldName,
      message: "Forecast Input must include at least one data row."
    });
  }

  return { rows, totalRows, importableRows: rows.filter(hasImportableValues).length, errors };
}

function hasImportableValues(row: ParsedImportRow) {
  return Boolean(row.previousMonthForecast || row.ongoingForecast || row.companyActiveStatus !== null);
}

function isDifferentCsm(csvCsmName: string, canonicalCsmName: string) {
  return normalizeCompanyOwnershipKey(csvCsmName) !== normalizeCompanyOwnershipKey(canonicalCsmName);
}

async function canonicalizeImportRows(rows: ParsedImportRow[]) {
  const ownershipIndex = await getCanonicalCompanyOwnershipIndex();
  const canonicalRows: ParsedImportRow[] = [];
  const errors: MonthlyForecastImportError[] = [];
  let csmCorrections = 0;

  for (const row of rows) {
    const ownership = resolveCanonicalCompanyOwnership(ownershipIndex, row.companyName);

    if (!ownership) {
      errors.push({
        row: row.rowNumber,
        field: "companyName",
        message: "companyName must exist in Company Ownership before monthly forecast values can be imported."
      });
      continue;
    }

    if (isDifferentCsm(row.csmName, ownership.csmName)) {
      csmCorrections += 1;
    }

    canonicalRows.push({
      ...row,
      companyName: ownership.companyName,
      csmName: ownership.csmName
    });
  }

  return { rows: canonicalRows, csmCorrections, errors };
}

async function upsertForecastMonthly(input: {
  tx: Prisma.TransactionClient;
  row: ParsedImportRow;
  change: ForecastValueChange;
  counters: ImportCounters;
}) {
  const { tx, row, change, counters } = input;
  const where = {
    companyName_businessUnit_year_month_forecastType: {
      companyName: row.companyName,
      businessUnit: row.businessUnit,
      year: row.year,
      month: row.month,
      forecastType: change.forecastType
    }
  };

  await tx.forecastMonthly.upsert({
    where,
    create: {
      companyName: row.companyName,
      csmName: row.csmName,
      businessUnit: row.businessUnit,
      year: row.year,
      month: row.month,
      forecastType: change.forecastType,
      value: change.value,
      status: "saved",
      createdBy: IMPORT_USER,
      updatedBy: IMPORT_USER
    },
    update: {
      csmName: row.csmName,
      value: change.value,
      status: "saved",
      updatedBy: IMPORT_USER
    }
  });

  counters.forecastUpserts += 1;
  counters.importedRowNumbers.add(row.rowNumber);
}

async function upsertCompanyForecastStatus(input: {
  tx: Prisma.TransactionClient;
  row: ParsedImportRow;
  change: CompanyStatusChange;
  counters: ImportCounters;
}) {
  const { tx, row, change, counters } = input;

  await tx.companyForecastStatus.upsert({
    where: { companyName: row.companyName },
    create: {
      companyName: row.companyName,
      isActive: change.isActive,
      reason: change.reason,
      updatedBy: IMPORT_USER
    },
    update: {
      isActive: change.isActive,
      reason: change.reason,
      updatedBy: IMPORT_USER
    }
  });

  counters.companyStatusUpserts += 1;
  counters.importedRowNumbers.add(row.rowNumber);
}

async function readExistingForecastMonthlyRows(rows: ParsedImportRow[]) {
  const companyNames = [...new Set(rows.map((row) => row.companyName))];
  const years = [...new Set(rows.map((row) => row.year))];
  const existingByKey = new Map<string, ForecastMonthly>();

  if (companyNames.length === 0 || years.length === 0) return existingByKey;

  for (const companyNameChunk of chunkArray(companyNames, DB_READ_CHUNK_SIZE)) {
    const existingRows = await prisma.forecastMonthly.findMany({
      where: {
        companyName: { in: companyNameChunk },
        year: { in: years },
        forecastType: { in: ["previous_month", "ongoing"] }
      }
    });

    for (const existing of existingRows) {
      existingByKey.set(
        forecastImportKey(existing.companyName, existing.businessUnit, existing.year, existing.month, existing.forecastType),
        existing
      );
    }
  }

  return existingByKey;
}

async function readExistingCompanyStatuses(rows: ParsedImportRow[]) {
  const companyNames = [...new Set(rows.filter((row) => row.companyActiveStatus !== null).map((row) => row.companyName))];
  const existingByCompany = new Map<string, CompanyForecastStatus>();

  if (companyNames.length === 0) return existingByCompany;

  for (const companyNameChunk of chunkArray(companyNames, DB_READ_CHUNK_SIZE)) {
    const existingRows = await prisma.companyForecastStatus.findMany({
      where: { companyName: { in: companyNameChunk } }
    });

    for (const existing of existingRows) {
      existingByCompany.set(normalizeCompanyOwnershipKey(existing.companyName), existing);
    }
  }

  return existingByCompany;
}

async function prepareImportRowChanges(rows: ParsedImportRow[]) {
  const [existingForecasts, existingStatuses] = await Promise.all([
    readExistingForecastMonthlyRows(rows),
    readExistingCompanyStatuses(rows)
  ]);
  const changes: PreparedImportRowChange[] = [];

  for (const row of rows) {
    const forecastChanges: ForecastValueChange[] = [];

    if (row.previousMonthForecast !== null) {
      const existing =
        existingForecasts.get(forecastImportKey(row.companyName, row.businessUnit, row.year, row.month, "previous_month")) ??
        null;

      if (isDecimalChanged(existing?.value, row.previousMonthForecast)) {
        forecastChanges.push({
          forecastType: "previous_month",
          fieldName: "previousMonthForecast",
          value: row.previousMonthForecast,
          existing
        });
      }
    }

    if (row.ongoingForecast !== null) {
      const existing =
        existingForecasts.get(forecastImportKey(row.companyName, row.businessUnit, row.year, row.month, "ongoing")) ?? null;

      if (isDecimalChanged(existing?.value, row.ongoingForecast)) {
        forecastChanges.push({
          forecastType: "ongoing",
          fieldName: "ongoingForecast",
          value: row.ongoingForecast,
          existing
        });
      }
    }

    let statusChange: CompanyStatusChange | null = null;

    if (row.companyActiveStatus !== null) {
      const existing = existingStatuses.get(normalizeCompanyOwnershipKey(row.companyName)) ?? null;
      const reason = row.note || null;
      const statusChanged = existing?.isActive !== row.companyActiveStatus;

      if (statusChanged) {
        statusChange = {
          isActive: row.companyActiveStatus,
          reason,
          existing,
          statusChanged
        };
      }
    }

    if (forecastChanges.length > 0 || statusChange) {
      changes.push({ row, forecastChanges, statusChange });
    }
  }

  return changes;
}

function buildChangeLogRows(saveSessionId: string, change: PreparedImportRowChange) {
  const rows: Prisma.ForecastChangeLogCreateManyInput[] = [];

  for (const forecastChange of change.forecastChanges) {
    rows.push({
      saveSessionId,
      companyName: change.row.companyName,
      businessUnit: change.row.businessUnit,
      fieldName: forecastChange.fieldName,
      previousValue: decimalToLogValue(forecastChange.existing?.value),
      newValue: decimalToLogValue(forecastChange.value),
      aiForecastValueAtSave: forecastChange.existing?.aiForecastValue ?? null,
      createdBy: IMPORT_USER
    });
  }

  if (change.statusChange?.statusChanged) {
    rows.push({
      saveSessionId,
      companyName: change.row.companyName,
      businessUnit: change.row.businessUnit,
      fieldName: "companyActiveStatus",
      previousValue: booleanToLogValue(change.statusChange.existing?.isActive),
      newValue: booleanToLogValue(change.statusChange.isActive),
      createdBy: IMPORT_USER
    });
  }

  return rows;
}

async function writeImportRows(changes: PreparedImportRowChange[], fileName: string | undefined, source: string) {
  const aggregateCounters: ImportCounters = {
    importedRowNumbers: new Set<number>(),
    forecastUpserts: 0,
    companyStatusUpserts: 0,
    changeLogRows: 0
  };
  const saveSessionIds: string[] = [];

  for (const changeChunk of chunkArray(changes, CHANGED_ROW_CHUNK_SIZE)) {
    const written = await prisma.$transaction(
      async (tx) => {
        const firstRow = changeChunk[0].row;
        const counters: ImportCounters = {
          importedRowNumbers: new Set<number>(),
          forecastUpserts: 0,
          companyStatusUpserts: 0,
          changeLogRows: 0
        };
        const saveSession = await tx.forecastSaveSession.create({
          data: {
            companyName: source,
            csmName: IMPORT_USER,
            source,
            year: firstRow.year,
            month: firstRow.month,
            forecastType: "ongoing",
            note: `Imported ${changeChunk.length} changed row(s)${fileName ? ` from ${fileName}` : ""}.`,
            companyActiveStatus: firstRow.companyActiveStatus ?? true,
            createdBy: IMPORT_USER
          }
        });
        const changeLogRows: Prisma.ForecastChangeLogCreateManyInput[] = [];

        for (const change of changeChunk) {
          for (const forecastChange of change.forecastChanges) {
            await upsertForecastMonthly({
              tx,
              row: change.row,
              change: forecastChange,
              counters
            });
          }

          if (change.statusChange) {
            await upsertCompanyForecastStatus({
              tx,
              row: change.row,
              change: change.statusChange,
              counters
            });
          }

          changeLogRows.push(...buildChangeLogRows(saveSession.id, change));
        }

        if (changeLogRows.length > 0) {
          await tx.forecastChangeLog.createMany({ data: changeLogRows });
          counters.changeLogRows += changeLogRows.length;
        }

        return {
          saveSessionId: saveSession.id,
          importedRows: counters.importedRowNumbers.size,
          forecastUpserts: counters.forecastUpserts,
          companyStatusUpserts: counters.companyStatusUpserts,
          changeLogRows: counters.changeLogRows
        };
      },
      { maxWait: 10000, timeout: 120000 }
    );

    saveSessionIds.push(written.saveSessionId);
    for (const change of changeChunk) {
      aggregateCounters.importedRowNumbers.add(change.row.rowNumber);
    }
    aggregateCounters.forecastUpserts += written.forecastUpserts;
    aggregateCounters.companyStatusUpserts += written.companyStatusUpserts;
    aggregateCounters.changeLogRows += written.changeLogRows;
  }

  return {
    saveSessionId: saveSessionIds[0] ?? null,
    saveSessionIds,
    importedRows: aggregateCounters.importedRowNumbers.size,
    forecastUpserts: aggregateCounters.forecastUpserts,
    companyStatusUpserts: aggregateCounters.companyStatusUpserts,
    changeLogRows: aggregateCounters.changeLogRows
  };
}

type ImportParsedOptions = {
  fileName?: string;
  source: string;
  emptyFieldName?: string;
  warnings?: MonthlyForecastImportWarning[];
  buildProblemRows?: (errors: MonthlyForecastImportError[]) => MonthlyForecastImportProblemRow[];
  startedAt?: number;
};

function reportExtras(options: ImportParsedOptions, errors: MonthlyForecastImportError[] = []) {
  return {
    warnings: options.warnings ?? [],
    problemRows: options.buildProblemRows?.(errors) ?? []
  };
}

async function importParsedMonthlyForecastRows(
  parsed: ParsedImportResult,
  options: ImportParsedOptions
): Promise<MonthlyForecastImportResult> {
  const startedAt = options.startedAt ?? Date.now();

  if (parsed.errors.length > 0) {
    return {
      ok: false,
      source: options.source,
      fileName: options.fileName,
      totalRows: parsed.totalRows,
      importableRows: parsed.importableRows,
      changedRows: 0,
      unchangedRows: 0,
      importedRows: 0,
      skippedRows: parsed.totalRows,
      forecastUpserts: 0,
      companyStatusUpserts: 0,
      changeLogRows: 0,
      csmCorrections: 0,
      saveSessionId: null,
      saveSessionIds: [],
      durationMs: Date.now() - startedAt,
      errors: parsed.errors,
      ...reportExtras(options, parsed.errors)
    };
  }

  let canonicalized: Awaited<ReturnType<typeof canonicalizeImportRows>>;

  try {
    canonicalized = await canonicalizeImportRows(parsed.rows);
  } catch (error) {
    if (!(error instanceof PetyrCompanyOwnershipError)) throw error;

    return {
      ok: false,
      source: options.source,
      fileName: options.fileName,
      totalRows: parsed.totalRows,
      importableRows: parsed.importableRows,
      changedRows: 0,
      unchangedRows: 0,
      importedRows: 0,
      skippedRows: parsed.totalRows,
      forecastUpserts: 0,
      companyStatusUpserts: 0,
      changeLogRows: 0,
      csmCorrections: 0,
      saveSessionId: null,
      saveSessionIds: [],
      durationMs: Date.now() - startedAt,
      errors: [{ row: 1, field: "company_ownership", message: error.message }],
      ...reportExtras(options, [{ row: 1, field: "company_ownership", message: error.message }])
    };
  }

  if (canonicalized.errors.length > 0) {
    return {
      ok: false,
      source: options.source,
      fileName: options.fileName,
      totalRows: parsed.totalRows,
      importableRows: parsed.importableRows,
      changedRows: 0,
      unchangedRows: 0,
      importedRows: 0,
      skippedRows: parsed.totalRows,
      forecastUpserts: 0,
      companyStatusUpserts: 0,
      changeLogRows: 0,
      csmCorrections: canonicalized.csmCorrections,
      saveSessionId: null,
      saveSessionIds: [],
      durationMs: Date.now() - startedAt,
      errors: canonicalized.errors,
      ...reportExtras(options, canonicalized.errors)
    };
  }

  const importableRows = canonicalized.rows.filter(hasImportableValues);
  const skippedRows = parsed.totalRows - importableRows.length;

  if (importableRows.length === 0) {
    return {
      ok: true,
      source: options.source,
      fileName: options.fileName,
      totalRows: parsed.totalRows,
      importableRows: 0,
      changedRows: 0,
      unchangedRows: 0,
      importedRows: 0,
      skippedRows,
      forecastUpserts: 0,
      companyStatusUpserts: 0,
      changeLogRows: 0,
      csmCorrections: canonicalized.csmCorrections,
      saveSessionId: null,
      saveSessionIds: [],
      durationMs: Date.now() - startedAt,
      message: "No changes detected. Nothing was imported.",
      errors: [],
      ...reportExtras(options)
    };
  }

  const changes = await prepareImportRowChanges(importableRows);
  const changedRows = changes.length;
  const unchangedRows = importableRows.length - changedRows;

  if (changes.length === 0) {
    return {
      ok: true,
      source: options.source,
      fileName: options.fileName,
      totalRows: parsed.totalRows,
      importableRows: importableRows.length,
      changedRows: 0,
      unchangedRows,
      importedRows: 0,
      skippedRows,
      forecastUpserts: 0,
      companyStatusUpserts: 0,
      changeLogRows: 0,
      csmCorrections: canonicalized.csmCorrections,
      saveSessionId: null,
      saveSessionIds: [],
      durationMs: Date.now() - startedAt,
      message: "No changes detected. Nothing was imported.",
      errors: [],
      ...reportExtras(options)
    };
  }

  const written = await writeImportRows(changes, options.fileName, options.source);

  return {
    ok: true,
    source: options.source,
    fileName: options.fileName,
    totalRows: parsed.totalRows,
    importableRows: importableRows.length,
    changedRows,
    unchangedRows,
    importedRows: written.importedRows,
    skippedRows,
    forecastUpserts: written.forecastUpserts,
    companyStatusUpserts: written.companyStatusUpserts,
    changeLogRows: written.changeLogRows,
    csmCorrections: canonicalized.csmCorrections,
    saveSessionId: written.saveSessionId,
    saveSessionIds: written.saveSessionIds,
    durationMs: Date.now() - startedAt,
    message: `Imported ${changedRows} changed row(s).`,
    errors: [],
    ...reportExtras(options)
  };
}

export async function importMonthlyForecastRecords(
  records: MonthlyForecastImportInputRecord[],
  options: ImportParsedOptions & { emptyFieldName?: string; totalRows?: number }
): Promise<MonthlyForecastImportResult> {
  const parsed = parseMonthlyForecastImportRecords(records, options.emptyFieldName ?? "xlsx", options.totalRows);
  return importParsedMonthlyForecastRows(parsed, options);
}

export function isMonthlyForecastImportColumn(value: string): value is (typeof REQUIRED_COLUMNS)[number] {
  return REQUIRED_COLUMN_SET.has(value);
}

export async function importMonthlyForecastCsv(csv: string, options: { fileName?: string } = {}): Promise<MonthlyForecastImportResult> {
  const parsed = parseMonthlyForecastImportCsv(csv);
  return importParsedMonthlyForecastRows(parsed, {
    fileName: options.fileName,
    source: CSV_IMPORT_SOURCE,
    startedAt: Date.now()
  });
}
