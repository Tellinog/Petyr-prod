import { getForecastEntryMode } from "@/lib/forecastEntryMode";
import { formatPetyrCurrency, formatPetyrPercent } from "@/lib/petyr/formatters";
import {
  getCompanyDetail,
  getCsmOverviewWorkspace,
  type PetyrAgreementDetail,
  type PetyrCompanyDetail,
  type PetyrCsmOverviewBusinessUnitForecast,
  type PetyrCsmOverviewCompany,
  type PetyrCsmOverviewWorkspace,
  type PetyrDataServiceResult
} from "@/services/petyrDataService";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const AGREEMENT_EXPIRING_DAYS = 60;
const HIGH_RESIDUAL_ABSOLUTE_THRESHOLD = 50000;
const HIGH_RESIDUAL_CRITICAL_THRESHOLD = 100000;
const HIGH_RESIDUAL_RATIO_THRESHOLD = 0.4;
const HIGH_RESIDUAL_CRITICAL_RATIO_THRESHOLD = 0.65;
const ACTUAL_UNDER_FORECAST_RATIO = 0.8;
const ACTUAL_UNDER_FORECAST_CRITICAL_RATIO = 0.5;
const CSM_AI_MATERIAL_RATIO = 0.8;
const CSM_AI_CRITICAL_RATIO = 0.5;
const CSM_AI_MIN_GAP = 5000;
const MIN_FORECAST_FOR_VARIANCE_ALERT = 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type PetyrAlertType =
  | "agreement_expiring_60_days"
  | "expiredAgreementWithResidual"
  | "high_agreement_residual"
  | "company_inactive"
  | "forecast_not_updated"
  | "past_month_locked"
  | "actual_under_forecast"
  | "csm_forecast_below_ai_forecast"
  | "business_unit_below_historical_pace";

export type PetyrAlertSeverity = "info" | "warning" | "critical";

export type PetyrAlert = {
  id: string;
  type: PetyrAlertType;
  severity: PetyrAlertSeverity;
  companyName: string;
  csmName: string;
  businessUnit?: string;
  agreementName?: string;
  agreementExpiry?: string | null;
  residualAmount?: number;
  totalAgreementValue?: number;
  agreementDealLink?: string | null;
  message: string;
  explanation: string;
  suggestedAction: string;
  targetUrl: string;
  year?: number;
  month?: number;
};

export type PetyrAlertQuery = {
  year?: number;
  month?: number;
  companyName?: string;
  csmName?: string;
  currentDate?: Date;
  limit?: number;
};

type ForecastSelection = {
  value: number;
  label: string;
};

type PetyrAlertBuildOptions = Required<Pick<PetyrAlertQuery, "year" | "month" | "currentDate">> &
  Pick<PetyrAlertQuery, "companyName" | "csmName" | "limit">;

function createResult<T>(data: T, diagnostics: string[]): PetyrDataServiceResult<T> {
  return {
    source: "postgresql",
    diagnostics: [...new Set(diagnostics)],
    data
  };
}

function normalizeKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function stableIdPart(value: string | number | null | undefined) {
  return String(value ?? "none")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "none";
}

function alertId(type: PetyrAlertType, ...parts: Array<string | number | null | undefined>) {
  return [type, ...parts.map(stableIdPart)].join(":");
}

function companyUrl(companyName: string, year?: number) {
  const path = `/forecasting/company/${encodeURIComponent(companyName)}`;
  return year ? `${path}?year=${year}` : path;
}

function forecastEntryUrl(companyName: string, csmName: string, year: number, month: number) {
  const params = new URLSearchParams({
    companyName,
    csmName,
    year: String(year),
    month: String(month)
  });

  return `/forecasting/entry?${params.toString()}`;
}

function formatMoney(value: number) {
  return formatPetyrCurrency(value);
}

function formatPercent(value: number) {
  return formatPetyrPercent(value * 100);
}

