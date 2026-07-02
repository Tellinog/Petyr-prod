import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getPetyrPerformanceResults } from "@/services/petyrPerformanceResultsService";

export const dynamic = "force-dynamic";

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function GET() {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await getPetyrPerformanceResults(), {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        persistenceEnabled: false,
        checkedAt: new Date().toISOString(),
        checks: [],
        recentHistory: [],
        warnings: ["Unable to read Petyr performance results."],
        error: formatError(error)
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
