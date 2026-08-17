import { PetyrForecastingDataHydrator } from "@/components/petyr/PetyrForecastingDataHydrator";
import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { canRefreshPetyrSourceData, hasPetyrPermission, PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getPetyrApprovedRenderingShellData } from "@/services/petyrApprovedRenderingAdapter";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type ForecastingPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseForecastingView(value: string | undefined): "management" | "csm" {
  return value === "csm" ? "csm" : "management";
}

export default async function ForecastingPage({ searchParams }: ForecastingPageProps) {
  const identity = await requirePetyrPagePermission(PETYR_PERMISSIONS.read);
  const canWriteForecast = hasPetyrPermission(identity, PETYR_PERMISSIONS.forecastWrite);

  if (canWriteForecast) {
    redirect("/forecasting/entry");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedView = parseForecastingView(firstParam(resolvedSearchParams.view)?.trim());
  const initialData = getPetyrApprovedRenderingShellData();
  const canViewAdminTools = hasPetyrPermission(identity, PETYR_PERMISSIONS.admin);
  const activeView = canViewAdminTools ? requestedView : "management";
  const canManageObjectives = hasPetyrPermission(identity, PETYR_PERMISSIONS.managementWrite);

  return (
    <PetyrForecastingDataHydrator
      initialData={initialData}
      activeView={activeView}
      userDisplayName={identity.user.displayName}
      authenticatedUserEmail={identity.user.email}
      canViewAdminTools={canViewAdminTools}
      canManageObjectives={canManageObjectives}
      canWriteForecast={canWriteForecast}
      canRefreshSourceData={canRefreshPetyrSourceData(identity)}
    />
  );
}
