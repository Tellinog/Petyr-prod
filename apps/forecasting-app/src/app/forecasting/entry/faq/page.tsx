import { ForecastEntryFaq } from "@/components/petyr/ForecastEntryFaq";
import { PetyrWorkspaceShell } from "@/components/petyr/PetyrLayoutPrimitives";
import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { hasPetyrPermission, PETYR_PERMISSIONS } from "@/lib/petyr/authCore";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type ForecastEntryFaqPageProps = {
  searchParams?: Promise<SearchParams>;
};

type ForecastEntryFaqQuery = {
  companyName: string;
  csmName: string;
  year: string;
  month: string;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getForecastEntryFaqQuery(searchParams: SearchParams): ForecastEntryFaqQuery {
  return {
    companyName: firstParam(searchParams.companyName)?.trim() ?? "",
    csmName: firstParam(searchParams.csmName)?.trim() ?? "",
    year: firstParam(searchParams.year)?.trim() ?? "",
    month: firstParam(searchParams.month)?.trim() ?? ""
  };
}

function buildForecastEntryHref(query: ForecastEntryFaqQuery) {
  const params = new URLSearchParams();

  if (query.companyName) {
    params.set("companyName", query.companyName);
  }
  if (query.csmName) {
    params.set("csmName", query.csmName);
  }
  if (query.year) {
    params.set("year", query.year);
  }
  if (query.month) {
    params.set("month", query.month);
  }

  const queryString = params.toString();
  return queryString ? `/forecasting/entry?${queryString}` : "/forecasting/entry";
}

function buildCompanyDetailHref(query: Pick<ForecastEntryFaqQuery, "companyName" | "csmName" | "year">) {
  if (!query.companyName) {
    return null;
  }

  const params = new URLSearchParams();
  if (query.year) {
    params.set("year", query.year);
  }
  if (query.csmName) {
    params.set("csmName", query.csmName);
  }

  const queryString = params.toString();
  return `/forecasting/company/${encodeURIComponent(query.companyName)}${queryString ? `?${queryString}` : ""}`;
}

export default async function ForecastEntryFaqPage({ searchParams }: ForecastEntryFaqPageProps) {
  const identity = await requirePetyrPagePermission(PETYR_PERMISSIONS.read);
  const resolvedSearchParams = (await searchParams) ?? {};
  const query = getForecastEntryFaqQuery(resolvedSearchParams);
  const canViewCsmOverview = hasPetyrPermission(identity, PETYR_PERMISSIONS.admin);

  return (
    <PetyrWorkspaceShell
      activeSection="entry"
      companyDetailHref={buildCompanyDetailHref(query)}
      forecastEntryHref={buildForecastEntryHref(query)}
      canViewCsmOverview={canViewCsmOverview}
    >
      <ForecastEntryFaq />
    </PetyrWorkspaceShell>
  );
}
