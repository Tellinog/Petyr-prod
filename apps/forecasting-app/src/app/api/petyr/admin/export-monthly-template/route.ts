import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { buildMonthlyForecastTemplateCsv } from "@/services/petyrMonthlyTemplateExportService";

const DEFAULT_TEMPLATE_YEAR = 2026;

export const dynamic = "force-dynamic";

function parseTemplateYear(value: string | null) {
  if (!value) return DEFAULT_TEMPLATE_YEAR;

  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;

  return year;
}

export async function GET(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const year = parseTemplateYear(searchParams.get("year"));

  if (!year) {
    return NextResponse.json({ error: "Invalid year query parameter" }, { status: 400 });
  }

  try {
    const csv = await buildMonthlyForecastTemplateCsv(year);

    return new NextResponse(csv, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="petyr-monthly-forecast-template-${year}.csv"`,
        "Content-Type": "text/csv; charset=utf-8"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to export monthly forecast template",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
