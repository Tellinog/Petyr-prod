import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAnnualForecastOngoing,
  calculateAnnualForecastPercentages,
  getAnnualForecastEntryDefaultYear,
  getAnnualForecastEntryInitialMode,
  getAnnualForecastEntryYearOptions,
  isPetyrAnnualConfidence,
  resolveAnnualEntryInitialForecast,
  shouldRequireAnnualOngoingConfidence
} from "../src/lib/petyr/annualForecastEntryRules";
import {
  isInitialForecastYearAdminUnlocked,
  parsePetyrInitialForecastWindowOverrides,
  PetyrInitialForecastWindowOverrideValidationError
} from "../src/services/petyrInitialForecastWindowOverrideService";
import { parseAnnualForecastImportRows } from "../src/lib/petyr/annualForecastImportParser";
import { getMissingAnnualForecastImportCustomers } from "../src/lib/petyr/annualForecastImportMissingCustomers";
import { buildInactiveCompaniesAnnualForecastRows } from "../src/lib/petyr/inactiveCompaniesAnnualExportRows";
import { PETYR_FORECAST_ENTRY_BUSINESS_UNITS } from "../src/lib/petyr/constants";

function dateFor(year: number, month: number, day: number) {
  return new Date(year, month - 1, day, 12, 0, 0);
}

test("Annual Forecast Entry year options start at 2026 and include at least 2026 and 2027", () => {
  assert.deepEqual(getAnnualForecastEntryYearOptions(dateFor(2026, 6, 25)), [2026, 2027]);
});

test("Forecast Entry Business Unit columns follow the CSM check order", () => {
  assert.deepEqual([...PETYR_FORECAST_ENTRY_BUSINESS_UNITS], [
    "QA",
    "Experience",
    "Accessibility",
    "Security",
    "FTE",
    "TA",
    "AI",
    "Other",
    "Express",
    "Community"
  ]);
});

test("Annual Forecast Entry default year switches on December 10 and resets on January 1", () => {
  assert.equal(getAnnualForecastEntryDefaultYear(dateFor(2026, 12, 9)), 2026);
  assert.equal(getAnnualForecastEntryDefaultYear(dateFor(2026, 12, 10)), 2027);
  assert.equal(getAnnualForecastEntryDefaultYear(dateFor(2027, 1, 1)), 2027);
});

test("Annual Forecast Entry progressively exposes next year", () => {
  assert.deepEqual(getAnnualForecastEntryYearOptions(dateFor(2027, 1, 1)), [2026, 2027, 2028]);
});

test("FC Initial is editable only from December 10 previous year through January 10 target year", () => {
  assert.equal(getAnnualForecastEntryInitialMode(2027, dateFor(2026, 12, 9)).editable, false);
  assert.equal(getAnnualForecastEntryInitialMode(2027, dateFor(2026, 12, 10)).editable, true);
  assert.equal(getAnnualForecastEntryInitialMode(2027, dateFor(2027, 1, 10)).editable, true);
  assert.equal(getAnnualForecastEntryInitialMode(2027, dateFor(2027, 1, 11)).editable, false);
});

test("FC Initial can be admin-unlocked outside the default window for the selected year", () => {
  const outsideWindow = dateFor(2027, 8, 15);

  assert.equal(getAnnualForecastEntryInitialMode(2027, outsideWindow).editable, false);
  assert.deepEqual(
    {
      editable: getAnnualForecastEntryInitialMode(2027, outsideWindow, { adminUnlocked: true }).editable,
      adminUnlocked: getAnnualForecastEntryInitialMode(2027, outsideWindow, { adminUnlocked: true }).adminUnlocked
    },
    {
      editable: true,
      adminUnlocked: true
    }
  );
  assert.equal(getAnnualForecastEntryInitialMode(2028, outsideWindow).editable, false);
});

test("FC Initial default window remains editable without admin unlock", () => {
  const mode = getAnnualForecastEntryInitialMode(2027, dateFor(2026, 12, 10));

  assert.equal(mode.editable, true);
  assert.equal(mode.adminUnlocked, false);
});

