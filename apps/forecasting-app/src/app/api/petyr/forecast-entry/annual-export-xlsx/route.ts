import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  buildForecastEntryAnnualExportWorkbookXlsx,
  PETYR_FORECASTING_EXPORT_CONTENT_TYPE
} from "@/services/petyrForecastingExportService";

export const dynamic = "force-dynamic";

function parseYear(value: string | null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) return null;
  return parsed;
}

function filenamePart(values: string[]) {
  const normalized = values.join("-").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || null;
}

export async function GET(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const year = parseYear(searchParams.get("year"));
  const csmNames = searchParams.getAll("csmName").map((value) => value.trim()).filter(Boolean);

  if (!year) {
    return NextResponse.json({ error: "Invalid year query parameter" }, { status: 400 });
  }

  try {
    const workbook = await buildForecastEntryAnnualExportWorkbookXlsx({
      year,
      csmNames,
      preferredCsmName: auth.user.displayName
    });
    const csmFilenamePart = filenamePart(csmNames);
    const filename = `petyr-forecast-entry-annual-${year}${csmFilenamePart ? `-${csmFilenamePart}` : ""}.xlsx`;

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
        error: "Unable to export Annual Forecast Entry Excel workbook",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
