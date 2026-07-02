export const PETYR_BUSINESS_UNITS = [
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
] as const;

export type PetyrBusinessUnit = (typeof PETYR_BUSINESS_UNITS)[number];

export const PETYR_FORECAST_INTELLIGENCE_CACHE_BUSINESS_UNIT = "__forecast_intelligence__";
export const PETYR_FORECAST_INTELLIGENCE_CACHE_MONTH = 0;

export const FORECAST_TYPES = ["previous_month", "ongoing"] as const;
export type ForecastType = (typeof FORECAST_TYPES)[number];

export type PetyrBusinessUnitNormalizationReason = "official" | "missing" | "unknown" | "unofficial";

export type PetyrBusinessUnitNormalization = {
  originalValue: string;
  businessUnit: PetyrBusinessUnit;
  reason: PetyrBusinessUnitNormalizationReason;
  mappedToOtherFallback: boolean;
};

export function normalizePetyrBusinessUnitKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const PETYR_BUSINESS_UNIT_BY_KEY: Map<string, PetyrBusinessUnit> = new Map(
  PETYR_BUSINESS_UNITS.map((businessUnit): [string, PetyrBusinessUnit] => [
    normalizePetyrBusinessUnitKey(businessUnit),
    businessUnit
  ])
);

export function normalizePetyrBusinessUnit(value: string | null | undefined): PetyrBusinessUnitNormalization {
  const originalValue = typeof value === "string" ? value.trim() : "";

  if (!originalValue) {
    return {
      originalValue,
      businessUnit: "Other",
      reason: "missing",
      mappedToOtherFallback: true
    };
  }

  const key = normalizePetyrBusinessUnitKey(originalValue);
  const officialBusinessUnit = PETYR_BUSINESS_UNIT_BY_KEY.get(key);

  if (officialBusinessUnit) {
    return {
      originalValue,
      businessUnit: officialBusinessUnit,
      reason: "official",
      mappedToOtherFallback: false
    };
  }

  if (key === "unknown") {
    return {
      originalValue,
      businessUnit: "Other",
      reason: "unknown",
      mappedToOtherFallback: true
    };
  }

  return {
    originalValue,
    businessUnit: "Other",
    reason: "unofficial",
    mappedToOtherFallback: true
  };
}
