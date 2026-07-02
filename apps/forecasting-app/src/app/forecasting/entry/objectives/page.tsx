import ManagementObjectivesWorkspace from "@/components/petyr/ManagementObjectivesWorkspace";
import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { parseManagementObjectiveYear } from "@/services/petyrManagementObjectiveService";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type ManagementObjectivesPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageYear(value: string | undefined) {
  try {
    return parseManagementObjectiveYear(value, { defaultToCurrent: true });
  } catch {
    return new Date().getFullYear();
  }
}

export default async function ManagementObjectivesPage({ searchParams }: ManagementObjectivesPageProps) {
  await requirePetyrPagePermission(PETYR_PERMISSIONS.managementWrite);
  const resolvedSearchParams = (await searchParams) ?? {};
  const year = pageYear(firstParam(resolvedSearchParams.year));

  return <ManagementObjectivesWorkspace initialObjectives={null} initialYear={year} />;
}
