export type MonthlyMetric = {
  month: string;
  forecastMese: number;
  forecastOngoing: number;
  forecastAI: number;
  real: number;
};

export type ProgressMetrics = {
  workedPct: number | null;
  workedAndPlannedPct: number | null;
  initialForecast: number | null;
  ongoingForecast: number | null;
  workedYtd: number;
  plannedFuture: number | null;
  workedAndPlanned: number | null;
  forecastMeseYtd: number;
  forecastYear: number;
};

export type BranchRow = {
  code: string;
  label: string;
  yearlyObjective: number | null;
  monthly: MonthlyMetric[];
  metrics?: ProgressMetrics;
};

export type BusinessUnitRow = {
  code: string;
  label: string;
  yearlyObjective: number | null;
  monthly: MonthlyMetric[];
  metrics?: ProgressMetrics;
};

export type CustomerBusinessUnitMonth = {
  businessUnit: string;
  actualRevenue: number;
  previousMonthForecast: number;
  ongoingForecast: number;
  aiForecast: number;
};

export type CustomerMonth = {
  month: number;
  businessUnits: CustomerBusinessUnitMonth[];
};

export type CustomerRow = {
  company: string;
  csm: string;
  activeAgreement: string;
  totalAgreement: number;
  residual: number;
  expiry: string;
  forecastMese: number;
  forecastOngoing: number;
  forecastAI: number;
  real: number;
  forecastAccuracy: string;
  aiAccuracy: string;
  risk: string;
  months?: CustomerMonth[];
};

export type Campaign = {
  name: string;
  status: string;
  budgetGroup: string;
  agreement: string;
  value: number;
  costs: number;
  gmPct: number | null;
  link: string;
};

export type CompanyProfile = {
  csm: string;
  totalAgreements: number;
  workedYTD: number;
  residual: number;
  monthly: MonthlyMetric[];
  budgetGroups: Array<{ group: string; y2024: number; y2025: number; y2026: number }> | null;
  campaigns: Campaign[] | null;
  alerts: string[];
};

export type RevenueSeriesRow = {
  group: string;
  y2024: number;
  y2025: number;
  y2026: number;
  y2024Forecast?: number;
  y2025Forecast?: number;
  y2026Forecast?: number;
  y2024InitialForecast?: number | null;
  y2025InitialForecast?: number | null;
  y2026InitialForecast?: number | null;
  y2024PreviousMonthForecast?: number;
  y2025PreviousMonthForecast?: number;
  y2026PreviousMonthForecast?: number;
};

export type ManagementRow = {
  csm: string;
  monthly: MonthlyMetric[];
  metrics?: ProgressMetrics;
};

export type ForecastChangeLogEntry = {
  company: string;
  when: string;
  source: string;
  month: string;
  businessUnit: string;
  field: string;
  from: number;
  to: number;
  note: string;
};

export type ApprovedUrgentActionId =
  | "agreement_expiring_60_days"
  | "expiredAgreementWithResidual"
  | "high_agreement_residual"
  | "company_inactive"
  | "forecast_not_updated"
  | "past_month_locked"
  | "business_unit_below_historical_pace"
  | "csm_forecast_below_ai_forecast";

export type ApprovedUrgentAction = {
  id: ApprovedUrgentActionId;
  title: string;
  description: string;
  companies: Array<{
    company: string;
    csm: string;
    activeAgreement: string;
    residual: number;
    expiry: string;
    detail: string;
    badges?: string[];
  }>;
};

export type PetyrRenderingDiagnostic = {
  severity: "blocking" | "warning" | "info";
  message: string;
};

export type PetyrApprovedRenderingData = {
  source: "postgresql";
  year: number;
  monthlyManagement: MonthlyMetric[];
  budgetGroupSeries: RevenueSeriesRow[];
  branchRows: BranchRow[];
  businessUnitRows: BusinessUnitRow[];
  managementRows: ManagementRow[];
  csmCustomersBase: CustomerRow[];
  companyProfiles: Record<string, CompanyProfile>;
  urgentActions: ApprovedUrgentAction[];
  positiveTrends: string[];
  negativeTrends: string[];
  forecastChangeLog: ForecastChangeLogEntry[];
  diagnostics: PetyrRenderingDiagnostic[];
};
