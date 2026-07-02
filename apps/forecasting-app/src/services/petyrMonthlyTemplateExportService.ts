import { PETYR_BUSINESS_UNITS } from "@/lib/petyr/constants";
import { prisma } from "@/lib/db";
import {
  getCanonicalCompanyOwnershipPairs,
  normalizeCompanyOwnershipKey
} from "@/services/petyrCompanyOwnershipService";

const CSV_COLUMNS = [
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

function formatCsvCell(value: string | number) {
  const rawValue = String(value);

  if (!/[",\r\n]/.test(rawValue)) return rawValue;

  return `"${rawValue.replace(/"/g, '""')}"`;
}

function buildCsvLine(values: Array<string | number>) {
  return values.map(formatCsvCell).join(",");
}

function activeStatusForExport(value: boolean | null | undefined) {
  if (value === true) return "active";
  if (value === false) return "inactive";
  return "";
}

export async function buildMonthlyForecastTemplateCsv(year: number) {
  const pairs = await getCanonicalCompanyOwnershipPairs();
  const statuses =
    pairs.length === 0
      ? []
      : await prisma.companyForecastStatus.findMany({
          where: { companyName: { in: pairs.map((pair) => pair.companyName) } }
        });
  const statusByCompany = new Map(
    statuses.map((status) => [normalizeCompanyOwnershipKey(status.companyName), activeStatusForExport(status.isActive)])
  );
  const lines = [buildCsvLine([...CSV_COLUMNS])];

  for (const pair of pairs) {
    const companyActiveStatus = statusByCompany.get(normalizeCompanyOwnershipKey(pair.companyName)) ?? "";

    for (const businessUnit of PETYR_BUSINESS_UNITS) {
      for (let month = 1; month <= 12; month += 1) {
        lines.push(
          buildCsvLine([
            pair.companyName,
            pair.csmName,
            businessUnit,
            year,
            month,
            "",
            "",
            companyActiveStatus,
            ""
          ])
        );
      }
    }
  }

  return lines.join("\r\n") + "\r\n";
}
