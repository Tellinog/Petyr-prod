"use client";

import React, { createContext, useContext, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ManagementObjectivesPanel } from '@/components/petyr/ManagementObjectivesWorkspace';
import { PetyrFloatingDiagnosticsMenu } from '@/components/petyr/PetyrFloatingDiagnosticsMenu';
import { PetyrWorkspaceShell } from '@/components/petyr/PetyrLayoutPrimitives';
import {
  formatPetyrCurrency,
  formatPetyrCurrencyValue,
  formatPetyrPercent,
  type PetyrNumericValue,
} from '@/lib/petyr/formatters';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import type {
  ApprovedUrgentAction,
  BranchRow,
  BusinessUnitRow,
  CompanyProfile,
  CustomerBusinessUnitMonth,
  CustomerRow,
  ForecastChangeLogEntry,
  ManagementRow,
  MonthlyMetric,
  PetyrApprovedRenderingData,
  ProgressMetrics,
  RevenueSeriesRow
} from '@/types/petyrApprovedRendering';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const AFFECTED_COMPANIES_PREVIEW_LIMIT = 4;

const chartColors = {
  forecastMese: '#2563eb',
  forecastOngoing: '#7c3aed',
  forecastAI: '#14b8a6',
  real: '#f97316',
  bar: '#7dd3fc',
  initialForecast: '#94a3b8',
};

const RenderingDataContext = createContext<PetyrApprovedRenderingData | null>(null);
const PreferredCsmContext = createContext<string | null>(null);

type RenderingState = 'loading' | 'ready' | 'error';

function useRenderingData() {
  const data = useContext(RenderingDataContext);

  if (!data) {
    throw new Error('PetyrMVPRendering requires PostgreSQL-backed rendering data.');
  }

  return data;
}

function usePreferredCsmName() {
  return useContext(PreferredCsmContext);
}

function customerMatchesPreferredCsm(customer: CustomerRow, preferredCsmName: string | null) {
  return Boolean(preferredCsmName && customer.csm === preferredCsmName);
}

function defaultSelectedCsm(customers: CustomerRow[], preferredCsmName: string | null) {
  return customers.some((customer) => customerMatchesPreferredCsm(customer, preferredCsmName)) ? preferredCsmName ?? 'all' : 'all';
}

function firstCustomerForCsm(customers: CustomerRow[], selectedCsm: string) {
  return selectedCsm === 'all' ? customers[0] : customers.find((customer) => customer.csm === selectedCsm) ?? customers[0];
}

function euro(value: number | null | undefined) {
  return formatPetyrCurrency(value);
}

function euroOrUnavailable(value: number | null | undefined) {
  return euro(value);
}

function shortEuro(value: number | null | undefined) {
  return euro(value);
}

function formatK(value: PetyrNumericValue) {
  return formatPetyrCurrencyValue(value);
}

function previousMonthForecastLineClass(previousMonthForecast: number | undefined, initialForecast: number | null | undefined) {
  if (previousMonthForecast === undefined || initialForecast === null || initialForecast === undefined) return 'bg-slate-400';
  if (previousMonthForecast > initialForecast) return 'bg-emerald-500';
  if (previousMonthForecast < initialForecast) return 'bg-yellow-400';
  return 'bg-slate-500';
}

function percent(value: number | null | undefined) {
  return formatPetyrPercent(value);
}

function monthlyTotal(items: MonthlyMetric[], key: keyof Pick<MonthlyMetric, 'forecastMese' | 'forecastOngoing' | 'forecastAI' | 'real'>) {
  return items.reduce((sum, item) => sum + item[key], 0);
}

function allMonthsTotal(items: MonthlyMetric[], key: keyof Pick<MonthlyMetric, 'forecastMese' | 'forecastOngoing' | 'forecastAI' | 'real'>) {
  return items.reduce((sum, item) => sum + item[key], 0);
}

function getYtdMonthCount() {
  return new Date().getMonth() + 1;
}

function buildProgressMetrics(monthly: MonthlyMetric[], yearlyObjective?: number | null): ProgressMetrics {
  const ytdMonthCount = getYtdMonthCount();
  const ytd = monthly.slice(0, ytdMonthCount);
  const workedYtd = monthlyTotal(ytd, 'real');
  const forecastMeseYtd = monthlyTotal(ytd, 'forecastMese');
  const forecastYear = allMonthsTotal(monthly, 'forecastMese');
  const denominator = yearlyObjective && yearlyObjective > 0 ? yearlyObjective : null;

  return {
    workedPct: denominator ? (workedYtd / denominator) * 100 : null,
    workedAndPlannedPct: null,
    initialForecast: null,
    ongoingForecast: null,
    workedYtd,
    plannedFuture: null,
    workedAndPlanned: null,
    forecastMeseYtd,
    forecastYear,
  };
}

function varianceClass(value: number, baseline: number) {
  if (!value || !baseline) return 'bg-slate-50 text-slate-500 border-slate-200';
  const ratio = value / baseline;
  if (ratio > 1.02) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (ratio >= 0.98) return 'bg-slate-50 text-slate-700 border-slate-200';
  if (ratio >= 0.9) return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-rose-50 text-rose-800 border-rose-200';
}

function NativeSelect({
  value,
  onChange,
  children,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <select
      aria-label={label || 'Select'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
    >
      {children}
    </select>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}

function InfoPill({ label, text }: { label: string; text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      className="inline-flex cursor-help items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500"
    >
      {label}
    </span>
  );
}

function MetricCell({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-lg border px-2 py-1 ${className}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-sm font-semibold leading-tight">{value}</div>
    </div>
  );
}

function ObjectiveCard({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value === null || value === undefined ? 'n/a' : euro(value)}</div>
    </div>
  );
}

function ValuePercentCard({ label, value, pct }: { label: string; value: number | null | undefined; pct: number | null | undefined }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{euroOrUnavailable(value)}</div>
      <div className="mt-1 text-xs font-medium text-slate-500">{percent(pct)}</div>
    </div>
  );
}

function TableValuePercentCell({ value, pct }: { value: number | null | undefined; pct: number | null | undefined }) {
  return (
    <div className="text-right">
      <div className="font-semibold text-slate-900">{euroOrUnavailable(value)}</div>
      <div className="text-xs text-slate-500">{percent(pct)}</div>
    </div>
  );
}

function MonthCard({ month }: { month: MonthlyMetric }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">{month.month}</div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <MetricCell label="Previous-month forecast" value={shortEuro(month.forecastMese)} className="border-slate-200 bg-slate-50 text-slate-700" />
        <MetricCell label="Ongoing forecast" value={shortEuro(month.forecastOngoing)} className={varianceClass(month.forecastOngoing, month.forecastMese)} />
        <MetricCell label="Closed revenue €" value={euro(month.real)} className={varianceClass(month.real, month.forecastMese)} />
      </div>
    </div>
  );
}

