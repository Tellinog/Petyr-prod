import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAnnualForecastOngoing,
  calculateAnnualForecastPercentages,
  getAnnualForecastEntryDefaultYear,
  getAnnualForecastEntryInitialMode,
  getAnnualForecastEntryYearOptions,
  isPetyrAnnualConfidence
} from "../src/lib/petyr/annualForecastEntryRules";
import {
  isInitialForecastYearAdminUnlocked,
  parsePetyrInitialForecastWindowOverrides,
  PetyrInitialForecastWindowOverrideValidationError
} from "../src/services/petyrInitialForecastWindowOverrideService";

function dateFor(year: number, month: number, day: number) {
  return new Date(year, month - 1, day, 12, 0, 0);
}

test("Annual Forecast Entry year options start at 2026 and include at least 2026 and 2027", () => {
  assert.deepEqual(getAnnualForecastEntryYearOptions(dateFor(2026, 6, 25)), [2026, 2027]);
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
