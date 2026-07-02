"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPetyrCurrencyValue } from "@/lib/petyr/formatters";
import { PetyrCard, PetyrEmptyState } from "@/components/petyr/PetyrLayoutPrimitives";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type CompanyBusinessUnitMonthRow = {
  month: number;
  actualRevenue: number;
  previousMonthForecast: number;
  ongoingForecast: number;
  aiForecast: number;
};

export type CompanyBusinessUnitMonthlyRow = {
  businessUnit: string;
  months: CompanyBusinessUnitMonthRow[];
};

function formatMoney(value: number | string | null | undefined) {
  return formatPetyrCurrencyValue(value);
}

function monthLabel(month: number) {
  return MONTHS[month - 1] ?? String(month);
}

function hasMonthData(month: CompanyBusinessUnitMonthRow) {
  return month.actualRevenue !== 0 || month.previousMonthForecast !== 0 || month.ongoingForecast !== 0 || month.aiForecast !== 0;
}

function totalFor(row: CompanyBusinessUnitMonthlyRow, key: keyof Omit<CompanyBusinessUnitMonthRow, "month">) {
  return row.months.reduce((sum, month) => sum + month[key], 0);
}

function MetricCell({ label, value, className = "" }: { label: string; value: number; className?: string }) {
  return (
    <div className={`rounded-lg border px-2 py-1 ${className}`}>
      <div className="text-[10px] uppercase opacity-70">{label}</div>
      <div className="text-sm font-semibold leading-tight">{formatMoney(value)}</div>
    </div>
  );
}

function MonthCard({ month }: { month: CompanyBusinessUnitMonthRow }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 text-center text-xs font-semibold uppercase text-slate-500">{monthLabel(month.month)}</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <MetricCell label="Previous-month forecast" value={month.previousMonthForecast} className="border-slate-200 bg-slate-50 text-slate-700" />
        <MetricCell label="Ongoing forecast" value={month.ongoingForecast} className="border-violet-200 bg-violet-50 text-violet-900" />
        <MetricCell label="AI Forecast" value={month.aiForecast} className="border-teal-200 bg-teal-50 text-teal-900" />
        <MetricCell label="Closed revenue" value={month.actualRevenue} className="border-orange-200 bg-orange-50 text-orange-900" />
      </div>
    </div>
  );
}

function hasBusinessUnitData(row: CompanyBusinessUnitMonthlyRow) {
  return row.months.some(hasMonthData);
}

export function CompanyBusinessUnitMonthlyView({ rows }: { rows: CompanyBusinessUnitMonthlyRow[] }) {
  const [expandedBusinessUnit, setExpandedBusinessUnit] = useState<string | null>(null);
  const visibleRows = rows.filter(hasBusinessUnitData);

  if (visibleRows.length === 0) {
    return <PetyrEmptyState>No monthly Business Unit forecast, AI forecast or closed revenue data found for this company and selected year.</PetyrEmptyState>;
  }

  return (
    <div className="space-y-4">
      {visibleRows.map((row) => {
        const isExpanded = expandedBusinessUnit === row.businessUnit;
        const monthsWithData = row.months.filter(hasMonthData).length;

        return (
          <PetyrCard key={row.businessUnit} className="bg-white">
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_170px_170px_170px_auto] xl:items-center">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{row.businessUnit}</div>
                  <div className="mt-1 text-xs text-slate-500">{monthsWithData} month(s) with source-backed values.</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Ongoing forecast</div>
                  <div className="text-base font-semibold text-slate-900">{formatMoney(totalFor(row, "ongoingForecast"))}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">AI Forecast</div>
                  <div className="text-base font-semibold text-slate-900">{formatMoney(totalFor(row, "aiForecast"))}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Closed Revenue YTD</div>
                  <div className="text-base font-semibold text-slate-900">{formatMoney(totalFor(row, "actualRevenue"))}</div>
                </div>
                <Button variant="outline" className="rounded-xl" type="button" onClick={() => setExpandedBusinessUnit(isExpanded ? null : row.businessUnit)}>
                  {isExpanded ? "Hide months" : "Show months"}
                </Button>
              </div>

              {isExpanded ? (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-slate-600">Monthly detail {row.businessUnit}</div>
                    <Badge variant="outline">Company Detail</Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-2 xl:grid-cols-2 2xl:grid-cols-3">
                    {row.months.map((month) => (
                      <MonthCard key={`${row.businessUnit}-${month.month}`} month={month} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </PetyrCard>
        );
      })}
    </div>
  );
}
