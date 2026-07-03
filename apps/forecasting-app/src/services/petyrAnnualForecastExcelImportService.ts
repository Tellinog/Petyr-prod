import { Prisma, type CompanyForecastStatus, type ForecastAnnual } from "@prisma/client";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { type PetyrBusinessUnit } from "@/lib/petyr/constants";
import {
  PETYR_ANNUAL_FORECAST_IMPORT_SHEET_NAME,
  parseAnnualForecastImportRows,
  type AnnualForecastImportCompany,
  type AnnualForecastImportIssue
} from "@/lib/petyr/annualForecastImportParser";
import { getMissingAnnualForecastImportCustomers } from "@/lib/petyr/annualForecastImportMissingCustomers";
import { startPetyrPerformanceTimer } from "@/lib/petyr/performance";
import {
  type CanonicalCompanyOwnershipPair,
  getCanonicalCompanyOwnershipIndex,
  normalizeCompanyOwnershipKey,
  PetyrCompanyOwnershipError,
  resolveCanonicalCompanyOwnership
} from "@/services/petyrCompanyOwnershipService";
import { invalidateForecastEntryReadCache } from "@/services/forecastEntryReadCache";

const IMPORT_SOURCE = "Admin Annual Forecast Import";
const IMPORT_USER_FALLBACK = "petyr-admin";
const COMPANY_FIELD_BUSINESS_UNIT = "__company__";

type CanonicalImportCompany = AnnualForecastImportCompany & {
  canonicalCompanyName: string;
  csmName: string;
};

type ExistingAnnualRow = ForecastAnnual;
type ExistingStatusRow = CompanyForecastStatus;

type ForecastChange = {
  companyName: string;
  csmName: string;
  businessUnit: PetyrBusinessUnit;
  nextValue: Prisma.Decimal;
  existing: ExistingAnnualRow | null;
};

type StatusChange = {
  companyName: string;
  csmName: string;
  nextActiveStatus: boolean;
  existing: ExistingStatusRow | null;
  reason: "zero_ongoing" | "missing_from_import";
};

type CompanyChangeSet = {
  company: CanonicalImportCompany;
  forecastChanges: ForecastChange[];
  statusChange: StatusChange | null;
};

export type AnnualForecastExcelImportResult = {
  ok: boolean;
  dryRun: boolean;
  source: string;
  fileName?: string;
  year: number;
  totalRows: number;
  importableRows: number;
  changedRows: number;
  unchangedRows: number;
  importedRows: number;
  skippedRows: number;
  forecastUpserts: number;
  activeStatusUpdates: number;
  missingCustomerInactiveUpdates: number;
  changeLogRows: number;
  saveSessionIds: string[];
  durationMs: number;
  message?: string;
  errors: AnnualForecastImportIssue[];
  warnings: AnnualForecastImportIssue[];
  duplicateCustomers: Array<{ customerName: string; rows: number[] }>;
  preview: Array<{
    companyName: string;
    csmName: string;
    ongoingTotal: number;
    forecastChanges: number;
    activeStatusChange: boolean;
    missingFromImport: boolean;
    sourceRows: number[];
  }>;
};

function decimalToLogValue(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : value.toFixed(2);
}

function formatForecastLogValue(value: Prisma.Decimal | null | undefined, source: string | null | undefined) {
  const amount = decimalToLogValue(value);
  if (amount === null) return null;
  return source ? `${amount} (${source})` : amount;
}

function statusLogValue(value: boolean | null | undefined) {
  if (value === null || value === undefined) return null;
  return value ? "active" : "inactive";
}

function decimalChanged(existing: Prisma.Decimal | null | undefined, nextValue: Prisma.Decimal) {
  return !existing || !existing.equals(nextValue);
}

function annualKey(companyName: string, businessUnit: string) {
  return [normalizeCompanyOwnershipKey(companyName), businessUnit].join("\u0000");
}

function asWorksheetRows(sheet: ExcelJS.Worksheet) {
  const rows: unknown[][] = [];
  const maxColumn = Math.max(sheet.actualColumnCount, sheet.columnCount);

  for (let rowNumber = 1; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values: unknown[] = [];

    for (let columnNumber = 1; columnNumber <= maxColumn; columnNumber += 1) {
      values.push(row.getCell(columnNumber).value);
    }

    rows.push(values);
  }

  return rows;
}