function BranchView() {
  const { branchRows } = useRenderingData();
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm font-medium text-slate-600">Branch View</div>
        <InfoPill label="Legend" text="Closed revenue is compared with the previous-month forecast alongside ongoing forecast. Green = above forecast, neutral = aligned, yellow = below forecast, red = severe gap." />
      </div>

      {branchRows.map((branch) => {
        const isExpanded = expandedBranch === branch.code;
        const metrics = branch.metrics ?? buildProgressMetrics(branch.monthly, branch.yearlyObjective);

        return (
          <Card key={branch.code} className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[150px_170px_160px_160px_190px_210px_auto] xl:items-center">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{branch.label}</div>
                </div>
                <ObjectiveCard label="Yearly Objective" value={branch.yearlyObjective} />
                <ObjectiveCard label="Initial Forecast" value={metrics.initialForecast} />
                <ObjectiveCard label="Ongoing Forecast" value={metrics.ongoingForecast} />
                <ValuePercentCard label="Closed revenue YTD" value={metrics.workedYtd} pct={metrics.workedPct} />
                <ValuePercentCard label="Closed revenue + planned" value={metrics.workedAndPlanned} pct={metrics.workedAndPlannedPct} />
                <Button variant="outline" className="rounded-xl" onClick={() => setExpandedBranch(isExpanded ? null : branch.code)}>
                  {isExpanded ? 'Hide months' : 'Show months'}
                </Button>
              </div>

              {isExpanded && (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-slate-600">Monthly detail {branch.code}</div>
                    <div className="text-xs text-slate-500">Closed revenue + planned: {euroOrUnavailable(metrics.workedAndPlanned)}</div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 xl:grid-cols-2 2xl:grid-cols-3">
                    {branch.monthly.map((month) => (
                      <MonthCard key={`${branch.code}-${month.month}`} month={month} />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
      </Card>
        );
      })}
    </div>
  );
}

function BusinessUnitView() {
  const { businessUnitRows } = useRenderingData();
  const [expandedBusinessUnit, setExpandedBusinessUnit] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {businessUnitRows.map((unit) => {
        const isExpanded = expandedBusinessUnit === unit.code;
        const metrics = unit.metrics ?? buildProgressMetrics(unit.monthly, unit.yearlyObjective);

        return (
          <Card key={unit.code} className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[150px_170px_160px_160px_190px_210px_auto] xl:items-center">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{unit.label}</div>
                </div>
                <ObjectiveCard label="Yearly Objective" value={unit.yearlyObjective} />
                <ObjectiveCard label="Initial Forecast" value={metrics.initialForecast} />
                <ObjectiveCard label="Ongoing Forecast" value={metrics.ongoingForecast} />
                <ValuePercentCard label="Closed revenue YTD" value={metrics.workedYtd} pct={metrics.workedPct} />
                <ValuePercentCard label="Closed revenue + planned" value={metrics.workedAndPlanned} pct={metrics.workedAndPlannedPct} />
                <Button variant="outline" className="rounded-xl" onClick={() => setExpandedBusinessUnit(isExpanded ? null : unit.code)}>
                  {isExpanded ? 'Hide months' : 'Show months'}
                </Button>
              </div>

              {isExpanded && (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-slate-600">Monthly detail {unit.label}</div>
                    <div className="text-xs text-slate-500">Closed revenue + planned: {euroOrUnavailable(metrics.workedAndPlanned)}</div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 xl:grid-cols-2 2xl:grid-cols-3">
                    {unit.monthly.map((month) => (
                      <MonthCard key={`${unit.code}-${month.month}`} month={month} />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
      </Card>
        );
      })}
    </div>
  );
}

function SingleCSMView() {
  const { managementRows } = useRenderingData();
  const [expandedCSM, setExpandedCSM] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {managementRows.map((row) => {
        const isExpanded = expandedCSM === row.csm;
        const metrics = row.metrics ?? buildProgressMetrics(row.monthly);

        return (
          <Card key={row.csm} className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_160px_160px_190px_210px_auto] xl:items-center">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{row.csm}</div>
                </div>
                <ObjectiveCard label="Initial Forecast" value={metrics.initialForecast} />
                <ObjectiveCard label="Ongoing Forecast" value={metrics.ongoingForecast} />
                <ValuePercentCard label="Closed revenue YTD" value={metrics.workedYtd} pct={metrics.workedPct} />
                <ValuePercentCard label="Closed revenue + planned" value={metrics.workedAndPlanned} pct={metrics.workedAndPlannedPct} />
                <Button variant="outline" className="rounded-xl" onClick={() => setExpandedCSM(isExpanded ? null : row.csm)}>
                  {isExpanded ? 'Hide months' : 'Show months'}
                </Button>
              </div>

              {isExpanded && (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-slate-600">Monthly detail {row.csm}</div>
                    <Badge variant="secondary">CSM KPI placeholder</Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-2 xl:grid-cols-2 2xl:grid-cols-3">
                    {row.monthly.map((month) => (
                      <MonthCard key={`${row.csm}-${month.month}`} month={month} />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
      </Card>
        );
      })}
    </div>
  );
}

function YearlyBranchView() {
  const { branchRows } = useRenderingData();

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle>Yearly View · Branch</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Yearly Objective</TableHead>
                <TableHead className="text-right">Initial Forecast</TableHead>
                <TableHead className="text-right">Ongoing Forecast</TableHead>
                <TableHead className="text-right">Closed revenue YTD</TableHead>
                <TableHead className="text-right">Closed revenue + planned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branchRows.map((branch) => {
                const metrics = branch.metrics ?? buildProgressMetrics(branch.monthly, branch.yearlyObjective);
                return (
                  <TableRow key={branch.code}>
                    <TableCell className="font-medium">{branch.code}</TableCell>
                    <TableCell className="text-right">{branch.yearlyObjective === null || branch.yearlyObjective === undefined ? 'n/a' : euro(branch.yearlyObjective)}</TableCell>
                    <TableCell className="text-right font-semibold">{euroOrUnavailable(metrics.initialForecast)}</TableCell>
                    <TableCell className="text-right font-semibold">{euroOrUnavailable(metrics.ongoingForecast)}</TableCell>
                    <TableCell><TableValuePercentCell value={metrics.workedYtd} pct={metrics.workedPct} /></TableCell>
                    <TableCell><TableValuePercentCell value={metrics.workedAndPlanned} pct={metrics.workedAndPlannedPct} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function formatTooltipValue(value: unknown) {
  if (typeof value === 'number' || typeof value === 'string') return formatPetyrCurrencyValue(value);
  return String(value ?? '');
}

function TrendInsightCard({ title, body, action }: { title: string; body: string; action: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-sm text-slate-600">{body}</div>
      <div className="mt-3 rounded-lg bg-white p-2 text-xs font-medium text-slate-600">Next step: {action}</div>
    </div>
  );
}

function BusinessUnitRevenueForecastChart() {
  const { budgetGroupSeries, year: selectedYear } = useRenderingData();
  const years = [
    {
      label: String(selectedYear - 2),
      valueKey: 'y2024',
      initialForecastKey: 'y2024InitialForecast',
      previousMonthForecastKey: 'y2024PreviousMonthForecast',
    },
    {
      label: String(selectedYear - 1),
      valueKey: 'y2025',
      initialForecastKey: 'y2025InitialForecast',
      previousMonthForecastKey: 'y2025PreviousMonthForecast',
    },
    {
      label: String(selectedYear),
      valueKey: 'y2026',
      initialForecastKey: 'y2026InitialForecast',
      previousMonthForecastKey: 'y2026PreviousMonthForecast',
    },
  ];

  const maxValue = Math.max(
    1,
    ...budgetGroupSeries.flatMap((item) =>
      years.flatMap((year) => {
        const actual = Number(item[year.valueKey as keyof RevenueSeriesRow] || 0);
        const initialForecast = Number(item[year.initialForecastKey as keyof RevenueSeriesRow] || 0);
        const previousMonthForecast = Number(item[year.previousMonthForecastKey as keyof RevenueSeriesRow] || 0);
        return [actual, initialForecast, previousMonthForecast];
      })
    )
  );
  const axisValues = [maxValue, maxValue * 0.5, 0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: chartColors.real }} />
          <span>Closed revenue</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-[3px] w-6 rounded-full" style={{ backgroundColor: chartColors.initialForecast }} />
          <span>Initial Forecast</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-[3px] w-6 rounded-full bg-emerald-500" />
          <span>Previous-month forecast above Initial Forecast</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-[3px] w-6 rounded-full bg-yellow-400" />
          <span>Previous-month forecast below Initial Forecast</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {budgetGroupSeries.map((item) => (
          <div key={item.group} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">{item.group}</div>
              <div className="text-xs text-slate-500">values in €</div>
          </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex h-[220px] gap-3">
                <div className="flex w-14 flex-col justify-between border-r border-slate-200 pr-2 text-right text-[10px] text-slate-500">
                  {axisValues.map((value) => (
                    <div key={`${item.group}-${value}`}>{formatK(value)}</div>
                  ))}
                </div>
                <div className="relative grid min-w-0 flex-1 grid-cols-3 items-end gap-3 border-b border-slate-300 px-2 pb-6 pt-2">
                  <div className="pointer-events-none absolute inset-x-2 top-2 border-t border-dashed border-slate-200" />
                  <div className="pointer-events-none absolute inset-x-2 top-1/2 border-t border-dashed border-slate-200" />
                  {years.map((year) => {
                    const actualValue = Number(item[year.valueKey as keyof RevenueSeriesRow] || 0);
                    const initialForecastValue = item[year.initialForecastKey as keyof RevenueSeriesRow] as number | null | undefined;
                    const previousMonthForecastValue = item[year.previousMonthForecastKey as keyof RevenueSeriesRow] as number | undefined;
                    const actualHeight = Math.max((actualValue / maxValue) * 100, actualValue > 0 ? 3 : 0);
                    const initialBottom = initialForecastValue !== null && initialForecastValue !== undefined ? Math.min((initialForecastValue / maxValue) * 100, 100) : undefined;
                    const previousBottom = previousMonthForecastValue !== undefined ? Math.min((previousMonthForecastValue / maxValue) * 100, 100) : undefined;

                    return (
                      <div key={`${item.group}-${year.label}`} className="relative flex h-full min-w-0 items-end justify-center">
                        {initialBottom !== undefined && (
                          <div
                            className="absolute left-1 right-1 z-10 h-[3px] rounded-full"
                            style={{ bottom: `${initialBottom}%`, backgroundColor: chartColors.initialForecast }}
                            title={`Initial Forecast ${year.label}: ${euro(initialForecastValue)}`}
                          />
                        )}
                        {previousBottom !== undefined && (
                          <div
                            className={`absolute left-1 right-1 z-20 h-[3px] rounded-full ${previousMonthForecastLineClass(previousMonthForecastValue, initialForecastValue)}`}
                            style={{ bottom: `${previousBottom}%` }}
                            title={`Previous-month forecast ${year.label}: ${euro(previousMonthForecastValue)}`}
                          />
                        )}
                        <div
                          className="w-9 rounded-t-lg"
                          style={{ height: `${actualHeight}%`, backgroundColor: chartColors.real }}
                          title={`${year.label}: ${euro(actualValue)}`}
                        />
                        <div className="absolute -bottom-5 text-[11px] font-medium text-slate-600">{year.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
          </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[0.8fr_1fr_1fr_1fr] bg-slate-50 px-3 py-2 text-[12.5px] font-medium text-slate-500">
                <div>Year</div>
                <div className="text-right">Closed revenue</div>
                <div className="text-right">Initial Forecast</div>
                <div className="text-right">Previous-month forecast</div>
              </div>
              {years.map((year) => {
                const actualValue = Number(item[year.valueKey as keyof RevenueSeriesRow] || 0);
                const initialForecastValue = item[year.initialForecastKey as keyof RevenueSeriesRow] as number | null | undefined;
                const previousMonthForecastValue = item[year.previousMonthForecastKey as keyof RevenueSeriesRow] as number | undefined;

                return (
                  <div key={`${item.group}-${year.label}-values`} className="grid grid-cols-[0.8fr_1fr_1fr_1fr] border-t border-slate-100 px-3 py-2 text-[12.5px] text-slate-600">
                    <div className="font-medium text-slate-700">{year.label}</div>
                    <div className="text-right">{formatK(actualValue)}</div>
                    <div className="text-right">{initialForecastValue !== null && initialForecastValue !== undefined ? formatK(initialForecastValue) : 'n/a'}</div>
                    <div className="text-right">{previousMonthForecastValue !== undefined ? formatK(previousMonthForecastValue) : 'n/a'}</div>
                  </div>
                );
              })}
          </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManagementView({
  canViewAdminTools,
  canManageObjectives,
}: {
  canViewAdminTools: boolean;
  canManageObjectives: boolean;
}) {
  const data = useRenderingData();
  const { monthlyManagement, positiveTrends, negativeTrends } = data;
  const [managementMode, setManagementMode] = useState<'monthly' | 'yearly'>('yearly');

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Management View"
        description="Visual rendering of the aggregated Petyr dashboard: Monthly Aggregate and Yearly View selection, branches, Business Units, CSMs, trends and insights."
      />

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Select aggregate mode</div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant={managementMode === 'monthly' ? 'default' : 'outline'} className="rounded-xl" onClick={() => setManagementMode('monthly')}>
              Monthly Aggregate
            </Button>
            <Button variant={managementMode === 'yearly' ? 'default' : 'outline'} className="rounded-xl" onClick={() => setManagementMode('yearly')}>
              Yearly View
            </Button>
          </div>
        </CardContent>
      </Card>

      {managementMode === 'monthly' ? (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Monthly Aggregate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
            <BranchView />
        </CardContent>
      </Card>
      ) : (
        <YearlyBranchView />
      )}

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Business Unit View</CardTitle>
        </CardHeader>
        <CardContent>
          <BusinessUnitView />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Single CSM View</CardTitle>
        </CardHeader>
        <CardContent>
          <SingleCSMView />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Current year trend</CardTitle>
          <CardDescription>Data source: CSM-entered forecast, AI forecast cache when available, closed revenue from Redash/campaign revenue.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
              <LineChart data={monthlyManagement}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={formatK} />
                <Tooltip formatter={formatTooltipValue} />
                <Legend />
                <Line type="monotone" dataKey="forecastAI" name="AI Forecast" stroke={chartColors.forecastAI} strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="forecastMese" name="Previous-month forecast" stroke={chartColors.forecastMese} strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="real" name="Closed revenue" stroke={chartColors.real} strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <TrendInsightCard
            title="Trend reading unavailable"
            body="Insight unavailable: this golden master view does not generate a narrative trend from chart data yet."
            action="Review the source-backed chart or the dedicated detail routes before taking action."
          />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Revenue per Business Unit</CardTitle>
          <CardDescription>Data source: historical campaign revenue by Business Unit, compared with the current year and previous years.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <BusinessUnitRevenueForecastChart />
          <TrendInsightCard
            title="Business Unit insight unavailable"
            body="Not enough source-backed narrative data is available in this rendering to state a Business Unit opportunity or risk."
            action="Use the Business Unit chart and dedicated Company Detail route for evidence-backed review."
          />
        </CardContent>
      </Card>

      {canViewAdminTools ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader>
      <CardTitle>Top 4 positive trends</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {positiveTrends.map((item) => (
                <div key={item} className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{item}</div>
              ))}
            </CardContent>
      </Card>
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader>
      <CardTitle>Top 4 negative trends</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {negativeTrends.map((item) => (
                <div key={item} className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900">{item}</div>
              ))}
            </CardContent>
      </Card>
        </div>
      ) : null}

      {canManageObjectives ? (
        <section className="space-y-3">
          <SectionTitle
            title="Management Objectives"
            description="Annual Branch and Business Unit objectives for management users. Annual Forecast remains the CSM-owned forecast."
          />
          <ManagementObjectivesPanel initialObjectives={null} initialYear={data.year} />
        </section>
      ) : null}
    </div>
  );
}

function getVisibleCSMMonthIndexes(currentMonth: number, extraMonth: string) {
  const nextMonth = Math.min(currentMonth + 1, months.length - 1);
  const indexes = [currentMonth, nextMonth];
  if (extraMonth !== 'none') indexes.push(Number(extraMonth));
  return Array.from(new Set(indexes)).filter((index) => index >= 0 && index < months.length);
}

function getForecastEntryMode(monthIndex: number, currentMonth: number, currentDay: number) {
  if (monthIndex < currentMonth) {
    return {
      label: 'Closed month',
      description: 'Closed month: values are read-only.',
      kind: 'closed',
      disabled: true,
    };
  }

  if (monthIndex === currentMonth && currentDay > 15) {
    return {
      label: 'Ongoing forecast',
      description: 'Forecast Entry edits the ongoing forecast for this month.',
      kind: 'ongoing',
      disabled: false,
    };
  }

  return {
    label: 'Previous-month forecast',
    description: 'Forecast Entry edits the previous-month forecast.',
    kind: 'previous-month',
    disabled: false,
  };
}

function annualBusinessUnitTotal(row: CustomerRow, businessUnit: string, key: keyof CustomerBusinessUnitMonth) {
  return row.months?.reduce((sum, month) => {
    const unit = month.businessUnits.find((item) => item.businessUnit === businessUnit);
    const value = unit?.[key];
    return sum + (typeof value === 'number' ? value : 0);
  }, 0) ?? 0;
}

function CSMMonthCard({
  month,
  index,
  currentMonth,
  currentDay,
  businessUnits,
}: {
  month: MonthlyMetric;
  index: number;
  currentMonth: number;
  currentDay: number;
  businessUnits?: CustomerBusinessUnitMonth[];
}) {
  const { businessUnitRows } = useRenderingData();
  const mode = getForecastEntryMode(index, currentMonth, currentDay);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{month.month}</div>
        </div>
        <Badge variant="outline">{mode.label}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {businessUnitRows.map((unit) => {
          const unitData = businessUnits?.find((item) => item.businessUnit === unit.label);
          const forecastValue = mode.kind === 'ongoing'
            ? unitData?.ongoingForecast
            : mode.kind === 'closed'
              ? unitData?.actualRevenue
              : unitData?.previousMonthForecast;

          return (
            <div key={`${month.month}-${unit.code}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="mb-1 text-[11px] font-medium text-slate-500">{unit.label}</div>
              <div className="text-sm font-semibold text-slate-900">{euro(forecastValue ?? null)}</div>
              <div className="mt-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
                AI Forecast: <span className="font-semibold text-slate-700">{euro(unitData?.aiForecast ?? null)}</span>
              </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function getCustomerMonthly(row: CustomerRow): MonthlyMetric[] {
  return months.map((month, monthIndex) => {
    const monthData = row.months?.find((item) => item.month === monthIndex + 1);
    const totals = monthData?.businessUnits.reduce(
      (summary, businessUnit) => ({
        forecastMese: summary.forecastMese + businessUnit.previousMonthForecast,
        forecastOngoing: summary.forecastOngoing + businessUnit.ongoingForecast,
        forecastAI: summary.forecastAI + businessUnit.aiForecast,
        real: summary.real + businessUnit.actualRevenue,
      }),
      { forecastMese: 0, forecastOngoing: 0, forecastAI: 0, real: 0 }
    );

    return {
      month,
      forecastMese: totals?.forecastMese ?? 0,
      forecastOngoing: totals?.forecastOngoing ?? 0,
      forecastAI: totals?.forecastAI ?? 0,
      real: totals?.real ?? 0,
    };
  });
}

function urgentActionTone(id: ApprovedUrgentAction['id']) {
  if (id === 'forecast_not_updated') return 'bg-blue-50 text-blue-900 border-blue-200';
  if (id === 'agreement_expiring_60_days') return 'bg-amber-50 text-amber-900 border-amber-200';
  if (id === 'expiredAgreementWithResidual') return 'bg-orange-50 text-orange-900 border-orange-200';
  if (id === 'high_agreement_residual' || id === 'csm_forecast_below_ai_forecast') return 'bg-rose-50 text-rose-900 border-rose-200';
  return 'bg-slate-50 text-slate-900 border-slate-200';
}

function agreementEvidenceLabel(row: Pick<CustomerRow, 'activeAgreement' | 'residual' | 'expiry'> & { totalAgreement?: number }) {
  return [
    row.activeAgreement,
    typeof row.totalAgreement === 'number' && row.totalAgreement > 0 ? 'Total agreement ' + euro(row.totalAgreement) : null,
    'Residual ' + euro(row.residual),
    'Exp. ' + row.expiry,
  ].filter(Boolean).join(' - ');
}

function CSMView() {
  const { csmCustomersBase, managementRows, urgentActions } = useRenderingData();
  const preferredCsmName = usePreferredCsmName();
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();
  const [selectedCSM, setSelectedCSM] = useState(() => defaultSelectedCsm(csmCustomersBase, preferredCsmName));
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [selectedActionId, setSelectedActionId] = useState<ApprovedUrgentAction['id']>('forecast_not_updated');
  const [showAllAffectedCompanies, setShowAllAffectedCompanies] = useState(false);
  const [extraMonth, setExtraMonth] = useState('none');

  const filtered = useMemo(() => {
    if (selectedCSM === 'all') return csmCustomersBase;
    return csmCustomersBase.filter((item) => item.csm === selectedCSM);
  }, [csmCustomersBase, selectedCSM]);

  const companyFilterOptions = useMemo(
    () => [...filtered].sort((left, right) => left.company.localeCompare(right.company)),
    [filtered]
  );

  const clientViewRows = useMemo(() => {
    if (selectedCompany === 'all') return filtered;
    return filtered.filter((row) => row.company === selectedCompany);
  }, [filtered, selectedCompany]);

  const visibleMonthIndexes = useMemo(() => getVisibleCSMMonthIndexes(currentMonth, extraMonth), [currentMonth, extraMonth]);
  const nextMonth = Math.min(currentMonth + 1, months.length - 1);

  const csmSummary = useMemo(() => {
    const selectedManagementRows = selectedCSM === 'all'
      ? managementRows
      : managementRows.filter((row) => row.csm === selectedCSM);

    if (selectedManagementRows.length > 0) {
      return selectedManagementRows.reduce(
        (summary, row) => ({
          workedYtd: summary.workedYtd + (row.metrics?.workedYtd ?? 0),
          plannedFuture: summary.plannedFuture === null || row.metrics?.plannedFuture === null || row.metrics?.plannedFuture === undefined
            ? null
            : summary.plannedFuture + row.metrics.plannedFuture,
        }),
        { workedYtd: 0, plannedFuture: 0 as number | null }
      );
    }

    return filtered.reduce(
      (summary, row) => ({
        workedYtd: summary.workedYtd + row.real,
        plannedFuture: null,
      }),
      { workedYtd: 0, plannedFuture: null as number | null }
    );
  }, [filtered, managementRows, selectedCSM]);

  const aiNotes = ['AI notes unavailable: no AI cache-backed notes are connected to this golden master view yet.'];

  const actionItems = urgentActions.map((action) => ({
    ...action,
    companies: selectedCSM === 'all' ? action.companies : action.companies.filter((company) => company.csm === selectedCSM),
    tone: urgentActionTone(action.id),
  })).filter((action) => action.companies.length > 0);

  const selectedAction = actionItems.find((item) => item.id === selectedActionId) || actionItems[0] || null;
  const activeActionId = selectedAction?.id ?? null;
  const selectedActionCompanies = selectedAction?.companies ?? [];
  const affectedCompaniesPreview = showAllAffectedCompanies
    ? selectedActionCompanies
    : selectedActionCompanies.slice(0, AFFECTED_COMPANIES_PREVIEW_LIMIT);
  const hasHiddenAffectedCompanies = selectedActionCompanies.length > AFFECTED_COMPANIES_PREVIEW_LIMIT;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="CSM Overview"
        description="Operational CSM view: essential KPIs, AI note availability, source-backed relevant insights, and read-only forecast overview for the selected CSM companies."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.1fr_1fr_1fr]">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="space-y-3 p-5">
            <div className="text-sm text-slate-500">CSM filter</div>
            <NativeSelect
              value={selectedCSM}
              onChange={(value) => {
                setSelectedCSM(value);
                setSelectedCompany('all');
                setShowAllAffectedCompanies(false);
              }}
              label="CSM filter"
            >
              <option value="all">All CSMs</option>
              {Array.from(new Set(csmCustomersBase.map((row) => row.csm))).map((csm) => (
                <option key={csm} value={csm}>{csm}</option>
              ))}
            </NativeSelect>
            <div className="text-xs text-slate-500">
              Client View always shows the current month and the next month. You can add one extra month from the dedicated selector.
          </div>
        </CardContent>
      </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-5">
            <div className="text-sm text-slate-500">Closed revenue YTD</div>
            <div className="mt-2 text-2xl font-semibold">{euro(csmSummary.workedYtd)}</div>
            <div className="mt-1 text-xs text-slate-500">Sum of closed revenue for closed months on filtered companies</div>
        </CardContent>
      </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-5">
            <div className="text-sm text-slate-500">Planned through year end</div>
            <div className="mt-2 text-2xl font-semibold">{euroOrUnavailable(csmSummary.plannedFuture)}</div>
            <div className="mt-1 text-xs text-slate-500">Redash future planned campaign revenue when management aggregates are available</div>
        </CardContent>
      </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>AI notes unavailable</CardTitle>
          <CardDescription>No AI cache-backed notes are generated in this golden master preview.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
            {aiNotes.map((note) => (
              <div key={note} className="rounded-xl bg-slate-50 p-3 text-sm">{note}</div>
            ))}
        </CardContent>
      </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Relevant insights</CardTitle>
          <CardDescription>Click a card to see the companies affected by the insight.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {actionItems.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    setSelectedActionId(action.id);
                    setShowAllAffectedCompanies(false);
                  }}
                  className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${activeActionId === action.id ? action.tone : 'border-slate-200 bg-white text-slate-700'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{action.title}</div>
                      <div className="mt-1 text-xs opacity-75">{action.description}</div>
                    </div>
                    <Badge variant="secondary">{action.companies.length}</Badge>
                  </div>
                </button>
              ))}
          </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Affected companies · {selectedAction?.title ?? 'Relevant insights'}</div>
              <div className="mt-3 space-y-2">
                {selectedAction && selectedActionCompanies.length > 0 ? (
                  affectedCompaniesPreview.map((company) => (
                    <div key={`${selectedAction.id}-${company.company}-${company.activeAgreement}`} className="flex flex-col gap-1 rounded-xl bg-white p-3 text-sm md:flex-row md:items-center md:justify-between">
                      <div>
                        <a className="font-medium text-slate-900 underline-offset-4 hover:underline" href={companyDetailHref(company.company)}>
                          {company.company}
                        </a>
                        <div className="text-xs text-slate-500">{company.activeAgreement}</div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {company.badges && company.badges.length > 0 ? (
                          company.badges.map((badge) => (
                            <Badge key={`${company.company}-${badge}`} variant="outline" className="text-[11px]">{badge}</Badge>
                          ))
                        ) : (
                          <>
                            <Badge variant="outline" className="max-w-full whitespace-normal text-left text-[11px] leading-5">{agreementEvidenceLabel({ ...company, totalAgreement: 0 })}</Badge>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl bg-white p-3 text-sm text-slate-500">No relevant insights for the selected scope.</div>
                )}
              </div>
              {hasHiddenAffectedCompanies ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 rounded-xl"
                  onClick={() => setShowAllAffectedCompanies((current) => !current)}
                >
                  {showAllAffectedCompanies
                    ? `Show first ${AFFECTED_COMPANIES_PREVIEW_LIMIT}`
                    : `Show all ${selectedActionCompanies.length}`}
                </Button>
              ) : null}
          </div>
        </CardContent>
      </Card>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
      <CardTitle>Client View</CardTitle>
      <CardDescription>
                Each company shows the current month, next month, and one optional extra month. Forecast values are split by Business Unit in a read-only view; edits happen in Forecast Entry.
              </CardDescription>
          </div>
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:w-[560px]">
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500">Company filter</div>
                <NativeSelect value={selectedCompany} onChange={setSelectedCompany} label="Company filter for Client View">
                  <option value="all">All companies</option>
                  {companyFilterOptions.map((row) => (
                    <option key={row.company} value={row.company}>{row.company}</option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-slate-500">Add another month</div>
                <NativeSelect value={extraMonth} onChange={setExtraMonth} label="Add another month to Client View">
                  <option value="none">No extra month</option>
                  {months.map((month, index) => (
                    index !== currentMonth && index !== nextMonth ? <option key={month} value={String(index)}>{month}</option> : null
                  ))}
                </NativeSelect>
              </div>
          </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {clientViewRows.length > 0 ? clientViewRows.map((row) => {
            const monthly = getCustomerMonthly(row);
            return (
      <Card key={row.company} className="rounded-2xl border-slate-200 shadow-sm">
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{row.company}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="max-w-full whitespace-normal text-left text-[11px] leading-5">
                          {agreementEvidenceLabel(row)}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-sm text-slate-500">Data status: {row.risk}</div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                    {visibleMonthIndexes.map((monthIndex) => (
                      <CSMMonthCard
                        key={`${row.company}-${monthly[monthIndex].month}`}
                        month={monthly[monthIndex]}
                        index={monthIndex}
                        currentMonth={currentMonth}
                        currentDay={currentDay}
                        businessUnits={row.months?.find((item) => item.month === monthIndex + 1)?.businessUnits}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          }) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No companies match the selected Client View filters.
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CompanyAlertActions({ companyName, profile }: { companyName: string; profile?: CompanyProfile }) {
  const [selectedAlertId, setSelectedAlertId] = useState('agreement');

  const alerts = [
    {
      id: 'agreement',
      title: 'Agreements and expirations',
      description: 'Detailed agreement alert evidence is not loaded in this golden master preview.',
      count: 0,
      tone: 'bg-amber-50 text-amber-900 border-amber-200',
      items: [],
      emptyMessage: 'Agreement alert detail unavailable in this preview. Open the dedicated Company Detail route for source-backed agreement evidence.',
    },
    {
      id: 'residual',
      title: 'Agreement residual',
      description: 'Read-only residual value from PostgreSQL-backed overview data.',
      count: profile?.residual ? 1 : 0,
      tone: 'bg-rose-50 text-rose-900 border-rose-200',
      items: profile?.residual ? [`Current residual from overview data: ${euro(profile.residual)}.`] : [],
      emptyMessage: 'Residual data pending for this company.',
    },
    {
      id: 'business-unit',
      title: 'Business Unit below history',
      description: 'Company-level Business Unit history insight is not generated in this preview.',
      count: 0,
      tone: 'bg-blue-50 text-blue-900 border-blue-200',
      items: [],
      emptyMessage: 'Business Unit history insight unavailable in this preview.',
    },
    {
      id: 'ai-notes',
      title: 'AI notes unavailable',
      description: 'No AI cache-backed note is loaded for this golden master preview.',
      count: 0,
      tone: 'bg-slate-50 text-slate-900 border-slate-200',
      items: [],
      emptyMessage: 'No AI notes generated yet for this company.',
    },
  ];

  const selectedAlert = alerts.find((alert) => alert.id === selectedAlertId) || alerts[0];

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle>Agreement alerts and note availability</CardTitle>
        <CardDescription>
          Source-backed alerts and unavailable-note states for the selected company. Click a card to see the detail.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              onClick={() => setSelectedAlertId(alert.id)}
              className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${selectedAlertId === alert.id ? alert.tone : 'border-slate-200 bg-white text-slate-700'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{alert.title}</div>
                  <div className="mt-1 text-xs opacity-75">{alert.description}</div>
                </div>
                <Badge variant="secondary">{alert.count}</Badge>
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-900">Detail · {selectedAlert.title}</div>
          <div className="mt-3 space-y-2">
            {selectedAlert.items.length > 0 ? (
              selectedAlert.items.map((item) => (
                <div key={item} className="rounded-xl bg-white p-3 text-sm text-slate-700">
                  {item}
                </div>
              ))
            ) : (
              <div className="rounded-xl bg-white p-3 text-sm text-slate-500">{selectedAlert.emptyMessage}</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function buildFallbackCompanyProfile(row?: CustomerRow): CompanyProfile | undefined {
  if (!row) return undefined;
  const monthly = getCustomerMonthly(row);

  return {
    csm: row.csm,
    totalAgreements: row.totalAgreement,
    workedYTD: row.real,
    residual: row.residual,
    monthly,
    budgetGroups: null,
    campaigns: null,
    alerts: [],
  };
}

function groupForecastLogs(companyName: string, forecastChangeLog: ForecastChangeLogEntry[]) {
  return forecastChangeLog.filter((entry) => entry.company === companyName).reduce<Array<{ id: string; when: string; source: string; month: string; note: string; entries: ForecastChangeLogEntry[] }>>((groups, entry) => {
    const id = `${entry.when}-${entry.source}-${entry.month}-${entry.note}`;
    const existingGroup = groups.find((group) => group.id === id);
    if (existingGroup) {
      existingGroup.entries.push(entry);
      return groups;
    }
    return [
      ...groups,
      {
        id,
        when: entry.when,
        source: entry.source,
        month: entry.month,
        note: entry.note,
        entries: [entry],
      },
    ];
  }, []);
}

function ForecastChangeHistory({ companyName }: { companyName: string }) {
  const { forecastChangeLog } = useRenderingData();
  const groupedCompanyLogs = groupForecastLogs(companyName, forecastChangeLog);

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle>Forecast change history</CardTitle>
        <CardDescription>
          Log of saved forecast changes for this company: date, source, Business Unit, updated field, previous value, new value and CSM note.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-500">Changes are grouped by save session: if the CSM updates multiple Business Units at once, Petyr records one batch with multiple detail rows.</div>
          <div className="mt-4 space-y-3">
            {groupedCompanyLogs.length > 0 ? (
              groupedCompanyLogs.map((group) => (
                <div key={group.id} className="rounded-xl bg-white p-3 text-sm">
                  <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="font-medium text-slate-900">Save session · {group.month}</div>
                      <div className="mt-1 text-xs text-slate-500">{group.when} · from {group.source}</div>
                    </div>
                    <Badge variant="outline">{group.entries.length} {group.entries.length === 1 ? 'change' : 'changes'}</Badge>
                  </div>

                  <div className="mt-3 space-y-2">
                    {group.entries.map((entry) => (
                      <div key={`${entry.company}-${entry.when}-${entry.businessUnit}-${entry.field}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-4">
                          <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                            <div className="text-slate-500">Business Unit</div>
                            <div className="font-semibold text-slate-900">{entry.businessUnit}</div>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                            <div className="text-slate-500">Updated field</div>
                            <div className="font-semibold text-slate-900">{entry.field}</div>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                            <div className="text-slate-500">Before</div>
                            <div className="font-semibold text-slate-900">{euro(entry.from)}</div>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                            <div className="text-slate-500">After</div>
                            <div className="font-semibold text-slate-900">{euro(entry.to)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">Session note: {group.note}</div>
                </div>
              ))
            ) : (
              <div className="rounded-xl bg-white p-3 text-sm text-slate-500">No tracked change for this company.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm"
      aria-pressed={checked}
      disabled={disabled}
    >
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      </span>
    </button>
  );
}

function forecastEntryHref(companyName: string, csmName: string, monthIndex: number) {
  const params = new URLSearchParams({
    companyName,
    csmName,
    year: String(new Date().getFullYear()),
    month: String(monthIndex + 1),
  });

  return `/forecasting/entry?${params.toString()}`;
}

function companyDetailHref(companyName: string) {
  const params = new URLSearchParams({
    year: String(new Date().getFullYear()),
  });

  return `/forecasting/company/${encodeURIComponent(companyName)}?${params.toString()}`;
}

function MenuRouteLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  const className = "inline-flex items-center justify-center whitespace-nowrap rounded-xl px-3 py-3 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50";

  if (!href) {
    return (
      <span
        aria-disabled="true"
        className={`${className} cursor-not-allowed text-slate-400 hover:bg-transparent`}
        title="Company data is required before this section can be opened."
      >
        {children}
      </span>
    );
  }

  return (
    <a className={className} href={href}>
      {children}
    </a>
  );
}

function defaultForecastEntryHref(customers: CustomerRow[], preferredCsmName: string | null) {
  const firstCompany = firstCustomerForCsm(customers, defaultSelectedCsm(customers, preferredCsmName));
  if (!firstCompany) return '/forecasting/entry';

  return forecastEntryHref(firstCompany.company, firstCompany.csm || 'Unassigned', new Date().getMonth());
}

function defaultCompanyDetailHref(customers: CustomerRow[], preferredCsmName: string | null) {
  const firstCompany = firstCustomerForCsm(customers, defaultSelectedCsm(customers, preferredCsmName));
  if (!firstCompany) return null;

  return companyDetailHref(firstCompany.company);
}

function CompanyForecastEditor({
  companyName,
  profile,
  row,
  currentMonth,
  currentDay,
  note,
  setNote,
  companyActive = true,
  onCompanyActiveChange,
}: {
  companyName: string;
  profile?: CompanyProfile;
  row?: CustomerRow;
  currentMonth: number;
  currentDay: number;
  note: string;
  setNote: (value: string) => void;
  companyActive?: boolean;
  onCompanyActiveChange?: (value: boolean) => void;
}) {
  const { businessUnitRows } = useRenderingData();
  const [selectedForecastMonth, setSelectedForecastMonth] = useState(String(currentMonth));
  const forecastMonthIndex = Number(selectedForecastMonth);
  const fallbackMetric: MonthlyMetric = { month: months[currentMonth] || 'Month', forecastMese: 0, forecastOngoing: 0, forecastAI: 0, real: 0 };
  const selectedMetric = profile?.monthly?.[forecastMonthIndex] ?? fallbackMetric;
  const mode = getForecastEntryMode(forecastMonthIndex, currentMonth, currentDay);
  const entryHref = forecastEntryHref(companyName, profile?.csm ?? 'Unassigned', forecastMonthIndex);

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
          <CardTitle>Review forecast and open Forecast Entry</CardTitle>
          <CardDescription>
              Select the month and review forecast values by Business Unit. Monthly edits are saved only in Forecast Entry.
            </CardDescription>
          </div>
          <div className="w-full xl:w-[240px]">
            <div className="mb-2 text-xs font-medium text-slate-500">Working month</div>
            <NativeSelect value={selectedForecastMonth} onChange={setSelectedForecastMonth} label="Company forecast working month">
              {months.map((month, index) => (
                <option key={month} value={String(index)}>{month}</option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">{selectedMetric.month}</div>
              <div className="mt-1 text-sm text-slate-600">{mode.description}</div>
          </div>
            <Badge variant={mode.disabled ? 'outline' : 'secondary'}>{mode.label}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {businessUnitRows.map((unit) => {
            const unitData = row?.months
              ?.find((item) => item.month === forecastMonthIndex + 1)
              ?.businessUnits.find((item) => item.businessUnit === unit.label);
            const forecastValue = mode.kind === 'ongoing'
              ? unitData?.ongoingForecast
              : mode.kind === 'closed'
                ? unitData?.actualRevenue
                : unitData?.previousMonthForecast;

            return (
              <div key={`${companyName}-${unit.code}-${selectedMetric.month}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{unit.label}</div>
                <div className="mt-3 text-xs font-medium text-slate-500">{mode.label}</div>
                <Input
                  defaultValue={formatPetyrCurrency(forecastValue ?? null)}
                  disabled
                  className="mt-1 h-10 rounded-xl text-right"
                />
                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                  AI Forecast
                  <div className="mt-1 text-base font-semibold text-slate-900">{euro(unitData?.aiForecast ?? null)}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
          <div>
            <div className="mb-2 text-sm text-slate-500">Save note</div>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add context for this forecast update..."
              disabled
              className="min-h-[120px] rounded-xl"
          />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 text-sm font-medium text-slate-700">Company status</div>
            <ToggleSwitch
              checked={companyActive}
              onChange={(value) => onCompanyActiveChange?.(value)}
              label={companyActive ? 'Company active' : 'Company inactive'}
              disabled
          />
            <div className="mt-2 text-xs text-slate-500">Company status is saved with the forecast update in Forecast Entry.</div>
          </div>
        </div>
        <a
          className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          href={entryHref}
        >
          Open Forecast Entry
        </a>

        <ForecastChangeHistory companyName={companyName} />
      </CardContent>
    </Card>
  );
}

function isAnnualForecastWindow(date: Date) {
  return date.getMonth() === 11 && date.getDate() >= 15 && date.getDate() <= 30;
}

function parseDisplayDate(date: string) {
  const [day, month, year] = date.split('/').map(Number);
  return new Date(year, month - 1, day).getTime();
}

function getCompanyPriorityScore(company: CustomerRow, activeMap: Record<string, boolean> = {}) {
  const expiryTime = parseDisplayDate(company.expiry);
  const now = new Date().getTime();
  const daysToExpiry = Math.max((expiryTime - now) / (1000 * 60 * 60 * 24), 0);
  const expiryScore = daysToExpiry <= 60 ? 50000 : daysToExpiry <= 120 ? 25000 : 0;
  const activeScore = activeMap[company.company] === false ? -100000 : 10000;
  return activeScore + company.residual + expiryScore;
}

function getForecastEntryCompanies(companies: CustomerRow[], selectedCSM: string, activeMap: Record<string, boolean> = {}) {
  const filtered = selectedCSM === 'all' ? companies : companies.filter((company) => company.csm === selectedCSM);
  return [...filtered].sort((a, b) => getCompanyPriorityScore(b, activeMap) - getCompanyPriorityScore(a, activeMap));
}

function ForecastCompanyNavigator({
  allCompanies,
  selectedCSM,
  setSelectedCSM,
  selectedCompany,
  setSelectedCompany,
  sortedCompanies,
  activeMap = {},
  sticky = false,
  orderLabel = 'ordering: forecast urgency',
  helperText = 'Ordering uses active company status, agreement residual and near expirations. Data status is shown without generating extra risk insight.',
}: {
  allCompanies: CustomerRow[];
  selectedCSM: string;
  setSelectedCSM: (value: string) => void;
  selectedCompany: string;
  setSelectedCompany: (value: string) => void;
  sortedCompanies: CustomerRow[];
  activeMap?: Record<string, boolean>;
  sticky?: boolean;
  orderLabel?: string;
  helperText?: string;
}) {
  const selectedIndex = Math.max(sortedCompanies.findIndex((company) => company.company === selectedCompany), 0);

  function selectCompanyByIndex(index: number) {
    const nextIndex = Math.min(Math.max(index, 0), sortedCompanies.length - 1);
    const nextCompany = sortedCompanies[nextIndex]?.company;
    if (nextCompany) setSelectedCompany(nextCompany);
  }

  return (
    <Card className={`${sticky ? 'sticky top-4 z-30 backdrop-blur' : ''} rounded-2xl border-slate-200 bg-white/95 shadow-sm`}>
      <CardContent className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-[220px_minmax(260px,0.62fr)_minmax(640px,1fr)] xl:items-end">
        <div className="space-y-2">
          <div className="text-sm text-slate-500">CSM filter</div>
          <NativeSelect
            value={selectedCSM}
	            onChange={(value) => {
	              setSelectedCSM(value);
	              const nextCompanies = getForecastEntryCompanies(allCompanies, value, activeMap);
	              if (nextCompanies[0]) setSelectedCompany(nextCompanies[0].company);
	            }}
            label="Forecast Entry CSM filter"
          >
	            <option value="all">All CSMs</option>
	            {Array.from(new Set(allCompanies.map((company) => company.csm))).map((csm) => (
	              <option key={csm} value={csm}>{csm}</option>
	            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-500">Company</div>
            <Badge variant="outline">{orderLabel}</Badge>
          </div>
          <NativeSelect value={selectedCompany} onChange={setSelectedCompany} label="Select company">
            {sortedCompanies.map((company) => (
              <option key={company.company} value={company.company}>{company.company}</option>
            ))}
          </NativeSelect>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex items-center gap-3">
            <Button variant="outline" className="min-w-[132px] rounded-xl" disabled={selectedIndex <= 0} onClick={() => selectCompanyByIndex(selectedIndex - 1)}>
              ← Previous
            </Button>
            <div className="flex-1 whitespace-nowrap rounded-xl bg-white px-3 py-2 text-center text-sm font-semibold text-slate-900 shadow-sm">
              {sortedCompanies.length ? selectedIndex + 1 : 0} / {sortedCompanies.length}
          </div>
            <Button variant="outline" className="min-w-[132px] rounded-xl" disabled={selectedIndex >= sortedCompanies.length - 1} onClick={() => selectCompanyByIndex(selectedIndex + 1)}>
              Next →
            </Button>
          </div>
          <div className="text-xs text-slate-500">{helperText}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function AnnualForecastEntry({
  selectedCSM,
  setSelectedCSM,
  row,
  isEditable,
}: {
  selectedCSM: string;
  setSelectedCSM: (value: string) => void;
  row?: CustomerRow;
  isEditable: boolean;
}) {
  const { businessUnitRows, csmCustomersBase } = useRenderingData();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(currentYear + 1));
  const [annualNote, setAnnualNote] = useState('');
  const year = Number(selectedYear);
  const isFutureYear = year > currentYear;
  const canEditSelectedYear = isFutureYear;
  const canConsolidate = isEditable && isFutureYear;

  if (!row) return null;

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
          <CardTitle>Annual forecast</CardTitle>
          <CardDescription>
              Review past annual forecasts, the current-year forecast and next-year forecast. Final consolidation happens between December 15 and December 30.
            </CardDescription>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:w-[520px]">
            <div>
              <div className="mb-2 text-xs font-medium text-slate-500">Single CSM</div>
              <NativeSelect
                value={selectedCSM === 'all' ? row.csm : selectedCSM}
                onChange={setSelectedCSM}
                label="Annual forecast CSM"
              >
                {Array.from(new Set(csmCustomersBase.map((company) => company.csm))).map((csm) => (
                  <option key={csm} value={csm}>{csm}</option>
                ))}
              </NativeSelect>
          </div>
            <div>
              <div className="mb-2 text-xs font-medium text-slate-500">Year</div>
              <NativeSelect value={selectedYear} onChange={setSelectedYear} label="Annual forecast year">
                {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((item) => (
                  <option key={item} value={String(item)}>{item}</option>
                ))}
              </NativeSelect>
          </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`rounded-2xl border p-4 ${canConsolidate ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : canEditSelectedYear ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
          {canConsolidate
            ? 'Consolidation window open: formal consolidation is handled in the dedicated Forecast Entry route.'
            : canEditSelectedYear
              ? 'Future year draft entry is handled in the dedicated Forecast Entry route.'
              : 'Historical year or current year: annual forecast and closed revenue/progress are available in read-only mode.'}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {businessUnitRows.map((unit) => {
            const forecastValue = year === currentYear ? annualBusinessUnitTotal(row, unit.label, 'previousMonthForecast') : null;
            const aiValue = year === currentYear ? annualBusinessUnitTotal(row, unit.label, 'aiForecast') : null;
            const actualValue = year <= currentYear ? annualBusinessUnitTotal(row, unit.label, 'actualRevenue') : null;
            return (
              <div key={`annual-${row.company}-${unit.code}-${year}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{unit.label}</div>
                <div className="mt-3 text-xs font-medium text-slate-500">CSM forecast {year}</div>
	                <Input
	                  defaultValue={formatPetyrCurrency(forecastValue)}
	                  disabled
	                  className="mt-1 h-10 rounded-xl text-right"
	                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                    AI Forecast
                    <div className="mt-1 text-sm font-semibold text-slate-900">{euroOrUnavailable(aiValue)}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                    {year <= currentYear ? 'Closed revenue/progress' : 'Expected closed revenue'}
                    <div className="mt-1 text-sm font-semibold text-slate-900">{euroOrUnavailable(actualValue)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <div className="mb-2 text-sm text-slate-500">Annual notes</div>
          <Textarea
            value={annualNote}
            onChange={(event) => setAnnualNote(event.target.value)}
            disabled
            placeholder="Add context on the annual forecast, assumptions and main risks..."
            className="min-h-[110px] rounded-xl"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Button variant="outline" className="rounded-xl" disabled>Save annual draft</Button>
          <Button className="rounded-xl" disabled>Consolidate annual forecast</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ForecastEntryView() {
  const { csmCustomersBase, companyProfiles } = useRenderingData();
  const preferredCsmName = usePreferredCsmName();
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();
  const initialSelectedCsm = defaultSelectedCsm(csmCustomersBase, preferredCsmName);
  const [selectedCSM, setSelectedCSM] = useState(initialSelectedCsm);
  const [selectedCompany, setSelectedCompany] = useState(() => firstCustomerForCsm(csmCustomersBase, initialSelectedCsm)?.company ?? '');
  const [note, setNote] = useState('');
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>({});

  const sortedCompanies = useMemo(() => getForecastEntryCompanies(csmCustomersBase, selectedCSM, activeMap), [activeMap, csmCustomersBase, selectedCSM]);
  const safeCompany = sortedCompanies.some((company) => company.company === selectedCompany) ? selectedCompany : sortedCompanies[0]?.company || '';
  const selectedRow = sortedCompanies.find((company) => company.company === safeCompany);
  const profile = companyProfiles[safeCompany] ?? buildFallbackCompanyProfile(selectedRow);
  const annualEditable = isAnnualForecastWindow(today);

  function handleActiveChange(company: string, value: boolean) {
    setActiveMap((current) => ({ ...current, [company]: value }));
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Forecast Entry"
        description="Read-only entry preview: monthly forecast saves happen only in the dedicated Forecast Entry route."
      />

      <ForecastCompanyNavigator
        allCompanies={csmCustomersBase}
        selectedCSM={selectedCSM}
        setSelectedCSM={setSelectedCSM}
        selectedCompany={safeCompany}
        setSelectedCompany={setSelectedCompany}
        sortedCompanies={sortedCompanies}
        activeMap={activeMap}
        sticky
      />

      <Tabs defaultValue="monthly" className="space-y-6">
        <TabsList className="grid h-auto grid-cols-1 rounded-2xl border border-slate-200 bg-white p-1 md:grid-cols-2">
          <TabsTrigger value="monthly" className="rounded-xl py-3">Monthly forecast</TabsTrigger>
          <TabsTrigger value="annual" className="rounded-xl py-3">Annual forecast</TabsTrigger>
        </TabsList>
        <TabsContent value="monthly">
          <div className="space-y-6">
            <CompanyAlertActions companyName={safeCompany} profile={profile} />
            <CompanyForecastEditor
              companyName={safeCompany}
              profile={profile}
              row={selectedRow}
              currentMonth={currentMonth}
              currentDay={currentDay}
              note={note}
              setNote={setNote}
              companyActive={activeMap[safeCompany] !== false}
              onCompanyActiveChange={(value) => handleActiveChange(safeCompany, value)}
          />
          </div>
        </TabsContent>
        <TabsContent value="annual">
          <AnnualForecastEntry
            selectedCSM={selectedCSM}
            setSelectedCSM={(value) => {
              setSelectedCSM(value);
              const nextCompanies = getForecastEntryCompanies(csmCustomersBase, value, activeMap);
              if (nextCompanies[0]) setSelectedCompany(nextCompanies[0].company);
            }}
            row={selectedRow}
            isEditable={annualEditable}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function getResidualSortedCompanies(companies: CustomerRow[], selectedCSM: string) {
  const filtered = selectedCSM === 'all' ? companies : companies.filter((company) => company.csm === selectedCSM);
  return [...filtered].sort((a, b) => b.residual - a.residual);
}

function CompanyView() {
  const { csmCustomersBase, companyProfiles } = useRenderingData();
  const preferredCsmName = usePreferredCsmName();
  const initialSelectedCsm = defaultSelectedCsm(csmCustomersBase, preferredCsmName);
  const [selectedCSM, setSelectedCSM] = useState(initialSelectedCsm);
  const [selectedCompany, setSelectedCompany] = useState(() => firstCustomerForCsm(csmCustomersBase, initialSelectedCsm)?.company ?? '');

  const sortedCompanies = useMemo(() => getResidualSortedCompanies(csmCustomersBase, selectedCSM), [csmCustomersBase, selectedCSM]);
  const safeCompany = sortedCompanies.some((company) => company.company === selectedCompany) ? selectedCompany : sortedCompanies[0]?.company || '';
  const selectedRow = sortedCompanies.find((company) => company.company === safeCompany);
  const profile = companyProfiles[safeCompany] ?? buildFallbackCompanyProfile(selectedRow);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Company Detail"
        description="Preview of the analytical company sheet. Full campaign detail, AI cache rows and change history live in the dedicated Company Detail route."
      />

      <ForecastCompanyNavigator
        allCompanies={csmCustomersBase}
        selectedCSM={selectedCSM}
        setSelectedCSM={setSelectedCSM}
        selectedCompany={safeCompany}
        setSelectedCompany={setSelectedCompany}
        sortedCompanies={sortedCompanies}
        orderLabel="ordered by residual"
        helperText="Browse selected companies starting from the highest agreement residual."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card className="rounded-2xl border-slate-200 shadow-sm"><CardContent className="p-4"><div className="text-xs text-slate-500">Total agreement</div><div className="mt-1 text-xl font-semibold">{euro(profile?.totalAgreements)}</div></CardContent></Card>
        <Card className="rounded-2xl border-slate-200 shadow-sm"><CardContent className="p-4"><div className="text-xs text-slate-500">Closed revenue YTD</div><div className="mt-1 text-xl font-semibold">{euro(profile?.workedYTD)}</div></CardContent></Card>
        <Card className="rounded-2xl border-slate-200 shadow-sm"><CardContent className="p-4"><div className="text-xs text-slate-500">Agreement residual</div><div className="mt-1 text-xl font-semibold">{euro(profile?.residual)}</div></CardContent></Card>
        <Card className="rounded-2xl border-slate-200 shadow-sm"><CardContent className="p-4"><div className="text-xs text-slate-500">CSM</div><div className="mt-1 text-lg font-semibold">{profile?.csm ?? '—'}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Month-by-month trend</CardTitle>
          <CardDescription>Previous-month forecast, ongoing forecast, AI forecast and closed revenue over time.</CardDescription>
        </CardHeader>
        <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
              <LineChart data={profile?.monthly || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={formatTooltipValue} />
                <Legend />
                <Line type="monotone" dataKey="forecastMese" name="Previous-month forecast" stroke={chartColors.forecastMese} strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="forecastOngoing" name="Ongoing forecast" stroke={chartColors.forecastOngoing} strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="forecastAI" name="AI Forecast" stroke={chartColors.forecastAI} strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="real" name="Closed revenue" stroke={chartColors.real} strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
        </CardContent>
      </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Revenue per Business Unit</CardTitle>
          <CardDescription>Preview only: company-level historical Business Unit rows are not loaded in this golden master tab.</CardDescription>
        </CardHeader>
        <CardContent className="h-[340px]">
            {profile?.budgetGroups ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
                <BarChart data={profile.budgetGroups}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="group" />
                <YAxis />
                <Tooltip formatter={formatTooltipValue} />
                <Legend />
                  <Bar dataKey="y2024" name="2024" fill="#94a3b8" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="y2025" name="2025" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="y2026" name="2026" fill="#22c55e" radius={[8, 8, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                Company-level Business Unit history unavailable in this preview.
              </div>
            )}
        </CardContent>
      </Card>
      </div>

      <CompanyAlertActions companyName={safeCompany} profile={profile} />

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Company campaigns</CardTitle>
          <CardDescription>Preview only: campaign rows are loaded in the dedicated Company Detail route, not in this golden master tab.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-2xl border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Campaign name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Business Unit</TableHead>
                  <TableHead>Agreement</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Costs</TableHead>
                  <TableHead className="text-right">GM%</TableHead>
                  <TableHead>Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profile?.campaigns && profile.campaigns.length > 0 ? (
                  profile.campaigns.map((campaign) => (
                    <TableRow key={campaign.name}>
                      <TableCell className="font-medium">{campaign.name}</TableCell>
                      <TableCell>{campaign.status}</TableCell>
                      <TableCell>{campaign.budgetGroup}</TableCell>
                      <TableCell>{campaign.agreement}</TableCell>
                      <TableCell className="text-right">{euro(campaign.value)}</TableCell>
                      <TableCell className="text-right">{euro(campaign.costs)}</TableCell>
                      <TableCell className="text-right font-semibold">{percent(campaign.gmPct)}</TableCell>
                      <TableCell><Button variant="link" className="h-auto p-0">{campaign.link}</Button></TableCell>
                    </TableRow>
                  ))
                ) : profile?.campaigns ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-sm text-slate-500">
                      No source-backed campaigns returned for this company.
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-sm text-slate-500">
                      Campaign detail unavailable in this preview. <a className="font-medium text-slate-900 underline" href={companyDetailHref(safeCompany)}>View full company detail</a>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ForecastChangeHistory companyName={safeCompany} />
    </div>
  );
}

function ForecastingDataLoadingBody() {
  return (
    <div className="flex min-h-[360px] items-center justify-center py-12">
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 text-center">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" aria-hidden="true" />
        <span className="text-sm font-semibold text-slate-900">Updating data ongoing</span>
      </div>
    </div>
  );
}

function ForecastingDataErrorBody({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex min-h-[360px] items-center justify-center py-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="h-10 w-10 rounded-full border-4 border-rose-200 bg-rose-50" aria-hidden="true" />
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-900">Unable to update Management data.</div>
          <div className="text-xs text-slate-500">Retry the PostgreSQL-backed refresh before using the dashboard.</div>
        </div>
        {onRetry ? (
          <Button variant="outline" className="rounded-xl" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function PetyrMVPRendering({
  data,
  activeView = 'management',
  preferredCsmName = null,
  canViewAdminTools = false,
  canViewCsmOverview = true,
  canManageObjectives = false,
  renderingState = 'ready',
  onRetryRenderingData,
}: {
  data: PetyrApprovedRenderingData;
  activeView?: 'management' | 'csm';
  preferredCsmName?: string | null;
  canViewAdminTools?: boolean;
  canViewCsmOverview?: boolean;
  canManageObjectives?: boolean;
  renderingState?: RenderingState;
  onRetryRenderingData?: () => void;
}) {
  const menuForecastEntryHref = defaultForecastEntryHref(data.csmCustomersBase, preferredCsmName);
  const menuCompanyDetailHref = defaultCompanyDetailHref(data.csmCustomersBase, preferredCsmName);
  const visibleView = activeView === 'csm' && !canViewCsmOverview ? 'management' : activeView;
  const workspaceBody = renderingState === 'loading'
    ? <ForecastingDataLoadingBody />
    : renderingState === 'error'
      ? <ForecastingDataErrorBody onRetry={onRetryRenderingData} />
      : visibleView === 'csm'
        ? <CSMView />
        : <ManagementView canViewAdminTools={canViewAdminTools} canManageObjectives={canManageObjectives} />;

  return (
    <RenderingDataContext.Provider value={data}>
      <PreferredCsmContext.Provider value={preferredCsmName}>
        <PetyrWorkspaceShell
          activeSection={visibleView}
          companyDetailHref={menuCompanyDetailHref}
          forecastEntryHref={menuForecastEntryHref}
          canViewCsmOverview={canViewCsmOverview}
        >
          {workspaceBody}
          {renderingState === 'ready' && canViewAdminTools ? <PetyrFloatingDiagnosticsMenu diagnostics={data.diagnostics} /> : null}
        </PetyrWorkspaceShell>
      </PreferredCsmContext.Provider>
    </RenderingDataContext.Provider>
  );
}
