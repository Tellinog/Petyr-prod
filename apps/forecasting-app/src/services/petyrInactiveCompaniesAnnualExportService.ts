import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { PETYR_ANNUAL_VALUE_SOURCE_INITIAL_ONLY } from "@/lib/petyr/annualForecastEntryRules";
import { PETYR_BUSINESS_UNITS } from "@/lib/petyr/constants";
import { PETYR_EXCEL_CURRENCY_NUM_FORMAT } from "@/lib/petyr/formatters";
import {
  buildInactiveCompaniesAnnualForecastRows,
  type InactiveCompanyAnnualForecastExportRow
} from "@/lib/petyr/inactiveCompaniesAnnualExportRows";
import { startPetyrPerformanceTimer } from "@/lib/petyr/performance";

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
}

function addInstructionsSheet(workbook: ExcelJS.Workbook, year: number) {
  const sheet = workbook.addWorksheet("Instructions");
  sheet.columns = [{ width: 34 }, { width: 110 }];
  sheet.addRow(["Petyr inactive companies annual export"]);
  sheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
  sheet.addRow([]);
  sheet.addRows([
    ["Scope", `Companies explicitly saved as inactive in Petyr, exported for annual Forecast Ongoing year ${year}.`],
    ["Revenue total", "Sum of saved annual Forecast Ongoing Business Unit values from forecast_annual.value."],
    ["Business Unit columns", `Official Petyr Business Units only: ${PETYR_BUSINESS_UNITS.join(", ")}.`],
    ["Not included", "Closed revenue, monthly forecast, AI forecast, Forecast Initial, Redash raw rows and Management Objectives are not exported as revenue values."]
  ]);

  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.getCell(1).font = { bold: true, color: { argb: "FF334155" } };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }
}

function addInactiveCompaniesSheet(workbook: ExcelJS.Workbook, rows: InactiveCompanyAnnualForecastExportRow[]) {
  const sheet = workbook.addWorksheet("Inactive Companies");
  sheet.columns = [
    { header: "Company", key: "companyName", width: 38 },
    { header: "CSM", key: "csmName", width: 24 },
    { header: "Status", key: "status", width: 14 },
    { header: "Status reason", key: "statusReason", width: 38 },
    { header: "Status updated at", key: "statusUpdatedAt", width: 24 },
    { header: "Total saved revenue", key: "totalRevenue", width: 22 },
    ...PETYR_BUSINESS_UNITS.map((businessUnit) => ({
      header: businessUnit,
      key: businessUnit,
      width: 18
    }))
  ];
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(rows.length + 1, 1), column: sheet.columns.length }
  };
  styleHeaderRow(sheet.getRow(1));

  for (const row of rows) {
    const worksheetRow = sheet.addRow({
      companyName: row.companyName,
      csmName: row.csmName,
      status: row.status,
      statusReason: row.statusReason,
      statusUpdatedAt: row.statusUpdatedAt,
      totalRevenue: row.totalRevenue,
      ...row.valuesByBusinessUnit
    });

    worksheetRow.getCell("statusUpdatedAt").numFmt = "yyyy-mm-dd hh:mm";
    worksheetRow.getCell("totalRevenue").numFmt = PETYR_EXCEL_CURRENCY_NUM_FORMAT;
    for (const businessUnit of PETYR_BUSINESS_UNITS) {
      worksheetRow.getCell(businessUnit).numFmt = PETYR_EXCEL_CURRENCY_NUM_FORMAT;
    }
  }
}

export async function buildInactiveCompaniesAnnualForecastWorkbookXlsx(input: { year: number }) {
  const finishPerformance = startPetyrPerformanceTimer("exportInactiveCompaniesAnnualForecastWorkbookXlsx", {
    year: input.year
  });

  try {
    const inactiveStatuses = await prisma.companyForecastStatus.findMany({
      where: { isActive: false },
      orderBy: { companyName: "asc" }
    });
    const companyNames = inactiveStatuses.map((status) => status.companyName);
    const annualForecasts = companyNames.length
      ? await prisma.forecastAnnual.findMany({
          where: {
            year: input.year,
            companyName: { in: companyNames },
            NOT: { valueSource: PETYR_ANNUAL_VALUE_SOURCE_INITIAL_ONLY }
          },
          orderBy: [{ companyName: "asc" }, { businessUnit: "asc" }]
        })
      : [];
    const rows = buildInactiveCompaniesAnnualForecastRows({ inactiveStatuses, annualForecasts });
    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Petyr Admin";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.properties.date1904 = false;

    addInstructionsSheet(workbook, input.year);
    addInactiveCompaniesSheet(workbook, rows);

    const buffer = await workbook.xlsx.writeBuffer();
    finishPerformance({ status: "success", rowCount: rows.length, annualForecastRows: annualForecasts.length });

    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  } catch (error) {
    finishPerformance({ status: "failed" });
    throw error;
  }
}