async function parseWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheet = workbook.getWorksheet(PETYR_ANNUAL_FORECAST_IMPORT_SHEET_NAME);
  if (!sheet) {
    return {
      parseResult: null,
      errors: [
        {
          row: 1,
          field: "sheet",
          message: `Workbook must include a "${PETYR_ANNUAL_FORECAST_IMPORT_SHEET_NAME}" sheet.`
        }
      ] satisfies AnnualForecastImportIssue[],
      warnings: [
        {
          field: "sheet",
          message: `Available sheets: ${workbook.worksheets.map((worksheet) => worksheet.name).join(", ")}.`
        }
      ] satisfies AnnualForecastImportIssue[]
    };
  }

  return {
    parseResult: parseAnnualForecastImportRows(asWorksheetRows(sheet)),
    errors: [],
    warnings: []
  };
}

async function canonicalizeCompanies(companies: AnnualForecastImportCompany[]) {
  const ownershipIndex = await getCanonicalCompanyOwnershipIndex();
  const canonicalCompanies: CanonicalImportCompany[] = [];
  const errors: AnnualForecastImportIssue[] = [];

  for (const company of companies) {
    const ownership = resolveCanonicalCompanyOwnership(ownershipIndex, company.companyName);
    if (!ownership) {
      errors.push({
        row: company.sourceRows[0],
        field: "Customer",
        message: `${company.companyName} must exist in Company Ownership before annual forecast values can be imported.`
      });
      continue;
    }

    canonicalCompanies.push({
      ...company,
      canonicalCompanyName: ownership.companyName,
      csmName: ownership.csmName || "Unassigned"
    });
  }

  return { companies: canonicalCompanies, errors, ownershipPairs: ownershipIndex.pairs };
}

async function readExistingAnnualRows(companies: CanonicalImportCompany[], year: number) {
  const existingByKey = new Map<string, ExistingAnnualRow>();
  const companyNames = [...new Set(companies.map((company) => company.canonicalCompanyName))];

  if (companyNames.length === 0) return existingByKey;

  const rows = await prisma.forecastAnnual.findMany({
    where: {
      companyName: { in: companyNames },
      year
    }
  });

  for (const row of rows) {
    existingByKey.set(annualKey(row.companyName, row.businessUnit), row);
  }

  return existingByKey;
}

async function readExistingStatusesByCompanyNames(companyNames: string[]) {
  const existingByCompany = new Map<string, ExistingStatusRow>();
  const uniqueCompanyNames = [...new Set(companyNames)];

  if (uniqueCompanyNames.length === 0) return existingByCompany;

  const rows = await prisma.companyForecastStatus.findMany({
    where: { companyName: { in: uniqueCompanyNames } }
  });

  for (const row of rows) {
    existingByCompany.set(normalizeCompanyOwnershipKey(row.companyName), row);
  }

  return existingByCompany;
}

