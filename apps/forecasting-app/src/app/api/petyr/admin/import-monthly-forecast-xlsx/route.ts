import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { importMonthlyForecastWorkbookXlsx } from "@/services/petyrMonthlyForecastExcelService";

export const dynamic = "force-dynamic";

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

function isXlsxFile(file: File) {
  return file.name.toLowerCase().endsWith(".xlsx");
}

function formatImportError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown error";

  if (error.message.includes("does not exist")) {
    return "Petyr forecast tables are missing. Apply the forecasting app Prisma schema before importing.";
  }

  return error.message;
}

export async function POST(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!isFile(file)) {
      return NextResponse.json({ error: "Missing Excel file upload field named file." }, { status: 400 });
    }

    if (!isXlsxFile(file)) {
      return NextResponse.json({ error: "Upload a .xlsx workbook." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importMonthlyForecastWorkbookXlsx(buffer, { fileName: file.name });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to import monthly forecast Excel workbook",
        detail: formatImportError(error)
      },
      { status: 500 }
    );
  }
}
