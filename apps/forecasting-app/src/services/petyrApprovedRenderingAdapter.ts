import { getPetyrDefaultYear } from "@/lib/petyr/config";
import { PETYR_BUSINESS_UNITS } from "@/lib/petyr/constants";
import { formatPetyrCurrency } from "@/lib/petyr/formatters";
import { startPetyrPerformanceTimer } from "@/lib/petyr/performance";
import {
  getBusinessUnitSummary,
  getCsmOverviewWorkspace,
  getManagementView,
  type PetyrBusinessUnitSummary,
  type PetyrCompanyOverview,
  type PetyrCsmOverviewCompany,
  type PetyrCsmOverviewWorkspace,
  type PetyrManagementAggregateRow,
  type PetyrManagementMonthlyMetric,
  type PetyrManagementView,
  type PetyrMonthlyRevenueTrend
} from "@/services/petyrDataService";
import { buildPetyrAlertsFromOverview, type PetyrAlert } from "@/services/petyrAlertService";
import type {
  ApprovedUrgentAction,
  BranchRow,
  BusinessUnitRow,
  CompanyProfile,
  CustomerBusinessUnitMonth,
  CustomerMonth,
  CustomerRow,
  ManagementRow,
  MonthlyMetric,
  PetyrApprovedRenderingData,
  PetyrRenderingDiagnostic,
  ProgressMetrics,
  RevenueSeriesRow
} from "@/types/petyrApprovedRendering";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const APPROVED_URGENT_ACTION_GROUPS: Array<Pick<ApprovedUrgentAction, "id" | "title" | "description">> = [
  {
    id: "agreement_expiring_60_days",
    title: "Agreements expiring within 60 days",
    description: "Active agreements whose expiry date is inside the next 60 days."
  },
  {
    id: "expiredAgreementWithResidual",
    title: "Expired agreement with residual",
    description: "Expired agreements whose residual value is still positive."
  },
  {
    id: "high_agreement_residual",
    title: "High agreement residuals",
    description: "Companies with high residual value or material residual ratio."
  },
  {
    id: "forecast_not_updated",
    title: "Forecast not updated",
    description: "Companies without a saved value for the current editable forecast."
  },
  {
    id: "business_unit_below_historical_pace",
    title: "Business Unit below history",
    description: "Company and Business Unit pairs under comparable historical pace."
  },
  {
    id: "csm_forecast_below_ai_forecast",
    title: "CSM forecast below AI forecast",
    description: "Companies where CSM forecast is materially below available AI forecast."
  }
];
const APPROVED_URGENT_ACTION_IDS = new Set(APPROVED_URGENT_ACTION_GROUPS.map((group) => group.id));

export type PetyrApprovedRenderingView = "all" | "management" | "csm" | "csm-scoped";

function monthLabel(month: number) {
  return MONTH_LABELS[month - 1] ?? String(month);
}

function normalizeKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function formatMoney(value: number) {
  return formatPetyrCurrency(value);
}

function isApprovedUrgentActionType(type: PetyrAlert["type"]): type is ApprovedUrgentAction["id"] {
  return APPROVED_URGENT_ACTION_IDS.has(type as ApprovedUrgentAction["id"]);
}

function toDiagnostic(message: string, severity: PetyrRenderingDiagnostic["severity"] = "warning") {
  return {
    severity,
    message
  };
}

