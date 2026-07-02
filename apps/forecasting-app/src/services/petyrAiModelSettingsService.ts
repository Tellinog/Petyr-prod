import { prisma } from "../lib/db";

export const PETYR_OPENROUTER_MODEL_SETTING_KEY = "petyr.openrouter.model";

const FALLBACK_OPENROUTER_DEFAULT_MODEL = "openai/gpt-4.1-mini";
const OPENROUTER_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

export class OpenRouterModelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterModelValidationError";
  }
}

export type PetyrAiModelSetting = {
  settingKey: typeof PETYR_OPENROUTER_MODEL_SETTING_KEY;
  selectedModel: string;
  defaultModel: string;
  isUsingDefault: boolean;
  updatedAt: string | null;
};

export type PetyrAiModelSettingResolution = {
  setting: PetyrAiModelSetting;
  diagnostics: string[];
};

export function getOpenRouterDefaultModel() {
  return process.env.OPENROUTER_DEFAULT_MODEL?.trim() || FALLBACK_OPENROUTER_DEFAULT_MODEL;
}

export function getDefaultPetyrAiModelSetting(): PetyrAiModelSetting {
  return {
    settingKey: PETYR_OPENROUTER_MODEL_SETTING_KEY,
    selectedModel: getOpenRouterDefaultModel(),
    defaultModel: getOpenRouterDefaultModel(),
    isUsingDefault: true,
    updatedAt: null
  };
}

function normalizeOpenRouterModel(model: string) {
  const normalizedModel = model.trim();

  if (!normalizedModel) {
    throw new OpenRouterModelValidationError("Choose an OpenRouter model before saving.");
  }

  if (!OPENROUTER_MODEL_PATTERN.test(normalizedModel)) {
    throw new OpenRouterModelValidationError(
      "Use an OpenRouter model id with letters, numbers, slash, colon, dash, underscore or period."
    );
  }

  return normalizedModel;
}

function toPetyrAiModelSetting(setting: { settingValue: string; updatedAt: Date } | null): PetyrAiModelSetting {
  const defaultModel = getOpenRouterDefaultModel();
  const selectedModel = setting?.settingValue.trim() || defaultModel;

  return {
    settingKey: PETYR_OPENROUTER_MODEL_SETTING_KEY,
    selectedModel,
    defaultModel,
    isUsingDefault: !setting?.settingValue.trim(),
    updatedAt: setting?.updatedAt.toISOString() ?? null
  };
}

function formatModelSettingReadDiagnostic(error: unknown) {
  const detail = error instanceof Error && error.message ? " " + error.message : "";
  return "Unable to read Petyr OpenRouter model setting from app_setting; using OPENROUTER_DEFAULT_MODEL fallback for this run." + detail;
}

export function resolvePetyrAiModelSettingRead(
  setting: { settingValue: string; updatedAt: Date } | null,
  error: unknown = null
): PetyrAiModelSettingResolution {
  if (error) {
    return {
      setting: getDefaultPetyrAiModelSetting(),
      diagnostics: [formatModelSettingReadDiagnostic(error)]
    };
  }

  return {
    setting: toPetyrAiModelSetting(setting),
    diagnostics: []
  };
}

export async function getPetyrAiModelSettingWithDiagnostics(): Promise<PetyrAiModelSettingResolution> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { settingKey: PETYR_OPENROUTER_MODEL_SETTING_KEY }
    });

    return resolvePetyrAiModelSettingRead(setting);
  } catch (error) {
    return resolvePetyrAiModelSettingRead(null, error);
  }
}

export async function getPetyrAiModelSetting() {
  return (await getPetyrAiModelSettingWithDiagnostics()).setting;
}

export async function updatePetyrAiModelSetting(model: string) {
  const settingValue = normalizeOpenRouterModel(model);
  const setting = await prisma.appSetting.upsert({
    where: { settingKey: PETYR_OPENROUTER_MODEL_SETTING_KEY },
    create: {
      settingKey: PETYR_OPENROUTER_MODEL_SETTING_KEY,
      settingValue
    },
    update: {
      settingValue
    }
  });

  return toPetyrAiModelSetting(setting);
}
