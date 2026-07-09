import { NextResponse } from "next/server";
import {
  PETYR_COMPANY_REVENUE_LIFECYCLE_STATUSES,
  type PetyrCompanyRevenueLifecycleStatus
} from "@/lib/petyr/companyRevenueLifecycle";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  buildManagementForecastExportWorkbookXlsx,
  PETYR_FORECASTING_EXPORT_CONTENT_TYPE,
  type ManagementForecastExportScope
} from "@/services/petyrForecastingExportService";

export const dynamic = "force-dynamic";

const MANAGEMENT_EXPORT_SCOPES = new Set<ManagementForecastExportScope>([
  "monthly-aggregate",
  "business-unit",
  "single-csm"
]);

function parseYear(value: string | null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) return null;
  return parsed;
}

function parseScope(value: string | null): ManagementForecastExportScope | null {
  if (!value || !MANAGEMENT_EXPORT_SCOPES.has(value as ManagementForecastExportScope)) return null;
  return value as ManagementForecastExportScope;
}

function parseLifecycleFilter(value: string | null): "all" | PetyrCompanyRevenueLifecycleStatus {
  if (PETYR_COMPANY_REVENUE_LIFECYCLE_STATUSES.includes(value as PetyrCompanyRevenueLifecycleStatus)) {
    return value as PetyrCompanyRevenueLifecycleStatus;
  }

  return "all";
}

export async function GET(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const year = parseYear(searchParams.get("year"));
  const scope = parseScope(searchParams.get("scope"));
  const lifecycleFilter = parseLifecycleFilter(searchParams.get("lifecycle"));

  if (!year) {
    return NextResponse.json({ error: "Invalid year query parameter" }, { status: 400 });
  }

  if (!scope) {
    return NextResponse.json({ error: "Invalid scope query parameter" }, { status: 400 });
  }

  try {
    const workbook = await buildManagementForecastExportWorkbookXlsx({ year, scope, lifecycleFilter });
    const filename = `petyr-management-${scope}-${year}-${lifecycleFilter}.xlsx`;

    return new NextResponse(workbook, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": PETYR_FORECASTING_EXPORT_CONTENT_TYPE
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to export Management Excel workbook",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
