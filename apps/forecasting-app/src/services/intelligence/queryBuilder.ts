import type { IntelligenceCompanyContext, IntelligenceQuery } from "./types";

export const INTELLIGENCE_SIGNAL_KEYWORDS = [
  "product launch",
  "partnership",
  "acquisition",
  "expansion",
  "digital transformation",
  "mobile app",
  "ecommerce",
  "customer experience",
  "layoffs",
  "funding",
  "rebranding",
  "cybersecurity",
  "new market"
];

function quote(value: string) {
  return `"${value.replace(/"/g, "").trim()}"`;
}

export function buildCompanyIntelligenceQuery(input: {
  company: IntelligenceCompanyContext;
  recencyDays: number;
  maxResults: number;
}): IntelligenceQuery {
  const aliases = input.company.aliases
    .map((alias) => alias.trim())
    .filter(Boolean)
    .filter((alias) => alias.toLowerCase() !== input.company.companyName.toLowerCase())
    .slice(0, 2);
  const companyTerms = [input.company.companyName, ...aliases].map(quote).join(" OR ");
  const domainTerm = input.company.domain ? ` OR site:${input.company.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}` : "";
  const keywordTerms = INTELLIGENCE_SIGNAL_KEYWORDS.map(quote).join(" OR ");

  return {
    companyId: input.company.companyId,
    companyName: input.company.companyName,
    query: `(${companyTerms}${domainTerm}) (${keywordTerms})`,
    recencyDays: input.recencyDays,
    maxResults: input.maxResults
  };
}

