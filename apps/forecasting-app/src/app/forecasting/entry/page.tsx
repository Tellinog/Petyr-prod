import ForecastEntryMonthlyBatchWorkspace from "@/components/petyr/ForecastEntryMonthlyBatchWorkspace";
import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getForecastEntryBatch } from "@/services/forecastEntryBatchService";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type ForecastEntryPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getForecastEntryQuery(searchParams: SearchParams) {
  return {
    csmName: firstParam(searchParams.csmName)?.trim() ?? "",
    year: firstParam(searchParams.year)?.trim() ?? "",
    month: firstParam(searchParams.month)?.trim() ?? ""
  };
}

export default async function ForecastEntryPage({ searchParams }: ForecastEntryPageProps) {
  const identity = await requirePetyrPagePermission(PETYR_PERMISSIONS.forecastWrite);
  const resolvedSearchParams = (await searchParams) ?? {};
  const query = getForecastEntryQuery(resolvedSearchParams);
  const initialBatch = await getForecastEntryBatch({
    csmName: query.csmName,
    preferredCsmName: identity.user.displayName,
    year: query.year,
    month: query.month
  });

  return <ForecastEntryMonthlyBatchWorkspace initialBatch={initialBatch} initialAnnualYear={query.year} />;

}
