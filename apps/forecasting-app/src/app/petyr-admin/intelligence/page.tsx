import Link from "next/link";
import IntelligenceAdminRunControl from "@/components/intelligence/IntelligenceAdminRunControl";
import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { readIntelligenceConfig } from "@/services/intelligence/config";
import { getFeedbackSummary } from "@/services/intelligence/feedbackService";
import { listIntelligenceInsights } from "@/services/intelligence/intelligenceReadService";
import { getIntelligenceDailyBudgetStatus } from "@/services/intelligence/intelligenceBudgetService";
import { getIntelligenceWorkerStatus } from "@/services/intelligence/intelligenceWorkerSettingsService";
import { listIntelligenceRuns } from "@/services/intelligence/runLogger";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function IntelligenceAdminPage() {
  await requirePetyrPagePermission(PETYR_PERMISSIONS.admin);
  const [runs, insights, feedbackSummary, workerStatus, dailyBudget] = await Promise.all([
    listIntelligenceRuns(25),
    listIntelligenceInsights({ limit: 25 }),
    getFeedbackSummary(),
    getIntelligenceWorkerStatus(),
    getIntelligenceDailyBudgetStatus()
  ]);
  const config = readIntelligenceConfig();

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Petyr Admin</p>
            <h1 className="text-3xl font-semibold tracking-tight">Intelligence</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Run status, provider usage, generated insights and feedback for the external-signal Intelligence module.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800" href="/petyr-admin">
              Back to Petyr Admin
            </Link>
            <Link className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800" href="/intelligence">
              CSM Intelligence
            </Link>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Enabled</div>
            <div className="mt-1 font-semibold">{config.enabled ? "yes" : "no"}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Provider keys</div>
            <div className="mt-1 font-semibold">Exa {config.exaApiKey ? "set" : "missing"} · OpenRouter {config.openRouterApiKey ? "set" : "missing"}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Run cap</div>
            <div className="mt-1 font-semibold">{config.maxCompaniesPerRun} companies · {config.maxResultsPerCompany} results</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Daily budget</div>
            <div className="mt-1 font-semibold">{dailyBudget.remaining} / {dailyBudget.limit} requests</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Worker</div>
            <div className="mt-1 font-semibold">{workerStatus.workerEnabled ? "enabled" : "disabled"}</div>
            <div className="text-xs text-slate-500">{workerStatus.scanDailyTime} {workerStatus.scanTimezone}</div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Manual run</h2>
          <p className="mt-1 text-sm text-slate-600">Dry-run by default. Real runs require enabled config, provider keys and the internal secret.</p>
          <div className="mt-4">
            <IntelligenceAdminRunControl
              dailyBudgetLimit={dailyBudget.limit}
              dailyBudgetRemaining={dailyBudget.remaining}
              initialWorkerEnabled={workerStatus.workerEnabled}
              maxCompanies={config.maxCompaniesPerRun}
              maxResultsPerCompany={config.maxResultsPerCompany}
              scanDailyTime={workerStatus.scanDailyTime}
              scanTimezone={workerStatus.scanTimezone}
              workerEnabledSource={workerStatus.workerEnabledSource}
            />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Runs</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Dry</th>
                  <th className="px-3 py-2">Companies</th>
                  <th className="px-3 py-2">Exa</th>
                  <th className="px-3 py-2">Results</th>
                  <th className="px-3 py-2">OpenRouter</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="px-3 py-2">{formatDate(run.startedAt)}</td>
                    <td className="px-3 py-2">{run.status}</td>
                    <td className="px-3 py-2">{run.dryRun ? "yes" : "no"}</td>
                    <td className="px-3 py-2">{run.selectedCompaniesCount}</td>
                    <td className="px-3 py-2">{run.exaRequestsUsed}</td>
                    <td className="px-3 py-2">{run.exaResultsReceived}</td>
                    <td className="px-3 py-2">{run.openrouterRequestsUsed}</td>
                    <td className="max-w-[280px] px-3 py-2 text-xs text-rose-700">{run.errorMessage ?? "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold">Generated insights</h2>
            <div className="mt-3 space-y-2">
              {insights.map((insight) => (
                <div className="rounded-md border border-slate-200 p-3 text-sm" key={insight.id}>
                  <div className="font-medium">{insight.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{insight.companyName} · {insight.businessUnit} · {insight.urgency}</div>
                </div>
              ))}
              {!insights.length ? <div className="text-sm text-slate-600">No insights generated yet.</div> : null}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold">Feedback summary</h2>
            <div className="mt-3 space-y-2">
              {feedbackSummary.map((row) => (
                <div className="rounded-md border border-slate-200 p-3 text-sm" key={`${row.ratingUsefulness}-${row.ratingAccuracy}`}>
                  {row.ratingUsefulness} · {row.ratingAccuracy}: <span className="font-semibold">{row.count}</span>
                </div>
              ))}
              {!feedbackSummary.length ? <div className="text-sm text-slate-600">No CSM feedback submitted yet.</div> : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