test("Annual BU Initial columns open by default only during the January entry window", () => {
  const decemberMode = getAnnualForecastEntryInitialMode(2027, dateFor(2026, 12, 10));
  const januaryMode = getAnnualForecastEntryInitialMode(2027, dateFor(2027, 1, 10));
  const adminMode = getAnnualForecastEntryInitialMode(2027, dateFor(2027, 8, 15), { adminUnlocked: true });
  const lockedMode = getAnnualForecastEntryInitialMode(2027, dateFor(2027, 1, 11));

  assert.equal(decemberMode.showInitialBusinessUnitsByDefault, false);
  assert.equal(decemberMode.canToggleInitialBusinessUnits, true);
  assert.equal(januaryMode.showInitialBusinessUnitsByDefault, true);
  assert.equal(januaryMode.canToggleInitialBusinessUnits, false);
  assert.equal(adminMode.showInitialBusinessUnitsByDefault, false);
  assert.equal(adminMode.canToggleInitialBusinessUnits, true);
  assert.equal(lockedMode.showInitialBusinessUnitsByDefault, false);
  assert.equal(lockedMode.canToggleInitialBusinessUnits, false);
});

test("Forecast Initial window override parser normalizes valid unlocked years", () => {
  const overrides = parsePetyrInitialForecastWindowOverrides(
    JSON.stringify({ unlockedYears: [2027, "2026", 2027], updatedBy: "admin-user" }),
    new Date("2026-08-15T10:00:00.000Z"),
    dateFor(2026, 8, 15)
  );

  assert.deepEqual(overrides.unlockedYears, [2026, 2027]);
  assert.equal(overrides.updatedBy, "admin-user");
  assert.equal(isInitialForecastYearAdminUnlocked(overrides, 2027), true);
  assert.equal(isInitialForecastYearAdminUnlocked(overrides, 2028), false);
});

test("Forecast Initial window override parser rejects unsupported years", () => {
  assert.throws(
    () => parsePetyrInitialForecastWindowOverrides(
      JSON.stringify({ unlockedYears: [2029], updatedBy: "admin-user" }),
      null,
      dateFor(2026, 8, 15)
    ),
    PetyrInitialForecastWindowOverrideValidationError
  );
});

test("FC Ongoing sums only saved or confirmed values passed to the calculator", () => {
  assert.equal(calculateAnnualForecastOngoing([100, null, undefined, 250.5]), 350.5);
});

test("Annual Forecast Entry confidence values are closed", () => {
  assert.equal(isPetyrAnnualConfidence("01 High"), true);
  assert.equal(isPetyrAnnualConfidence("02 Mid"), true);
  assert.equal(isPetyrAnnualConfidence("03 Low"), true);
  assert.equal(isPetyrAnnualConfidence("04 Unknown"), false);
});

test("Annual Forecast Entry requires confidence only for changed Forecast Ongoing values", () => {
  assert.equal(shouldRequireAnnualOngoingConfidence({ ongoingForecastChanged: true, hasExistingConfidence: false }), true);
  assert.equal(shouldRequireAnnualOngoingConfidence({ ongoingForecastChanged: true, hasExistingConfidence: true }), false);
  assert.equal(shouldRequireAnnualOngoingConfidence({ ongoingForecastChanged: false, hasExistingConfidence: false }), false);
});

test("Annual Forecast Entry keeps submitted Forecast Initial ahead of derived ongoing totals", () => {
  assert.equal(
    resolveAnnualEntryInitialForecast({
      initialModeEditable: true,
      submittedInitialForecast: 100,
      derivedInitialForecast: 900
    }),
    100
  );
  assert.equal(
    resolveAnnualEntryInitialForecast({
      initialModeEditable: true,
      submittedInitialForecast: null,
      derivedInitialForecast: 900
    }),
    900
  );
  assert.equal(
    resolveAnnualEntryInitialForecast({
      initialModeEditable: false,
      submittedInitialForecast: null,
      derivedInitialForecast: 900
    }),
    null
  );
});

test("Annual Forecast Entry percentages handle zero FC Ongoing", () => {
  assert.deepEqual(calculateAnnualForecastPercentages({ revenue: 100, planned: 50, fcOngoing: 0 }), {
    revenuePct: null,
    plannedPct: null,
    uncoveredPct: null
  });
});

test("Annual Forecast Entry percentages derive revenue, planned and uncovered shares", () => {
  assert.deepEqual(calculateAnnualForecastPercentages({ revenue: 25, planned: 50, fcOngoing: 100 }), {
    revenuePct: 0.25,
    plannedPct: 0.5,
    uncoveredPct: 0.25
  });
});