function monthLabel(year: number, month: number) {
  return `${MONTHS[month - 1] ?? `Month ${month}`} ${year}`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysUntil(date: Date, today: Date) {
  return Math.ceil((startOfLocalDay(date).getTime() - startOfLocalDay(today).getTime()) / ONE_DAY_MS);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isAgreementStatusActive(agreement: Pick<PetyrAgreementDetail, "status" | "expiryDate">, today: Date) {
  const status = normalizeKey(agreement.status);
  const expiryDate = parseDate(agreement.expiryDate);

  if (expiryDate && daysUntil(expiryDate, today) < 0) return false;

  if (status) {
    if (["cancel", "closed", "expired", "completed", "lost", "inactive", "terminat"].some((token) => status.includes(token))) return false;
    if (["active", "confirmed", "open", "ongoing", "signed", "in corso", "aperto"].some((token) => status.includes(token))) return true;
  }

  return true;
}

function resolveYear(value: number | undefined, today: Date, diagnostics: string[]) {
  if (value === undefined) return today.getFullYear();
  if (Number.isInteger(value) && value >= 2000 && value <= 2100) return value;

  diagnostics.push(`Invalid Petyr alert year "${value}". Falling back to ${today.getFullYear()}.`);
  return today.getFullYear();
}

function resolveMonth(value: number | undefined, fallbackMonth: number, diagnostics: string[]) {
  if (value === undefined) return fallbackMonth;
  if (Number.isInteger(value) && value >= 1 && value <= 12) return value;

  diagnostics.push(`Invalid Petyr alert month "${value}". Falling back to ${fallbackMonth}.`);
  return fallbackMonth;
}

function alertMatchesQuery(alert: PetyrAlert, query: Pick<PetyrAlertQuery, "companyName" | "csmName">) {
  if (query.companyName && normalizeKey(alert.companyName) !== normalizeKey(query.companyName)) return false;
  if (query.csmName && normalizeKey(alert.csmName) !== normalizeKey(query.csmName)) return false;

  return true;
}

function severityWeight(severity: PetyrAlertSeverity) {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  return 2;
}

function uniqueSortedAlerts(alerts: PetyrAlert[], limit?: number) {
  const byId = new Map<string, PetyrAlert>();

  for (const alert of alerts) {
    const existing = byId.get(alert.id);
    if (!existing || severityWeight(alert.severity) < severityWeight(existing.severity)) {
      byId.set(alert.id, alert);
    }
  }

  const sorted = [...byId.values()].sort((left, right) => {
    return (
      severityWeight(left.severity) - severityWeight(right.severity) ||
      left.companyName.localeCompare(right.companyName) ||
      left.type.localeCompare(right.type) ||
      (left.businessUnit ?? "").localeCompare(right.businessUnit ?? "") ||
      (left.agreementExpiry ?? "").localeCompare(right.agreementExpiry ?? "") ||
      (right.residualAmount ?? 0) - (left.residualAmount ?? 0) ||
      (left.agreementName ?? "").localeCompare(right.agreementName ?? "") ||
      left.message.localeCompare(right.message)
    );
  });

  return typeof limit === "number" && limit > 0 ? sorted.slice(0, limit) : sorted;
}

function currentForecastValue(
  businessUnit: PetyrCsmOverviewBusinessUnitForecast,
  editableForecastType: "previous_month" | "ongoing" | null
) {
  return editableForecastType === "ongoing"
    ? businessUnit.ongoingForecast
    : businessUnit.previousMonthForecast;
}

function committedForecastValue(businessUnit: PetyrCsmOverviewBusinessUnitForecast): ForecastSelection {
  if (businessUnit.ongoingForecast > 0) {
    return {
      value: businessUnit.ongoingForecast,
      label: "ongoing forecast"
    };
  }

  return {
    value: businessUnit.previousMonthForecast,
    label: "previous-month forecast"
  };
}

function monthForCompany(company: PetyrCsmOverviewCompany, month: number) {
  return company.months.find((item) => item.month === month) ?? null;
}

function buildAgreementExpiringAlertsFromActions(overview: PetyrCsmOverviewWorkspace, options: PetyrAlertBuildOptions): PetyrAlert[] {
  const action = overview.urgentActions.find((item) => item.id === "expiring-agreements");
  if (!action) return [];

  return action.companies.flatMap((item) => {
    const expiryDate = parseDate(item.agreementExpiry);
    if (!expiryDate) return [];

    const remainingDays = daysUntil(expiryDate, options.currentDate);
    if (remainingDays < 0 || remainingDays > AGREEMENT_EXPIRING_DAYS) return [];

    const severity: PetyrAlertSeverity = remainingDays <= 30 ? "critical" : "warning";
    const agreementName = item.agreementName ?? "Agreement";

    return [{
      id: alertId("agreement_expiring_60_days", item.companyName, agreementName, item.agreementExpiry),
      type: "agreement_expiring_60_days",
      severity,
      companyName: item.companyName,
      csmName: item.csmName,
      agreementName,
      agreementExpiry: item.agreementExpiry,
      residualAmount: item.residualAgreementValue,
      totalAgreementValue: item.totalAgreementValue,
      agreementDealLink: item.agreementDealLink,
      message: `${agreementName} expires within ${AGREEMENT_EXPIRING_DAYS} days.`,
      explanation: `Expiry is ${item.agreementExpiry}; ${remainingDays} day(s) remain. Residual value is ${formatMoney(item.residualAgreementValue)}.`,
      suggestedAction: "Review renewal, extension, or consumption plan with the account owner before the expiry date.",
      targetUrl: companyUrl(item.companyName, options.year),
      year: options.year,
      month: options.month
    }];
  });
}

function buildExpiredAgreementResidualAlertsFromActions(overview: PetyrCsmOverviewWorkspace, options: PetyrAlertBuildOptions): PetyrAlert[] {
  const action = overview.urgentActions.find((item) => item.id === "expired-agreement-residual");
  if (!action) return [];

  return action.companies.flatMap((item) => {
    const expiryDate = parseDate(item.agreementExpiry);
    if (!expiryDate || daysUntil(expiryDate, options.currentDate) >= 0 || item.residualAgreementValue <= 0) return [];

    const agreementName = item.agreementName ?? "Agreement";

    return [{
      id: alertId("expiredAgreementWithResidual", item.companyName, agreementName, item.agreementExpiry),
      type: "expiredAgreementWithResidual",
      severity: "warning",
      companyName: item.companyName,
      csmName: item.csmName,
      agreementName,
      agreementExpiry: item.agreementExpiry,
      residualAmount: item.residualAgreementValue,
      totalAgreementValue: item.totalAgreementValue,
      agreementDealLink: item.agreementDealLink,
      message: `${agreementName} is expired with residual ${formatMoney(item.residualAgreementValue)}.`,
      explanation: `Expiry was ${item.agreementExpiry}; residual amount is ${formatMoney(item.residualAgreementValue)}.`,
      suggestedAction: "Review whether the residual should be consumed, renewed, closed, or reconciled outside the expiring-soon workflow.",
      targetUrl: companyUrl(item.companyName, options.year),
      year: options.year,
      month: options.month
    }];
  });
}

function buildHighResidualAlerts(overview: PetyrCsmOverviewWorkspace, options: PetyrAlertBuildOptions): PetyrAlert[] {
  const action = overview.urgentActions.find((item) => item.id === "high-residual");
  if (!action) return [];

  const companyByKey = new Map(overview.companies.map((company) => [normalizeKey(company.companyName), company]));

  return action.companies.flatMap((item) => {
    const company = companyByKey.get(normalizeKey(item.companyName));
    const companyResidualValue = company?.activeResidualAgreementValue ?? item.residualAgreementValue;
    const companyTotalValue = company?.activeTotalAgreementValue ?? item.totalAgreementValue;

    if (company?.isForecastActive === false || companyResidualValue <= 0) return [];

    const residualRatio = companyTotalValue > 0
      ? companyResidualValue / companyTotalValue
      : 0;

    if (
      companyResidualValue < HIGH_RESIDUAL_ABSOLUTE_THRESHOLD &&
      residualRatio < HIGH_RESIDUAL_RATIO_THRESHOLD
    ) {
      return [];
    }

    const severity: PetyrAlertSeverity =
      companyResidualValue >= HIGH_RESIDUAL_CRITICAL_THRESHOLD ||
      residualRatio >= HIGH_RESIDUAL_CRITICAL_RATIO_THRESHOLD
        ? "critical"
        : "warning";
    const ratioText = companyTotalValue > 0
      ? ` Company active residual is ${formatPercent(residualRatio)} of active agreement value.`
      : "";
    const agreementText = item.agreementName
      ? `${item.agreementName} has residual ${formatMoney(item.residualAgreementValue)}.`
      : `Agreement residual to monitor: ${formatMoney(item.residualAgreementValue)}.`;

    return [
      {
        id: alertId("high_agreement_residual", item.companyName, item.agreementName ?? options.year, item.agreementExpiry),
        type: "high_agreement_residual",
        severity,
        companyName: item.companyName,
        csmName: item.csmName,
        agreementName: item.agreementName ?? undefined,
        agreementExpiry: item.agreementExpiry,
        residualAmount: item.residualAgreementValue,
        totalAgreementValue: item.totalAgreementValue,
        agreementDealLink: item.agreementDealLink,
        message: agreementText,
        explanation: `${agreementText} Total agreement value is ${formatMoney(item.totalAgreementValue)}.${ratioText}`,
        suggestedAction: "Check whether current and next-month forecast cover the residual, then align campaigns or renewal scope.",
        targetUrl: companyUrl(item.companyName, options.year),
        year: options.year,
        month: options.month
      }
    ];
  });
}

function buildInactiveCompanyAlerts(companies: PetyrCsmOverviewCompany[], options: PetyrAlertBuildOptions): PetyrAlert[] {
  return companies.flatMap((company) => {
    if (company.isForecastActive !== false) return [];

    return [
      {
        id: alertId("company_inactive", company.companyName),
        type: "company_inactive",
        severity: "info",
        companyName: company.companyName,
        csmName: company.csmName,
        message: `${company.companyName} is inactive for forecasting.`,
        explanation: company.dataQualityStatus.startsWith("Inactive")
          ? company.dataQualityStatus
          : "Petyr company_forecast_status marks this company as inactive.",
        suggestedAction: "Confirm the inactive reason before planning new forecast values.",
        targetUrl: companyUrl(company.companyName, options.year),
        year: options.year,
        month: options.month
      }
    ];
  });
}

function buildForecastNotUpdatedAlerts(companies: PetyrCsmOverviewCompany[], options: PetyrAlertBuildOptions): PetyrAlert[] {
  const mode = getForecastEntryMode({
    year: options.year,
    month: options.month,
    currentDate: options.currentDate
  });

  if (!mode.editableForecastType) return [];

  const forecastLabel = mode.editableForecastType === "ongoing" ? "ongoing forecast" : "previous-month forecast";

  return companies.flatMap((company) => {
    if (company.isForecastActive === false) return [];

    const month = monthForCompany(company, options.month);
    const total = month?.businessUnits.reduce((sum, businessUnit) => {
      return sum + currentForecastValue(businessUnit, mode.editableForecastType);
    }, 0) ?? 0;

    if (total > 0) return [];

    return [
      {
        id: alertId("forecast_not_updated", company.companyName, options.year, options.month, mode.editableForecastType),
        type: "forecast_not_updated",
        severity: "critical",
        companyName: company.companyName,
        csmName: company.csmName,
        message: `No ${forecastLabel} saved for ${monthLabel(options.year, options.month)}.`,
        explanation: mode.reason,
        suggestedAction: "Open Forecast Entry and save the current editable forecast values for the relevant Business Units.",
        targetUrl: forecastEntryUrl(company.companyName, company.csmName, options.year, options.month),
        year: options.year,
        month: options.month
      }
    ];
  });
}

function resolveLockedReferenceMonth(year: number, month: number, today: Date) {
  const mode = getForecastEntryMode({ year, month, currentDate: today });
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  if (mode.locked && (year < currentYear || (year === currentYear && month < currentMonth))) {
    return { year, month };
  }

  if (year === currentYear && month > 1) {
    return { year, month: month - 1 };
  }

  if (year < currentYear) {
    return { year, month: 12 };
  }

  return null;
}

function buildPastMonthLockedAlerts(companies: PetyrCsmOverviewCompany[], options: PetyrAlertBuildOptions): PetyrAlert[] {
  const lockedMonth = resolveLockedReferenceMonth(options.year, options.month, options.currentDate);
  if (!lockedMonth) return [];

  return companies.flatMap((company) => {
    if (company.isForecastActive === false) return [];

    const month = monthForCompany(company, lockedMonth.month);
    const hasLockedData = month?.businessUnits.some((businessUnit) => {
      return (
        businessUnit.actualRevenue > 0 ||
        businessUnit.previousMonthForecast > 0 ||
        businessUnit.ongoingForecast > 0 ||
        businessUnit.aiForecast > 0
      );
    }) ?? false;

    if (!hasLockedData) return [];

    return [
      {
        id: alertId("past_month_locked", company.companyName, lockedMonth.year, lockedMonth.month),
        type: "past_month_locked",
        severity: "info",
        companyName: company.companyName,
        csmName: company.csmName,
        message: `${monthLabel(lockedMonth.year, lockedMonth.month)} is locked.`,
        explanation: "Past months are read-only in Petyr; closed revenue and saved forecast values are retained for analysis.",
        suggestedAction: "Review the locked month for variance analysis, then adjust only current or future forecast periods.",
        targetUrl: forecastEntryUrl(company.companyName, company.csmName, lockedMonth.year, lockedMonth.month),
        year: lockedMonth.year,
        month: lockedMonth.month
      }
    ];
  });
}

function buildActualUnderForecastAlerts(companies: PetyrCsmOverviewCompany[], options: PetyrAlertBuildOptions): PetyrAlert[] {
  const comparisonMonth = resolveLockedReferenceMonth(options.year, options.month, options.currentDate);
  if (!comparisonMonth) return [];

  return companies.flatMap((company) => {
    if (company.isForecastActive === false) return [];

    const month = monthForCompany(company, comparisonMonth.month);
    if (!month) return [];

    return month.businessUnits.flatMap((businessUnit) => {
      const forecast = committedForecastValue(businessUnit);
      if (forecast.value < MIN_FORECAST_FOR_VARIANCE_ALERT) return [];

      const ratio = businessUnit.actualRevenue / forecast.value;
      if (ratio >= ACTUAL_UNDER_FORECAST_RATIO) return [];

      const severity: PetyrAlertSeverity = ratio < ACTUAL_UNDER_FORECAST_CRITICAL_RATIO ? "critical" : "warning";

      return [
        {
          id: alertId("actual_under_forecast", company.companyName, businessUnit.businessUnit, comparisonMonth.year, comparisonMonth.month),
          type: "actual_under_forecast",
          severity,
          companyName: company.companyName,
          csmName: company.csmName,
          businessUnit: businessUnit.businessUnit,
          message: `${businessUnit.businessUnit} closed revenue is under CSM forecast for ${monthLabel(comparisonMonth.year, comparisonMonth.month)}.`,
          explanation: `Closed revenue is ${formatMoney(businessUnit.actualRevenue)}, which is ${formatPercent(ratio)} of the ${forecast.label} value ${formatMoney(forecast.value)}.`,
          suggestedAction: "Review the variance and record any correction in the current editable forecast period.",
          targetUrl: forecastEntryUrl(company.companyName, company.csmName, comparisonMonth.year, comparisonMonth.month),
          year: comparisonMonth.year,
          month: comparisonMonth.month
        }
      ];
    });
  });
}

function buildCsmBelowAiForecastAlerts(companies: PetyrCsmOverviewCompany[], options: PetyrAlertBuildOptions): PetyrAlert[] {
  const mode = getForecastEntryMode({
    year: options.year,
    month: options.month,
    currentDate: options.currentDate
  });

  return companies.flatMap((company) => {
    if (company.isForecastActive === false) return [];

    const month = monthForCompany(company, options.month);
    if (!month) return [];

    return month.businessUnits.flatMap((businessUnit) => {
      if (businessUnit.aiForecast <= 0) return [];

      const forecast = mode.editableForecastType
        ? {
            value: currentForecastValue(businessUnit, mode.editableForecastType),
            label: mode.editableForecastType === "ongoing" ? "ongoing forecast" : "previous-month forecast"
          }
        : committedForecastValue(businessUnit);
      const gap = businessUnit.aiForecast - forecast.value;

      if (gap < CSM_AI_MIN_GAP || forecast.value >= businessUnit.aiForecast * CSM_AI_MATERIAL_RATIO) return [];

      const ratio = forecast.value / businessUnit.aiForecast;
      const severity: PetyrAlertSeverity = ratio < CSM_AI_CRITICAL_RATIO ? "critical" : "warning";

      return [
        {
          id: alertId("csm_forecast_below_ai_forecast", company.companyName, businessUnit.businessUnit, options.year, options.month),
          type: "csm_forecast_below_ai_forecast",
          severity,
          companyName: company.companyName,
          csmName: company.csmName,
          businessUnit: businessUnit.businessUnit,
          message: `${businessUnit.businessUnit} CSM forecast is materially below AI forecast.`,
          explanation: `${forecast.label} is ${formatMoney(forecast.value)} while AI forecast is ${formatMoney(businessUnit.aiForecast)}; the gap is ${formatMoney(gap)}.`,
          suggestedAction: "Compare the CSM assumption with the AI forecast evidence before saving the next forecast revision.",
          targetUrl: forecastEntryUrl(company.companyName, company.csmName, options.year, options.month),
          year: options.year,
          month: options.month
        }
      ];
    });
  });
}

function parseHistoryPaceRatio(detail: string) {
  const match = /(\d+)%/.exec(detail);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed / 100 : null;
}

function buildBusinessUnitHistoricalPaceAlerts(overview: PetyrCsmOverviewWorkspace, options: PetyrAlertBuildOptions): PetyrAlert[] {
  const action = overview.urgentActions.find((item) => item.id === "business-unit-gap");
  if (!action) return [];

  return action.companies.map((item) => {
    const ratio = parseHistoryPaceRatio(item.detail);
    const severity: PetyrAlertSeverity = ratio !== null && ratio < ACTUAL_UNDER_FORECAST_CRITICAL_RATIO ? "critical" : "warning";
    const businessUnit = item.businessUnit ?? "Business Unit";

    return {
      id: alertId("business_unit_below_historical_pace", item.companyName, businessUnit, options.year, options.month),
      type: "business_unit_below_historical_pace",
      severity,
      companyName: item.companyName,
      csmName: item.csmName,
      businessUnit,
      message: `${businessUnit} is below historical pace.`,
      explanation: `${item.reason} ${item.detail}`,
      suggestedAction: "Check whether the gap is expected, then plan recovery activity or explain the lower forecast.",
      targetUrl: forecastEntryUrl(item.companyName, item.csmName, options.year, options.month),
      year: options.year,
      month: options.month
    };
  });
}

export function buildPetyrAlertsFromOverview(
  overview: PetyrCsmOverviewWorkspace,
  input: Omit<PetyrAlertQuery, "year" | "month"> & Partial<Pick<PetyrAlertQuery, "year" | "month">> = {}
) {
  const currentDate = input.currentDate ?? new Date();
  const diagnostics: string[] = [];
  const year = resolveYear(input.year ?? overview.year, currentDate, diagnostics);
  const month = resolveMonth(input.month ?? overview.currentMonth, overview.currentMonth, diagnostics);
  const options: PetyrAlertBuildOptions = {
    year,
    month,
    currentDate,
    companyName: input.companyName,
    csmName: input.csmName,
    limit: input.limit
  };
  const alerts = [
    ...buildAgreementExpiringAlertsFromActions(overview, options),
    ...buildExpiredAgreementResidualAlertsFromActions(overview, options),
    ...buildHighResidualAlerts(overview, options),
    ...buildInactiveCompanyAlerts(overview.companies, options),
    ...buildForecastNotUpdatedAlerts(overview.companies, options),
    ...buildPastMonthLockedAlerts(overview.companies, options),
    ...buildActualUnderForecastAlerts(overview.companies, options),
    ...buildCsmBelowAiForecastAlerts(overview.companies, options),
    ...buildBusinessUnitHistoricalPaceAlerts(overview, options)
  ].filter((alert) => alertMatchesQuery(alert, input));

  return uniqueSortedAlerts(alerts, input.limit);
}

function buildCompanyExpiredAgreementResidualAlerts(
  detail: PetyrCompanyDetail,
  companyName: string,
  year: number,
  month: number,
  currentDate: Date
) {
  const csmName = detail.overview?.csmName ?? "Unassigned";

  return detail.agreements.flatMap((agreement): PetyrAlert[] => {
    const expiryDate = parseDate(agreement.expiryDate);
    if (!expiryDate || daysUntil(expiryDate, currentDate) >= 0 || agreement.residualValue <= 0) return [];

    return [
      {
        id: alertId("expiredAgreementWithResidual", companyName, agreement.name, agreement.expiryDate),
        type: "expiredAgreementWithResidual",
        severity: "warning",
        companyName,
        csmName,
        agreementName: agreement.name,
        agreementExpiry: agreement.expiryDate,
        residualAmount: agreement.residualValue,
        totalAgreementValue: agreement.totalValue,
        agreementDealLink: agreement.agreementDealLink,
        message: `${agreement.name} is expired with residual ${formatMoney(agreement.residualValue)}.`,
        explanation: `Expiry was ${agreement.expiryDate}; residual amount is ${formatMoney(agreement.residualValue)} against total value ${formatMoney(agreement.totalValue)}.`,
        suggestedAction: "Review the residual separately from expiring-soon actions and decide whether to consume, renew, close, or reconcile it.",
        targetUrl: companyUrl(companyName, year),
        year,
        month
      }
    ];
  });
}

function buildCompanyAgreementExpiringAlerts(
  detail: PetyrCompanyDetail,
  companyName: string,
  year: number,
  month: number,
  currentDate: Date
) {
  const csmName = detail.overview?.csmName ?? "Unassigned";

  return detail.agreements.flatMap((agreement): PetyrAlert[] => {
    if (!isAgreementStatusActive(agreement, currentDate)) return [];

    const expiryDate = parseDate(agreement.expiryDate);
    if (!expiryDate) return [];

    const remainingDays = daysUntil(expiryDate, currentDate);
    if (remainingDays < 0 || remainingDays > AGREEMENT_EXPIRING_DAYS) return [];

    return [
      {
        id: alertId("agreement_expiring_60_days", companyName, agreement.name, agreement.expiryDate),
        type: "agreement_expiring_60_days",
        severity: remainingDays <= 30 ? "critical" : "warning",
        companyName,
        csmName,
        agreementName: agreement.name,
        agreementExpiry: agreement.expiryDate,
        residualAmount: agreement.residualValue,
        totalAgreementValue: agreement.totalValue,
        agreementDealLink: agreement.agreementDealLink,
        message: `${agreement.name} expires in ${remainingDays} day(s).`,
        explanation: `Expiry is ${agreement.expiryDate}; residual value is ${formatMoney(agreement.residualValue)} against total value ${formatMoney(agreement.totalValue)}.`,
        suggestedAction: "Review renewal timing, residual consumption, and any campaign scope that should be pulled forward.",
        targetUrl: companyUrl(companyName, year),
        year,
        month
      }
    ];
  });
}

export async function getPetyrAlerts(input: PetyrAlertQuery = {}): Promise<PetyrDataServiceResult<PetyrAlert[]>> {
  const diagnostics: string[] = [];
  const currentDate = input.currentDate ?? new Date();
  const year = resolveYear(input.year, currentDate, diagnostics);
  const overviewResult = await getCsmOverviewWorkspace(year);
  const month = resolveMonth(input.month, overviewResult.data.currentMonth, diagnostics);
  const alerts = buildPetyrAlertsFromOverview(overviewResult.data, {
    ...input,
    year,
    month,
    currentDate
  });

  diagnostics.push(...overviewResult.diagnostics);
  return createResult(alerts, diagnostics);
}

function buildCompanyScopedOverviewWorkspace(
  detail: PetyrCompanyDetail,
  year: number,
  currentMonth: number
): PetyrCsmOverviewWorkspace | null {
  const overview = detail.overview;
  if (!overview) return null;

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;

    return {
      year,
      month,
      businessUnits: detail.monthlyBusinessUnitView.map((row) => {
        const monthValue = row.months.find((item) => item.month === month);

        return {
          businessUnit: row.businessUnit,
          actualRevenue: monthValue?.actualRevenue ?? 0,
          previousMonthForecast: monthValue?.previousMonthForecast ?? 0,
          ongoingForecast: monthValue?.ongoingForecast ?? 0,
          aiForecast: monthValue?.aiForecast ?? 0
        };
      })
    };
  });

  return {
    year,
    currentMonth,
    nextMonth: Math.min(currentMonth + 1, 12),
    csmNames: [overview.csmName],
    companies: [{ ...overview, months }],
    urgentActions: []
  };
}

