"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getForecastEntryMode, type ForecastEntryMode } from "@/lib/forecastEntryMode";
import { formatPetyrCurrency } from "@/lib/petyr/formatters";
import type {
  PetyrCsmOverviewBusinessUnitForecast,
  PetyrCsmOverviewCompany,
  PetyrCsmOverviewWorkspace,
  PetyrCsmUrgentAction,
  PetyrCsmUrgentActionCompany
} from "@/services/petyrDataService";
import type { PetyrAlert, PetyrAlertSeverity, PetyrAlertType } from "@/services/petyrAlertService";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ALERT_TYPE_LABELS: Record<PetyrAlertType, string> = {
  agreement_expiring_60_days: "Agreement expiry",
  expiredAgreementWithResidual: "Expired residual",
  high_agreement_residual: "High residual",
  company_inactive: "Inactive company",
  forecast_not_updated: "Forecast update",
  past_month_locked: "Locked month",
  actual_under_forecast: "Closed revenue under forecast",
  csm_forecast_below_ai_forecast: "CSM below AI",
  business_unit_below_historical_pace: "BU below history"
};
const CSM_OVERVIEW_HIDDEN_ALERT_TYPES = new Set<PetyrAlertType>(["company_inactive", "past_month_locked"]);

function formatMoney(value: number | null | undefined) {
  return formatPetyrCurrency(value);
}

