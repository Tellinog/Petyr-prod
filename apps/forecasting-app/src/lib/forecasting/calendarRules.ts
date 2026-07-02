export {
  getForecastEntryMode,
  getForecastEntryModeDiagnostics,
  type EditableForecastType,
  type ForecastEntryMode,
  type ForecastEntryModeParams,
  type ForecastEntryTarget
} from "../forecastEntryMode";

export type AnnualForecastStatus = "draft" | "consolidated";

export type AnnualForecastMode = {
  year: number;
  currentYear: number;
  status: AnnualForecastStatus | null;
  isAdmin: boolean;
  isPastYear: boolean;
  isCurrentYear: boolean;
  isFutureYear: boolean;
  isNextYear: boolean;
  isConsolidationWindowOpen: boolean;
  canSaveDraft: boolean;
  canConsolidate: boolean;
  readOnly: boolean;
  label: string;
  reason: string;
};

export type AnnualForecastModeParams = {
  year: number;
  currentDate?: Date;
  status?: AnnualForecastStatus | null;
  isAdmin?: boolean;
};

export function isAnnualForecastConsolidationWindow(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return month === 12 && day >= 15 && day <= 30;
}

export function isAnnualForecastConsolidationTarget(year: number, date = new Date()) {
  return year === date.getFullYear() + 1 && isAnnualForecastConsolidationWindow(date);
}

export function getAnnualForecastMode(params: AnnualForecastModeParams): AnnualForecastMode {
  const currentDate = params.currentDate ?? new Date();
  const currentYear = currentDate.getFullYear();
  const isPastYear = params.year < currentYear;
  const isCurrentYear = params.year === currentYear;
  const isFutureYear = params.year > currentYear;
  const isNextYear = params.year === currentYear + 1;
  const isAdmin = params.isAdmin === true;
  const status = params.status ?? null;
  const isConsolidated = status === "consolidated";
  const isConsolidationWindowOpen = isAnnualForecastConsolidationWindow(currentDate);
  const canConsolidate = isNextYear && isConsolidationWindowOpen && (!isConsolidated || isAdmin);

  if (!Number.isInteger(params.year) || params.year < 2000 || params.year > 2100) {
    return {
      year: params.year,
      currentYear,
      status,
      isAdmin,
      isPastYear: false,
      isCurrentYear: false,
      isFutureYear: false,
      isNextYear: false,
      isConsolidationWindowOpen,
      canSaveDraft: false,
      canConsolidate: false,
      readOnly: true,
      label: "Invalid annual forecast year",
      reason: "Annual forecast requires a valid year between 2000 and 2100."
    };
  }

  if (isPastYear) {
    return {
      year: params.year,
      currentYear,
      status,
      isAdmin,
      isPastYear,
      isCurrentYear,
      isFutureYear,
      isNextYear,
      isConsolidationWindowOpen,
      canSaveDraft: false,
      canConsolidate: false,
      readOnly: true,
      label: "Read-only annual forecast",
      reason: "Past years are closed and can only be consulted."
    };
  }

  if (isCurrentYear) {
    return {
      year: params.year,
      currentYear,
      status,
      isAdmin,
      isPastYear,
      isCurrentYear,
      isFutureYear,
      isNextYear,
      isConsolidationWindowOpen,
      canSaveDraft: false,
      canConsolidate: false,
      readOnly: true,
      label: "Current-year progress",
      reason: "The current year is consultative: annual forecast is compared with closed revenue progress."
    };
  }

  if (isConsolidated && !isAdmin) {
    return {
      year: params.year,
      currentYear,
      status,
      isAdmin,
      isPastYear,
      isCurrentYear,
      isFutureYear,
      isNextYear,
      isConsolidationWindowOpen,
      canSaveDraft: false,
      canConsolidate,
      readOnly: true,
      label: "Consolidated annual forecast",
      reason: "Consolidated annual forecast records are read-only unless an admin edits them."
    };
  }

  return {
    year: params.year,
    currentYear,
    status,
    isAdmin,
    isPastYear,
    isCurrentYear,
    isFutureYear,
    isNextYear,
    isConsolidationWindowOpen,
    canSaveDraft: isFutureYear,
    canConsolidate,
    readOnly: !isFutureYear,
    label: isAdmin && isConsolidated ? "Admin annual forecast edit" : "Draft annual forecast",
    reason: isNextYear
      ? "Future-year annual forecast can be saved as draft; next-year consolidation is available only from December 15 through December 30."
      : "Future-year annual forecast can be saved as draft."
  };
}
