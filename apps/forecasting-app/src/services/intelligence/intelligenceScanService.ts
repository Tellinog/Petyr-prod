import { readIntelligenceConfig } from "./config";
import { ExaSearchClient } from "./exaSearchClient";
import { canSpendIntelligenceRequests, getIntelligenceDailyBudgetStatus } from "./intelligenceBudgetService";
import { OpenRouterInsightGenerator, INTELLIGENCE_INSIGHT_PROMPT_VERSION } from "./openRouterInsightGenerator";
import { runProviderWithRetry } from "./providerRetry";
import { buildCompanyIntelligenceQuery } from "./queryBuilder";
import { normalizeExaResult } from "./resultNormalizer";
import { deduplicateSignalResults } from "./signalDeduplicationService";
import { classifySignalBusinessUnits } from "./signalClassificationService";
import { selectCompaniesForIntelligence } from "./companySelectionService";
import {
  createIntelligenceRun,
  finishIntelligenceRun,
  logProviderRequest,
  persistBusinessUnitClassifications,
  persistGeneratedInsight,
  persistSignalResult
} from "./runLogger";
import type { IntelligenceCompanyContext, PersistedSignalItem } from "./types";

type RunInput = {
  dryRun: boolean;
  companyName?: string | null;
  maxCompanies?: number | null;
  maxResultsPerCompany?: number | null;
  createdBy: string;
  runSource?: "manual" | "scheduled";
};

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

class IntelligenceBudgetExhaustedError extends Error {
  constructor(message = "Daily Intelligence provider request budget exhausted.") {
    super(message);
    this.name = "IntelligenceBudgetExhaustedError";
  }
}

function isBudgetExhausted(error: unknown) {
  return error instanceof IntelligenceBudgetExhaustedError;
}