function uniqueDiagnostics(messages: PetyrRenderingDiagnostic[]) {
  const seen = new Set<string>();
  return messages.filter((item) => {
    const key = `${item.severity}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function monthlyTrendToMetric(row: PetyrMonthlyRevenueTrend): MonthlyMetric {
  return {
    month: monthLabel(row.month),
    forecastMese: row.previousMonthForecast,
    forecastOngoing: row.ongoingForecast,
    forecastAI: row.aiForecast,
    real: row.actualRevenue
  };
}

function aggregateMonthToMetric(row: PetyrManagementMonthlyMetric): MonthlyMetric {
  return {
    month: monthLabel(row.month),
    forecastMese: row.forecast,
    forecastOngoing: 0,
    forecastAI: 0,
    real: row.worked
  };
}

function aggregateMetrics(row: PetyrManagementAggregateRow): ProgressMetrics {
  return {
    workedPct: row.workedYtdPct,
    workedAndPlannedPct: row.workedAndPlannedPct,
    initialForecast: row.initialForecast,
    ongoingForecast: row.ongoingForecast,
    workedYtd: row.workedYtd,
    plannedFuture: row.plannedFuture,
    workedAndPlanned: row.workedAndPlanned,
    forecastMeseYtd: row.monthly.reduce((sum, item) => sum + item.forecast, 0),
    forecastYear: row.ongoingForecast ?? row.forecast
  };
}

function branchRow(row: PetyrManagementAggregateRow): BranchRow {
  return {
    code: row.label,
    label: `€ Revenue ${row.label}`,
    yearlyObjective: row.yearlyObjective,
    monthly: row.monthly.map(aggregateMonthToMetric),
    metrics: aggregateMetrics(row)
  };
}

function businessUnitRow(row: PetyrManagementAggregateRow): BusinessUnitRow {
  return {
    code: row.label,
    label: row.label,
    yearlyObjective: row.yearlyObjective,
    monthly: row.monthly.map(aggregateMonthToMetric),
    metrics: aggregateMetrics(row)
  };
}

function managementRow(row: PetyrManagementAggregateRow): ManagementRow {
  return {
    csm: row.label,
    monthly: row.monthly.map(aggregateMonthToMetric),
    metrics: aggregateMetrics(row)
  };
}

function customerMonths(company: PetyrCsmOverviewCompany): CustomerMonth[] {
  return company.months.map((month) => ({
    month: month.month,
    businessUnits: month.businessUnits
  }));
}

function customerRow(company: PetyrCsmOverviewCompany): CustomerRow {
  return {
    company: company.companyName,
    csm: company.csmName,
    activeAgreement: company.primaryAgreementName ?? "n/a",
    totalAgreement: company.totalAgreementValue,
    residual: company.residualAgreementValue,
    expiry: company.primaryAgreementExpiry ?? "n/a",
    forecastMese: company.previousMonthForecast,
    forecastOngoing: company.ongoingForecast,
    forecastAI: company.aiForecast,
    real: company.currentYearRevenue,
    forecastAccuracy: company.forecastAccuracyLabel,
    aiAccuracy: company.aiAccuracyLabel,
    risk: company.dataQualityStatus,
    months: customerMonths(company)
  };
}

function monthlyFromCustomer(row: CustomerRow): MonthlyMetric[] {
  return MONTH_LABELS.map((month, index) => {
    const monthData = row.months?.find((item) => item.month === index + 1);
    const totals = monthData?.businessUnits.reduce(
      (summary, businessUnit) => ({
        forecastMese: summary.forecastMese + businessUnit.previousMonthForecast,
        forecastOngoing: summary.forecastOngoing + businessUnit.ongoingForecast,
        forecastAI: summary.forecastAI + businessUnit.aiForecast,
        real: summary.real + businessUnit.actualRevenue
      }),
      { forecastMese: 0, forecastOngoing: 0, forecastAI: 0, real: 0 }
    );

    return {
      month,
      forecastMese: totals?.forecastMese ?? 0,
      forecastOngoing: totals?.forecastOngoing ?? 0,
      forecastAI: totals?.forecastAI ?? 0,
      real: totals?.real ?? 0
    };
  });
}

function customerRowFromCompanyOverview(company: PetyrCompanyOverview): CustomerRow {
  return {
    company: company.companyName,
    csm: company.csmName,
    activeAgreement: company.primaryAgreementName ?? "n/a",
    totalAgreement: company.totalAgreementValue,
    residual: company.residualAgreementValue,
    expiry: company.primaryAgreementExpiry ?? "n/a",
    forecastMese: company.previousMonthForecast,
    forecastOngoing: company.ongoingForecast,
    forecastAI: company.aiForecast,
    real: company.currentYearRevenue,
    forecastAccuracy: company.forecastAccuracyLabel,
    aiAccuracy: company.aiAccuracyLabel,
    risk: company.dataQualityStatus,
    months: []
  };
}

function companyProfileFromCustomer(row: CustomerRow): CompanyProfile {
  const monthly = monthlyFromCustomer(row);

  return {
    csm: row.csm,
    totalAgreements: row.totalAgreement,
    workedYTD: row.real,
    residual: row.residual,
    monthly,
    budgetGroups: null,
    campaigns: null,
    alerts: []
  };
}

function buildCompanyProfiles(rows: CustomerRow[]) {
  return rows.reduce<Record<string, CompanyProfile>>((profiles, row) => {
    profiles[row.company] = companyProfileFromCustomer(row);
    return profiles;
  }, {});
}

function businessUnitSeries(
  currentYear: number,
  currentYearRows: PetyrBusinessUnitSummary[],
  previousYearRows: PetyrBusinessUnitSummary[],
  twoYearsAgoRows: PetyrBusinessUnitSummary[]
): RevenueSeriesRow[] {
  const byYear = new Map<number, Map<string, PetyrBusinessUnitSummary>>([
    [currentYear, new Map(currentYearRows.map((row) => [row.businessUnit, row]))],
    [currentYear - 1, new Map(previousYearRows.map((row) => [row.businessUnit, row]))],
    [currentYear - 2, new Map(twoYearsAgoRows.map((row) => [row.businessUnit, row]))]
  ]);

  return PETYR_BUSINESS_UNITS.map((businessUnit) => {
    const y2024 = byYear.get(currentYear - 2)?.get(businessUnit);
    const y2025 = byYear.get(currentYear - 1)?.get(businessUnit);
    const y2026 = byYear.get(currentYear)?.get(businessUnit);

    return {
      group: businessUnit,
      y2024: y2024?.actualRevenue ?? 0,
      y2025: y2025?.actualRevenue ?? 0,
      y2026: y2026?.actualRevenue ?? 0,
      y2024Forecast: y2024?.annualForecast || y2024?.previousMonthForecast || undefined,
      y2025Forecast: y2025?.annualForecast || y2025?.previousMonthForecast || undefined,
      y2026Forecast: y2026?.annualForecast || y2026?.previousMonthForecast || undefined,
      y2024InitialForecast: y2024?.initialForecast ?? null,
      y2025InitialForecast: y2025?.initialForecast ?? null,
      y2026InitialForecast: y2026?.initialForecast ?? null,
      y2024PreviousMonthForecast: y2024?.previousMonthForecast || undefined,
      y2025PreviousMonthForecast: y2025?.previousMonthForecast || undefined,
      y2026PreviousMonthForecast: y2026?.previousMonthForecast || undefined
    };
  });
}

function alertBadges(alert: PetyrAlert, company: PetyrCsmOverviewCompany | undefined) {
  const residualValue = alert.residualAmount ?? company?.activeResidualAgreementValue ?? null;
  const totalValue = alert.totalAgreementValue ?? company?.activeTotalAgreementValue ?? null;
  const expiry = alert.agreementExpiry ?? company?.primaryAgreementExpiry ?? null;
  const agreementEvidence = [
    alert.agreementName ?? company?.primaryAgreementName ?? null,
    totalValue !== null && totalValue > 0 ? `Total agreement ${formatMoney(totalValue)}` : null,
    residualValue !== null && residualValue > 0 ? `Residual ${formatMoney(residualValue)}` : null,
    expiry ? `Exp. ${expiry}` : null
  ].filter((item): item is string => Boolean(item)).join(" - ");
  const badges = [
    alert.businessUnit,
    agreementEvidence || null,
    alert.agreementDealLink ? "Deal link" : null
  ].filter((badge): badge is string => Boolean(badge));

  return [...new Set(badges)].slice(0, 3);
}

function approvedUrgentActionsFromAlerts(overview: PetyrCsmOverviewWorkspace): ApprovedUrgentAction[] {
  const companyByKey = new Map(overview.companies.map((company) => [normalizeKey(company.companyName), company]));
  const alertsByType = new Map<ApprovedUrgentAction["id"], PetyrAlert[]>();

  for (const alert of buildPetyrAlertsFromOverview(overview)) {
    if (!isApprovedUrgentActionType(alert.type)) continue;

    alertsByType.set(alert.type, [...(alertsByType.get(alert.type) ?? []), alert]);
  }

  return APPROVED_URGENT_ACTION_GROUPS
    .map<ApprovedUrgentAction>((group) => ({
      ...group,
      companies: (alertsByType.get(group.id) ?? []).map((alert) => {
        const company = companyByKey.get(normalizeKey(alert.companyName));

        return {
          company: alert.companyName,
          csm: alert.csmName,
          activeAgreement: alert.message,
          residual: alert.residualAmount ?? company?.activeResidualAgreementValue ?? 0,
          expiry: alert.agreementExpiry ?? company?.primaryAgreementExpiry ?? "n/a",
          detail: alert.explanation,
          badges: alertBadges(alert, company)
        };
      })
    }))
    .filter((action) => action.companies.length > 0);
}

function hasMonthlyMetricData(row: MonthlyMetric | PetyrMonthlyRevenueTrend | PetyrManagementMonthlyMetric) {
  return Object.entries(row).some(([key, value]) => key !== "month" && typeof value === "number" && value > 0);
}

function hasCustomerRealData(row: CustomerRow) {
  return (
    row.totalAgreement > 0 ||
    row.residual > 0 ||
    row.forecastMese > 0 ||
    row.forecastOngoing > 0 ||
    row.forecastAI > 0 ||
    row.real > 0 ||
    Boolean(row.activeAgreement && row.activeAgreement !== "n/a") ||
    (row.months ?? []).some((month) => month.businessUnits.some((businessUnit) => (
      businessUnit.actualRevenue > 0 ||
      businessUnit.previousMonthForecast > 0 ||
      businessUnit.ongoingForecast > 0 ||
      businessUnit.aiForecast > 0
    )))
  );
}

function hasBusinessUnitRealData(row: PetyrBusinessUnitSummary) {
  return (
    row.actualRevenue > 0 ||
    row.plannedFuture > 0 ||
    (row.forecast ?? 0) > 0 ||
    row.previousMonthForecast > 0 ||
    row.ongoingForecast > 0 ||
    row.annualForecast > 0 ||
    row.aiForecast > 0 ||
    row.closedRevenueCampaignsCount > 0 ||
    row.plannedFutureCampaignsCount > 0 ||
    row.monthlyForecastRowsCount > 0 ||
    row.annualForecastRowsCount > 0 ||
    row.aiForecastRowsCount > 0
  );
}

function hasManagementAggregateRealData(row: PetyrManagementAggregateRow) {
  return (
    row.workedYtd > 0 ||
    row.plannedFuture > 0 ||
    row.workedAndPlanned > 0 ||
    row.forecast > 0 ||
    (row.ongoingForecast ?? 0) > 0 ||
    (row.initialForecast ?? 0) > 0 ||
    (row.yearlyObjective ?? 0) > 0 ||
    row.monthly.some(hasMonthlyMetricData)
  );
}

function hasManagementRealData(data: PetyrManagementView) {
  return (
    data.companies.some((company) => hasCustomerRealData(customerRowFromCompanyOverview(company))) ||
    data.monthlyTrend.some(hasMonthlyMetricData) ||
    data.monthlyTotals.some(hasMonthlyMetricData) ||
    data.branchAggregates.some(hasManagementAggregateRealData) ||
    data.businessUnitAggregates.some(hasManagementAggregateRealData) ||
    data.csmAggregates.some(hasManagementAggregateRealData) ||
    data.businessUnits.some(hasBusinessUnitRealData)
  );
}

function buildTrendNotes(input: {
  managementRows: ManagementRow[];
  branchRows: BranchRow[];
  businessUnitRows: BusinessUnitRow[];
  diagnostics: PetyrRenderingDiagnostic[];
}) {
  const positive: string[] = [];
  const negative: string[] = [];
  const topBranch = input.branchRows[0];
  const topBusinessUnit = [...input.businessUnitRows].sort((left, right) => {
    const leftValue = left.metrics?.workedAndPlanned ?? 0;
    const rightValue = right.metrics?.workedAndPlanned ?? 0;
    return rightValue - leftValue;
  })[0];
  const bottomBusinessUnit = [...input.businessUnitRows].sort((left, right) => {
    const leftValue = left.metrics?.workedYtd ?? 0;
    const rightValue = right.metrics?.workedYtd ?? 0;
    return leftValue - rightValue;
  })[0];

  if (topBranch && (topBranch.metrics?.workedAndPlanned ?? 0) > 0) {
    positive.push(`${topBranch.code} has the highest Closed revenue + planned in the selected year.`);
  }

  if (topBusinessUnit && (topBusinessUnit.metrics?.workedAndPlanned ?? 0) > 0) {
    positive.push(`${topBusinessUnit.label} is the strongest Business Unit by Closed revenue + planned.`);
  }

  if (bottomBusinessUnit && input.businessUnitRows.some((row) => (row.metrics?.workedYtd ?? 0) > 0)) {
    negative.push(`${bottomBusinessUnit.label} has the lowest Closed revenue YTD among official Business Units.`);
  }

  for (const diagnostic of input.diagnostics.filter((item) => item.severity !== "info").slice(0, 3)) {
    negative.push(diagnostic.message);
  }

  return {
    positiveTrends: positive.length ? positive.slice(0, 4) : ["No positive trend is available until PostgreSQL-backed Petyr data is loaded."],
    negativeTrends: negative.length ? negative.slice(0, 4) : ["No negative trend is available until PostgreSQL-backed Petyr data is loaded."]
  };
}

export function getPetyrApprovedRenderingShellData(year = getPetyrDefaultYear()): PetyrApprovedRenderingData {
  return {
    source: "postgresql",
    year,
    monthlyManagement: MONTH_LABELS.map((month) => ({
      month,
      forecastMese: 0,
      forecastOngoing: 0,
      forecastAI: 0,
      real: 0
    })),
    budgetGroupSeries: [],
    branchRows: [],
    businessUnitRows: [],
    managementRows: [],
    csmCustomersBase: [],
    companyProfiles: {},
    urgentActions: [],
    positiveTrends: ["Petyr data is loading."],
    negativeTrends: ["Updated PostgreSQL-backed metrics will appear shortly."],
    forecastChangeLog: [],
    diagnostics: [toDiagnostic("Petyr rendered the Forecasting workspace shell while PostgreSQL-backed data refreshes in the background.", "info")]
  };
}

function addManagementDiagnostics(input: {
  diagnostics: PetyrRenderingDiagnostic[];
  branchRows: BranchRow[];
  hasRealPostgresData: boolean;
}) {
  if (input.branchRows.length === 0) {
    input.diagnostics.push(toDiagnostic(
      input.hasRealPostgresData
        ? "No Branch rows are available from PostgreSQL/company ownership. Petyr is using real PostgreSQL campaign/agreement/forecast data with Branch fallback instead of mock values."
        : "No Branch rows are available from PostgreSQL/company ownership, and no real PostgreSQL fallback data is available.",
      input.hasRealPostgresData ? "warning" : "blocking"
    ));
  }
}

function addCsmDiagnostics(input: {
  diagnostics: PetyrRenderingDiagnostic[];
  csmCustomersFromWorkspace: CustomerRow[];
  csmCustomersBase: CustomerRow[];
}) {
  if (input.csmCustomersFromWorkspace.length === 0) {
    input.diagnostics.push(toDiagnostic(
      input.csmCustomersBase.length > 0
        ? "No Company Ownership-backed CSM Overview rows were available. Petyr is rendering real PostgreSQL company rows from Management View instead of mock customers."
        : "No Company Ownership-backed companies are available for CSM Overview, and no real PostgreSQL fallback customers are available.",
      input.csmCustomersBase.length > 0 ? "warning" : "blocking"
    ));
  }
}

export async function getPetyrApprovedRenderingManagementData(year = getPetyrDefaultYear()): Promise<PetyrApprovedRenderingData> {
  const finishPerformance = startPetyrPerformanceTimer("getPetyrApprovedRenderingData", { year, view: "management" });

  try {
    const [managementResult, previousBusinessUnits, twoYearsAgoBusinessUnits] = await Promise.all([
      getManagementView(year),
      getBusinessUnitSummary(year - 1),
      getBusinessUnitSummary(year - 2)
    ]);
    const currentBusinessUnits = managementResult.data.businessUnits;
    const diagnostics = uniqueDiagnostics([
      ...managementResult.diagnostics.map((message) => toDiagnostic(message)),
      ...previousBusinessUnits.diagnostics.map((message) => toDiagnostic(message)),
      ...twoYearsAgoBusinessUnits.diagnostics.map((message) => toDiagnostic(message))
    ]);
    const monthlyManagement = managementResult.data.monthlyTrend.map(monthlyTrendToMetric);
    const branchRows = managementResult.data.branchAggregates.map(branchRow);
    const businessUnitRows = managementResult.data.businessUnitAggregates.map(businessUnitRow);
    const managementRows = managementResult.data.csmAggregates.map(managementRow);
    const csmCustomersBase = managementResult.data.companies.map(customerRowFromCompanyOverview);
    const hasRealPostgresData = (
      csmCustomersBase.some(hasCustomerRealData) ||
      hasManagementRealData(managementResult.data) ||
      currentBusinessUnits.some(hasBusinessUnitRealData) ||
      previousBusinessUnits.data.some(hasBusinessUnitRealData) ||
      twoYearsAgoBusinessUnits.data.some(hasBusinessUnitRealData)
    );

    addManagementDiagnostics({ diagnostics, branchRows, hasRealPostgresData });

    const trends = buildTrendNotes({
      managementRows,
      branchRows,
      businessUnitRows,
      diagnostics
    });

    return {
      ...getPetyrApprovedRenderingShellData(year),
      monthlyManagement,
      budgetGroupSeries: businessUnitSeries(year, currentBusinessUnits, previousBusinessUnits.data, twoYearsAgoBusinessUnits.data),
      branchRows,
      businessUnitRows,
      managementRows,
      csmCustomersBase,
      companyProfiles: buildCompanyProfiles(csmCustomersBase),
      positiveTrends: trends.positiveTrends,
      negativeTrends: trends.negativeTrends,
      diagnostics: uniqueDiagnostics(diagnostics)
    };
  } finally {
    finishPerformance();
  }
}

export async function getPetyrApprovedRenderingCsmData(year = getPetyrDefaultYear()): Promise<PetyrApprovedRenderingData> {
  const finishPerformance = startPetyrPerformanceTimer("getPetyrApprovedRenderingData", { year, view: "csm" });

  try {
    const csmWorkspaceResult = await getCsmOverviewWorkspace(year);
    const csmCustomersFromWorkspace = csmWorkspaceResult.data.companies.map(customerRow);
    const diagnostics = uniqueDiagnostics(csmWorkspaceResult.diagnostics.map((message) => toDiagnostic(message)));

    addCsmDiagnostics({
      diagnostics,
      csmCustomersFromWorkspace,
      csmCustomersBase: csmCustomersFromWorkspace
    });

    return {
      ...getPetyrApprovedRenderingShellData(year),
      csmCustomersBase: csmCustomersFromWorkspace,
      companyProfiles: buildCompanyProfiles(csmCustomersFromWorkspace),
      urgentActions: approvedUrgentActionsFromAlerts(csmWorkspaceResult.data),
      diagnostics: uniqueDiagnostics(diagnostics)
    };
  } finally {
    finishPerformance();
  }
}

export async function getPetyrApprovedRenderingScopedCsmData(
  csmName: string,
  year = getPetyrDefaultYear()
): Promise<PetyrApprovedRenderingData> {
  const finishPerformance = startPetyrPerformanceTimer("getPetyrApprovedRenderingData", { year, view: "csm-scoped" });

  try {
    const csmWorkspaceResult = await getCsmOverviewWorkspace(year);
    const csmKey = normalizeKey(csmName);
    const scopedWorkspace = {
      ...csmWorkspaceResult.data,
      csmNames: csmName ? [csmName] : csmWorkspaceResult.data.csmNames,
      companies: csmName
        ? csmWorkspaceResult.data.companies.filter((company) => normalizeKey(company.csmName) === csmKey)
        : []
    };
    const scopedCompanyKeys = new Set(scopedWorkspace.companies.map((company) => normalizeKey(company.companyName)));
    scopedWorkspace.urgentActions = csmWorkspaceResult.data.urgentActions
      .map((action) => ({
        ...action,
        companies: action.companies.filter((company) => scopedCompanyKeys.has(normalizeKey(company.companyName)))
      }))
      .filter((action) => action.companies.length > 0);
    const csmCustomersFromWorkspace = scopedWorkspace.companies.map(customerRow);
    const diagnostics = uniqueDiagnostics(csmWorkspaceResult.diagnostics.map((message) => toDiagnostic(message)));

    addCsmDiagnostics({
      diagnostics,
      csmCustomersFromWorkspace,
      csmCustomersBase: csmCustomersFromWorkspace
    });

    return {
      ...getPetyrApprovedRenderingShellData(year),
      csmCustomersBase: csmCustomersFromWorkspace,
      companyProfiles: buildCompanyProfiles(csmCustomersFromWorkspace),
      urgentActions: approvedUrgentActionsFromAlerts(scopedWorkspace),
      diagnostics: uniqueDiagnostics(diagnostics)
    };
  } finally {
    finishPerformance();
  }
}

export async function getPetyrApprovedRenderingData(year = getPetyrDefaultYear()): Promise<PetyrApprovedRenderingData> {
  const finishPerformance = startPetyrPerformanceTimer("getPetyrApprovedRenderingData", { year, view: "all" });

  try {
    const [managementResult, csmWorkspaceResult, previousBusinessUnits, twoYearsAgoBusinessUnits] = await Promise.all([
      getManagementView(year),
      getCsmOverviewWorkspace(year),
      getBusinessUnitSummary(year - 1),
      getBusinessUnitSummary(year - 2)
    ]);
    const currentBusinessUnits = managementResult.data.businessUnits;
    const diagnostics = uniqueDiagnostics([
      ...managementResult.diagnostics.map((message) => toDiagnostic(message)),
      ...csmWorkspaceResult.diagnostics.map((message) => toDiagnostic(message)),
      ...previousBusinessUnits.diagnostics.map((message) => toDiagnostic(message)),
      ...twoYearsAgoBusinessUnits.diagnostics.map((message) => toDiagnostic(message))
    ]);
    const monthlyManagement = managementResult.data.monthlyTrend.map(monthlyTrendToMetric);
    const branchRows = managementResult.data.branchAggregates.map(branchRow);
    const businessUnitRows = managementResult.data.businessUnitAggregates.map(businessUnitRow);
    const managementRows = managementResult.data.csmAggregates.map(managementRow);
    const csmCustomersFromWorkspace = csmWorkspaceResult.data.companies.map(customerRow);
    const csmCustomersBase = csmCustomersFromWorkspace.length > 0
      ? csmCustomersFromWorkspace
      : managementResult.data.companies.map(customerRowFromCompanyOverview);
    const hasRealPostgresData = (
      csmCustomersBase.some(hasCustomerRealData) ||
      hasManagementRealData(managementResult.data) ||
      currentBusinessUnits.some(hasBusinessUnitRealData) ||
      previousBusinessUnits.data.some(hasBusinessUnitRealData) ||
      twoYearsAgoBusinessUnits.data.some(hasBusinessUnitRealData)
    );

    addManagementDiagnostics({ diagnostics, branchRows, hasRealPostgresData });
    addCsmDiagnostics({ diagnostics, csmCustomersFromWorkspace, csmCustomersBase });

    const trends = buildTrendNotes({
      managementRows,
      branchRows,
      businessUnitRows,
      diagnostics
    });

    return {
      source: "postgresql",
      year,
      monthlyManagement,
      budgetGroupSeries: businessUnitSeries(year, currentBusinessUnits, previousBusinessUnits.data, twoYearsAgoBusinessUnits.data),
      branchRows,
      businessUnitRows,
      managementRows,
      csmCustomersBase,
      companyProfiles: buildCompanyProfiles(csmCustomersBase),
      urgentActions: approvedUrgentActionsFromAlerts(csmWorkspaceResult.data),
      positiveTrends: trends.positiveTrends,
      negativeTrends: trends.negativeTrends,
      forecastChangeLog: [],
      diagnostics: uniqueDiagnostics(diagnostics)
    };
  } finally {
    finishPerformance();
  }
}

export async function getPetyrApprovedRenderingDataForView(
  view: PetyrApprovedRenderingView,
  year = getPetyrDefaultYear(),
  options: { csmName?: string | null } = {}
) {
  if (view === "management") return getPetyrApprovedRenderingManagementData(year);
  if (view === "csm-scoped") return getPetyrApprovedRenderingScopedCsmData(options.csmName ?? "", year);
  if (view === "csm") return getPetyrApprovedRenderingCsmData(year);
  return getPetyrApprovedRenderingData(year);
}
