import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  getManagementObjectives,
  parseManagementObjectiveYear,
  PetyrManagementObjectiveError,
  upsertManagementObjective
} from "@/services/petyrManagementObjectiveService";
import { invalidatePetyrReadCache } from "@/services/forecastEntryReadCache";

export const dynamic = "force-dynamic";

function errorDetail(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.managementWrite);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseManagementObjectiveYear(searchParams.get("year"), { defaultToCurrent: true });
    const result = await getManagementObjectives(year);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PetyrManagementObjectiveError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: "Unable to read Management Objectives",
        detail: errorDetail(error)
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.managementWrite);
  if (auth instanceof NextResponse) return auth;

  try {
    const payload = await request.json();
    const result = await upsertManagementObjective(payload);
    invalidatePetyrReadCache((key) => key.startsWith("overview:"));

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PetyrManagementObjectiveError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error: "Unable to save Management Objective",
        detail: errorDetail(error)
      },
      { status: 500 }
    );
  }
}
