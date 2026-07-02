export const PETYR_NUMERIC_AI_FORECAST_CACHE_SELECTED_COLUMNS = [
  "id",
  "companyName",
  "businessUnit",
  "year",
  "month",
  "forecastValue",
  "confidenceScore",
  "modelVersion",
  "generatedAt"
] as const;

export const PETYR_NUMERIC_AI_FORECAST_CACHE_EXCLUDED_COLUMNS = [
  "explanation",
  "requestPayloadSummary",
  "validatedOutput",
  "errorMessage"
] as const;

export type PetyrNumericAiForecastCacheReadModelRow = {
  id: string;
  companyName: string;
  businessUnit: string;
  year: number;
  month: number;
  forecastValue: unknown;
  confidenceScore: unknown | null;
  modelVersion: string;
  generatedAt: Date;
};

export function selectLatestNumericAiForecastCacheRows<T extends PetyrNumericAiForecastCacheReadModelRow>(
  rows: T[],
  limit = 50000
): PetyrNumericAiForecastCacheReadModelRow[] {
  const latestByKey = new Map<string, PetyrNumericAiForecastCacheReadModelRow>();

  for (const row of rows) {
    const key = [row.companyName.trim().toLowerCase(), row.businessUnit.trim().toLowerCase(), row.year, row.month].join("\u0000");
    const existing = latestByKey.get(key);

    if (!existing || row.generatedAt.getTime() > existing.generatedAt.getTime()) {
      latestByKey.set(key, {
        id: row.id,
        companyName: row.companyName,
        businessUnit: row.businessUnit,
        year: row.year,
        month: row.month,
        forecastValue: row.forecastValue,
        confidenceScore: row.confidenceScore,
        modelVersion: row.modelVersion,
        generatedAt: row.generatedAt
      });
    }
  }

  return [...latestByKey.values()]
    .sort((left, right) => right.generatedAt.getTime() - left.generatedAt.getTime() || right.id.localeCompare(left.id))
    .slice(0, limit);
}
