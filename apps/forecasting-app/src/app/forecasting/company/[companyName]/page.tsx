import type { ReactNode } from "react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { hasPetyrPermission, PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { resolvePreferredCsmName } from "@/lib/petyr/csmIdentity";
import { formatPetyrCurrencyValue, formatPetyrNumber, formatPetyrPercent } from "@/lib/petyr/formatters";
import { saveCompanyLogNote } from "@/services/companyLogNoteService";
import { getCompanyDetail, getCompanyDetailNavigationCompanies, type PetyrCompanyDetail } from "@/services/petyrDataService";
import { buildPetyrCompanyAlertsFromDetail, type PetyrAlert, type PetyrAlertSeverity, type PetyrAlertType } from "@/services/petyrAlertService";
import { CompanyBusinessUnitRevenueChart, CompanyMonthlyTrendChart } from "./CompanyDetailCharts";
import { PetyrFloatingDiagnosticsMenu } from "@/components/petyr/PetyrFloatingDiagnosticsMenu";
import { CompanyBusinessUnitMonthlyView } from "@/components/petyr/CompanyBusinessUnitMonthlyView";
import { CompanyDetailNavigator, type CompanyDetailNavigationOption } from "@/components/petyr/CompanyDetailNavigator";
import {
  PetyrCard,
  PetyrEmptyState,
  PetyrInlineNotice,
  PetyrKpiCard,
  PetyrSectionTitle,
  PetyrSupportCard,
  PetyrTwoColumnGrid,
  PetyrWorkspaceShell
} from "@/components/petyr/PetyrLayoutPrimitives";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type CompanyDetailPageProps = {
  params: Promise<{
    companyName: string;
  }>;
  searchParams?: Promise<SearchParams>;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ACTIVE_OR_PLANNED_CAMPAIGN_STATUSES = new Set(["running", "setup", "recruiting"]);
const COMPLETED_CAMPAIGN_STATUSES = new Set(["completed"]);

const ALERT_TYPE_LABELS: Record<PetyrAlertType, string> = {
  agreement_expiring_60_days: "Agreement expiring within 60 days",
  expiredAgreementWithResidual: "Expired agreement with residual",
  high_agreement_residual: "High agreement residual",
  company_inactive: "Inactive company",
  forecast_not_updated: "Forecast not updated",
  past_month_locked: "Past month locked",
  actual_under_forecast: "Closed revenue under forecast",
  csm_forecast_below_ai_forecast: "CSM forecast below AI forecast",
  business_unit_below_historical_pace: "Business Unit below historical pace"
};

async function addCompanyLogNote(formData: FormData) {
  "use server";

  const identity = await requirePetyrPagePermission(PETYR_PERMISSIONS.forecastWrite);
  const companyName = String(formData.get("companyName") ?? "");
  const csmName = String(formData.get("csmName") ?? "");
  const year = parseYearParam(String(formData.get("year") ?? "")) ?? new Date().getFullYear();
  const activeStatusValue = String(formData.get("companyActiveStatus") ?? "");
  const companyActiveStatus = activeStatusValue === "false" ? false : activeStatusValue === "true" ? true : null;
  const createdBy = identity.user.displayName || identity.user.email || "Petyr user";

  await saveCompanyLogNote({
    companyName,
    csmName,
    year,
    note: formData.get("note"),
    companyActiveStatus,
    createdBy
  });

  const href = buildCompanyDetailHref(companyName, year) + "#company-logs";
  revalidatePath(`/forecasting/company/${encodeURIComponent(companyName)}`);
  redirect(href);
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function decodeRouteParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeRouteKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function parseYearParam(value: string | undefined) {
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : undefined;
}

function formatMoney(value: number | string | null | undefined) {
  return formatPetyrCurrencyValue(value);
}

function formatPct(value: number | null | undefined) {
  return formatPetyrPercent(value);
}

function formatScore(value: number | null | undefined) {
  return formatPetyrNumber(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "n/a";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium"
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "n/a";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function monthLabel(month: number) {
  if (month === 0) return "Annual";
  return MONTHS[month - 1] ?? String(month);
}

function forecastTypeLabel(forecastType: string | null | undefined) {
  if (forecastType === "active_status") return "Company active status";
  if (forecastType === "annual_initial_forecast") return "Annual Forecast Initial";
  if (forecastType === "annual_ongoing_confidence") return "Annual confidence";
  if (forecastType === "annual_forecast") return "Annual forecast";
  if (forecastType === "companyActiveStatus") return "Company active status";
  if (forecastType === "ongoing") return "Ongoing forecast";
  if (forecastType === "previous_month") return "Previous-month forecast";
  return forecastType || "Forecast";
}

function formatChangeValue(fieldName: string, value: string | null) {
  if (fieldName === "companyActiveStatus" || fieldName === "active_status") {
    if (value === "active") return "Active";
    if (value === "inactive") return "Inactive";
    return "n/a";
  }

  if (fieldName === "annual_ongoing_confidence") return value || "n/a";

  return formatMoney(value);
}

function forecastSourceLabel(source: PetyrCompanyDetail["businessUnitSummary"][number]["forecastSource"]) {
  if (source === "annual") return "Annual";
  if (source === "monthly") return "Monthly";
  return "n/a";
}

function statusLabel(value: boolean | null | undefined) {
  if (value === true) return "Active";
  if (value === false) return "Inactive";
  return "n/a";
}

function alertBadgeVariant(severity: PetyrAlertSeverity): "default" | "secondary" | "outline" {
  if (severity === "critical") return "default";
  if (severity === "warning") return "secondary";
  return "outline";
}

function alertTone(severity: PetyrAlertSeverity) {
  if (severity === "critical") return "border-rose-200 bg-rose-50 text-rose-900";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-blue-200 bg-blue-50 text-blue-900";
}

function isExpiredAgreement(row: PetyrCompanyDetail["agreements"][number]) {
  return row.status.toLowerCase() === "expired";
}

function statusKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function dateTimeValue(value: string | null | undefined) {
  if (!value) return Number.NaN;

  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.NaN : time;
}

function isAgreementNotExpired(row: PetyrCompanyDetail["agreements"][number], now: Date) {
  const expiryTime = dateTimeValue(row.expiryDate);
  return Number.isFinite(expiryTime) && expiryTime > now.getTime();
}

function sortCampaignRows(rows: PetyrCompanyDetail["campaigns"]) {
  return [...rows].sort((left, right) => {
    const leftDate = dateTimeValue(left.endDate);
    const rightDate = dateTimeValue(right.endDate);
    const leftSafeDate = Number.isFinite(leftDate) ? leftDate : Number.NEGATIVE_INFINITY;
    const rightSafeDate = Number.isFinite(rightDate) ? rightDate : Number.NEGATIVE_INFINITY;

    return rightSafeDate - leftSafeDate || left.name.localeCompare(right.name);
  });
}

function campaignRowKey(row: PetyrCompanyDetail["campaigns"][number], index: number) {
  return `${row.name}-${row.endDate ?? "no-date"}-${index}`;
}

function getVisibleCampaignRows(rows: PetyrCompanyDetail["campaigns"]) {
  const sortedRows = sortCampaignRows(rows);
  const latestCompleted = sortedRows.find((row) => COMPLETED_CAMPAIGN_STATUSES.has(statusKey(row.status)));
  const visibleKeys = new Set<string>();
  const visibleRows: PetyrCompanyDetail["campaigns"] = [];

  sortedRows.forEach((row, index) => {
    const key = campaignRowKey(row, index);
    const isActiveOrPlanned = ACTIVE_OR_PLANNED_CAMPAIGN_STATUSES.has(statusKey(row.status));
    const isLatestCompleted = latestCompleted === row;

    if (!isActiveOrPlanned && !isLatestCompleted) return;
    visibleKeys.add(key);
    visibleRows.push(row);
  });

  return {
    visibleRows,
    hiddenRows: sortedRows.filter((row, index) => !visibleKeys.has(campaignRowKey(row, index)))
  };
}

function getVisibleAgreementRows(rows: PetyrCompanyDetail["agreements"], now: Date) {
  const sortedRows = [...rows].sort((left, right) => {
    const leftDate = dateTimeValue(left.expiryDate);
    const rightDate = dateTimeValue(right.expiryDate);
    const leftSafeDate = Number.isFinite(leftDate) ? leftDate : Number.POSITIVE_INFINITY;
    const rightSafeDate = Number.isFinite(rightDate) ? rightDate : Number.POSITIVE_INFINITY;

    return leftSafeDate - rightSafeDate || left.name.localeCompare(right.name);
  });

  return {
    visibleRows: sortedRows.filter((row) => isAgreementNotExpired(row, now)),
    hiddenRows: sortedRows.filter((row) => !isAgreementNotExpired(row, now))
  };
}

function buildForecastEntryHref(companyName: string, csmName: string, year: number) {
  const params = new URLSearchParams({
    companyName,
    csmName,
    year: String(year),
    month: String(new Date().getMonth() + 1)
  });

  return `/forecasting/entry?${params.toString()}`;
}

function buildCompanyDetailHref(companyName: string, year: number) {
  const params = new URLSearchParams({ year: String(year) });
  return "/forecasting/company/" + encodeURIComponent(companyName) + "?" + params.toString();
}

function EmptyTableState({ text }: { text: string }) {
  return <PetyrEmptyState>{text}</PetyrEmptyState>;
}

function SectionCard({
  id,
  title,
  description,
  children
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <PetyrCard id={id}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </PetyrCard>
  );
}

function PrimaryKpiSection({
  data
}: {
  data: PetyrCompanyDetail;
}) {
  const overview = data.overview;
  const initialForecastRows = data.businessUnitSummary.filter((row) => row.initialForecast !== null);
  const initialForecastTotal = initialForecastRows.length > 0
    ? initialForecastRows.reduce((sum, row) => sum + (row.initialForecast ?? 0), 0)
    : null;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <PetyrKpiCard
        label="Total agreement"
        value={formatMoney(overview?.totalAgreementValue)}
        helper="Agreement value from PostgreSQL-backed source data."
      />
      <PetyrKpiCard
        label="Closed revenue YTD"
        value={formatMoney(overview?.currentYearRevenue)}
        helper="Closed revenue for the selected year."
      />
      <PetyrKpiCard
        label="Agreement residual"
        value={formatMoney(overview?.residualAgreementValue)}
        helper="Residual agreement value still available."
      />
      <PetyrKpiCard
        label="Initial Forecast"
        value={formatMoney(initialForecastTotal)}
        helper="Frozen annual baseline compiled for the selected year."
      />
    </div>
  );
}

function SecondaryCompanyContextSection({
  selectedYear,
  data
}: {
  selectedYear: number;
  data: PetyrCompanyDetail;
}) {
  const overview = data.overview;
  const activeStatus = data.companyStatus?.isActive ?? overview?.isForecastActive ?? null;
  const expiredAgreementsCount = data.agreements.filter(isExpiredAgreement).length;
  const expiredResidualCount = data.agreements.filter((row) => isExpiredAgreement(row) && row.residualValue > 0).length;
  const contextItems = [
    { label: "Selected year", value: String(selectedYear) },
    { label: "Company active status", value: statusLabel(activeStatus) },
    { label: "Active agreements", value: String(overview?.activeAgreementsCount ?? 0) },
    { label: "Expired agreements", value: String(expiredAgreementsCount) },
    { label: "Expired residual rows", value: String(expiredResidualCount) }
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {contextItems.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase text-slate-500">{item.label}</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{item.value}</div>
          </div>
        ))}
      </div>
      {data.companyStatus?.reason ? (
        <PetyrInlineNotice tone="info">Company status note: {data.companyStatus.reason}</PetyrInlineNotice>
      ) : null}
    </div>
  );
}

function MonthlyTrendSection({ rows }: { rows: PetyrCompanyDetail["monthlyTrend"] }) {
  return (
    <div className="h-[340px]">
      <CompanyMonthlyTrendChart rows={rows} />
    </div>
  );
}

function visibleBusinessUnitRows(rows: PetyrCompanyDetail["businessUnitSummary"]) {
  return rows.filter((row) => (
    row.closedRevenueCampaignsCount +
    row.plannedFutureCampaignsCount +
    row.monthlyForecastRowsCount +
    row.initialForecastRowsCount +
    row.annualForecastRowsCount +
    row.aiForecastRowsCount
  ) > 0);
}

function BusinessUnitRevenueChartSection({ rows }: { rows: PetyrCompanyDetail["businessUnitSummary"] }) {
  return (
    <div className="h-[340px]">
      <CompanyBusinessUnitRevenueChart
        rows={visibleBusinessUnitRows(rows).map((row) => ({
          businessUnit: row.businessUnit,
          actualRevenue: row.actualRevenue,
          initialForecast: row.initialForecast,
          previousMonthForecast: row.previousMonthForecast,
          previousMonthForecastRowsCount: row.previousMonthForecastRowsCount
        }))}
      />
    </div>
  );
}

function BusinessUnitSection({ rows }: { rows: PetyrCompanyDetail["businessUnitSummary"] }) {
  const visibleRows = visibleBusinessUnitRows(rows);
  const otherFallbackCount = visibleRows.find((row) => row.businessUnit === "Other")?.normalizedToOtherCount ?? 0;

  if (visibleRows.length === 0) return <EmptyTableState text="No Business Unit revenue or forecast data found for this company and selected year." />;

  return (
    <div className="space-y-3">
      {otherFallbackCount > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {otherFallbackCount} campaign row(s) had missing or non-official Business Unit values and are grouped as Other.
        </div>
      ) : null}
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Business Unit</TableHead>
              <TableHead className="text-right">Closed revenue</TableHead>
              <TableHead className="text-right">Planned future</TableHead>
              <TableHead className="text-right">Forecast</TableHead>
              <TableHead>Forecast source</TableHead>
              <TableHead className="text-right">Previous-month forecast</TableHead>
              <TableHead className="text-right">Ongoing forecast</TableHead>
              <TableHead className="text-right">AI forecast</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.businessUnit}>
                <TableCell className="font-medium text-slate-900">{row.businessUnit}</TableCell>
                <TableCell className="text-right text-slate-700">{formatMoney(row.actualRevenue)}</TableCell>
                <TableCell className="text-right text-slate-700">{formatMoney(row.plannedFuture)}</TableCell>
                <TableCell className="text-right text-slate-700">{formatMoney(row.forecast)}</TableCell>
                <TableCell className="text-slate-700">{forecastSourceLabel(row.forecastSource)}</TableCell>
                <TableCell className="text-right text-slate-700">{formatMoney(row.previousMonthForecast)}</TableCell>
                <TableCell className="text-right text-slate-700">{formatMoney(row.ongoingForecast)}</TableCell>
                <TableCell className="text-right text-slate-700">{formatMoney(row.aiForecast)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AgreementsTable({ rows }: { rows: PetyrCompanyDetail["agreements"] }) {
  if (rows.length === 0) return <EmptyTableState text="No agreement data is available for this company." />;

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Agreement</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Agreement value</TableHead>
            <TableHead className="text-right">Residual</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead>Deal link</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.name}-${index}`}>
              <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
              <TableCell className="text-slate-700">{row.status}</TableCell>
              <TableCell className="text-right text-slate-700">{formatMoney(row.totalValue)}</TableCell>
              <TableCell className="text-right text-slate-700">{formatMoney(row.residualValue)}</TableCell>
              <TableCell className="text-slate-700">{formatDate(row.expiryDate)}</TableCell>
              <TableCell>
                {row.agreementDealLink ? (
                  <a className="font-medium text-slate-900 underline-offset-4 hover:underline" href={row.agreementDealLink} rel="noreferrer" target="_blank">
                    Deal link
                  </a>
                ) : (
                  <span className="text-slate-500">n/a</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AgreementsSection({ rows, now }: { rows: PetyrCompanyDetail["agreements"]; now: Date }) {
  if (rows.length === 0) return <EmptyTableState text="No agreement data is available for this company." />;

  const { visibleRows, hiddenRows } = getVisibleAgreementRows(rows, now);

  return (
    <div className="space-y-3">
      <AgreementsTable rows={visibleRows} />
      {hiddenRows.length > 0 ? (
        <details>
          <summary className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:bg-slate-50">
            Show expired or undated agreements ({hiddenRows.length})
          </summary>
          <div className="mt-3">
            <AgreementsTable rows={hiddenRows} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function CampaignsTable({ rows }: { rows: PetyrCompanyDetail["campaigns"] }) {
  if (rows.length === 0) return <EmptyTableState text="No campaign rows match the visible criteria for this company." />;

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
      <Table className="min-w-[1120px]">
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Campaign name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Business Unit</TableHead>
            <TableHead>Agreement</TableHead>
            <TableHead className="text-right">Value/revenue</TableHead>
            <TableHead className="text-right">Costs</TableHead>
            <TableHead className="text-right">GM%</TableHead>
            <TableHead>Start date</TableHead>
            <TableHead>End date</TableHead>
            <TableHead>Link</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.name}-${index}`}>
              <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
              <TableCell className="text-slate-700">{row.status}</TableCell>
              <TableCell className="text-slate-700">{row.businessUnit}</TableCell>
              <TableCell className="text-slate-700">
                {row.agreementName ? (
                  row.agreementLink ? (
                    <a className="font-medium text-slate-900 underline-offset-4 hover:underline" href={row.agreementLink} rel="noreferrer" target="_blank">
                      {row.agreementName}
                    </a>
                  ) : (
                    row.agreementName
                  )
                ) : (
                  <span className="text-slate-500">n/a</span>
                )}
              </TableCell>
              <TableCell className="text-right text-slate-700">{formatMoney(row.revenue)}</TableCell>
              <TableCell className="text-right text-slate-700">{formatMoney(row.costs)}</TableCell>
              <TableCell className="text-right font-semibold text-slate-700">{formatPct(row.grossMarginPct)}</TableCell>
              <TableCell className="text-slate-700">{formatDate(row.startDate)}</TableCell>
              <TableCell className="text-slate-700">{formatDate(row.endDate)}</TableCell>
              <TableCell>
                {row.link ? (
                  <a className="font-medium text-slate-900 underline-offset-4 hover:underline" href={row.link} rel="noreferrer" target="_blank">
                    Open
                  </a>
                ) : (
                  <span className="text-slate-500">n/a</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CampaignsSection({ rows }: { rows: PetyrCompanyDetail["campaigns"] }) {
  if (rows.length === 0) return <EmptyTableState text="No campaigns found for this company and selected year." />;

  const { visibleRows, hiddenRows } = getVisibleCampaignRows(rows);

  return (
    <div className="space-y-3">
      <CampaignsTable rows={visibleRows} />
      {hiddenRows.length > 0 ? (
        <details>
          <summary className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:bg-slate-50">
            Show all other campaigns ({hiddenRows.length})
          </summary>
          <div className="mt-3">
            <CampaignsTable rows={hiddenRows} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function AlertsSection({ rows }: { rows: PetyrAlert[] }) {
  const activeRows = rows.filter((row) => ALERT_TYPE_LABELS[row.type]);
  const alertGroups = Object.entries(ALERT_TYPE_LABELS).map(([type, label]) => {
    const groupRows = activeRows.filter((row) => row.type === type);
    const groupSeverity: PetyrAlertSeverity = groupRows.some((row) => row.severity === "critical")
      ? "critical"
      : groupRows.some((row) => row.severity === "warning")
        ? "warning"
        : "info";

    return {
      type,
      label,
      rows: groupRows,
      severity: groupSeverity
    };
  }).filter((group) => group.rows.length > 0);

  if (alertGroups.length === 0) {
    return <EmptyTableState text="No relevant company insights are active for this company." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {alertGroups.map((group) => (
          <div
            key={group.type}
            className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${group.rows.length > 0 ? alertTone(group.severity) : "border-slate-200 bg-white text-slate-700"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{group.label}</div>
                <div className="mt-1 text-xs opacity-75">
                  {group.rows.length > 0 ? "Source-backed alert evidence is available." : "No source-backed alert for this company."}
                </div>
              </div>
              <Badge variant="secondary">{group.rows.length}</Badge>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm font-semibold text-slate-900">Detail · Source-backed alert evidence</div>
        <div className="mt-3 space-y-2">
          {activeRows.length > 0 ? (
            activeRows.map((row) => (
              <div key={row.id} className="rounded-xl bg-white p-3 text-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={alertBadgeVariant(row.severity)}>{row.severity}</Badge>
                      <Badge variant="outline">{ALERT_TYPE_LABELS[row.type]}</Badge>
                      {row.businessUnit ? <Badge variant="secondary">{row.businessUnit}</Badge> : null}
                      {typeof row.residualAmount === "number" ? <Badge variant="outline">Residual {formatMoney(row.residualAmount)}</Badge> : null}
                      {row.agreementExpiry ? <Badge variant="outline">Exp. {formatDate(row.agreementExpiry)}</Badge> : null}
                    </div>
                    <div className="mt-3 font-semibold text-slate-950">{row.message}</div>
                    <div className="mt-2 text-xs text-slate-600">{row.explanation}</div>
                  </div>
                </div>
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{row.suggestedAction}</div>
                {row.agreementDealLink ? (
                  <a className="mt-3 inline-flex text-xs font-semibold text-slate-900 underline-offset-4 hover:underline" href={row.agreementDealLink} rel="noreferrer" target="_blank">
                    Deal link
                  </a>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-xl bg-white p-3 text-sm text-slate-500">No rule-based alerts are available for this company.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MonthlyForecastSection({ rows }: { rows: PetyrCompanyDetail["monthlyForecasts"] }) {
  const sortedRows = [...rows].sort(
    (left, right) =>
      left.year - right.year ||
      left.month - right.month ||
      left.businessUnit.localeCompare(right.businessUnit) ||
      left.forecastType.localeCompare(right.forecastType)
  );

  if (sortedRows.length === 0) return <EmptyTableState text="No monthly forecast rows have been saved for this company." />;

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Month</TableHead>
            <TableHead>Business Unit</TableHead>
            <TableHead>Forecast type</TableHead>
            <TableHead className="text-right">Forecast</TableHead>
            <TableHead className="text-right">AI forecast at save</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row) => (
            <TableRow key={`${row.year}-${row.month}-${row.businessUnit}-${row.forecastType}`}>
              <TableCell className="font-medium text-slate-900">
                {monthLabel(row.month)} {row.year}
              </TableCell>
              <TableCell className="text-slate-700">{row.businessUnit}</TableCell>
              <TableCell className="text-slate-700">{forecastTypeLabel(row.forecastType)}</TableCell>
              <TableCell className="text-right text-slate-700">{formatMoney(row.value)}</TableCell>
              <TableCell className="text-right text-slate-700">{formatMoney(row.aiForecastValue)}</TableCell>
              <TableCell className="text-slate-700">{row.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AnnualForecastSection({ rows }: { rows: PetyrCompanyDetail["annualForecasts"] }) {
  const sortedRows = [...rows].sort(
    (left, right) => left.year - right.year || left.businessUnit.localeCompare(right.businessUnit)
  );

  if (sortedRows.length === 0) return <EmptyTableState text="No annual forecast rows have been saved for this company." />;

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Year</TableHead>
            <TableHead>Business Unit</TableHead>
            <TableHead className="text-right">Annual forecast</TableHead>
            <TableHead className="text-right">AI forecast</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row) => (
            <TableRow key={`${row.year}-${row.businessUnit}`}>
              <TableCell className="font-medium text-slate-900">{row.year}</TableCell>
              <TableCell className="text-slate-700">{row.businessUnit}</TableCell>
              <TableCell className="text-right text-slate-700">{formatMoney(row.value)}</TableCell>
              <TableCell className="text-right text-slate-700">{formatMoney(row.aiForecastValue)}</TableCell>
              <TableCell className="text-slate-700">{row.status}</TableCell>
              <TableCell className="text-slate-700">{row.note || "n/a"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AiForecastCacheSection({ rows }: { rows: PetyrCompanyDetail["aiForecasts"] }) {
  if (rows.length === 0) return <EmptyTableState text="No AI forecast cache rows are available for this company." />;

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Month</TableHead>
            <TableHead>Business Unit</TableHead>
            <TableHead className="text-right">AI forecast</TableHead>
            <TableHead className="text-right">Confidence</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Generated</TableHead>
            <TableHead>Explanation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.year}-${row.month}-${row.businessUnit}-${row.modelVersion}`}>
              <TableCell className="font-medium text-slate-900">
                {monthLabel(row.month)} {row.year}
              </TableCell>
              <TableCell className="text-slate-700">{row.businessUnit}</TableCell>
              <TableCell className="text-right text-slate-700">{formatMoney(row.forecastValue)}</TableCell>
              <TableCell className="text-right text-slate-700">{formatScore(row.confidenceScore)}</TableCell>
              <TableCell className="text-slate-700">{row.modelVersion}</TableCell>
              <TableCell className="text-slate-700">{formatDateTime(row.generatedAt)}</TableCell>
              <TableCell className="max-w-sm text-slate-700">{row.explanation || "n/a"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ChangeHistoryList({ rows }: { rows: PetyrCompanyDetail["changeHistory"] }) {
  return (
    <div className="space-y-3">
      {rows.map((session) => (
          <div key={session.id} className="rounded-xl bg-white p-3 text-sm">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="font-medium text-slate-900">
                  {session.source === "Company Detail Note"
                    ? `Company note · ${monthLabel(session.month)} ${session.year}`
                    : `Save session · ${forecastTypeLabel(session.forecastType)} · ${monthLabel(session.month)} ${session.year}`}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatDateTime(session.createdAt)} · from {session.source} · by {session.createdBy}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{session.changes.length} {session.changes.length === 1 ? "change" : "changes"}</Badge>
                <Badge variant={session.companyActiveStatus ? "secondary" : "outline"}>
                  {session.companyActiveStatus ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {session.changes.length > 0 ? (
                session.changes.map((change) => (
                  <div key={change.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-5">
                      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                        <div className="text-slate-500">Business Unit</div>
                        <div className="font-semibold text-slate-900">{change.businessUnit}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                        <div className="text-slate-500">Updated field</div>
                        <div className="font-semibold text-slate-900">{forecastTypeLabel(change.fieldName)}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                        <div className="text-slate-500">Before</div>
                        <div className="font-semibold text-slate-900">{formatChangeValue(change.fieldName, change.previousValue)}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                        <div className="text-slate-500">After</div>
                        <div className="font-semibold text-slate-900">{formatChangeValue(change.fieldName, change.newValue)}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                        <div className="text-slate-500">AI forecast at save</div>
                        <div className="font-semibold text-slate-900">{formatMoney(change.aiForecastValueAtSave)}</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No Business Unit value changed in this save session.</div>
              )}
            </div>

            {session.note ? <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">Session note: {session.note}</div> : null}
          </div>
        ))}
    </div>
  );
}

function ChangeHistorySection({ rows }: { rows: PetyrCompanyDetail["changeHistory"] }) {
  if (rows.length === 0) return <EmptyTableState text="No company logs are available for this company." />;

  const latestRows = rows.slice(0, 3);
  const olderRows = rows.slice(3);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs text-slate-500">
        Logs are grouped by save session or company note. The latest three logs are shown by default.
      </div>
      <div className="mt-4">
        <ChangeHistoryList rows={latestRows} />
      </div>
      {olderRows.length > 0 ? (
        <details className="mt-4">
          <summary className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:bg-slate-50">
            Show previous logs ({olderRows.length})
          </summary>
          <div className="mt-3">
            <ChangeHistoryList rows={olderRows} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function CompanyNoteSection({
  companyName,
  csmName,
  selectedYear,
  activeStatus
}: {
  companyName: string;
  csmName: string;
  selectedYear: number;
  activeStatus: boolean | null;
}) {
  return (
    <form action={addCompanyLogNote} className="space-y-3">
      <input type="hidden" name="companyName" value={companyName} />
      <input type="hidden" name="csmName" value={csmName} />
      <input type="hidden" name="year" value={selectedYear} />
      <input type="hidden" name="companyActiveStatus" value={activeStatus === null ? "" : String(activeStatus)} />
      <Textarea name="note" maxLength={4000} placeholder="Add a company note..." required />
      <button className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800" type="submit">
        Add note
      </button>
    </form>
  );
}


export default async function CompanyDetailPage({ params, searchParams }: CompanyDetailPageProps) {
  const identity = await requirePetyrPagePermission(PETYR_PERMISSIONS.read);
  const routeParams = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const rawYear = firstParam(resolvedSearchParams.year)?.trim();
  const requestedCsmName = firstParam(resolvedSearchParams.csmName)?.trim() ?? "";
  const selectedYear = parseYearParam(rawYear) ?? new Date().getFullYear();
  const companyName = decodeRouteParam(routeParams.companyName).trim();
  const yearDiagnostics = rawYear && !parseYearParam(rawYear) ? [`Invalid year query parameter "${rawYear}" ignored.`] : [];
  const [result, navigationResult] = await Promise.all([
    getCompanyDetail(companyName, selectedYear),
    getCompanyDetailNavigationCompanies()
  ]);
  const data = result.data;
  const overview = data.overview;
  const displayCompanyName = overview?.companyName || companyName || "Company";
  const navigationCompaniesBase: CompanyDetailNavigationOption[] = navigationResult.data.map((company) => ({
    companyName: company.companyName,
    csmName: company.csmName || "Unassigned",
    isForecastActive: company.isForecastActive ?? null,
    priorityScore: company.priorityScore
  }));
  const hasDisplayCompanyInNavigation = navigationCompaniesBase.some(
    (company) => normalizeRouteKey(company.companyName) === normalizeRouteKey(displayCompanyName)
  );
  const navigationCompanies = hasDisplayCompanyInNavigation
    ? navigationCompaniesBase
    : [
        ...navigationCompaniesBase,
        {
          companyName: displayCompanyName,
          csmName: overview?.csmName || "Unassigned",
          isForecastActive: data.companyStatus?.isActive ?? overview?.isForecastActive ?? null,
          priorityScore: 0
        }
      ];
  const preferredCsmName = resolvePreferredCsmName(
    identity.user.displayName,
    navigationCompanies.map((company) => company.csmName)
  );
  const requestedCsmNavigationCompany = requestedCsmName
    ? navigationCompanies.find(
        (company) =>
          normalizeRouteKey(company.companyName) === normalizeRouteKey(displayCompanyName) &&
          normalizeRouteKey(company.csmName) === normalizeRouteKey(requestedCsmName)
      )
    : null;
  const navigationCompany = requestedCsmNavigationCompany ?? navigationCompanies.find(
    (company) => normalizeRouteKey(company.companyName) === normalizeRouteKey(displayCompanyName)
  );
  const hasRequestedCsmInNavigation = requestedCsmName
    ? navigationCompanies.some((company) => normalizeRouteKey(company.csmName) === normalizeRouteKey(requestedCsmName))
    : false;
  const csmName = requestedCsmNavigationCompany?.csmName || (hasRequestedCsmInNavigation ? requestedCsmName : "") || overview?.csmName || navigationCompany?.csmName || "Unassigned";
  const forecastEntryHref = buildForecastEntryHref(displayCompanyName, csmName, selectedYear);
  const companyDetailHref = buildCompanyDetailHref(displayCompanyName, selectedYear);
  const activeStatus = data.companyStatus?.isActive ?? overview?.isForecastActive ?? navigationCompany?.isForecastActive ?? null;
  const alertsResult = buildPetyrCompanyAlertsFromDetail(data, displayCompanyName, { year: selectedYear, diagnostics: result.diagnostics });
  const diagnostics = [...new Set([...yearDiagnostics, ...result.diagnostics, ...alertsResult.diagnostics, ...navigationResult.diagnostics])];
  const canViewAdminTools = hasPetyrPermission(identity, PETYR_PERMISSIONS.admin);
  const canAddCompanyNotes = hasPetyrPermission(identity, PETYR_PERMISSIONS.forecastWrite);

  return (
    <PetyrWorkspaceShell
      activeSection="company"
      companyDetailHref={companyDetailHref}
      forecastEntryHref={forecastEntryHref}
      canViewCsmOverview={canViewAdminTools}
    >
      <PetyrSectionTitle
        title="Company Detail"
        description={`Analytical company sheet for ${displayCompanyName}: agreement, closed revenue, residual, AI and company logs context.`}
        actions={
          <>
            <Badge variant={activeStatus === false ? "outline" : "secondary"}>Forecast status: {statusLabel(activeStatus)}</Badge>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
              href={forecastEntryHref}
            >
              Edit forecast
            </Link>
          </>
        }
      />

      <CompanyDetailNavigator
        companies={navigationCompanies}
        selectedCompanyName={displayCompanyName}
        selectedCsmName={csmName}
        selectedYear={selectedYear}
        preferredCsmName={preferredCsmName}
      />

      <PrimaryKpiSection data={data} />

      <PetyrTwoColumnGrid>
        <SectionCard title="Month-by-month trend" description="Previous-month forecast, ongoing forecast, AI Forecast and closed revenue over time.">
          <MonthlyTrendSection rows={data.monthlyTrend} />
        </SectionCard>

        <SectionCard title="Revenue per Business Unit" description="Selected-year Business Unit view. Historical multi-year BU comparison is not available in the current company detail payload.">
          <BusinessUnitRevenueChartSection rows={data.businessUnitSummary} />
        </SectionCard>
      </PetyrTwoColumnGrid>

      <SectionCard
        title="Business Unit current-year view"
        description="Current-year Business Unit totals. Expand a Business Unit to show the individual months and review the monthly view with closed revenue, previous-month forecast, ongoing forecast and AI Forecast."
      >
        <CompanyBusinessUnitMonthlyView rows={data.monthlyBusinessUnitView} />
      </SectionCard>

{canAddCompanyNotes ? (
        <SectionCard title="Company note" description="Add a note to this company log without opening Forecast Entry or changing forecast values.">
        <CompanyNoteSection
          companyName={displayCompanyName}
          csmName={csmName}
          selectedYear={selectedYear}
          activeStatus={activeStatus ?? null}
        />
      </SectionCard>
      ) : null}

      <SectionCard title="Relevant company insights" description="Only active rule-based insight evidence is shown for this company.">
        <AlertsSection rows={alertsResult.data} />
      </SectionCard>

      <SectionCard title="Company campaigns" description="Shows the latest chronologically completed campaign plus campaigns that are running or planned. Other campaign rows are available by expanding the section.">
        <CampaignsSection rows={data.campaigns} />
      </SectionCard>

      <SectionCard title="Agreements and residual evidence" description="Shows only agreements whose expiry date is after the moment of viewing. Expired or undated rows are available by expanding the section.">
        <AgreementsSection rows={data.agreements} now={new Date()} />
      </SectionCard>

      <SectionCard id="company-logs" title="Company logs" description="Contains all notes and forecast changes made for this company.">
        <ChangeHistorySection rows={data.changeHistory} />
      </SectionCard>

      <section className="space-y-4" aria-label="Company Detail support details">
        <PetyrSectionTitle
          title="Support details"
          description="Secondary operational tables and read-only evidence remain available below the analytical story."
          actions={<Badge variant="outline">Secondary</Badge>}
        />

        <PetyrSupportCard title="Company context and extra metrics" description="Operational context moved below the four primary KPI cards." badge="Context">
          <SecondaryCompanyContextSection selectedYear={selectedYear} data={data} />
        </PetyrSupportCard>

        {canViewAdminTools ? (
          <>
            <PetyrSupportCard title="Revenue by Business Unit detail" description="Read-only company totals by official Business Unit for the selected year." badge="Evidence">
              <BusinessUnitSection rows={data.businessUnitSummary} />
            </PetyrSupportCard>

            <PetyrSupportCard title="Monthly forecast rows" description="Saved CSM monthly forecast rows are shown read-only here; edit them only in Forecast Entry." badge="Support">
              <MonthlyForecastSection rows={data.monthlyForecasts} />
            </PetyrSupportCard>

            <PetyrSupportCard title="Annual forecast rows" description="CSM-owned annual forecast rows by Business Unit and year, including draft or consolidated state. These are not Management Objectives." badge="Support">
              <AnnualForecastSection rows={data.annualForecasts} />
            </PetyrSupportCard>

            <PetyrSupportCard title="AI forecast cache" description="Generated AI forecast suggestions saved in ai_forecast_cache. They are read-only here; generate or apply AI Forecast only in Forecast Entry." badge="Support">
              <AiForecastCacheSection rows={data.aiForecasts} />
            </PetyrSupportCard>
          </>
        ) : null}
      </section>

      {canViewAdminTools ? <PetyrFloatingDiagnosticsMenu diagnostics={diagnostics} /> : null}
    </PetyrWorkspaceShell>
  );
}
