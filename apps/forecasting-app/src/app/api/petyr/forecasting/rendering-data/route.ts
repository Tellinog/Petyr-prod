import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { hasPetyrPermission, PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { resolvePreferredCsmName } from "@/lib/petyr/csmIdentity";
import {
  getPetyrApprovedRenderingDataForView,
  type PetyrApprovedRenderingView
} from "@/services/petyrApprovedRenderingAdapter";
import { getForecastEntryCompanies } from "@/services/petyrDataService";

export const dynamic = "force-dynamic";

function parseView(value: string | null): PetyrApprovedRenderingView {
  if (value === "management" || value === "csm" || value === "csm-scoped" || value === "all") return value;
  return "all";
}

function parseYear(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : undefined;
}

export async function GET(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const view = parseView(searchParams.get("view"));
  const needsCsmOverviewAccess = view === "csm" || view === "csm-scoped" || view === "all";

  if (needsCsmOverviewAccess && !hasPetyrPermission(auth, PETYR_PERMISSIONS.admin)) {
    return NextResponse.json(
      { error: "CSM Overview is temporarily available only to Petyr admins while it is in development." },
      { status: 403 }
    );
  }

  let scopedCsmName: string | null = null;

  if (view === "csm-scoped") {
    const companies = await getForecastEntryCompanies();
    scopedCsmName = resolvePreferredCsmName(
      auth.user.displayName,
      companies.data.map((company) => company.csmName || "Unassigned")
    );
  }

  const data = await getPetyrApprovedRenderingDataForView(view, parseYear(searchParams.get("year")), {
    csmName: scopedCsmName
  });
  return NextResponse.json(data);
}
