import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { buildInactiveCompaniesAnnualForecastWorkbookXlsx } from "@/services/petyrInactiveCompaniesAnnualExportService";

const DEFAULT_EXPORT_YEAR = 2026;

export const dynamic = "force-dynamic";

function parseExportYear(value: string | null) {
  if (!value) return DEFAULT_EXPORT_YEAR;

  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;

  return year;
}

export async function GET(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const year = parseExportYear(searchParams.get("year"));

  if (!year) {
    return NextResponse.json({ error: "Invalid year query parameter" }, { status: 400 });
  }

  try {
    const workbook = await buildInactiveCompaniesAnnualForecastWorkbookXlsx({ year });

    return new NextResponse(workbook, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="petyr-inactive-companies-annual-forecast-${year}.xlsx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to export inactive companies annual forecast workbook",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
