import { type PetyrBusinessUnit } from "./constants";

export const PETYR_ANNUAL_FORECAST_IMPORT_SHEET_NAME = "ITA_Andamento lavorato VS Forec";

const COMPANY_HEADER = "company";
const CUSTOMER_HEADER = "customer";
const FORECAST_ONGOING_HEADER = "forecastongoing";

const ONGOING_BUSINESS_UNIT_HEADERS = new Map<string, PetyrBusinessUnit>([
  ["qa", "QA"],
  ["ux", "Experience"],
  ["accessibility", "Accessibility"],
  ["security", "Security"],
  ["fte", "FTE"],
  ["ta", "TA"],
  ["ai", "AI"],
  ["other", "Other"]
]);

export type AnnualForecastImportIssue = {
  row?: number;
  field?: string;
  message: string;
};

export type AnnualForecastImportDuplicateCustomer = {
  customerName: string;
  rows: number[];
};

export type AnnualForecastImportCompany = {
  companyName: string;
  companyReferences: string[];
  sourceRows: number[];
  ongoingTotal: number;
  valuesByBusinessUnit: Partial<Record<PetyrBusinessUnit, number>>;
  businessUnitsWithValues: PetyrBusinessUnit[];
};

export type AnnualForecastImportParseResult = {
  ok: boolean;
  totalRows: number;
  importableRows: number;
  businessUnits: PetyrBusinessUnit[];
  companies: AnnualForecastImportCompany[];
  duplicateCustomers: AnnualForecastImportDuplicateCustomer[];
  errors: AnnualForecastImportIssue[];
  warnings: AnnualForecastImportIssue[];
};

type HeaderInfo = {
  customerColumn: number;
  companyColumn: number | null;
  ongoingTotalColumn: number;
  businessUnitColumns: Array<{ column: number; businessUnit: PetyrBusinessUnit; label: string }>;
};

type AggregatedCompany = {
  companyName: string;
  companyKey: string;
  companyReferences: Set<string>;
  sourceRows: number[];
  ongoingTotal: number;
  valuesByBusinessUnit: Map<PetyrBusinessUnit, number>;
};

