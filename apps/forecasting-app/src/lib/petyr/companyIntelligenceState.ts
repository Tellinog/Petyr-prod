import type { PetyrLatestCompanyIntelligence } from "@/services/petyrForecastIntelligenceCacheService";
import type { PetyrCompanyIntelligenceActionResult } from "@/types/petyrAiForecastManualAction";

export function mapLatestPetyrCompanyIntelligenceToActionResult(
  intelligence: PetyrLatestCompanyIntelligence | null
): PetyrCompanyIntelligenceActionResult | null {
  if (!intelligence) return null;

  return {
    ok: true,
    requested: true,
    companyName: intelligence.companyName,
    requestedCompanyName: intelligence.companyName,
    year: intelligence.year,
    status: "success",
    model: intelligence.model,
    promptVersion: intelligence.promptVersion ?? "n/a",
    outputSchemaVersion: intelligence.outputSchemaVersion,
    inputHash: intelligence.inputHash,
    output: intelligence.output,
    errorMessage: null,
    validationErrors: [],
    openRouterCalled: false,
    retried: false,
    cacheAction: "reused",
    generatedAt: intelligence.generatedAt,
    diagnostics: [],
    summary: "Latest saved Forecast Intelligence loaded for " + intelligence.companyName + "."
  };
}

export function resolveVisiblePetyrCompanyIntelligenceResult(
  current: PetyrCompanyIntelligenceActionResult | null,
  next: PetyrCompanyIntelligenceActionResult
) {
  return next.ok && next.output ? next : current;
}
