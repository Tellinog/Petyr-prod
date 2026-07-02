import {
  getAnnualForecastEntryYearOptions,
  isValidAnnualForecastEntryYear
} from "../lib/petyr/annualForecastEntryRules";
import { invalidateForecastEntryReadCache } from "./forecastEntryReadCache";

export const PETYR_INITIAL_FORECAST_WINDOW_OVERRIDES_SETTING_KEY = "petyr_initial_forecast_window_overrides_v1";
export const PETYR_INITIAL_FORECAST_WINDOW_OVERRIDES_SCHEMA_VERSION = "petyr_initial_forecast_window_overrides_v1";

export type PetyrInitialForecastWindowOverrides = {
  schemaVersion: typeof PETYR_INITIAL_FORECAST_WINDOW_OVERRIDES_SCHEMA_VERSION;
  unlockedYears: number[];
  updatedBy: string;
  updatedAt: string | null;
};

export type PetyrInitialForecastWindowOverridesResolution = {
  overrides: PetyrInitialForecastWindowOverrides;
  diagnostics: string[];
};

export class PetyrInitialForecastWindowOverrideValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PetyrInitialForecastWindowOverrideValidationError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeYear(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeUnlockedYears(value: unknown, currentDate = new Date()) {
  if (!Array.isArray(value)) {
    throw new PetyrInitialForecastWindowOverrideValidationError("unlockedYears must be an array.");
  }

  const years: number[] = [];
  for (const rawYear of value) {
    const year = normalizeYear(rawYear);
    if (year === null || !isValidAnnualForecastEntryYear(year, currentDate)) {
      throw new PetyrInitialForecastWindowOverrideValidationError(
        `Unlocked Forecast Initial years must be one of: ${getAnnualForecastEntryYearOptions(currentDate).join(", ")}.`
      );
    }
    if (!years.includes(year)) years.push(year);
  }

  return years.sort((left, right) => left - right);
}

export function getDefaultPetyrInitialForecastWindowOverrides(): PetyrInitialForecastWindowOverrides {
  return {
    schemaVersion: PETYR_INITIAL_FORECAST_WINDOW_OVERRIDES_SCHEMA_VERSION,
    unlockedYears: [],
    updatedBy: "default",
    updatedAt: null
  };
}

export function parsePetyrInitialForecastWindowOverrides(
  settingValue: string | null | undefined,
  updatedAt: Date | null = null,
  currentDate = new Date()
): PetyrInitialForecastWindowOverrides {
  if (!settingValue?.trim()) return getDefaultPetyrInitialForecastWindowOverrides();

  const parsed = JSON.parse(settingValue) as unknown;
  const record = asRecord(parsed);
  if (!record) {
    throw new PetyrInitialForecastWindowOverrideValidationError("Forecast Initial window override setting must be an object.");
  }

  return {
    schemaVersion: PETYR_INITIAL_FORECAST_WINDOW_OVERRIDES_SCHEMA_VERSION,
    unlockedYears: normalizeUnlockedYears(record.unlockedYears, currentDate),
    updatedBy: typeof record.updatedBy === "string" && record.updatedBy.trim() ? record.updatedBy.trim() : "petyr-admin",
    updatedAt: updatedAt?.toISOString() ?? null
  };
}

export function isInitialForecastYearAdminUnlocked(
  overrides: Pick<PetyrInitialForecastWindowOverrides, "unlockedYears">,
  year: number
) {
  return overrides.unlockedYears.includes(year);
}

function overrideReadDiagnostic(error: unknown) {
  const detail = error instanceof Error && error.message ? " " + error.message : "";
  return "Unable to read Forecast Initial admin window overrides from app_setting; using the default December 10-January 10 window." + detail;
}

export async function getPetyrInitialForecastWindowOverridesWithDiagnostics(): Promise<PetyrInitialForecastWindowOverridesResolution> {
  try {
    const { prisma } = await import("../lib/db");
    const setting = await prisma.appSetting.findUnique({
      where: { settingKey: PETYR_INITIAL_FORECAST_WINDOW_OVERRIDES_SETTING_KEY }
    });

    return {
      overrides: parsePetyrInitialForecastWindowOverrides(setting?.settingValue, setting?.updatedAt ?? null),
      diagnostics: []
    };
  } catch (error) {
    return {
      overrides: getDefaultPetyrInitialForecastWindowOverrides(),
      diagnostics: [overrideReadDiagnostic(error)]
    };
  }
}

export async function getPetyrInitialForecastWindowOverrides() {
  const { prisma } = await import("../lib/db");
  const setting = await prisma.appSetting.findUnique({
    where: { settingKey: PETYR_INITIAL_FORECAST_WINDOW_OVERRIDES_SETTING_KEY }
  });

  return parsePetyrInitialForecastWindowOverrides(setting?.settingValue, setting?.updatedAt ?? null);
}

export async function updatePetyrInitialForecastWindowOverride(input: {
  year: unknown;
  unlocked: unknown;
  updatedBy?: unknown;
}) {
  const year = normalizeYear(input.year);
  if (year === null || !isValidAnnualForecastEntryYear(year)) {
    throw new PetyrInitialForecastWindowOverrideValidationError(
      `Forecast Initial window year must be one of: ${getAnnualForecastEntryYearOptions().join(", ")}.`
    );
  }

  const current = (await getPetyrInitialForecastWindowOverridesWithDiagnostics()).overrides;
  const unlockedYears = input.unlocked === true
    ? [...new Set([...current.unlockedYears, year])].sort((left, right) => left - right)
    : current.unlockedYears.filter((unlockedYear) => unlockedYear !== year);

  const payload = {
    schemaVersion: PETYR_INITIAL_FORECAST_WINDOW_OVERRIDES_SCHEMA_VERSION,
    unlockedYears,
    updatedBy: typeof input.updatedBy === "string" && input.updatedBy.trim() ? input.updatedBy.trim() : "petyr-admin",
    updatedAt: null
  };

  const { prisma } = await import("../lib/db");
  const setting = await prisma.appSetting.upsert({
    where: { settingKey: PETYR_INITIAL_FORECAST_WINDOW_OVERRIDES_SETTING_KEY },
    create: {
      settingKey: PETYR_INITIAL_FORECAST_WINDOW_OVERRIDES_SETTING_KEY,
      settingValue: JSON.stringify(payload)
    },
    update: {
      settingValue: JSON.stringify(payload)
    }
  });

  invalidateForecastEntryReadCache((key) => key.startsWith("annual:") || key.startsWith("overview:"));

  return parsePetyrInitialForecastWindowOverrides(setting.settingValue, setting.updatedAt);
}