function prepareChanges(input: {
  companies: CanonicalImportCompany[];
  ownershipPairs: CanonicalCompanyOwnershipPair[];
  existingAnnualRows: Map<string, ExistingAnnualRow>;
  existingStatuses: Map<string, ExistingStatusRow>;
  businessUnitsToImport: PetyrBusinessUnit[];
  markMissingCustomersInactive: boolean;
}) {
  const changes: CompanyChangeSet[] = [];
  const importedBusinessUnitSet = new Set<string>(input.businessUnitsToImport);

  for (const company of input.companies) {
    const forecastChanges: ForecastChange[] = [];

    for (const businessUnit of company.businessUnitsWithValues) {
      const rawValue = company.valuesByBusinessUnit[businessUnit];
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) continue;

      const nextValue = new Prisma.Decimal(rawValue);
      const existing = input.existingAnnualRows.get(annualKey(company.canonicalCompanyName, businessUnit)) ?? null;

      if (decimalChanged(existing?.value, nextValue) || existing?.valueSource !== "manual") {
        forecastChanges.push({
          companyName: company.canonicalCompanyName,
          csmName: company.csmName,
          businessUnit,
          nextValue,
          existing
        });
      }
    }

    for (const [key, existing] of input.existingAnnualRows.entries()) {
      if (!key.startsWith(`${normalizeCompanyOwnershipKey(company.canonicalCompanyName)}\u0000`)) continue;
      const businessUnit = existing.businessUnit as PetyrBusinessUnit;
      if (company.businessUnitsWithValues.includes(businessUnit)) continue;
      if (!importedBusinessUnitSet.has(businessUnit)) continue;

      const nextValue = new Prisma.Decimal(0);
      if (decimalChanged(existing.value, nextValue) || existing.valueSource !== "manual") {
        forecastChanges.push({
          companyName: company.canonicalCompanyName,
          csmName: company.csmName,
          businessUnit,
          nextValue,
          existing
        });
      }
    }

    const existingStatus = input.existingStatuses.get(normalizeCompanyOwnershipKey(company.canonicalCompanyName)) ?? null;
    const shouldSetInactive = company.ongoingTotal === 0;
    const statusChange = shouldSetInactive && existingStatus?.isActive !== false
      ? {
          companyName: company.canonicalCompanyName,
          csmName: company.csmName,
          nextActiveStatus: false,
          existing: existingStatus,
          reason: "zero_ongoing" as const
        }
      : null;

    if (forecastChanges.length > 0 || statusChange) {
      changes.push({ company, forecastChanges, statusChange });
    }
  }

  if (input.markMissingCustomersInactive) {
    const missingCustomers = getMissingAnnualForecastImportCustomers({
      importedCompanyNames: input.companies.map((company) => company.canonicalCompanyName),
      ownershipPairs: input.ownershipPairs,
      inactiveCompanyNames: [...input.existingStatuses.values()]
        .filter((status) => status.isActive === false)
        .map((status) => status.companyName)
    });

    for (const ownership of missingCustomers) {
      const existingStatus = input.existingStatuses.get(normalizeCompanyOwnershipKey(ownership.companyName)) ?? null;
      changes.push({
        company: {
          companyName: ownership.companyName,
          companyReferences: [],
          sourceRows: [],
          ongoingTotal: 0,
          valuesByBusinessUnit: {},
          businessUnitsWithValues: [],
          canonicalCompanyName: ownership.companyName,
          csmName: ownership.csmName || "Unassigned"
        },
        forecastChanges: [],
        statusChange: {
          companyName: ownership.companyName,
          csmName: ownership.csmName || "Unassigned",
          nextActiveStatus: false,
          existing: existingStatus,
          reason: "missing_from_import"
        }
      });
    }
  }

  return changes;
}

function changeIsMissingCustomerInactive(change: CompanyChangeSet) {
  return change.statusChange?.reason === "missing_from_import";
}

function changeSourceNote(changeSet: CompanyChangeSet, fileName?: string) {
  if (changeIsMissingCustomerInactive(changeSet)) {
    return `Marked inactive because Customer was not present in annual forecast workbook${fileName ? ` ${fileName}` : ""}.`;
  }

  return `Imported annual forecast${fileName ? ` from ${fileName}` : ""}. Source rows: ${changeSet.company.sourceRows.join(", ")}.`;
}

