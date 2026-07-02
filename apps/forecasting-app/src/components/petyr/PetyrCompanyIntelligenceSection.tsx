"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { generatePetyrCompanyIntelligenceAction } from "@/app/forecasting/aiForecastActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PetyrEmptyState, PetyrInlineNotice } from "@/components/petyr/PetyrLayoutPrimitives";
import { resolveVisiblePetyrCompanyIntelligenceResult } from "@/lib/petyr/companyIntelligenceState";
import type { PetyrCompanyIntelligenceActionResult } from "@/types/petyrAiForecastManualAction";

type PetyrCompanyIntelligenceSectionProps = {
  companyName: string;
  year: number;
  selectedMonth?: number | null;
  context?: "forecast-entry" | "company-detail";
  initialResult?: PetyrCompanyIntelligenceActionResult | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const redactionPatterns: Array<[RegExp, string]> = [
  [/Authorization\s*:\s*Bearer\s+[^\n\r"}]+/gi, "Authorization: Bearer [redacted]"],
  [/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/g, "Bearer [redacted]"],
  [/(OPENROUTER_API_KEY\s*[=:]\s*)[^\s,"}]+/gi, "$1[redacted]"],
  [/("(?:api[_-]?key|authorization|token)"\s*:\s*")[^"]+(")/gi, "$1[redacted]"]
];

function monthLabel(month: number | null | undefined) {
  if (!month) return "n/a";
  return MONTHS[month - 1] ?? `Month ${month}`;
}

function redactedText(value: string) {
  return redactionPatterns.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

function toneForStatus(status: PetyrCompanyIntelligenceActionResult["status"]): "neutral" | "info" | "success" | "warning" | "danger" {
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

function formatGeneratedAt(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function TextList({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

export function PetyrCompanyIntelligenceSection({
  companyName,
  year,
  selectedMonth = null,
  context = "forecast-entry",
  initialResult = null
}: PetyrCompanyIntelligenceSectionProps) {
  const [result, setResult] = useState<PetyrCompanyIntelligenceActionResult | null>(initialResult);
  const [lastAttempt, setLastAttempt] = useState<PetyrCompanyIntelligenceActionResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const company = companyName.trim();
  const canGenerate = company.length > 0 && Number.isInteger(year);
  const output = result?.output ?? null;
  const contextLabel = context === "company-detail" ? "Company Detail" : "Forecast Entry";
  const generatedAtLabel = formatGeneratedAt(result?.generatedAt);

  async function generateIntelligence() {
    if (!canGenerate || isGenerating) return;

    setIsGenerating(true);
    setClientError(null);

    try {
      const nextResult = await generatePetyrCompanyIntelligenceAction({
        companyName: company,
        year,
        selectedMonth
      });
      setLastAttempt(nextResult);
      setResult((current) => resolveVisiblePetyrCompanyIntelligenceResult(current, nextResult));
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Unable to generate Intelligence.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Company Intelligence">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">Intelligence</h2>
            <Badge variant="outline">CSM</Badge>
            <Badge variant="secondary">Consultative</Badge>
            {generatedAtLabel ? <Badge variant="outline">Last generated: {generatedAtLabel}</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {company || "Company"} - {year} - {contextLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {result?.model ? <Badge variant="outline">{result.model}</Badge> : null}
          {result?.cacheAction && result.cacheAction !== "none" ? <Badge variant="outline">cache: {result.cacheAction}</Badge> : null}
          <Button type="button" disabled={!canGenerate || isGenerating} onClick={generateIntelligence}>
            {isGenerating ? "Generating" : "Generate Intelligence"}
          </Button>
        </div>
      </div>

      {!canGenerate ? (
        <PetyrInlineNotice tone="warning">Select a company and a valid year before generating Intelligence.</PetyrInlineNotice>
      ) : null}

      {isGenerating ? (
        <PetyrInlineNotice tone="info">Generating Intelligence for {company}.</PetyrInlineNotice>
      ) : null}

      {clientError ? <PetyrInlineNotice tone="danger">{redactedText(clientError)}</PetyrInlineNotice> : null}

      {lastAttempt && !lastAttempt.ok ? (
        <PetyrInlineNotice tone="danger">
          {redactedText(lastAttempt.summary)}
        </PetyrInlineNotice>
      ) : null}

      {result ? (
        <PetyrInlineNotice tone={toneForStatus(result.status)}>
          {redactedText(result.summary)}
        </PetyrInlineNotice>
      ) : !isGenerating ? (
        <PetyrEmptyState>Generate Intelligence to read OpenRouter-backed guidance for this company.</PetyrEmptyState>
      ) : null}

      {lastAttempt && !lastAttempt.ok ? (
        <div className="space-y-3">
          {lastAttempt.errorMessage ? <PetyrInlineNotice tone="danger">{redactedText(lastAttempt.errorMessage)}</PetyrInlineNotice> : null}
          {lastAttempt.validationErrors.map((error) => (
            <PetyrInlineNotice key={`${error.path}-${error.message}`} tone="danger">
              {error.path}: {error.message}
            </PetyrInlineNotice>
          ))}
        </div>
      ) : null}

      {output ? (
        <>
          <TextList title="Stakeholder notes">
            {output.stakeholder_notes.length > 0 ? output.stakeholder_notes.map((note, index) => (
              <PetyrInlineNotice key={`${note.title}-${index}`} tone="neutral">
                <div className="font-semibold">{note.title}</div>
                <div className="mt-1">{note.note}</div>
                <div className="mt-2 text-xs font-semibold text-slate-600">{note.numeric_evidence}</div>
              </PetyrInlineNotice>
            )) : <PetyrEmptyState>No stakeholder notes were returned.</PetyrEmptyState>}
          </TextList>

          <div className="grid gap-4 xl:grid-cols-2">
            <TextList title="Risks">
              {output.risks.length > 0 ? output.risks.map((risk, index) => (
                <PetyrInlineNotice key={`${risk.type}-${index}`} tone={severityTone(risk.severity)}>
                  <div className="font-semibold">{risk.type.replaceAll("_", " ")} - {risk.severity}</div>
                  <div className="mt-1">{risk.description}</div>
                  <div className="mt-2 text-xs font-semibold text-slate-600">{risk.numeric_evidence}</div>
                </PetyrInlineNotice>
              )) : <PetyrEmptyState>No risks were returned.</PetyrEmptyState>}
            </TextList>

            <TextList title="Watchouts">
              {output.watchouts.length > 0 ? output.watchouts.map((watchout, index) => (
                <PetyrInlineNotice key={`${watchout.title}-${index}`} tone={severityTone(watchout.severity)}>
                  <div className="font-semibold">{watchout.title} - {watchout.severity}</div>
                  <div className="mt-1">{watchout.evidence}</div>
                  <div className="mt-2 text-xs font-semibold text-slate-600">{watchout.numeric_evidence}</div>
                </PetyrInlineNotice>
              )) : <PetyrEmptyState>No watchouts were returned.</PetyrEmptyState>}
            </TextList>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <TextList title="Opportunities">
              {output.opportunities.length > 0 ? output.opportunities.map((opportunity, index) => (
                <PetyrInlineNotice key={`${opportunity.title}-${index}`} tone={severityTone(opportunity.severity)}>
                  <div className="font-semibold">{opportunity.title} - {opportunity.severity}</div>
                  <div className="mt-1">{opportunity.evidence}</div>
                  <div className="mt-2 text-xs font-semibold text-slate-600">{opportunity.numeric_evidence}</div>
                </PetyrInlineNotice>
              )) : <PetyrEmptyState>No opportunities were returned.</PetyrEmptyState>}
            </TextList>
          </div>
        </>
      ) : null}
    </section>
  );
}