export async function getPetyrCompanyAlerts(
  companyName: string,
  input: Omit<PetyrAlertQuery, "companyName"> = {}
): Promise<PetyrDataServiceResult<PetyrAlert[]>> {
  const diagnostics: string[] = [];
  const currentDate = input.currentDate ?? new Date();
  const year = resolveYear(input.year, currentDate, diagnostics);
  const detailResult = await getCompanyDetail(companyName, year);

  return buildPetyrCompanyAlertsFromDetail(detailResult.data, companyName, {
    ...input,
    year,
    currentDate,
    diagnostics: [...diagnostics, ...detailResult.diagnostics]
  });
}

export function buildPetyrCompanyAlertsFromDetail(
  detail: PetyrCompanyDetail,
  companyName: string,
  input: Omit<PetyrAlertQuery, "companyName"> & { diagnostics?: string[] } = {}
): PetyrDataServiceResult<PetyrAlert[]> {
  const diagnostics = [...(input.diagnostics ?? [])];
  const currentDate = input.currentDate ?? new Date();
  const year = resolveYear(input.year, currentDate, diagnostics);
  const month = resolveMonth(input.month, currentDate.getMonth() + 1, diagnostics);
  const resolvedCompanyName = detail.overview?.companyName ?? companyName;
  const scopedOverview = buildCompanyScopedOverviewWorkspace(detail, year, month);
  const alerts = scopedOverview
    ? buildPetyrAlertsFromOverview(scopedOverview, { ...input, companyName: resolvedCompanyName, year, month, currentDate })
    : [];

  return createResult(
    uniqueSortedAlerts(
      [
        ...alerts,
        ...buildCompanyAgreementExpiringAlerts(detail, resolvedCompanyName, year, month, currentDate),
        ...buildCompanyExpiredAgreementResidualAlerts(detail, resolvedCompanyName, year, month, currentDate)
      ],
      input.limit
    ),
    diagnostics
  );
}