export async function runCompanyIntelligenceScan(input: RunInput) {
  const config = readIntelligenceConfig();
  const maxCompanies = Math.min(input.maxCompanies ?? config.maxCompaniesPerRun, config.maxCompaniesPerRun);
  const maxResults = Math.min(input.maxResultsPerCompany ?? config.maxResultsPerCompany, config.maxResultsPerCompany);
  const companies = await selectCompaniesForIntelligence({
    companyName: input.companyName,
    maxCompanies,
    includeInactive: true
  });
  const runId = await createIntelligenceRun({
    dryRun: input.dryRun,
    runScope: input.companyName ? "company" : "batch",
    companyName: input.companyName ?? null,
    csmName: companies[0]?.csmName ?? null,
    selectedCompaniesCount: companies.length,
    selectedReason: input.companyName ? "manual selected company" : "manual capped subset",
    budgetPolicy: {
      maxCompanies,
      maxResultsPerCompany: maxResults,
      searchRecencyDays: config.searchRecencyDays,
      dailyBudgetRequests: config.dailyBudgetRequests,
      runSource: input.runSource ?? "manual"
    },
    createdBy: input.createdBy
  });

  let exaRequestsUsed = 0;
  let exaResultsReceived = 0;
  let openrouterRequestsUsed = 0;
  const errors: string[] = [];

  if (companies.length === 0) {
    await finishIntelligenceRun({
      runId,
      status: "failed",
      errorMessage: "No companies were selected for Intelligence scan.",
      exaRequestsUsed,
      exaResultsReceived,
      openrouterRequestsUsed
    });
    return { runId, status: "failed", selectedCompanies: 0, errors: ["No companies selected."] };
  }

  if (input.dryRun) {
    await finishIntelligenceRun({
      runId,
      status: "succeeded",
      errorMessage: null,
      exaRequestsUsed,
      exaResultsReceived,
      openrouterRequestsUsed
    });
    return {
      runId,
      status: "succeeded",
      dryRun: true,
      selectedCompanies: companies.length,
      plannedQueries: companies.map((company) => buildCompanyIntelligenceQuery({ company, recencyDays: config.searchRecencyDays, maxResults }).query),
      errors
    };
  }

  if (!config.enabled) errors.push("INTELLIGENCE_ENABLED is not true.");
  if (!config.exaApiKey) errors.push("EXA_API_KEY is not configured.");
  if (!config.openRouterApiKey) errors.push("OPENROUTER_API_KEY is not configured.");
  if (errors.length) {
    await finishIntelligenceRun({
      runId,
      status: "failed",
      errorMessage: errors.join(" "),
      exaRequestsUsed,
      exaResultsReceived,
      openrouterRequestsUsed
    });
    return { runId, status: "failed", selectedCompanies: companies.length, errors };
  }

  const initialBudget = await getIntelligenceDailyBudgetStatus();
  if (!canSpendIntelligenceRequests(initialBudget)) {
    await finishIntelligenceRun({
      runId,
      status: "skipped_budget",
      errorMessage: "Daily Intelligence provider request budget is already exhausted.",
      exaRequestsUsed,
      exaResultsReceived,
      openrouterRequestsUsed
    });
    return {
      runId,
      status: "skipped_budget",
      selectedCompanies: companies.length,
      dailyBudget: initialBudget,
      errors: ["Daily Intelligence provider request budget is already exhausted."]
    };
  }

  const exaClient = new ExaSearchClient({ apiKey: config.exaApiKey as string });
  const insightGenerator = new OpenRouterInsightGenerator({
    apiKey: config.openRouterApiKey as string,
    model: config.openRouterModel
  });
  let budgetExhausted = false;

  for (const company of companies) {
    if (budgetExhausted) {
      break;
    }

    await processCompany({
      company,
      runId,
      maxResults,
      config,
      exaClient,
      insightGenerator,
      counters: {
        get exaRequestsUsed() { return exaRequestsUsed; },
        set exaRequestsUsed(value: number) { exaRequestsUsed = value; },
        get exaResultsReceived() { return exaResultsReceived; },
        set exaResultsReceived(value: number) { exaResultsReceived = value; },
        get openrouterRequestsUsed() { return openrouterRequestsUsed; },
        set openrouterRequestsUsed(value: number) { openrouterRequestsUsed = value; }
      },
      errors,
      onBudgetExhausted: () => {
        budgetExhausted = true;
      }
    });
  }

  const totalProviderRequests = exaRequestsUsed + openrouterRequestsUsed;
  const status = budgetExhausted && totalProviderRequests === 0
    ? "skipped_budget"
    : errors.length
    ? (exaRequestsUsed === 0 && openrouterRequestsUsed === 0 ? "failed" : "partial")
    : "succeeded";
  await finishIntelligenceRun({
    runId,
    status,
    errorMessage: errors.length ? errors.join(" ") : null,
    exaRequestsUsed,
    exaResultsReceived,
    openrouterRequestsUsed
  });

  return {
    runId,
    status,
    selectedCompanies: companies.length,
    exaRequestsUsed,
    exaResultsReceived,
    openrouterRequestsUsed,
    dailyBudget: await getIntelligenceDailyBudgetStatus(),
    errors
  };
}