function normalizeHeader(value: unknown) {
  return cellText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeCompanyKey(value: string) {
  return value.trim().toLowerCase();
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function cellText(value: unknown): string {
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
    return value.richText.map((item: { text?: string }) => item.text ?? "").join("").trim();
  }

  return "";
}

function parseMoney(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = cellText(value);
  if (!text) return null;

  let normalized = text.replace(/\s+/g, "").replace(/EUR|\u20ac/gi, "");

  if (/^-?\d+,\d+$/.test(normalized)) {
    normalized = normalized.replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  } else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasCellValue(value: unknown) {
  return cellText(value) !== "";
}

function findHeaderInfo(headerRow: unknown[]): { header: HeaderInfo | null; errors: AnnualForecastImportIssue[] } {
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const companyColumn = normalizedHeaders.indexOf(COMPANY_HEADER);
  const customerColumn = normalizedHeaders.indexOf(CUSTOMER_HEADER);
  const ongoingTotalColumn = normalizedHeaders.indexOf(FORECAST_ONGOING_HEADER);
  const errors: AnnualForecastImportIssue[] = [];

  if (customerColumn < 0) {
    errors.push({ row: 1, field: "Customer", message: 'Missing required "Customer" column.' });
  }

  if (ongoingTotalColumn < 0) {
    errors.push({ row: 1, field: "FORECAST ONGOING", message: 'Missing required "FORECAST ONGOING" column.' });
  }

  if (errors.length > 0) {
    return { header: null, errors };
  }

  const businessUnitColumns: HeaderInfo["businessUnitColumns"] = [];
  const seenBusinessUnits = new Set<PetyrBusinessUnit>();

  for (let column = ongoingTotalColumn + 1; column < normalizedHeaders.length; column += 1) {
    const businessUnit = ONGOING_BUSINESS_UNIT_HEADERS.get(normalizedHeaders[column]);
    if (!businessUnit) continue;
    if (seenBusinessUnits.has(businessUnit)) {
      errors.push({
        row: 1,
        field: cellText(headerRow[column]) || `Column ${column + 1}`,
        message: `Duplicate mapped Business Unit column for ${businessUnit}.`
      });
      continue;
    }

    seenBusinessUnits.add(businessUnit);
    businessUnitColumns.push({
      column,
      businessUnit,
      label: cellText(headerRow[column])
    });
  }

  if (businessUnitColumns.length === 0) {
    errors.push({
      row: 1,
      field: "Business Units",
      message: "No supported Business Unit columns were found after FORECAST ONGOING."
    });
  }

  return {
    header: {
      customerColumn,
      companyColumn: companyColumn >= 0 ? companyColumn : null,
      ongoingTotalColumn,
      businessUnitColumns
    },
    errors
  };
}

function rowHasImportableValue(row: unknown[], header: HeaderInfo) {
  if (parseMoney(row[header.ongoingTotalColumn]) !== null) return true;

  return header.businessUnitColumns.some(({ column }) => hasCellValue(row[column]));
}

function toCompanyOutput(company: AggregatedCompany): AnnualForecastImportCompany {
  const valuesByBusinessUnit: Partial<Record<PetyrBusinessUnit, number>> = {};
  const businessUnitsWithValues: PetyrBusinessUnit[] = [];

  for (const [businessUnit, value] of company.valuesByBusinessUnit.entries()) {
    valuesByBusinessUnit[businessUnit] = roundMoney(value);
    businessUnitsWithValues.push(businessUnit);
  }

  return {
    companyName: company.companyName,
    companyReferences: [...company.companyReferences].sort((left, right) => left.localeCompare(right)),
    sourceRows: company.sourceRows,
    ongoingTotal: roundMoney(company.ongoingTotal),
    valuesByBusinessUnit,
    businessUnitsWithValues
  };
}

export function parseAnnualForecastImportRows(rows: unknown[][]): AnnualForecastImportParseResult {
  const headerRow = rows[0] ?? [];
  const { header, errors } = findHeaderInfo(headerRow);
  const warnings: AnnualForecastImportIssue[] = [];
  const aggregated = new Map<string, AggregatedCompany>();
  let totalRows = 0;

  if (!header) {
    return {
      ok: false,
      totalRows: Math.max(rows.length - 1, 0),
      importableRows: 0,
      businessUnits: [],
      companies: [],
      duplicateCustomers: [],
      errors,
      warnings
    };
  }

  const importBusinessUnits = header.businessUnitColumns.map((column) => column.businessUnit);

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const rowNumber = index + 1;
    const hasAnyValue = row.some(hasCellValue);

    if (!hasAnyValue) continue;
    totalRows += 1;

    if (!rowHasImportableValue(row, header)) continue;

    const companyName = cellText(row[header.customerColumn]);
    if (!companyName) {
      errors.push({
        row: rowNumber,
        field: "Customer",
        message: "Customer is required when Forecast Ongoing or Business Unit values are present."
      });
      continue;
    }

    const companyKey = normalizeCompanyKey(companyName);
    const company = aggregated.get(companyKey) ?? {
      companyName,
      companyKey,
      companyReferences: new Set<string>(),
      sourceRows: [],
      ongoingTotal: 0,
      valuesByBusinessUnit: new Map<PetyrBusinessUnit, number>()
    };
    const companyReference = header.companyColumn === null ? "" : cellText(row[header.companyColumn]);
    const ongoingTotal = parseMoney(row[header.ongoingTotalColumn]);

    company.sourceRows.push(rowNumber);
    if (companyReference) company.companyReferences.add(companyReference);
    if (ongoingTotal !== null) company.ongoingTotal += ongoingTotal;

    for (const { column, businessUnit, label } of header.businessUnitColumns) {
      const rawValue = row[column];
      if (!hasCellValue(rawValue)) continue;

      const parsed = parseMoney(rawValue);
      if (parsed === null || parsed < 0) {
        errors.push({
          row: rowNumber,
          field: label,
          message: `${label} must be numeric and greater than or equal to 0 when provided.`
        });
        continue;
      }

      company.valuesByBusinessUnit.set(businessUnit, (company.valuesByBusinessUnit.get(businessUnit) ?? 0) + parsed);
    }

    aggregated.set(companyKey, company);
  }

  const duplicateCustomers = [...aggregated.values()]
    .filter((company) => company.sourceRows.length > 1)
    .map((company) => ({
      customerName: company.companyName,
      rows: company.sourceRows
    }))
    .sort((left, right) => left.customerName.localeCompare(right.customerName));

  if (duplicateCustomers.length > 0) {
    warnings.push({
      field: "Customer",
      message: `${duplicateCustomers.length} duplicate Customer group(s) were aggregated before import.`
    });
  }

  return {
    ok: errors.length === 0,
    totalRows,
    importableRows: aggregated.size,
    businessUnits: importBusinessUnits,
    companies: [...aggregated.values()].map(toCompanyOutput).sort((left, right) => left.companyName.localeCompare(right.companyName)),
    duplicateCustomers,
    errors,
    warnings
  };
}
