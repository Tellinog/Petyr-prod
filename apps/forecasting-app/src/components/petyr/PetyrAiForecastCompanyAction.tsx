"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { applyPetyrAiForecastAction, generatePetyrAiForecastPreviewAction } from "@/app/forecasting/aiForecastActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PetyrEmptyState, PetyrInlineNotice, PetyrSupportCard } from "@/components/petyr/PetyrLayoutPrimitives";
import { formatPetyrCurrency, formatPetyrNumber } from "@/lib/petyr/formatters";
import type {
  PetyrAiForecastIntelligenceActionResult,
  PetyrAiForecastManualActionResult,
  PetyrAiForecastManualForecastRow,
  PetyrAiForecastNumericMetric,
  PetyrAiForecastOpenRouterDebug
} from "@/types/petyrAiForecastManualAction";

type PetyrAiForecastCompanyActionProps = {
  companyName: string;
  year: number;
  onApplied?: () => void;
};

type AiExecutionState = {
  status: "idle" | "running" | "failed";
  mode: "deterministic" | "llm" | "apply" | null;
  message: string | null;
};

type ChartRow = Record<string, string | number | null>;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const chartColors = {
  baseline: "#2563eb",
  ai: "#14b8a6",
  planned: "#f97316",
  closed: "#64748b",
  previous: "#7c3aed",
  ongoing: "#0f766e",
  residual: "#f59e0b"
};