async function writeChanges(input: {
  changes: CompanyChangeSet[];
  year: number;
  fileName?: string;
  importedBy: string;
}) {
  let forecastUpserts = 0;
  let activeStatusUpdates = 0;
  let changeLogRows = 0;
  const saveSessionIds: string[] = [];

  await prisma.$transaction(
    async (tx) => {
      for (const changeSet of input.changes) {
        const currentActiveStatus = changeSet.statusChange?.existing?.isActive ?? true;
        const nextActiveStatus = changeSet.statusChange?.nextActiveStatus ?? currentActiveStatus;
        const saveSession = await tx.forecastSaveSession.create({
          data: {
            companyName: changeSet.company.canonicalCompanyName,
            csmName: changeSet.company.csmName,
            source: IMPORT_SOURCE,
            year: input.year,
            month: 0,
            forecastType: "ongoing",
            note: changeSourceNote(changeSet, input.fileName),
            companyActiveStatus: nextActiveStatus,
            createdBy: input.importedBy
          }
        });
        saveSessionIds.push(saveSession.id);

        if (changeSet.statusChange) {
          await tx.companyForecastStatus.upsert({
            where: { companyName: changeSet.statusChange.companyName },
            create: {
              companyName: changeSet.statusChange.companyName,
              isActive: false,
              reason: IMPORT_SOURCE,
              updatedBy: input.importedBy
            },
            update: {
              isActive: false,
              reason: IMPORT_SOURCE,
              updatedBy: input.importedBy
            }
          });
          activeStatusUpdates += 1;

          await tx.forecastChangeLog.create({
            data: {
              saveSessionId: saveSession.id,
              companyName: changeSet.statusChange.companyName,
              businessUnit: COMPANY_FIELD_BUSINESS_UNIT,
              fieldName: "active_status",
              previousValue: statusLogValue(changeSet.statusChange.existing?.isActive ?? true),
              newValue: "inactive",
              createdBy: input.importedBy
            }
          });
          changeLogRows += 1;
        }

        for (const forecastChange of changeSet.forecastChanges) {
          await tx.forecastAnnual.upsert({
            where: {
              companyName_businessUnit_year: {
                companyName: forecastChange.companyName,
                businessUnit: forecastChange.businessUnit,
                year: input.year
              }
            },
            create: {
              companyName: forecastChange.companyName,
              csmName: forecastChange.csmName,
              businessUnit: forecastChange.businessUnit,
              year: input.year,
              value: forecastChange.nextValue,
              valueSource: "manual",
              status: "draft",
              note: null,
              createdBy: input.importedBy,
              updatedBy: input.importedBy
            },
            update: {
              csmName: forecastChange.csmName,
              value: forecastChange.nextValue,
              valueSource: "manual",
              status: "draft",
              updatedBy: input.importedBy
            }
          });
          forecastUpserts += 1;

          await tx.forecastChangeLog.create({
            data: {
              saveSessionId: saveSession.id,
              companyName: forecastChange.companyName,
              businessUnit: forecastChange.businessUnit,
              fieldName: "annual_forecast",
              previousValue: formatForecastLogValue(forecastChange.existing?.value, forecastChange.existing?.valueSource),
              newValue: formatForecastLogValue(forecastChange.nextValue, "manual"),
              aiForecastValueAtSave: forecastChange.existing?.aiForecastValue ?? null,
              createdBy: input.importedBy
            }
          });
          changeLogRows += 1;
        }
      }
    },
    { maxWait: 10000, timeout: 120000 }
  );

  return {
    forecastUpserts,
    activeStatusUpdates,
    changeLogRows,
    saveSessionIds
  };
}

function buildResult(input: {
  ok: boolean;
  dryRun: boolean;
  source?: string;
  fileName?: string;
  year: number;
  totalRows: number;
  importableRows: number;
  changedRows: number;
  unchangedRows: number;
  importedRows: number;
  skippedRows: number;
  forecastUpserts: number;
  activeStatusUpdates: number;
  missingCustomerInactiveUpdates: number;
  changeLogRows: number;
  saveSessionIds?: string[];
  startedAt: number;
  message?: string;
  errors?: AnnualForecastImportIssue[];
  warnings?: AnnualForecastImportIssue[];
  duplicateCustomers?: Array<{ customerName: string; rows: number[] }>;
  preview?: AnnualForecastExcelImportResult["preview"];
}): AnnualForecastExcelImportResult {
  return {
    ok: input.ok,
    dryRun: input.dryRun,
    source: input.source ?? IMPORT_SOURCE,
    fileName: input.fileName,
    year: input.year,
    totalRows: input.totalRows,
    importableRows: input.importableRows,
    changedRows: input.changedRows,
    unchangedRows: input.unchangedRows,
    importedRows: input.importedRows,
    skippedRows: input.skippedRows,
    forecastUpserts: input.forecastUpserts,
    activeStatusUpdates: input.activeStatusUpdates,
    missingCustomerInactiveUpdates: input.missingCustomerInactiveUpdates,
    changeLogRows: input.changeLogRows,
    saveSessionIds: input.saveSessionIds ?? [],
    durationMs: Date.now() - input.startedAt,
    message: input.message,
    errors: input.errors ?? [],
    warnings: input.warnings ?? [],
    duplicateCustomers: input.duplicateCustomers ?? [],
    preview: input.preview ?? []
  };
}

