import Link from "next/link";
import IntelligenceFeedbackButtons from "@/components/intelligence/IntelligenceFeedbackButtons";
import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { PETYR_BUSINESS_UNITS } from "@/lib/petyr/constants";
import { listIntelligenceInsights } from "@/services/intelligence/intelligenceReadService";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function valueOrNull(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export default async function IntelligencePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const identity = await requirePetyrPagePermission(PETYR_PERMISSIONS.admin);
  const params = (await searchParams) ?? {};
  const companyName = valueOrNull(firstParam(params.companyName));
  const businessUnit = valueOrNull(firstParam(params.businessUnit));
  const insightType = valueOrNull(firstParam(params.insightType));
  const urgency = valueOrNull(firstParam(params.urgency));
  const csmName = valueOrNull(firstParam(params.csmName)) ?? identity.user.displayName;
  const insights = await listIntelligenceInsights({
    csmName,
    companyName,
    businessUnit,
    insightType,
    urgency,
    limit: 50
  });

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Petyr Intelligence</p>
            <h1 className="text-3xl font-semibold tracking-tight">External company signals</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Source-backed opportunities, risks and watch items from external company signals. Forecasting numbers remain deterministic in Forecasting.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800" href="/forecasting">
              Forecasting
            </Link>
            <Link className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800" href="/petyr-admin/intelligence">
              Admin Intelligence
            </Link>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <form className="grid gap-3 md:grid-cols-5">
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" defaultValue={csmName ?? ""} name="csmName" placeholder="CSM" />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" defaultValue={companyName ?? ""} name="companyName" placeholder="Company" />
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" defaultValue={businessUnit ?? ""} name="businessUnit">
              <option value="">All Business Units</option>
              {PETYR_BUSINESS_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" defaultValue={urgency ?? ""} name="urgency">
              <option value="">All urgency</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white" type="submit">Filter</button>
          </form>
        </section>

        <section className="space-y-3">
          {insights.length ? insights.map((insight) => (
            <article className="rounded-lg border border-slate-200 bg-white p-4" key={insight.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {insight.companyName} · {insight.businessUnit} · {insight.insightType} · {insight.urgency}
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-slate-950">{insight.title}</h2>
                </div>
                <Link className="text-sm font-medium text-slate-700 underline" href={`/intelligence/company/${encodeURIComponent(insight.companyName)}`}>
                  Company view
                </Link>
              </div>
              <p className="mt-3 text-sm text-slate-700">{insight.summary}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">Rationale</div>
                  <div className="mt-1">{insight.rationale}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">Suggested action</div>
                  <div className="mt-1">{insight.suggestedAction}</div>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <div className="text-sm font-medium text-slate-900">Sources</div>
                <div className="flex flex-wrap gap-2">
                  {insight.sources.map((source) => (
                    <a className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 underline" href={source.url} key={source.id} rel="noreferrer" target="_blank">
                      {source.title || source.sourceDomain || source.url}
                    </a>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <IntelligenceFeedbackButtons insightId={insight.id} />
              </div>
            </article>
          )) : (
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
              No Intelligence insights match the current filters yet.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
