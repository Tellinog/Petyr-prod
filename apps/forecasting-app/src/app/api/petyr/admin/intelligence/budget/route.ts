import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { readIntelligenceConfig } from "@/services/intelligence/config";
import { getIntelligenceDailyBudgetStatus } from "@/services/intelligence/intelligenceBudgetService";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  const [config, dailyBudget] = await Promise.all([
    Promise.resolve(readIntelligenceConfig()),
    getIntelligenceDailyBudgetStatus()
  ]);
  return NextResponse.json({
    enabled: config.enabled,
    maxCompaniesPerRun: config.maxCompaniesPerRun,
    maxResultsPerCompany: config.maxResultsPerCompany,
    searchRecencyDays: config.searchRecencyDays,
    dailyBudgetRequests: config.dailyBudgetRequests,
    dailyBudget,
    scanDailyTime: config.scanDailyTime,
    scanTimezone: config.scanTimezone,
    hasExaKey: Boolean(config.exaApiKey),
    hasOpenRouterKey: Boolean(config.openRouterApiKey)
  }, { headers: { "Cache-Control": "no-store" } });
}
