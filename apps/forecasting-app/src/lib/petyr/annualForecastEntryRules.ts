export const PETYR_ANNUAL_FORECAST_START_YEAR = 2026;
export const PETYR_ANNUAL_CONFIDENCE_VALUES = ["01 High", "02 Mid", "03 Low"] as const;

export type PetyrAnnualConfidence = (typeof PETYR_ANNUAL_CONFIDENCE_VALUES)[number];

export type PetyrAnnualForecastValueSource = "manual" | "ai_confirmed";

export type PetyrAnnualForecastPercentages = {
  revenuePct: number | null;
  plannedPct: number | null;
  uncoveredPct: number | null;
};

export type AnnualForecastInitialModeOverride = {
  adminUnlocked?: boolean;
};

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getAnnualForecastEntryDefaultYear(currentDate = new Date()) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const day = currentDate.getDate();
  const defaultYear = month === 12 && day >= 10 ? year + 1 : year;

  return Math.max(PETYR_ANNUAL_FORECAST_START_YEAR, defaultYear);
}

export function getAnnualForecastEntryYearOptions(currentDate = new Date()) {
  const defaultYear = getAnnualForecastEntryDefaultYear(currentDate);
  const maxYear = Math.max(PETYR_ANNUAL_FORECAST_START_YEAR + 1, defaultYear + 1);
  const years: number[] = [];

  for (let year = PETYR_ANNUAL_FORECAST_START_YEAR; year <= maxYear; year += 1) {
    years.push(year);
  }

  return years;
}

export function isValidAnnualForecastEntryYear(year: number, currentDate = new Date()) {
  return Number.isInteger(year) && getAnnualForecastEntryYearOptions(currentDate).includes(year);
}

export function getAnnualForecastEntryInitialMode(
  year: number,
  currentDate = new Date(),
  override: AnnualForecastInitialModeOverride = {}
) {
  const current = startOfLocalDay(currentDate).getTime();
  const start = new Date(year - 1, 11, 10).getTime();
  const end = new Date(year, 0, 10).getTime();
  const validYear = Number.isInteger(year) && year >= PETYR_ANNUAL_FORECAST_START_YEAR;
  const inDefaultWindow = validYear && current >= start && current <= end;
  const adminUnlocked = validYear && override.adminUnlocked === true;
  const editable = inDefaultWindow || adminUnlocked;

  return {
    editable,
    adminUnlocked,
    label: editable
      ? adminUnlocked
        ? "Forecast Initial admin-unlocked"
        : "Forecast Initial editable"
      : "Forecast Initial read-only",
    reason: adminUnlocked
      ? `Forecast Initial for ${year} is open because Petyr Admin unlocked this target year.`
      : editable
        ? `Forecast Initial for ${year} can be edited from December 10 ${year - 1} through January 10 ${year}.`
      : `Forecast Initial for ${year} is editable only from December 10 ${year - 1} through January 10 ${year}.`
  };
}

export function isPetyrAnnualConfidence(value: string): value is PetyrAnnualConfidence {
  return PETYR_ANNUAL_CONFIDENCE_VALUES.includes(value as PetyrAnnualConfidence);
}

export function calculateAnnualForecastOngoing(values: Array<number | null | undefined>) {
  return values.reduce<number>((sum, value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return sum;
    return sum + value;
  }, 0);
}

export function calculateAnnualForecastPercentages(input: {
  revenue: number;
  planned: number;
  fcOngoing: number | null | undefined;
}): PetyrAnnualForecastPercentages {
  const denominator = input.fcOngoing;
  if (typeof denominator !== "number" || !Number.isFinite(denominator) || denominator <= 0) {
    return {
      revenuePct: null,
      plannedPct: null,
      uncoveredPct: null
    };
  }

  const revenuePct = input.revenue / denominator;
  const plannedPct = input.planned / denominator;

  return {
    revenuePct,
    plannedPct,
    uncoveredPct: 1 - revenuePct - plannedPct
  };
}
