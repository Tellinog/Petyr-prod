export const PETYR_AI_FORECAST_BASELINE_WEIGHTS_SETTING_KEY = "petyr_ai_forecast_baseline_weights_v1";
export const PETYR_AI_FORECAST_BASELINE_WEIGHTS_SCHEMA_VERSION = "petyr_ai_forecast_baseline_weights_v1";

export type PetyrAiForecastBaselineWeights = {
  schemaVersion: typeof PETYR_AI_FORECAST_BASELINE_WEIGHTS_SCHEMA_VERSION;
  enabled: boolean;
  historicalWeightedBaseline: number;
  monthlySeasonality: number;
  runRate: number;
  updatedBy: string;
  updatedAt: string | null;
};

export type PetyrAiForecastBaselineWeightsResolution = {
  weights: PetyrAiForecastBaselineWeights;
  diagnostics: string[];
};

export class PetyrAiForecastWeightsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PetyrAiForecastWeightsValidationError";
  }
}

export function getDefaultPetyrAiForecastBaselineWeights(): PetyrAiForecastBaselineWeights {
  return {
    schemaVersion: PETYR_AI_FORECAST_BASELINE_WEIGHTS_SCHEMA_VERSION,
    enabled: false,
    historicalWeightedBaseline: 0,
    monthlySeasonality: 0,
    runRate: 0,
    updatedBy: "default",
    updatedAt: null
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readInteger(value: unknown, fieldName: string) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new PetyrAiForecastWeightsValidationError(`${fieldName} must be an integer from 0 to 100.`);
  }

  return parsed;
}

function normalizeWeightsPayload(payload: unknown, updatedAt: string | null): PetyrAiForecastBaselineWeights {
  const record = asRecord(payload);
  if (!record) throw new PetyrAiForecastWeightsValidationError("Weights payload must be an object.");

  const historicalWeightedBaseline = readInteger(record.historicalWeightedBaseline, "historicalWeightedBaseline");
  const monthlySeasonality = readInteger(record.monthlySeasonality, "monthlySeasonality");
  const runRate = readInteger(record.runRate, "runRate");
  const total = historicalWeightedBaseline + monthlySeasonality + runRate;

  if (total !== 100) {
    throw new PetyrAiForecastWeightsValidationError("AI Forecast baseline weights must sum to 100.");
  }

  return {
    schemaVersion: PETYR_AI_FORECAST_BASELINE_WEIGHTS_SCHEMA_VERSION,
    enabled: record.enabled !== false,
    historicalWeightedBaseline,
    monthlySeasonality,
    runRate,
    updatedBy: typeof record.updatedBy === "string" && record.updatedBy.trim() ? record.updatedBy.trim() : "petyr-admin",
    updatedAt
  };
}

function parseStoredWeights(value: string, updatedAt: Date): PetyrAiForecastBaselineWeights {
  return normalizeWeightsPayload(JSON.parse(value), updatedAt.toISOString());
}

function formatWeightsDiagnostic(error: unknown) {
  const detail = error instanceof Error && error.message ? " " + error.message : "";
  return "Unable to read Petyr AI Forecast baseline weights from app_setting; using the compatible positive-signal average fallback." + detail;
}

export function resolvePetyrAiForecastBaselineWeightsRead(
  setting: { settingValue: string; updatedAt: Date } | null,
  error: unknown = null
): PetyrAiForecastBaselineWeightsResolution {
  if (error) {
    return {
      weights: getDefaultPetyrAiForecastBaselineWeights(),
      diagnostics: [formatWeightsDiagnostic(error)]
    };
  }

  if (!setting?.settingValue.trim()) {
    return {
      weights: getDefaultPetyrAiForecastBaselineWeights(),
      diagnostics: []
    };
  }

  try {
    return {
      weights: parseStoredWeights(setting.settingValue, setting.updatedAt),
      diagnostics: []
    };
  } catch (parseError) {
    return {
      weights: getDefaultPetyrAiForecastBaselineWeights(),
      diagnostics: [formatWeightsDiagnostic(parseError)]
    };
  }
}

export async function getPetyrAiForecastBaselineWeightsWithDiagnostics(): Promise<PetyrAiForecastBaselineWeightsResolution> {
  try {
    const { prisma } = await import("../lib/db");
    const setting = await prisma.appSetting.findUnique({
      where: { settingKey: PETYR_AI_FORECAST_BASELINE_WEIGHTS_SETTING_KEY }
    });

    return resolvePetyrAiForecastBaselineWeightsRead(setting);
  } catch (error) {
    return resolvePetyrAiForecastBaselineWeightsRead(null, error);
  }
}

export async function getPetyrAiForecastBaselineWeights() {
  return (await getPetyrAiForecastBaselineWeightsWithDiagnostics()).weights;
}

export async function updatePetyrAiForecastBaselineWeights(input: {
  historicalWeightedBaseline: unknown;
  monthlySeasonality: unknown;
  runRate: unknown;
  enabled?: unknown;
  updatedBy?: unknown;
}) {
  const payload = normalizeWeightsPayload({
    schemaVersion: PETYR_AI_FORECAST_BASELINE_WEIGHTS_SCHEMA_VERSION,
    enabled: input.enabled !== false,
    historicalWeightedBaseline: input.historicalWeightedBaseline,
    monthlySeasonality: input.monthlySeasonality,
    runRate: input.runRate,
    updatedBy: typeof input.updatedBy === "string" && input.updatedBy.trim() ? input.updatedBy.trim() : "petyr-admin"
  }, null);
  const { prisma } = await import("../lib/db");
  const setting = await prisma.appSetting.upsert({
    where: { settingKey: PETYR_AI_FORECAST_BASELINE_WEIGHTS_SETTING_KEY },
    create: {
      settingKey: PETYR_AI_FORECAST_BASELINE_WEIGHTS_SETTING_KEY,
      settingValue: JSON.stringify(payload)
    },
    update: {
      settingValue: JSON.stringify(payload)
    }
  });

  return parseStoredWeights(setting.settingValue, setting.updatedAt);
}
