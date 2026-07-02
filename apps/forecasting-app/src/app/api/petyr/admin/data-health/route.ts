import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getPetyrDataHealth } from "@/services/petyrDataHealthService";

export const dynamic = "force-dynamic";

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function GET() {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await getPetyrDataHealth();

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        sources: {
          redashSourceModel: {
            relationName: "RedashSource",
            exists: false,
            accessible: false,
            error: "Unable to complete data health check."
          },
          expected: [],
          ownership: null
        },
        managementObjectives: {
          currentYear: new Date().getFullYear(),
          tableExists: false,
          missingTables: ["management_objective", "management_objective_change_log"],
          configuredByYear: [],
          currentYearConfiguredCount: 0,
          currentYearBranchConfiguredCount: 0,
          currentYearBusinessUnitConfiguredCount: 0,
          branchesWithoutObjective: [],
          businessUnitsWithoutObjective: [],
          diagnostics: [],
          inspectionError: "Unable to complete data health check."
        },
        materializedTables: {},
        rowCounts: {},
        availableColumns: {},
        mappingDiagnostics: [],
        blockingIssues: [
          {
            code: "DATA_HEALTH_CHECK_FAILED",
            message: "Unable to complete Petyr data health check.",
            detail: formatError(error)
          }
        ],
        warnings: [],
        checkedAt: new Date().toISOString()
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
