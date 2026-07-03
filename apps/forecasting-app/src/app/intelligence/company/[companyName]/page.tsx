import Link from "next/link";
import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { listIntelligenceInsights } from "@/services/intelligence/intelligenceReadService";

export const dynamic = "force-dynamic";

export default async function IntelligenceCompanyPage({ params }: { params: Promise<{ companyName: string }> }) {
  await requirePetyrPagePermission(PETYR_PERMISSIONS.admin);
  const { companyName } = await params;
  const decodedCompanyName = decodeURIComponent(companyName);
  const insights = await listIntelligenceInsights({ companyName: decodedCompanyName, limit: 50 });

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-3">
          <Link className="text-sm font-medium text-slate-700 underline" href="/intelligence">Back to Intelligence</Link>
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Petyr Intelligence</p>
            <h1 className="text-3xl font-semibold tracking-tight">{decodedCompanyName}</h1>
            <p className="mt-2 text-sm text-slate-600">External signal insights for this company. Forecasting remains available in the separate company detail page.</p>
          </div>
          <Link className="inline-flex rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800" href={`/forecasting/company/${encodeURIComponent(decodedCompanyName)}`}>
            Open Forecasting company detail
          </Link>
        </header>

        <section className="space-y-3">
          {insights.length ? insights.map((insight) => (
            <article className="rounded-lg border border-slate-200 bg-white p-4" key={insight.id}>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {insight.businessUnit} · {insight.insightType} · {insight.urgency}
              </div>
              <h2 className="mt-1 text-lg font-semibold">{insight.title}</h2>
              <p className="mt-2 text-sm text-slate-700">{insight.summary}</p>
              <div className="mt-3 text-sm text-slate-600">{insight.rationale}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {insight.sources.map((source) => (
                  <a className="rounded-md border border-slate-200 px-2 py-1 text-xs underline" href={source.url} key={source.id} rel="noreferrer" target="_blank">
                    {source.title || source.sourceDomain || source.url}
                  </a>
                ))}
              </div>
            </article>
          )) : (
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
              No Intelligence insights have been generated for this company yet.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