test("Annual forecast import parser reads only the Forecast Ongoing BU block", () => {
  const result = parseAnnualForecastImportRows([
    [
      "CSM",
      "Customer",
      "Company",
      "FORECAST INIZIALE 2026",
      "Revenue previste su UX",
      "FORECAST ONGOING",
      "QA",
      "UX",
      "Accessibility",
      "Security",
      "FTE",
      "TA",
      "AI",
      "OTHER"
    ],
    ["CSM 1", "Customer A", "Company A", 999, 999, 300, 100, 50, "", "", "", "", "", 150]
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.importableRows, 1);
  assert.deepEqual(result.businessUnits, ["QA", "Experience", "Accessibility", "Security", "FTE", "TA", "AI", "Other"]);
  assert.equal(result.companies[0].ongoingTotal, 300);
  assert.deepEqual(result.companies[0].valuesByBusinessUnit, {
    QA: 100,
    Experience: 50,
    Other: 150
  });
});

test("Annual forecast import parser aggregates duplicate customers and reports them", () => {
  const result = parseAnnualForecastImportRows([
    ["Customer", "Company", "FORECAST ONGOING", "QA", "UX", "OTHER"],
    ["Customer A", "Company A", 100, 80, 20, ""],
    ["Customer A", "Company A - second row", 50, "", 10, 40],
    ["Customer B", "Company B", 0, "", "", ""]
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.importableRows, 2);
  assert.deepEqual(result.duplicateCustomers, [{ customerName: "Customer A", rows: [2, 3] }]);
  assert.deepEqual(result.companies[0].valuesByBusinessUnit, {
    QA: 80,
    Experience: 30,
    Other: 40
  });
  assert.equal(result.companies[0].ongoingTotal, 150);
  assert.equal(result.companies[1].ongoingTotal, 0);
});

test("Annual forecast import parser accepts rows with values and missing optional Company", () => {
  const result = parseAnnualForecastImportRows([
    ["Customer", "Company", "FORECAST ONGOING", "QA", "UX"],
    ["Consip", "", 350000, "", 150000]
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.companies[0].companyName, "Consip");
  assert.deepEqual(result.companies[0].valuesByBusinessUnit, {
    Experience: 150000
  });
});

test("Annual forecast import parser does not duplicate rows with same Company but different Customer", () => {
  const result = parseAnnualForecastImportRows([
    ["Customer", "Company", "FORECAST ONGOING", "QA", "UX"],
    ["Accenture Italia", "Accenture Italia", 100000, 20000, 80000],
    ["Accenture / Valentino", "Accenture Italia", 0, 0, ""]
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.importableRows, 2);
  assert.deepEqual(result.duplicateCustomers, []);
});

test("Annual forecast import parser rejects rows with values and missing Customer", () => {
  const result = parseAnnualForecastImportRows([
    ["Customer", "Company", "FORECAST ONGOING", "QA", "UX"],
    ["", "Company A", 10, 10, ""]
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].field, "Customer");
});

test("Annual forecast import missing-customer selector ignores imported and already inactive companies", () => {
  const missing = getMissingAnnualForecastImportCustomers({
    importedCompanyNames: ["Customer A", "Customer C"],
    inactiveCompanyNames: ["Customer D"],
    ownershipPairs: [
      { companyName: "Customer A", csmName: "CSM 1" },
      { companyName: "Customer B", csmName: "CSM 2" },
      { companyName: "Customer C", csmName: "CSM 3" },
      { companyName: "Customer D", csmName: "CSM 4" }
    ]
  });

  assert.deepEqual(missing, [{ companyName: "Customer B", csmName: "CSM 2" }]);
});

test("Inactive companies annual export rows aggregate saved annual revenue by Business Unit", () => {
  const rows = buildInactiveCompaniesAnnualForecastRows({
    inactiveStatuses: [
      { companyName: "Customer B", reason: "zero annual forecast", updatedAt: "2026-07-03T08:00:00.000Z" },
      { companyName: "Customer A", reason: null }
    ],
    annualForecasts: [
      { companyName: "Customer B", csmName: "CSM 2", businessUnit: "QA", value: "100.25" },
      { companyName: "Customer B", csmName: "CSM 2", businessUnit: "Experience", value: 50 },
      { companyName: "Customer B", csmName: "CSM 2", businessUnit: "Unknown BU", value: 25 },
      { companyName: "Active Customer", csmName: "CSM 1", businessUnit: "QA", value: 999 }
    ]
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].companyName, "Customer A");
  assert.equal(rows[0].totalRevenue, 0);
  assert.equal(rows[1].companyName, "Customer B");
  assert.equal(rows[1].csmName, "CSM 2");
  assert.equal(rows[1].totalRevenue, 175.25);
  assert.equal(rows[1].valuesByBusinessUnit.QA, 100.25);
  assert.equal(rows[1].valuesByBusinessUnit.Experience, 50);
  assert.equal(rows[1].valuesByBusinessUnit.Other, 25);
});
