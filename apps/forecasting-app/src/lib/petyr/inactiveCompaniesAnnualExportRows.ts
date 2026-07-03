import { PETYR_BUSINESS_UNITS, normalizePetyrBusinessUnit, type PetyrBusinessUnit } from "./constants";

export type InactiveStatusInput = {
  companyName: string;
  reason?: string | null;
  updatedAt?: Date | string | null;
};

export type AnnualForecastInput = {
  companyName: string;
  csmName?: string | null;
  businessUnit: string;
  value: number | string | { toString(): string } | null;
};

export type InactiveCompanyAnnualForecastExportRow = {
  companyName: string;
  csmName: string;
  status: "inactive";
  statusReason: string;
  statusUpdatedAt: Date | null;
  totalRevenue: number;
  valuesByBusinessUnit: Record<PetyrBusinessUnit, number>;
};

function normalizeCompanyKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function decimalLikeToNumber(value: AnnualForecastInput["value"]) {
  if (value === null || value === undefined) return 0;

  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyBusinessUnitValues(): Record<PetyrBusinessUnit, number> {
  return Object.fromEntries(PETYR_BUSINESS_UNITS.map((businessUnit) => [businessUnit, 0])) as Record<PetyrBusinessUnit, number>;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildInactiveCompaniesAnnualForecastRows(input: {
  inactiveStatuses: InactiveStatusInput[];
  annualForecasts: AnnualForecastInput[];
}): InactiveCompanyAnnualForecastExportRow[] {
  const rowsByCompany = new Map<string, InactiveCompanyAnnualForecastExportRow>();

  for (const status of input.inactiveStatuses) {
    const companyName = status.companyName.trim();
    if (!companyName) continue;

    rowsByCompany.set(normalizeCompanyKey(companyName), {
      companyName,
      csmName: "",
      status: "inactive",
      statusReason: status.reason?.trim() ?? "",
      statusUpdatedAt: status.updatedAt ? new Date(status.updatedAt) : null,
      totalRevenue: 0,
      valuesByBusinessUnit: emptyBusinessUnitValues()
    });
  }

  for (const forecast of input.annualForecasts) {
    const row = rowsByCompany.get(normalizeCompanyKey(forecast.companyName));
    if (!row) continue;

    const businessUnit = normalizePetyrBusinessUnit(forecast.businessUnit).businessUnit;
    const value = decimalLikeToNumber(forecast.value);

    row.valuesByBusinessUnit[businessUnit] = roundMoney(row.valuesByBusinessUnit[businessUnit] + value);
    row.totalRevenue = roundMoney(row.totalRevenue + value);

    const csmName = forecast.csmName?.trim();
    if (!row.csmName && csmName) row.csmName = csmName;
  }

  return [...rowsByCompany.values()].sort((left, right) => left.companyName.localeCompare(right.companyName));
}