export async function importAnnualForecastWorkbookXlsx(
  buffer: Buffer,
  options: {
    fileName?: string;
    year: number;
    dryRun: boolean;
    markMissingCustomersInactive?: boolean;
    importedBy?: string | null;
  }
): Promise<AnnualForecastExcelImportResult> {
  const startedAt = Date.now();
  const finishPerformance = startPetyrPerformanceTimer("importAnnualForecastWorkbookXlsx", {
    year: options.year,
    dryRun: options.dryRun,
    markMissingCustomersInactive: options.markMissingCustomersInactive ?? false
  });
  const importedBy = options.importedBy?.trim() || IMPORT_USER_FALLBACK;

  try {
    const parsedWorkbook = await parseWorkbook(buffer);
    if (!parsedWorkbook.parseResult) {
      const result = buildResult({
        ok: false,
        dryRun: options.dryRun,
        fileName: options.fileName,
        year: options.year,
        totalRows: 0,
        importableRows: 0,
        changedRows: 0,
        unchangedRows: 0,
        importedRows: 0,
        skippedRows: 0,
        forecastUpserts: 0,
        activeStatusUpdates: 0,
        missingCustomerInactiveUpdates: 0,
        changeLogRows: 0,
        startedAt,
        errors: parsedWorkbook.errors,
        warnings: parsedWorkbook.warnings
      });
      finishPerformance({ status: "failed", rowCount: result.totalRows, errors: result.errors.length });
      return result;
    }

    const parseResult = parsedWorkbook.parseResult;
    const warnings = [...parsedWorkbook.warnings, ...parseResult.warnings];

    if (!parseResult.ok) {
      const result = buildResult({
        ok: false,
        dryRun: options.dryRun,
        fileName: options.fileName,
        year: options.year,
        totalRows: parseResult.totalRows,
        importableRows: parseResult.importableRows,
        changedRows: 0,
        unchangedRows: 0,
        importedRows: 0,
        skippedRows: parseResult.totalRows,
        forecastUpserts: 0,
        activeStatusUpdates: 0,
        missingCustomerInactiveUpdates: 0,
        changeLogRows: 0,
        startedAt,
        errors: parseResult.errors,
        warnings,
        duplicateCustomers: parseResult.duplicateCustomers
      });
      finishPerformance({ status: "failed", rowCount: result.totalRows, errors: result.errors.length });
      return result;
    }

    let canonicalized: Awaited<ReturnType<typeof canonicalizeCompanies>>;
    try {
      canonicalized = await canonicalizeCompanies(parseResult.companies);
    } catch (error) {
      if (!(error instanceof PetyrCompanyOwnershipError)) throw error;

      const result = buildResult({
        ok: false,
        dryRun: options.dryRun,
        fileName: options.fileName,
        year: options.year,
        totalRows: parseResult.totalRows,
        importableRows: parseResult.importableRows,
        changedRows: 0,
        unchangedRows: 0,
        importedRows: 0,
        skippedRows: parseResult.totalRows,
        forecastUpserts: 0,
        activeStatusUpdates: 0,
        missingCustomerInactiveUpdates: 0,
        changeLogRows: 0,
        startedAt,
        errors: [{ row: 1, field: "company_ownership", message: error.message }],
        warnings,
        duplicateCustomers: parseResult.duplicateCustomers
      });
      finishPerformance({ status: "failed", rowCount: result.totalRows, errors: result.errors.length });
      return result;
    }

    if (canonicalized.errors.length > 0) {
      const result = buildResult({
        ok: false,
        dryRun: options.dryRun,
        fileName: options.fileName,
        year: options.year,
        totalRows: parseResult.totalRows,
        importableRows: parseResult.importableRows,
        changedRows: 0,
        unchangedRows: 0,
        importedRows: 0,
        skippedRows: parseResult.totalRows,
        forecastUpserts: 0,
        activeStatusUpdates: 0,
        missingCustomerInactiveUpdates: 0,
        changeLogRows: 0,
        startedAt,
        errors: canonicalized.errors,
        warnings,
        duplicateCustomers: parseResult.duplicateCustomers
      });
      finishPerformance({ status: "failed", rowCount: result.totalRows, errors: result.errors.length });
      return result;
    }

    const statusCompanyNames = options.markMissingCustomersInactive
      ? canonicalized.ownershipPairs.map((pair) => pair.companyName)
      : canonicalized.companies.map((company) => company.canonicalCompanyName);
    const [existingAnnualRows, existingStatuses] = await Promise.all([
      readExistingAnnualRows(canonicalized.companies, options.year),
      readExistingStatusesByCompanyNames(statusCompanyNames)
    ]);
    const changes = prepareChanges({
      companies: canonicalized.companies,
      ownershipPairs: canonicalized.ownershipPairs,
      existingAnnualRows,
      existingStatuses,
      businessUnitsToImport: parseResult.businessUnits,
      markMissingCustomersInactive: options.markMissingCustomersInactive ?? false
    });
    const workbookChanges = changes.filter((change) => !changeIsMissingCustomerInactive(change));
    const missingCustomerInactiveUpdates = changes.filter(changeIsMissingCustomerInactive).length;
    const unchangedRows = canonicalized.companies.length - workbookChanges.length;
    const preview = changes.slice(0, 20).map((change) => ({
      companyName: change.company.canonicalCompanyName,
      csmName: change.company.csmName,
      ongoingTotal: change.company.ongoingTotal,
      forecastChanges: change.forecastChanges.length,
      activeStatusChange: Boolean(change.statusChange),
      missingFromImport: changeIsMissingCustomerInactive(change),
      sourceRows: change.company.sourceRows
    }));

    if (changes.length === 0) {
      const result = buildResult({
        ok: true,
        dryRun: options.dryRun,
        fileName: options.fileName,
        year: options.year,
        totalRows: parseResult.totalRows,
        importableRows: canonicalized.companies.length,
        changedRows: 0,
        unchangedRows,
        importedRows: 0,
        skippedRows: parseResult.totalRows - canonicalized.companies.length,
        forecastUpserts: 0,
        activeStatusUpdates: 0,
        missingCustomerInactiveUpdates,
        changeLogRows: 0,
        startedAt,
        message: "No changes detected. Nothing was imported.",
        warnings,
        duplicateCustomers: parseResult.duplicateCustomers,
        preview
      });
      finishPerformance({ status: "success", rowCount: result.totalRows, changedRows: 0, importedRows: 0 });
      return result;
    }

    if (options.dryRun) {
      const forecastUpserts = changes.reduce((sum, change) => sum + change.forecastChanges.length, 0);
      const activeStatusUpdates = changes.filter((change) => change.statusChange).length;
      const result = buildResult({
        ok: true,
        dryRun: true,
        fileName: options.fileName,
        year: options.year,
        totalRows: parseResult.totalRows,
        importableRows: canonicalized.companies.length,
        changedRows: changes.length,
        unchangedRows,
        importedRows: 0,
        skippedRows: parseResult.totalRows - canonicalized.companies.length,
        forecastUpserts,
        activeStatusUpdates,
        missingCustomerInactiveUpdates,
        changeLogRows: forecastUpserts + activeStatusUpdates,
        startedAt,
        message: `Dry run found ${changes.length} Customer change(s).`,
        warnings,
        duplicateCustomers: parseResult.duplicateCustomers,
        preview
      });
      finishPerformance({
        status: "success",
        rowCount: result.totalRows,
        changedRows: result.changedRows,
        forecastUpserts,
        activeStatusUpdates
      });
      return result;
    }

    const written = await writeChanges({
      changes,
      year: options.year,
      fileName: options.fileName,
      importedBy
    });
    invalidateForecastEntryReadCache((key) => key.startsWith("annual:") || key.startsWith("overview:"));

    const result = buildResult({
      ok: true,
      dryRun: false,
      fileName: options.fileName,
      year: options.year,
      totalRows: parseResult.totalRows,
      importableRows: canonicalized.companies.length,
      changedRows: changes.length,
      unchangedRows,
      importedRows: changes.length,
      skippedRows: parseResult.totalRows - canonicalized.companies.length,
      forecastUpserts: written.forecastUpserts,
      activeStatusUpdates: written.activeStatusUpdates,
      missingCustomerInactiveUpdates,
      changeLogRows: written.changeLogRows,
      saveSessionIds: written.saveSessionIds,
      startedAt,
      message: `Imported ${changes.length} annual forecast Customer change(s).`,
      warnings,
      duplicateCustomers: parseResult.duplicateCustomers,
      preview
    });
    finishPerformance({
      status: "success",
      rowCount: result.totalRows,
      changedRows: result.changedRows,
      importedRows: result.importedRows,
      forecastUpserts: result.forecastUpserts,
      activeStatusUpdates: result.activeStatusUpdates
    });
    return result;
  } catch (error) {
    finishPerformance({ status: "failed" });
    throw error;
  }
}