const redactionPatterns: Array<[RegExp, string]> = [
  [/Authorization\s*:\s*Bearer\s+[^\n\r"}]+/gi, "Authorization: Bearer [redacted]"],
  [/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/g, "Bearer [redacted]"],
  [/(OPENROUTER_API_KEY\s*[=:]\s*)[^\s,"}]+/gi, "$1[redacted]"],
  [/("(?:api[_-]?key|authorization|token)"\s*:\s*")[^"]+(")/gi, "$1[redacted]$2"]
];

function monthLabel(month: number) {
  return MONTHS[month - 1] ?? `Month ${month}`;
}

function noticeTone(result: PetyrAiForecastManualActionResult): "success" | "warning" | "danger" {
  if (!result.ok) return "danger";
  if (result.mode === "apply" && !result.wroteToDatabase) return "warning";
  return "success";
}

function metricAvailable(metric: PetyrAiForecastNumericMetric | null | undefined) {
  return metric?.availability === "available" && typeof metric.value === "number" && Number.isFinite(metric.value);
}

function metricValue(metric: PetyrAiForecastNumericMetric | null | undefined) {
  const value = metric?.value;
  return metricAvailable(metric) && typeof value === "number" ? value : null;
}

function metricMoney(metric: PetyrAiForecastNumericMetric | null | undefined) {
  const value = metric?.value;
  return metricAvailable(metric) && typeof value === "number" ? formatPetyrCurrency(value) : "n/a";
}

function metricReason(metric: PetyrAiForecastNumericMetric | null | undefined) {
  return metric?.availability === "notAvailable" ? metric.reason : null;
}

function formatSignedMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  if (value > 0) return `+${formatPetyrCurrency(value)}`;
  return formatPetyrCurrency(value);
}

function formatTooltipValue(value: unknown) {
  if (typeof value === "number") return formatPetyrCurrency(value);
  return String(value ?? "n/a");
}

function residualCoverageLabel(row: PetyrAiForecastManualForecastRow) {
  const signal = row.agreementResidualSignal;
  const gap = formatPetyrCurrency(signal.coverageGap);
  const coverage = formatPetyrCurrency(signal.forecastCoverageValue);
  const residual = formatPetyrCurrency(signal.residualValue);

  if (signal.status === "gap" || signal.coverageGap > 0) {
    return `Gap ${gap}; coverage ${coverage}; residual ${residual}`;
  }

  if (signal.status === "covered") return `Covered; coverage ${coverage}; residual ${residual}`;
  if (signal.status === "company_level_unattributed") return `Company-level residual signal; residual ${residual}`;
  return "No active future residual";
}

function redactedText(value: string) {
  return redactionPatterns.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

function redactedJson(value: unknown) {
  if (value === null || value === undefined) return "n/a";

  try {
    return redactedText(JSON.stringify(value, null, 2));
  } catch {
    return redactedText(String(value));
  }
}

function SummaryCard({ label, value, helper }: { label: string; value: string | number; helper?: string | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</div>
      {helper ? <div className="mt-1 text-[11px] leading-4 text-slate-500">{helper}</div> : null}
    </div>
  );
}

function JsonDetails({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      <summary className="cursor-pointer font-medium text-slate-900">{title}</summary>
      <pre className="mt-3 max-h-[360px] overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
        {redactedJson(value)}
      </pre>
    </details>
  );
}

function RowSignalDetails({ row }: { row: PetyrAiForecastManualForecastRow }) {
  const explainability = row.explainability;

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
      <summary className="cursor-pointer font-medium text-slate-900">
        {row.businessUnit} · {monthLabel(row.month)} {row.year}
      </summary>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <SummaryCard label="Historical weighted" value={metricMoney(explainability.historicalWeightedBaseline)} helper={metricReason(explainability.historicalWeightedBaseline)} />
        <SummaryCard label="Seasonality" value={metricMoney(explainability.seasonalitySignal)} helper={metricReason(explainability.seasonalitySignal)} />
        <SummaryCard label="Run-rate" value={metricMoney(explainability.runRateSignal)} helper={metricReason(explainability.runRateSignal)} />
        <SummaryCard label="Planned floor" value={metricMoney(explainability.plannedCampaignsValue)} helper="Valid Setup/Recruiting planned future value." />
        <SummaryCard label="Baseline" value={metricMoney(explainability.baselineForecast)} helper={explainability.weightingMode.replaceAll("_", " ")} />
        <SummaryCard label="Model adjustment" value={formatSignedMoney(explainability.finalAiAdjustment.value)} helper="Interpretation-only; forecast value stays deterministic." />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-semibold text-slate-900">Included signals</div>
          <div className="mt-2 space-y-2">
            {explainability.includedSignals.length > 0 ? (
              explainability.includedSignals.map((signal) => (
                <div key={`${row.businessUnit}-${row.month}-included-${signal.code}`} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                  <div className="font-semibold text-slate-900">{signal.label}</div>
                  <div>{signal.reason}</div>
                  <div className="mt-1 text-slate-500">Value: {signal.value === null ? "n/a" : formatPetyrCurrency(signal.value)} · Weight: {signal.numericWeight === null ? "not calibrated" : signal.numericWeight}</div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-500">No positive signal was included for this row.</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-semibold text-slate-900">Excluded or limited signals</div>
          <div className="mt-2 space-y-2">
            {explainability.excludedSignals.length > 0 ? (
              explainability.excludedSignals.map((signal) => (
                <div key={`${row.businessUnit}-${row.month}-excluded-${signal.code}`} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                  <div className="font-semibold text-slate-900">{signal.label}</div>
                  <div>{signal.reason}</div>
                  <div className="mt-1 text-slate-500">Value: {signal.value === null ? "n/a" : formatPetyrCurrency(signal.value)}</div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-500">No excluded signal was reported for this row.</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div className="text-sm font-semibold text-slate-900">Drivers</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {row.drivers.map((driver) => <Badge key={`${row.businessUnit}-${row.month}-${driver}`} variant="outline">{driver}</Badge>)}
          </div>
          <div className="mt-3">{row.explanation}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div className="text-sm font-semibold text-slate-900">Context and residual allocation</div>
          <div className="mt-2">{row.advice}</div>
          <div className="mt-2 text-slate-500">{residualCoverageLabel(row)}</div>
        </div>
      </div>
    </details>
  );
}

function OverviewSection({ rows }: { rows: PetyrAiForecastManualForecastRow[] }) {
  if (rows.length === 0) return <PetyrEmptyState>No future forecast rows are available for this company and year.</PetyrEmptyState>;

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
      <Table className="min-w-[1180px]">
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Business Unit</TableHead>
            <TableHead>Month</TableHead>
            <TableHead className="text-right">Baseline</TableHead>
            <TableHead className="text-right">Forecast value</TableHead>
            <TableHead className="text-right">Model adj.</TableHead>
            <TableHead className="text-right">Confidence</TableHead>
            <TableHead className="text-right">Planned</TableHead>
            <TableHead>Residual pressure</TableHead>
            <TableHead>Context</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.businessUnit}-${row.year}-${row.month}`}>
              <TableCell className="font-medium text-slate-900">{row.businessUnit}</TableCell>
              <TableCell className="text-slate-700">{monthLabel(row.month)} {row.year}</TableCell>
              <TableCell className="text-right text-slate-700">{formatPetyrCurrency(row.baselineForecast)}</TableCell>
              <TableCell className="text-right font-semibold text-slate-900">{formatPetyrCurrency(row.aiForecastValue)}</TableCell>
              <TableCell className="text-right text-slate-700">{formatSignedMoney(row.finalAiAdjustment)}</TableCell>
              <TableCell className="text-right text-slate-700">{formatPetyrNumber(row.confidenceScore)}</TableCell>
              <TableCell className="text-right text-slate-700">{formatPetyrCurrency(row.plannedCampaignsValue)}</TableCell>
              <TableCell className="max-w-[260px] text-xs text-slate-700">{residualCoverageLabel(row)}</TableCell>
              <TableCell className="max-w-[320px] text-xs text-slate-700">{row.advice}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function intelligenceStatusTone(status: PetyrAiForecastIntelligenceActionResult["status"]): "neutral" | "info" | "success" | "warning" | "danger" {
  if (status === "success") return "success";
  if (status === "cached") return "info";
  if (status === "failed") return "danger";
  return "neutral";
}

function severityTone(severity: "low" | "medium" | "high"): "info" | "warning" | "danger" {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "info";
}

function IntelligenceSection({ result }: { result: PetyrAiForecastManualActionResult }) {
  const intelligence = result.aiIntelligence;
  const output = intelligence.output;

  if (!intelligence.requested) {
    return (
      <div className="space-y-4">
        <PetyrInlineNotice tone="neutral">
          Deterministic preview is available. Generate AI forecast to request OpenRouter business analysis without changing local forecast values.
        </PetyrInlineNotice>
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryCard label="AI status" value="not requested" />
          <SummaryCard label="Prompt" value={intelligence.promptVersion} />
          <SummaryCard label="Output schema" value={intelligence.outputSchemaVersion} />
        </div>
      </div>
    );
  }

  if (!intelligence.ok || !output) {
    return (
      <div className="space-y-4">
        <PetyrInlineNotice tone="danger">
          Forecast Intelligence did not produce valid JSON. Deterministic forecast values are still available.
        </PetyrInlineNotice>
        {intelligence.errorMessage ? <PetyrInlineNotice tone="danger">{redactedText(intelligence.errorMessage)}</PetyrInlineNotice> : null}
        {intelligence.validationErrors.length > 0 ? (
          <div className="space-y-2">
            {intelligence.validationErrors.map((error) => (
              <PetyrInlineNotice key={[error.path, error.message].join("-")} tone="danger">{error.path}: {error.message}</PetyrInlineNotice>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">Stakeholder notes</div>
        <div className="mt-3 space-y-3">
          {output.stakeholder_notes.length > 0 ? output.stakeholder_notes.map((note, index) => (
            <PetyrInlineNotice key={["stakeholder-note", index, note.title].join("-")} tone="neutral">
              <div className="font-semibold">{note.title}</div>
              <div className="mt-1 text-sm">{note.note}</div>
              <div className="mt-2 text-xs font-semibold text-slate-600">{note.numeric_evidence}</div>
            </PetyrInlineNotice>
          )) : <PetyrEmptyState>No stakeholder notes were returned.</PetyrEmptyState>}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Risks and red flags</div>
          <div className="mt-3 space-y-3">
            {output.risks.length > 0 ? output.risks.map((risk, index) => (
              <PetyrInlineNotice key={["risk", index, risk.type].join("-")} tone={severityTone(risk.severity)}>
                <div className="font-semibold">{risk.type.replaceAll("_", " ")} · {risk.severity}</div>
                <div className="mt-1 text-sm">{risk.description}</div>
                <div className="mt-2 text-xs font-semibold text-slate-600">{risk.numeric_evidence}</div>
              </PetyrInlineNotice>
            )) : <PetyrEmptyState>No risks were returned.</PetyrEmptyState>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Watchouts</div>
          <div className="mt-3 space-y-3">
            {output.watchouts.length > 0 ? output.watchouts.map((item, index) => (
              <PetyrInlineNotice key={["watchout", index, item.title].join("-")} tone={severityTone(item.severity)}>
                <div className="font-semibold">{item.title} · {item.severity}</div>
                <div className="mt-1 text-sm">{item.evidence}</div>
                <div className="mt-2 text-xs font-semibold text-slate-600">{item.numeric_evidence}</div>
              </PetyrInlineNotice>
            )) : <PetyrEmptyState>No watchouts were returned.</PetyrEmptyState>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Opportunities</div>
          <div className="mt-3 space-y-3">
            {output.opportunities.length > 0 ? output.opportunities.map((item, index) => (
              <PetyrInlineNotice key={["opportunity", index, item.title].join("-")} tone={severityTone(item.severity)}>
                <div className="font-semibold">{item.title} · {item.severity}</div>
                <div className="mt-1 text-sm">{item.evidence}</div>
                <div className="mt-2 text-xs font-semibold text-slate-600">{item.numeric_evidence}</div>
              </PetyrInlineNotice>
            )) : <PetyrEmptyState>No opportunities were returned.</PetyrEmptyState>}
          </div>
        </div>
      </div>
    </div>
  );
}

function AlgorithmsSection({ result, rows }: { result: PetyrAiForecastManualActionResult; rows: PetyrAiForecastManualForecastRow[] }) {
  const summary = result.algorithmSummary;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <PetyrInlineNotice tone="info">
          <div className="font-semibold">{summary.code} · v{summary.version}</div>
          <div className="mt-1">{summary.deterministicFormulaExplanation}</div>
        </PetyrInlineNotice>
        <PetyrInlineNotice tone="warning">
          No fake weights are shown. Calibrated weights are {summary.usesCalibratedWeights ? "available" : "not defined"}; current weighting mode is {summary.weightingMode.replaceAll("_", " ")}.
        </PetyrInlineNotice>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div className="font-semibold text-slate-900">AI interpretation rule</div>
          <div className="mt-1">{summary.llmAdjustmentExplanation}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div className="font-semibold text-slate-900">Validation authority</div>
          <div className="mt-1">{summary.validationAuthorityExplanation}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <div className="font-semibold text-slate-900">Current limitations</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {summary.currentLimitations.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>

      <div className="space-y-3">
        {rows.length > 0 ? rows.map((row) => <RowSignalDetails key={`${row.businessUnit}-${row.year}-${row.month}`} row={row} />) : <PetyrEmptyState>No row-level signal breakdown is available.</PetyrEmptyState>}
      </div>
    </div>
  );
}

function YearBusinessUnitSection({ result }: { result: PetyrAiForecastManualActionResult }) {
  const rows = result.selectedYearAggregates.businessUnits;

  if (rows.length === 0) return <PetyrEmptyState>No selected-year Business Unit aggregate data is available.</PetyrEmptyState>;

  return (
    <div className="space-y-4">
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
        <Table className="min-w-[1120px]">
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Business Unit</TableHead>
              <TableHead className="text-right">Closed revenue YTD</TableHead>
              <TableHead className="text-right">Planned future</TableHead>
              <TableHead className="text-right">Baseline future</TableHead>
              <TableHead className="text-right">Forecast future</TableHead>
              <TableHead className="text-right">CSM annual forecast</TableHead>
              <TableHead className="text-right">Residual gap</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.businessUnit}>
                <TableCell className="font-medium text-slate-900">{row.businessUnit}</TableCell>
                <TableCell className="text-right text-slate-700" title={metricReason(row.closedRevenueYtd) ?? undefined}>{metricMoney(row.closedRevenueYtd)}</TableCell>
                <TableCell className="text-right text-slate-700" title={metricReason(row.plannedFutureValue) ?? undefined}>{metricMoney(row.plannedFutureValue)}</TableCell>
                <TableCell className="text-right text-slate-700" title={metricReason(row.deterministicBaselineFutureTotal) ?? undefined}>{metricMoney(row.deterministicBaselineFutureTotal)}</TableCell>
                <TableCell className="text-right font-semibold text-slate-900" title={metricReason(row.aiForecastFutureTotal) ?? undefined}>{metricMoney(row.aiForecastFutureTotal)}</TableCell>
                <TableCell className="text-right text-slate-700" title={metricReason(row.csmAnnualForecast) ?? undefined}>{metricMoney(row.csmAnnualForecast)}</TableCell>
                <TableCell className="text-right text-slate-700" title={metricReason(row.residualPressureGap) ?? undefined}>{metricMoney(row.residualPressureGap)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2">
        {result.selectedYearAggregates.notes.map((note) => (
          <PetyrInlineNotice key={note} tone="neutral">{note}</PetyrInlineNotice>
        ))}
      </div>
    </div>
  );
}

function MonthlyChart({ result }: { result: PetyrAiForecastManualActionResult }) {
  const series = result.selectedYearAggregates.monthlySeries;

  const hasBaseline = series.some((row) => metricAvailable(row.deterministicBaseline));
  const hasAi = series.some((row) => metricAvailable(row.aiForecast));
  const hasPlanned = series.some((row) => metricAvailable(row.plannedCampaignValue));
  const hasClosed = series.some((row) => metricAvailable(row.closedRevenue));
  const hasPrevious = series.some((row) => metricAvailable(row.previousMonthForecast));
  const hasOngoing = series.some((row) => metricAvailable(row.ongoingForecast));
  const hasAny = hasBaseline || hasAi || hasPlanned || hasClosed || hasPrevious || hasOngoing;

  if (!hasAny) return <PetyrEmptyState>No monthly chart series are available for this AI Forecast run.</PetyrEmptyState>;

  const chartRows: ChartRow[] = series.map((row) => ({
    month: monthLabel(row.month),
    baseline: metricValue(row.deterministicBaseline),
    aiForecast: metricValue(row.aiForecast),
    planned: metricValue(row.plannedCampaignValue),
    closed: metricValue(row.closedRevenue),
    previous: metricValue(row.previousMonthForecast),
    ongoing: metricValue(row.ongoingForecast)
  }));

  return (
    <div className="h-[320px] rounded-2xl border border-slate-200 bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartRows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip formatter={formatTooltipValue} />
          <Legend />
          {hasBaseline ? <Line type="monotone" dataKey="baseline" name="Deterministic baseline" stroke={chartColors.baseline} strokeWidth={3} dot={{ r: 3 }} /> : null}
          {hasAi ? <Line type="monotone" dataKey="aiForecast" name="Forecast value" stroke={chartColors.ai} strokeWidth={3} dot={{ r: 3 }} /> : null}
          {hasPlanned ? <Line type="monotone" dataKey="planned" name="Planned campaign value" stroke={chartColors.planned} strokeWidth={3} dot={{ r: 3 }} /> : null}
          {hasClosed ? <Line type="monotone" dataKey="closed" name="Closed revenue" stroke={chartColors.closed} strokeWidth={2} dot={{ r: 3 }} /> : null}
          {hasPrevious ? <Line type="monotone" dataKey="previous" name="Previous-month forecast" stroke={chartColors.previous} strokeWidth={2} dot={{ r: 3 }} /> : null}
          {hasOngoing ? <Line type="monotone" dataKey="ongoing" name="Ongoing forecast" stroke={chartColors.ongoing} strokeWidth={2} dot={{ r: 3 }} /> : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BusinessUnitChart({ result }: { result: PetyrAiForecastManualActionResult }) {
  const rows = result.selectedYearAggregates.businessUnits;

  const hasBaseline = rows.some((row) => metricAvailable(row.deterministicBaselineFutureTotal));
  const hasAi = rows.some((row) => metricAvailable(row.aiForecastFutureTotal));
  const hasPlanned = rows.some((row) => metricAvailable(row.plannedFutureValue));
  const hasResidual = rows.some((row) => metricAvailable(row.residualPressureGap));
  const hasAny = hasBaseline || hasAi || hasPlanned || hasResidual;

  if (!hasAny) return <PetyrEmptyState>No Business Unit comparison series are available for this AI Forecast run.</PetyrEmptyState>;

  const chartRows = rows
    .filter((row) => metricAvailable(row.deterministicBaselineFutureTotal) || metricAvailable(row.aiForecastFutureTotal) || metricAvailable(row.plannedFutureValue) || metricAvailable(row.residualPressureGap))
    .map((row) => ({
      businessUnit: row.businessUnit,
      baseline: metricValue(row.deterministicBaselineFutureTotal),
      aiForecast: metricValue(row.aiForecastFutureTotal),
      planned: metricValue(row.plannedFutureValue),
      residualGap: metricValue(row.residualPressureGap)
    }));

  return (
    <div className="h-[340px] rounded-2xl border border-slate-200 bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartRows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="businessUnit" interval={0} tick={{ fontSize: 11 }} />
          <YAxis />
          <Tooltip formatter={formatTooltipValue} />
          <Legend />
          {hasBaseline ? <Bar dataKey="baseline" name="Baseline future total" fill={chartColors.baseline} radius={[8, 8, 0, 0]} /> : null}
          {hasAi ? <Bar dataKey="aiForecast" name="Forecast future total" fill={chartColors.ai} radius={[8, 8, 0, 0]} /> : null}
          {hasPlanned ? <Bar dataKey="planned" name="Planned future total" fill={chartColors.planned} radius={[8, 8, 0, 0]} /> : null}
          {hasResidual ? <Bar dataKey="residualGap" name="Residual gap" fill={chartColors.residual} radius={[8, 8, 0, 0]} /> : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartsSection({ result }: { result: PetyrAiForecastManualActionResult }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-sm font-semibold text-slate-900">Monthly forecast series</div>
        <MonthlyChart result={result} />
      </div>
      <div>
        <div className="mb-2 text-sm font-semibold text-slate-900">Business Unit comparison</div>
        <BusinessUnitChart result={result} />
      </div>
    </div>
  );
}

function OpenRouterSection({ debug }: { debug: PetyrAiForecastOpenRouterDebug }) {
  const calledText = debug.openRouterCalled ? "OpenRouter was called for this current run." : `OpenRouter was not called: ${debug.notCalledReason ?? "not requested"}.`;

  return (
    <div className="space-y-4">
      <PetyrInlineNotice tone={debug.openRouterCalled ? "info" : "neutral"}>{calledText}</PetyrInlineNotice>
      <PetyrInlineNotice tone="warning">
        API keys, Authorization headers and bearer tokens are never intentionally displayed. The UI applies defensive redaction before rendering diagnostics.
      </PetyrInlineNotice>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Model" value={debug.selectedModel ?? "n/a"} />
        <SummaryCard label="Prompt schema" value={debug.promptSchemaVersion} />
        <SummaryCard label="Response schema" value={debug.responseSchemaVersion} />
        <SummaryCard label="Raw response" value={debug.rawModelContentStatus.replaceAll("_", " ")} />
      </div>

      {debug.providerError ? <PetyrInlineNotice tone="danger">Provider error: {redactedText(debug.providerError)}</PetyrInlineNotice> : null}

      {debug.validationErrors.length > 0 ? (
        <div className="space-y-2">
          {debug.validationErrors.map((error) => (
            <PetyrInlineNotice key={`${error.path}-${error.message}`} tone="danger">{error.path}: {error.message}</PetyrInlineNotice>
          ))}
        </div>
      ) : null}

      <JsonDetails title="Sanitized prompt payload" value={debug.sanitizedPayloadSentToPromptBuilder} />
      <JsonDetails title="Prepared prompt messages" value={debug.sanitizedPromptMessagesPrepared} />
      <JsonDetails title="Messages sent to OpenRouter" value={debug.sanitizedPromptMessagesSentToOpenRouter} />
      <JsonDetails title="Sanitized model response" value={debug.rawModelContent ?? debug.rawModelContentStatus} />
    </div>
  );
}

function ApplyDiagnosticsSection({ result, applyResult }: { result: PetyrAiForecastManualActionResult; applyResult: PetyrAiForecastManualActionResult | null }) {
  const validationErrors = result.report?.validationErrors ?? [];

  return (
    <div className="space-y-4">
      {applyResult?.report ? (
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryCard label="Saved" value={applyResult.report.savedRows} />
          <SummaryCard label="Skipped" value={applyResult.report.skippedRows} />
          <SummaryCard label="Validation errors" value={applyResult.report.validationErrors.length} />
        </div>
      ) : (
        <PetyrEmptyState>Apply has not been run for this preview. AI Forecast remains read-only until explicit confirmation saves validated rows to the AI cache.</PetyrEmptyState>
      )}

      {validationErrors.length > 0 ? (
        <div className="space-y-2">
          {validationErrors.map((error) => (
            <PetyrInlineNotice key={`${error.path}-${error.message}`} tone="danger">{error.path}: {error.message}</PetyrInlineNotice>
          ))}
        </div>
      ) : null}

      {result.diagnostics.length > 0 ? (
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <summary className="cursor-pointer font-medium text-slate-900">Data diagnostics ({result.diagnostics.length})</summary>
          <div className="mt-3 space-y-2">
            {result.diagnostics.map((diagnostic) => <PetyrInlineNotice key={diagnostic} tone="warning">{diagnostic}</PetyrInlineNotice>)}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function PetyrAiForecastCompanyAction({ companyName, year, onApplied }: PetyrAiForecastCompanyActionProps) {
  const router = useRouter();
  const [previewResult, setPreviewResult] = useState<PetyrAiForecastManualActionResult | null>(null);
  const [applyResult, setApplyResult] = useState<PetyrAiForecastManualActionResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isLlmPreviewing, setIsLlmPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [executionState, setExecutionState] = useState<AiExecutionState>({ status: "idle", mode: null, message: null });

  const company = companyName.trim();
  const canGenerate = company.length > 0 && Number.isInteger(year);
  const latestResult = applyResult ?? previewResult;
  const activeResult = (applyResult?.forecasts.length ? applyResult : previewResult) ?? latestResult;
  const forecastRows = activeResult?.ok ? activeResult.forecasts : [];
  const residualGapCount = useMemo(
    () => forecastRows.filter((row) => row.agreementResidualSignal.status === "gap" || row.agreementResidualSignal.coverageGap > 0).length,
    [forecastRows]
  );
  const averageConfidence = useMemo(() => {
    const values = forecastRows
      .map((row) => row.confidenceScore)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [forecastRows]);

  async function generatePreview(useLlmPreview = false) {
    if (!canGenerate) return;

    const mode = useLlmPreview ? "llm" : "deterministic";
    if (useLlmPreview) setIsLlmPreviewing(true);
    else setIsPreviewing(true);
    setApplyResult(null);
    setExecutionState({
      status: "running",
      mode,
      message: useLlmPreview ? "Generating AI forecast with Forecast Intelligence diagnostics." : "Generating deterministic dry-run preview."
    });

    try {
      const result = await generatePetyrAiForecastPreviewAction({ companyName: company, year, useLlmPreview });
      setPreviewResult(result);
      setExecutionState({ status: "idle", mode, message: null });
    } catch (error) {
      setExecutionState({
        status: "failed",
        mode,
        message: error instanceof Error ? error.message : "Unable to generate Petyr AI Forecast preview."
      });
    } finally {
      if (useLlmPreview) setIsLlmPreviewing(false);
      else setIsPreviewing(false);
    }
  }

  async function applyForecast() {
    if (!previewResult?.ok || isApplying) return;

    const confirmed = window.confirm(
      `Apply AI Forecast for ${previewResult.companyName} ${previewResult.year}? This can save validated future-month rows to the AI forecast cache.`
    );

    if (!confirmed) return;

    setIsApplying(true);
    setExecutionState({ status: "running", mode: "apply", message: "Applying validated AI forecast cache rows." });

    try {
      const result = await applyPetyrAiForecastAction({
        companyName: previewResult.companyName,
        year: previewResult.year,
        confirmed: true
      });
      setApplyResult(result);
      setExecutionState({ status: "idle", mode: "apply", message: null });

      if (result.ok) {
        onApplied?.();
        router.refresh();
      }
    } catch (error) {
      setExecutionState({
        status: "failed",
        mode: "apply",
        message: error instanceof Error ? error.message : "Unable to apply Petyr AI Forecast."
      });
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <PetyrSupportCard
      title="AI Forecast"
      description={`${company || "Company"} · ${year}`}
      badge="Read-only support"
      actions={
        <>
          <Badge variant="outline">single company</Badge>
          <Badge variant="secondary">deterministic preview</Badge>
          {latestResult?.modelVersion ? <Badge variant="outline">{latestResult.modelVersion}</Badge> : null}
          {latestResult?.asOfDate ? <Badge variant="outline">as of {latestResult.asOfDate}</Badge> : null}
          <Button type="button" variant="outline" disabled={!canGenerate || isPreviewing || isLlmPreviewing || isApplying} onClick={() => generatePreview(false)}>
            {isPreviewing ? "Generating" : "Generate deterministic preview"}
          </Button>
          <Button type="button" variant="outline" disabled={!canGenerate || isPreviewing || isLlmPreviewing || isApplying} onClick={() => generatePreview(true)}>
            {isLlmPreviewing ? "Generating AI forecast" : "Generate AI forecast"}
          </Button>
          <Button type="button" disabled={!previewResult?.ok || isPreviewing || isLlmPreviewing || isApplying} onClick={applyForecast}>
            {isApplying ? "Applying" : "Apply AI forecast"}
          </Button>
        </>
      }
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        Request context: {company || "n/a"} · {year} · {executionState.mode === "llm" ? "AI forecast with Forecast Intelligence" : executionState.mode === "apply" ? "Apply AI forecast" : "deterministic-only preview"}
      </div>

      {executionState.status === "running" ? (
        <PetyrInlineNotice tone="info">
          {executionState.message || "Petyr AI Forecast operation is running."}
        </PetyrInlineNotice>
      ) : null}

      {executionState.status === "failed" ? (
        <PetyrInlineNotice tone="danger">
          {executionState.message || "Petyr AI Forecast operation failed before returning diagnostics."}
        </PetyrInlineNotice>
      ) : null}

      {latestResult ? (
        <PetyrInlineNotice tone={noticeTone(latestResult)}>
          {latestResult.summary}
          {latestResult.error ? <div className="mt-1 text-xs">{latestResult.error}</div> : null}
        </PetyrInlineNotice>
      ) : executionState.status === "idle" ? (
        <PetyrInlineNotice tone="neutral">
          Generate a deterministic dry-run preview first. It does not call OpenRouter and does not write database rows.
        </PetyrInlineNotice>
      ) : null}

      {latestResult ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Generated rows" value={forecastRows.length} />
            <SummaryCard label="Model" value={latestResult.modelVersion ?? "n/a"} />
            <SummaryCard label="Residual gaps" value={residualGapCount} />
            <SummaryCard label="Avg confidence" value={formatPetyrNumber(averageConfidence)} />
          </div>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid h-auto grid-cols-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm md:grid-cols-4 xl:grid-cols-7">
              <TabsTrigger value="overview" className="rounded-xl">Overview</TabsTrigger>
              <TabsTrigger value="intelligence" className="rounded-xl">Intelligence</TabsTrigger>
              <TabsTrigger value="algorithms" className="rounded-xl">Algorithms & signals</TabsTrigger>
              <TabsTrigger value="year-bu" className="rounded-xl">Year & BU</TabsTrigger>
              <TabsTrigger value="charts" className="rounded-xl">Charts</TabsTrigger>
              <TabsTrigger value="openrouter" className="rounded-xl">OpenRouter I/O</TabsTrigger>
              <TabsTrigger value="apply" className="rounded-xl">Apply result</TabsTrigger>
            </TabsList>

            <TabsContent value="overview"><OverviewSection rows={forecastRows} /></TabsContent>
            <TabsContent value="intelligence"><IntelligenceSection result={latestResult} /></TabsContent>
            <TabsContent value="algorithms"><AlgorithmsSection result={latestResult} rows={forecastRows} /></TabsContent>
            <TabsContent value="year-bu"><YearBusinessUnitSection result={latestResult} /></TabsContent>
            <TabsContent value="charts"><ChartsSection result={latestResult} /></TabsContent>
            <TabsContent value="openrouter"><OpenRouterSection debug={latestResult.openRouterDebug} /></TabsContent>
            <TabsContent value="apply"><ApplyDiagnosticsSection result={latestResult} applyResult={applyResult} /></TabsContent>
          </Tabs>
        </>
      ) : null}
    </PetyrSupportCard>
  );
}
