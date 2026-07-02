import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { buildMonthlyForecastWorkbookXlsx } from "@/services/petyrMonthlyForecastExcelService";

const DEFAULT_TEMPLATE_YEAR = 2026;

export const dynamic = "force-dynamic";

function parseTemplateYear(value: string | null) {
  if (!value) return DEFAULT_TEMPLATE_YEAR;

  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;

  return year;
}

function filenamePart(value: string | null) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || null;
}

export async function GET(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const year = parseTemplateYear(searchParams.get("year"));
  const csmName = searchParams.get("csmName")?.trim() || null;

  if (!year) {
    return NextResponse.json({ error: "Invalid year query parameter" }, { status: 400 });
  }

  try {
    const workbook = await buildMonthlyForecastWorkbookXlsx({ year, csmName });
    const csmFilenamePart = filenamePart(csmName);
    const filename = `petyr-monthly-forecast-${year}${csmFilenamePart ? `-${csmFilenamePart}` : ""}.xlsx`;

    return new NextResponse(workbook, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to export monthly forecast Excel workbook",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
