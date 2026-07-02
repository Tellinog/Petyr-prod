"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PetyrRenderingDiagnostic } from "@/types/petyrApprovedRendering";

export type PetyrFloatingDiagnosticInput = PetyrRenderingDiagnostic | string;

type Severity = PetyrRenderingDiagnostic["severity"];

type DiagnosticsBySeverity = Record<Severity, PetyrRenderingDiagnostic[]>;

const severityOrder: Severity[] = ["blocking", "warning", "info"];

const severityMeta: Record<
  Severity,
  {
    title: string;
    empty: string;
    containerClassName: string;
    titleClassName: string;
  }
> = {
  blocking: {
    title: "Blocking issues",
    empty: "No blocking issues.",
    containerClassName: "border-red-200 bg-red-50 text-red-950",
    titleClassName: "text-red-950",
  },
  warning: {
    title: "Warnings",
    empty: "No warnings.",
    containerClassName: "border-amber-200 bg-amber-50 text-amber-950",
    titleClassName: "text-amber-950",
  },
  info: {
    title: "Info",
    empty: "No info diagnostics.",
    containerClassName: "border-slate-200 bg-slate-50 text-slate-700",
    titleClassName: "text-slate-900",
  },
};

function normalizeDiagnostics(diagnostics: PetyrFloatingDiagnosticInput[]): PetyrRenderingDiagnostic[] {
  return diagnostics.map((diagnostic) => {
    if (typeof diagnostic === "string") {
      return {
        severity: "warning",
        message: diagnostic
      };
    }

    return diagnostic;
  });
}

function groupDiagnostics(diagnostics: PetyrRenderingDiagnostic[]): DiagnosticsBySeverity {
  return diagnostics.reduce<DiagnosticsBySeverity>(
    (groups, diagnostic) => {
      groups[diagnostic.severity].push(diagnostic);
      return groups;
    },
    { blocking: [], warning: [], info: [] }
  );
}

function DiagnosticsSection({
  severity,
  diagnostics,
}: {
  severity: Severity;
  diagnostics: PetyrRenderingDiagnostic[];
}) {
  const meta = severityMeta[severity];

  return (
    <section className="space-y-2" aria-labelledby={`petyr-diagnostics-${severity}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={`petyr-diagnostics-${severity}`} className={cn("text-sm font-semibold", meta.titleClassName)}>
          {meta.title}
        </h3>
        <Badge variant="outline" className="shrink-0">
          {diagnostics.length}
        </Badge>
      </div>
      {diagnostics.length > 0 ? (
        <div className="space-y-2">
          {diagnostics.map((diagnostic, index) => (
            <div
              className={cn("rounded-xl border px-3 py-2 text-sm leading-relaxed", meta.containerClassName)}
              key={`${diagnostic.severity}-${diagnostic.message}-${index}`}
            >
              {diagnostic.message}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
          {meta.empty}
        </div>
      )}
    </section>
  );
}

export function PetyrFloatingDiagnosticsMenu({
  diagnostics,
}: {
  diagnostics: PetyrFloatingDiagnosticInput[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const normalizedDiagnostics = useMemo(() => normalizeDiagnostics(diagnostics), [diagnostics]);
  const groupedDiagnostics = useMemo(() => groupDiagnostics(normalizedDiagnostics), [normalizedDiagnostics]);
  const blockingCount = groupedDiagnostics.blocking.length;
  const warningCount = groupedDiagnostics.warning.length;
  const infoCount = groupedDiagnostics.info.length;
  const totalCount = normalizedDiagnostics.length;
  const hasBlockingIssues = blockingCount > 0;
  const panelId = "petyr-floating-diagnostics-panel";

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3">
      {isOpen ? (
        <div
          id={panelId}
          className="w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Data diagnostics</p>
                <p className="mt-1 text-xs text-slate-500">
                  PostgreSQL, Redash materialization and mapping messages for this view.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-8 shrink-0 px-3 text-xs"
                onClick={() => setIsOpen(false)}
              >
                Close
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant={hasBlockingIssues ? "default" : "outline"} className={hasBlockingIssues ? "bg-red-700 text-white" : ""}>
                {blockingCount} blocking
              </Badge>
              <Badge variant="outline" className={warningCount > 0 ? "border-amber-300 bg-amber-100 text-amber-950" : ""}>
                {warningCount} warnings
              </Badge>
              <Badge variant="outline">{infoCount} info</Badge>
              <Badge variant="secondary">{totalCount} total</Badge>
            </div>
          </div>

          <div className="max-h-[min(68vh,560px)] space-y-5 overflow-y-auto px-4 py-4">
            {severityOrder.map((severity) => (
              <DiagnosticsSection
                key={severity}
                severity={severity}
                diagnostics={groupedDiagnostics[severity]}
              />
            ))}
          </div>

          <div className="border-t border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap gap-3">
              <a
                className="inline-flex h-9 items-center rounded-xl bg-slate-950 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                href="/petyr-admin"
              >
                Open Petyr Admin
              </a>
              <a
                className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50"
                href="/petyr-admin"
              >
                Open Data Health
              </a>
              <a
                className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50"
                href="/redash-ingestor"
              >
                Open Redash Ingestor
              </a>
            </div>
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        aria-controls={panelId}
        aria-expanded={isOpen}
        variant={hasBlockingIssues ? "default" : "outline"}
        className={cn(
          "h-auto min-h-11 flex-wrap justify-end gap-2 rounded-2xl px-3 py-2 shadow-lg",
          hasBlockingIssues ? "bg-red-700 text-white hover:bg-red-800" : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
        )}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full text-xs font-bold",
            hasBlockingIssues ? "bg-white text-red-700" : "bg-slate-900 text-white"
          )}
        >
          !
        </span>
        <span>Data diagnostics</span>
        <Badge
          variant="outline"
          className={cn(
            "bg-white",
            warningCount > 0 ? "border-amber-300 text-amber-950" : "text-slate-700",
            hasBlockingIssues ? "text-slate-900" : ""
          )}
        >
          {warningCount} warnings
        </Badge>
        {hasBlockingIssues ? (
          <Badge variant="outline" className="border-red-200 bg-white text-red-700">
            {blockingCount} blocking
          </Badge>
        ) : null}
      </Button>
    </div>
  );
}