function monthLabel(month: number) {
  return MONTHS[month - 1] ?? `Month ${month}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "n/a";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-GB");
}

function companyHref(companyName: string, csmName?: string | null, year?: number | null) {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (csmName) params.set("csmName", csmName);
  const query = params.toString();
  return `/forecasting/company/${encodeURIComponent(companyName)}${query ? `?${query}` : ""}`;
}

function forecastEntryHref(companyName: string, csmName: string, year: number, month: number) {
  const params = new URLSearchParams({
    companyName,
    csmName,
    year: String(year),
    month: String(month)
  });

  return `/forecasting/entry?${params.toString()}`;
}

function urgentActionHref(item: PetyrCsmUrgentActionCompany) {
  if (item.target === "forecast-entry") {
    return forecastEntryHref(item.companyName, item.csmName, item.year, item.month);
  }

  return companyHref(item.companyName, item.csmName, item.year);
}

function actionTone(id: PetyrCsmUrgentAction["id"], selected: boolean) {
  if (!selected) return "border-slate-200 bg-white text-slate-700 hover:border-slate-300";
  if (id === "forecast-update") return "border-blue-200 bg-blue-50 text-blue-950";
  if (id === "expiring-agreements") return "border-amber-200 bg-amber-50 text-amber-950";
  if (id === "expired-agreement-residual") return "border-orange-200 bg-orange-50 text-orange-950";
  if (id === "high-residual") return "border-rose-200 bg-rose-50 text-rose-950";
  return "border-slate-300 bg-slate-100 text-slate-950";
}

function alertTone(severity: PetyrAlertSeverity) {
  if (severity === "critical") return "border-rose-200 bg-rose-50 text-rose-950";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-slate-50 text-slate-800";
}

function alertBadgeVariant(severity: PetyrAlertSeverity): "default" | "secondary" | "outline" {
  if (severity === "critical") return "default";
  if (severity === "warning") return "secondary";
  return "outline";
}

function visibleMonths(overview: PetyrCsmOverviewWorkspace, extraMonth: string) {
  const months = [overview.currentMonth, overview.nextMonth];
  const parsedExtraMonth = Number(extraMonth);

  if (Number.isInteger(parsedExtraMonth) && parsedExtraMonth >= 1 && parsedExtraMonth <= 12) {
    months.push(parsedExtraMonth);
  }

  return [...new Set(months)];
}

function selectForecastValue(row: PetyrCsmOverviewBusinessUnitForecast, mode: ForecastEntryMode) {
  return mode.editableForecastType === "ongoing" ? row.ongoingForecast : row.previousMonthForecast;
}

function monthForecastTotal(company: PetyrCsmOverviewCompany, year: number, month: number, currentDate: Date) {
  const mode = getForecastEntryMode({ year, month, currentDate });
  const monthData = company.months.find((item) => item.month === month);

  return monthData?.businessUnits.reduce((sum, row) => sum + selectForecastValue(row, mode), 0) ?? 0;
}

function businessUnitRowsForMonth(company: PetyrCsmOverviewCompany, month: number) {
  return company.months.find((item) => item.month === month)?.businessUnits ?? [];
}

function filteredUrgentCompanies(action: PetyrCsmUrgentAction, selectedCSM: string) {
  if (selectedCSM === "all") return action.companies;
  return action.companies.filter((company) => company.csmName === selectedCSM);
}

function filteredAlerts(alerts: PetyrAlert[], selectedCSM: string) {
  const relevantAlerts = alerts.filter((alert) => !CSM_OVERVIEW_HIDDEN_ALERT_TYPES.has(alert.type));
  if (selectedCSM === "all") return relevantAlerts;
  return relevantAlerts.filter((alert) => alert.csmName === selectedCSM);
}

function agreementEvidenceLabel(item: {
  agreementName: string | null;
  totalAgreementValue: number;
  residualAgreementValue: number;
  agreementExpiry: string | null;
}) {
  const parts = [
    item.agreementName,
    item.totalAgreementValue > 0 ? `Total agreement ${formatMoney(item.totalAgreementValue)}` : null,
    `Residual ${formatMoney(item.residualAgreementValue)}`,
    `Exp. ${formatDate(item.agreementExpiry)}`
  ].filter(Boolean);

  return parts.join(" - ");
}

function CsmMonthCard({
  company,
  year,
  month,
  currentDate
}: {
  company: PetyrCsmOverviewCompany;
  year: number;
  month: number;
  currentDate: Date;
}) {
  const mode = getForecastEntryMode({ year, month, currentDate });
  const rows = businessUnitRowsForMonth(company, month);
  const totalForecast = rows.reduce((sum, row) => sum + selectForecastValue(row, mode), 0);
  const totalAi = rows.reduce((sum, row) => sum + row.aiForecast, 0);

  return (
    <Link
      href={forecastEntryHref(company.companyName, company.csmName, year, month)}
      className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{monthLabel(month)} {year}</div>
        </div>
        <Badge variant="outline">{mode.label}</Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-[11px] uppercase text-slate-500">CSM forecast</div>
          <div className="text-sm font-semibold text-slate-900">{formatMoney(totalForecast)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-[11px] uppercase text-slate-500">AI forecast</div>
          <div className="text-sm font-semibold text-slate-900">{formatMoney(totalAi)}</div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {rows.map((row) => (
          <div key={`${company.companyName}-${month}-${row.businessUnit}`} className="grid grid-cols-[minmax(92px,1fr)_auto_auto] gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
            <span className="font-medium text-slate-700">{row.businessUnit}</span>
            <span className="text-right text-slate-900">{formatMoney(selectForecastValue(row, mode))}</span>
            <span className="text-right text-slate-500">AI {formatMoney(row.aiForecast)}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

export default function CsmOverviewWorkspace({
  overview,
  alerts = [],
  preferredCsmName = null
}: {
  overview: PetyrCsmOverviewWorkspace;
  alerts?: PetyrAlert[];
  preferredCsmName?: string | null;
}) {
  const currentDate = useMemo(() => new Date(), []);
  const [selectedCSM, setSelectedCSM] = useState(() => (
    preferredCsmName && overview.csmNames.includes(preferredCsmName) ? preferredCsmName : "all"
  ));
  const [selectedActionId, setSelectedActionId] = useState<PetyrCsmUrgentAction["id"]>("forecast-update");
  const [extraMonth, setExtraMonth] = useState("none");
  const monthsToShow = visibleMonths(overview, extraMonth);
  const companies = useMemo(
    () => selectedCSM === "all" ? overview.companies : overview.companies.filter((company) => company.csmName === selectedCSM),
    [overview.companies, selectedCSM]
  );
  const selectedAction = overview.urgentActions.find((action) => action.id === selectedActionId) ?? overview.urgentActions[0];
  const selectedActionCompanies = selectedAction ? filteredUrgentCompanies(selectedAction, selectedCSM) : [];
  const selectedAlerts = useMemo(() => filteredAlerts(alerts, selectedCSM), [alerts, selectedCSM]);
  const currentMonthTotal = companies.reduce((sum, company) => sum + monthForecastTotal(company, overview.year, overview.currentMonth, currentDate), 0);
  const nextMonthTotal = companies.reduce((sum, company) => sum + monthForecastTotal(company, overview.year, overview.nextMonth, currentDate), 0);

  return (
    <div className="space-y-6">
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">CSM Overview</h2>
        <p className="text-sm text-slate-500">
          Read-only CSM workspace with assigned companies, monthly Business Unit forecast, AI forecast and relevant insights.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-500">CSM filter</div>
              <Badge variant="secondary">Read-only</Badge>
            </div>
            <select
              aria-label="CSM filter"
              value={selectedCSM}
              onChange={(event) => setSelectedCSM(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="all">All CSMs</option>
              {overview.csmNames.map((csmName) => (
                <option key={csmName} value={csmName}>{csmName}</option>
              ))}
            </select>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-slate-500">Assigned companies</div>
            <div className="mt-2 text-2xl font-semibold">{companies.length}</div>
            <div className="mt-1 text-xs text-slate-500">Filtered by selected CSM owner.</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-slate-500">Current month forecast</div>
            <div className="mt-2 text-2xl font-semibold">{formatMoney(currentMonthTotal)}</div>
            <div className="mt-1 text-xs text-slate-500">{monthLabel(overview.currentMonth)} {overview.year}</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-slate-500">Next month forecast</div>
            <div className="mt-2 text-2xl font-semibold">{formatMoney(nextMonthTotal)}</div>
            <div className="mt-1 text-xs text-slate-500">{monthLabel(overview.nextMonth)} {overview.year}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Relevant insights</CardTitle>
          <CardDescription>Each company card opens the related company detail or Forecast Entry context.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {overview.urgentActions.map((action) => {
              const count = filteredUrgentCompanies(action, selectedCSM).length;
              const selected = selectedActionId === action.id;

              return (
                <button
                  key={action.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedActionId(action.id)}
                  className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${actionTone(action.id, selected)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{action.title}</div>
                      <div className="mt-1 text-xs opacity-75">{action.description}</div>
                    </div>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">
              Affected companies{selectedAction ? `: ${selectedAction.title}` : ""}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {selectedActionCompanies.length > 0 ? (
                selectedActionCompanies.map((company) => (
                  <Link
                    key={`${selectedAction?.id}-${company.companyName}-${company.businessUnit ?? company.agreementName ?? "action"}`}
                    href={urgentActionHref(company)}
                    className="block rounded-xl border border-slate-200 bg-white p-3 text-sm transition hover:border-slate-300 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{company.companyName}</div>
                        <div className="mt-1 text-xs text-slate-500">{company.reason}</div>
                      </div>
                      {selectedAction?.id === "high-residual" && company.totalAgreementValue > 0 ? (
                        <Badge variant="outline">Total agreement {formatMoney(company.totalAgreementValue)}</Badge>
                      ) : (
                        <Badge variant="outline">{company.target === "forecast-entry" ? "Forecast Entry" : "Company"}</Badge>
                      )}
                    </div>
                    <div className="mt-3 text-xs text-slate-600">{company.detail}</div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {company.businessUnit ? <Badge variant="secondary">{company.businessUnit}</Badge> : null}
                      {company.agreementName || company.totalAgreementValue > 0 || company.residualAgreementValue > 0 || company.agreementExpiry ? (
                        <Badge variant="outline" className="max-w-full whitespace-normal text-left leading-5">
                          {agreementEvidenceLabel(company)}
                        </Badge>
                      ) : null}
                      {company.agreementDealLink ? <Badge variant="outline">Deal link</Badge> : null}
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-xl bg-white p-3 text-sm text-slate-500">No affected company for the selected CSM filter.</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Rule-based alerts</CardTitle>
              <CardDescription>Deterministic PostgreSQL alerts with evidence and suggested actions.</CardDescription>
            </div>
            <Badge variant="outline">{selectedAlerts.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {selectedAlerts.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {selectedAlerts.slice(0, 12).map((alert) => {
                const className = `block rounded-xl border p-4 text-sm transition hover:shadow-sm ${alertTone(alert.severity)}`;
                const content = (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={alertBadgeVariant(alert.severity)}>{alert.severity}</Badge>
                          <Badge variant="outline">{ALERT_TYPE_LABELS[alert.type]}</Badge>
                          {alert.businessUnit ? <Badge variant="secondary">{alert.businessUnit}</Badge> : null}
                          {alert.agreementName ? <Badge variant="secondary">{alert.agreementName}</Badge> : null}
                          {typeof alert.residualAmount === "number" ? <Badge variant="outline">Residual {formatMoney(alert.residualAmount)}</Badge> : null}
                          {alert.type !== "high_agreement_residual" && typeof alert.totalAgreementValue === "number" && alert.totalAgreementValue > 0 ? <Badge variant="outline">Total agreement {formatMoney(alert.totalAgreementValue)}</Badge> : null}
                        </div>
                        <div className="mt-3 font-semibold text-slate-950">{alert.companyName}</div>
                        <div className="mt-1 text-sm">{alert.message}</div>
                      </div>
                      {alert.type === "high_agreement_residual" && typeof alert.totalAgreementValue === "number" && alert.totalAgreementValue > 0 ? (
                        <Badge variant="outline">Total agreement {formatMoney(alert.totalAgreementValue)}</Badge>
                      ) : (
                        <Badge variant="outline">{alert.month ? monthLabel(alert.month) : overview.year}</Badge>
                      )}
                    </div>
                    <div className="mt-3 text-xs opacity-80">{alert.explanation}</div>
                    <div className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-700">{alert.suggestedAction}</div>
                  </>
                );

                if (!alert.agreementDealLink) {
                  return (
                    <Link key={alert.id} href={alert.targetUrl} className={className}>
                      {content}
                    </Link>
                  );
                }

                return (
                  <div key={alert.id} className={className}>
                    {content}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link className="text-xs font-semibold underline-offset-4 hover:underline" href={alert.targetUrl}>
                        Company detail
                      </Link>
                      <a className="text-xs font-semibold underline-offset-4 hover:underline" href={alert.agreementDealLink} rel="noreferrer" target="_blank">
                        Deal link
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No rule-based alerts for the selected CSM filter.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle>Assigned companies</CardTitle>
              <CardDescription>
                Each company shows the current month, next month and an optional third month. Forecast values are split by Business Unit in a read-only view; edits happen in Forecast Entry.
              </CardDescription>
            </div>
            <div className="w-full xl:w-[260px]">
              <div className="mb-2 text-xs font-medium text-slate-500">Optional third month</div>
              <select
                aria-label="Optional third month"
                value={extraMonth}
                onChange={(event) => setExtraMonth(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="none">No extra month</option>
                {MONTHS.map((month, index) => {
                  const value = index + 1;
                  return value !== overview.currentMonth && value !== overview.nextMonth
                    ? <option key={month} value={String(value)}>{month}</option>
                    : null;
                })}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {companies.length > 0 ? (
            companies.map((company) => (
              <div key={company.companyName} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <Link href={companyHref(company.companyName, company.csmName, overview.year)} className="block rounded-xl bg-white p-3 transition hover:shadow-sm">
                    <div className="font-semibold text-slate-900">{company.companyName}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="outline">{company.activeAgreementsCount} active agreement(s)</Badge>
                      {company.primaryAgreementName ? <Badge variant="secondary">{company.primaryAgreementName}</Badge> : null}
                      <Badge variant="outline">Residual {formatMoney(company.residualAgreementValue)}</Badge>
                      <Badge variant="outline">Exp. {formatDate(company.primaryAgreementExpiry)}</Badge>
                    </div>
                  </Link>
                  <div className="rounded-xl bg-white p-3 text-sm text-slate-600 xl:max-w-[360px]">
                    {company.dataQualityStatus}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                  {monthsToShow.map((month) => (
                    <CsmMonthCard
                      key={`${company.companyName}-${month}`}
                      company={company}
                      year={overview.year}
                      month={month}
                      currentDate={currentDate}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No assigned companies are available for the selected CSM filter.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
