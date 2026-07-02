"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Scatter,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatPetyrCurrencyValue } from "@/lib/petyr/formatters";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const chartColors = {
  forecastMese: "#2563eb",
  forecastOngoing: "#7c3aed",
  forecastAI: "#14b8a6",
  real: "#f97316",
  closedBar: "#f97316",
  initialForecastBar: "#94a3b8",
  previousMonthAbove: "#16a34a",
  previousMonthBelow: "#eab308"
};

export type CompanyMonthlyTrendChartRow = {
  month: number;
  actualRevenue: number;
  previousMonthForecast: number;
  ongoingForecast: number;
  aiForecast: number;
};

export type CompanyBusinessUnitChartRow = {
  businessUnit: string;
  actualRevenue: number;
  initialForecast: number | null;
  previousMonthForecast: number;
  previousMonthForecastRowsCount: number;
};

type PreviousMonthMarkerProps = {
  cx?: number;
  cy?: number;
  payload?: {
    previousMonthMarkerColor?: string;
  };
};

function formatTooltipValue(value: unknown) {
  if (typeof value === "number" || typeof value === "string") return formatPetyrCurrencyValue(value);
  return String(value ?? "");
}

function PreviousMonthMarker({ cx, cy, payload }: PreviousMonthMarkerProps) {
  if (typeof cx !== "number" || typeof cy !== "number") return null;

  return (
    <line
      x1={cx - 15}
      x2={cx + 15}
      y1={cy}
      y2={cy}
      stroke={payload?.previousMonthMarkerColor ?? chartColors.previousMonthAbove}
      strokeWidth={4}
      strokeLinecap="round"
    />
  );
}

function ChartEmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[260px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

export function CompanyMonthlyTrendChart({ rows }: { rows: CompanyMonthlyTrendChartRow[] }) {
  if (rows.length === 0) {
    return <ChartEmptyState text="No monthly trend data is available for this company." />;
  }

  const chartRows = rows.map((row) => ({
    month: months[row.month - 1] ?? String(row.month),
    forecastMese: row.previousMonthForecast,
    forecastOngoing: row.ongoingForecast,
    forecastAI: row.aiForecast,
    real: row.actualRevenue
  }));

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
      <LineChart data={chartRows}>
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
  );
}

export function CompanyBusinessUnitRevenueChart({ rows }: { rows: CompanyBusinessUnitChartRow[] }) {
  const visibleRows = rows.filter((row) => (
    row.actualRevenue !== 0 ||
    row.initialForecast !== null ||
    row.previousMonthForecastRowsCount > 0
  ));
  const hasInitialForecast = visibleRows.some((row) => row.initialForecast !== null);
  const hasPreviousMonthForecast = visibleRows.some((row) => row.previousMonthForecastRowsCount > 0);

  if (visibleRows.length === 0) {
    return (
      <ChartEmptyState text="No closed revenue or forecast values are available for the selected year. Planned future values are shown in the table when present." />
    );
  }

  const chartRows = visibleRows.map((row) => {
    const previousMonthMarkerColor = row.initialForecast !== null && row.previousMonthForecast < row.initialForecast
      ? chartColors.previousMonthBelow
      : chartColors.previousMonthAbove;

    return {
      group: row.businessUnit,
      closedRevenue: row.actualRevenue,
      initialForecast: row.initialForecast,
      previousMonthForecast: row.previousMonthForecastRowsCount > 0 ? row.previousMonthForecast : null,
      previousMonthMarkerColor
    };
  });

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
      <ComposedChart data={chartRows}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="group" interval={0} tick={{ fontSize: 12 }} />
        <YAxis />
        <Tooltip formatter={formatTooltipValue} />
        <Legend />
        <Bar dataKey="closedRevenue" name="Closed revenue" fill={chartColors.closedBar} radius={[8, 8, 0, 0]} />
        {hasInitialForecast ? <Bar dataKey="initialForecast" name="Initial Forecast" fill={chartColors.initialForecastBar} radius={[8, 8, 0, 0]} /> : null}
        {hasPreviousMonthForecast ? (
          <Scatter
            dataKey="previousMonthForecast"
            name="Previous-month forecast"
            legendType="line"
            shape={<PreviousMonthMarker />}
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
