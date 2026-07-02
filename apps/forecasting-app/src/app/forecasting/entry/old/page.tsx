import ForecastEntryWorkspaceOld from "@/components/petyr/ForecastEntryWorkspaceOld";
import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getForecastEntryData } from "@/services/forecastEntryService";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type ForecastEntryOldPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getForecastEntryQuery(searchParams: SearchParams) {
  return {
    companyName: firstParam(searchParams.companyName)?.trim() ?? "",
    csmName: firstParam(searchParams.csmName)?.trim() ?? "",
    year: firstParam(searchParams.year)?.trim() ?? "",
    month: firstParam(searchParams.month)?.trim() ?? ""
  };
}

export default async function ForecastEntryOldPage({ searchParams }: ForecastEntryOldPageProps) {
  const identity = await requirePetyrPagePermission(PETYR_PERMISSIONS.admin);
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialEntry = await getForecastEntryData({
    ...getForecastEntryQuery(resolvedSearchParams),
    preferredCsmName: identity.user.displayName
  });

  return <ForecastEntryWorkspaceOld initialEntry={initialEntry} canViewAdminTools />;
}
