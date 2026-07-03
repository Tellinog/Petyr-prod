import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { readIntelligenceConfig } from "@/services/intelligence/config";
import { getIntelligenceDailyBudgetStatus } from "@/services/intelligence/intelligenceBudgetService";
import { isAuthorizedAppInternalRequest, getConfiguredAppInternalSecret } from "@/services/intelligence/intelligenceApiAuth";
import { runCompanyIntelligenceScan } from "@/services/intelligence/intelligenceScanService";
import { runIntelligenceScanWorkerOnce } from "@/services/intelligence/intelligenceWorkerService";
import { getIntelligenceWorkerStatus } from "@/services/intelligence/intelligenceWorkerSettingsService";
import { listIntelligenceRuns } from "@/services/intelligence/runLogger";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  const [runs, config, dailyBudget, worker] = await Promise.all([
    listIntelligenceRuns(),
    Promise.resolve(readIntelligenceConfig()),
    getIntelligenceDailyBudgetStatus(),
    getIntelligenceWorkerStatus()
  ]);

  return NextResponse.json({
    runs,
    worker,
    dailyBudget,
    config: {
      enabled: config.enabled,
      hasExaKey: Boolean(config.exaApiKey),
      hasOpenRouterKey: Boolean(config.openRouterApiKey),
      openRouterModel: config.openRouterModel,
      maxCompaniesPerRun: config.maxCompaniesPerRun,
      maxResultsPerCompany: config.maxResultsPerCompany,
      searchRecencyDays: config.searchRecencyDays,
      dailyBudgetRequests: config.dailyBudgetRequests,
      workerEnabledByDefault: config.workerEnabledByDefault,
      scanDailyTime: config.scanDailyTime,
      scanTimezone: config.scanTimezone
    }
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  const payload = await request.json().catch(() => ({})) as {
    dryRun?: unknown;
    confirmed?: unknown;
    companyName?: unknown;
    maxCompanies?: unknown;
    maxResultsPerCompany?: unknown;
  };
  const dryRun = payload.dryRun !== false;

  if (!dryRun) {
    if (!getConfiguredAppInternalSecret()) {
      return NextResponse.json({ error: "APP_INTERNAL_SECRET is not configured for non-dry-run Intelligence scans." }, { status: 503 });
    }
    if (!isAuthorizedAppInternalRequest(request.headers)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (payload.confirmed !== true) {
      return NextResponse.json({ error: "Non-dry-run Intelligence scan requires explicit confirmation." }, { status: 400 });
    }
  }

  const result = dryRun
    ? await runCompanyIntelligenceScan({
      dryRun,
      companyName: typeof payload.companyName === "string" ? payload.companyName.trim() : null,
      maxCompanies: typeof payload.maxCompanies === "number" ? payload.maxCompanies : null,
      maxResultsPerCompany: typeof payload.maxResultsPerCompany === "number" ? payload.maxResultsPerCompany : null,
      createdBy: auth.email,
      runSource: "manual"
    })
    : await runIntelligenceScanWorkerOnce({
      runSource: "manual",
      createdBy: auth.email,
      companyName: typeof payload.companyName === "string" ? payload.companyName.trim() : null,
      maxCompanies: typeof payload.maxCompanies === "number" ? payload.maxCompanies : null,
      maxResultsPerCompany: typeof payload.maxResultsPerCompany === "number" ? payload.maxResultsPerCompany : null
    });

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
