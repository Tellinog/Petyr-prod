export type CompanyForecastPaceStatus = "green" | "orange" | "red" | "unavailable";

export type CompanyForecastPace = {
  status: CompanyForecastPaceStatus;
  closedRevenueAndPlanned: number;
  annualForecast: number | null;
  expectedPacePercent: number | null;
  expectedValue: number | null;
  attainmentPercent: number | null;
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Compares the current-year closed revenue plus valid planned revenue with the
 * annual Forecast Ongoing expected by the current calendar month. The expected
 * percentage is rounded down to a whole number so August is 66%, as used in
 * the Petyr product rule.
 */
export function calculateCompanyForecastPace(input: {
  closedRevenueYtd: number | null | undefined;
  plannedRevenue: number | null | undefined;
  annualForecast: number | null | undefined;
  selectedYear: number;
  now?: Date;
}): CompanyForecastPace {
  const now = input.now ?? new Date();
  const currentYear = now.getFullYear();
  const annualForecast = Number(input.annualForecast);
  const closedRevenueYtd = Number(input.closedRevenueYtd) || 0;
  const plannedRevenue = Number(input.plannedRevenue) || 0;
  const closedRevenueAndPlanned = round(closedRevenueYtd + plannedRevenue);

  if (!Number.isFinite(annualForecast) || annualForecast <= 0 || input.selectedYear !== currentYear) {
    return {
      status: "unavailable",
      closedRevenueAndPlanned,
      annualForecast: null,
      expectedPacePercent: null,
      expectedValue: null,
      attainmentPercent: null
    };
  }

  const expectedPacePercent = Math.floor(((now.getMonth() + 1) / 12) * 100);
  const expectedValue = round(annualForecast * expectedPacePercent / 100);
  const attainmentPercent = expectedValue > 0 ? round(closedRevenueAndPlanned / expectedValue * 100) : null;
  const annualForecastSharePercent = closedRevenueAndPlanned / annualForecast * 100;
  const percentagePointShortfall = expectedPacePercent - annualForecastSharePercent;

  return {
    status: percentagePointShortfall <= 0 ? "green" : percentagePointShortfall <= 9 ? "orange" : "red",
    closedRevenueAndPlanned,
    annualForecast: round(annualForecast),
    expectedPacePercent,
    expectedValue,
    attainmentPercent
  };
}