async function processCompany(input: {
  company: IntelligenceCompanyContext;
  runId: string;
  maxResults: number;
  config: ReturnType<typeof readIntelligenceConfig>;
  exaClient: ExaSearchClient;
  insightGenerator: OpenRouterInsightGenerator;
  counters: {
    exaRequestsUsed: number;
    exaResultsReceived: number;
    openrouterRequestsUsed: number;
  };
  errors: string[];
  onBudgetExhausted: () => void;
}) {
  const query = buildCompanyIntelligenceQuery({
    company: input.company,
    recencyDays: input.config.searchRecencyDays,
    maxResults: input.maxResults
  });
  const exaStarted = Date.now();

  try {
    const exaResults = await runProviderWithRetry({
      beforeAttempt: async () => {
        const budget = await getIntelligenceDailyBudgetStatus();
        if (!canSpendIntelligenceRequests(budget)) throw new IntelligenceBudgetExhaustedError();
      },
      execute: async () => {
        input.counters.exaRequestsUsed += 1;
        return input.exaClient.search(query);
      },
      onFailedAttempt: async ({ attempt, willRetry, durationMs, error }) => {
        await logProviderRequest({
          runId: input.runId,
          provider: "exa",
          operation: "company_signal_search",
          status: willRetry ? "retrying" : "failed",
          resultCount: 0,
          durationMs,
          requestMetadata: {
            companyName: input.company.companyName,
            maxResults: input.maxResults,
            recencyDays: input.config.searchRecencyDays,
            attempt
          },
          errorMessage: safeError(error)
        });
      }
    });
    input.counters.exaResultsReceived += exaResults.length;
    await logProviderRequest({
      runId: input.runId,
      provider: "exa",
      operation: "company_signal_search",
      status: "success",
      resultCount: exaResults.length,
      durationMs: Date.now() - exaStarted,
      requestMetadata: {
        companyName: input.company.companyName,
        maxResults: input.maxResults,
        recencyDays: input.config.searchRecencyDays
      }
    });

    const normalized = exaResults.map(normalizeExaResult).filter((item): item is NonNullable<typeof item> => item !== null);
    const deduped = deduplicateSignalResults(normalized);
    const persistedSignals: PersistedSignalItem[] = [];

    for (const signal of deduped) {
      const persisted = await persistSignalResult({
        runId: input.runId,
        companyName: input.company.companyName,
        queryText: query.query,
        signal
      });
      const classifications = classifySignalBusinessUnits(signal);
      await persistBusinessUnitClassifications(persisted.id, classifications);
      persistedSignals.push(persisted);
    }

    if (!persistedSignals.length) return;

    const openRouterStarted = Date.now();
    const insights = await runProviderWithRetry({
      beforeAttempt: async () => {
        const budget = await getIntelligenceDailyBudgetStatus();
        if (!canSpendIntelligenceRequests(budget)) throw new IntelligenceBudgetExhaustedError();
      },
      execute: async () => {
        input.counters.openrouterRequestsUsed += 1;
        return input.insightGenerator.generate({
          company: input.company,
          signals: persistedSignals
        });
      },
      onFailedAttempt: async ({ attempt, willRetry, durationMs, error }) => {
        await logProviderRequest({
          runId: input.runId,
          provider: "openrouter",
          operation: "insight_generation",
          status: willRetry ? "retrying" : "failed",
          resultCount: 0,
          durationMs,
          model: input.config.openRouterModel,
          requestMetadata: {
            companyName: input.company.companyName,
            promptVersion: INTELLIGENCE_INSIGHT_PROMPT_VERSION,
            sourceCount: persistedSignals.length,
            attempt
          },
          errorMessage: safeError(error)
        });
      }
    });
    await logProviderRequest({
      runId: input.runId,
      provider: "openrouter",
      operation: "insight_generation",
      status: "success",
      resultCount: insights.length,
      durationMs: Date.now() - openRouterStarted,
      model: input.config.openRouterModel,
      requestMetadata: {
        companyName: input.company.companyName,
        promptVersion: INTELLIGENCE_INSIGHT_PROMPT_VERSION,
        sourceCount: persistedSignals.length
      }
    });

    for (const insight of insights) {
      await persistGeneratedInsight({
        runId: input.runId,
        company: input.company,
        insight,
        provider: "openrouter",
        model: input.config.openRouterModel,
        promptVersion: INTELLIGENCE_INSIGHT_PROMPT_VERSION
      });
    }
  } catch (error) {
    if (isBudgetExhausted(error)) {
      input.onBudgetExhausted();
    }
    const message = `${input.company.companyName}: ${safeError(error)}`;
    input.errors.push(message);
    await logProviderRequest({
      runId: input.runId,
      provider: "intelligence",
      operation: "company_scan",
      status: "failed",
      durationMs: Date.now() - exaStarted,
      requestMetadata: {
        companyName: input.company.companyName
      },
      errorMessage: safeError(error)
    }).catch(() => undefined);
  }
}
