import { PETYR_BUSINESS_UNITS, type PetyrBusinessUnit } from "../../lib/petyr/constants";
import type { BusinessUnitClassification, NormalizedSignalResult } from "./types";

const BU_KEYWORDS: Record<PetyrBusinessUnit, string[]> = {
  AI: ["ai", "artificial intelligence", "automation", "machine learning"],
  Accessibility: ["accessibility", "inclusive", "wcag", "disability"],
  Community: ["community", "forum", "social", "creator"],
  Experience: ["customer experience", "cx", "user experience", "ux", "journey"],
  Express: ["express", "quick", "rapid", "fast delivery"],
  FTE: ["hiring", "layoffs", "workforce", "employees", "team"],
  Other: [],
  QA: ["quality", "testing", "qa", "bug", "release"],
  Security: ["security", "cybersecurity", "breach", "privacy", "risk"],
  TA: ["talent", "recruiting", "candidate", "hiring"]
};

export function classifySignalBusinessUnits(signal: Pick<NormalizedSignalResult, "title" | "snippet">): BusinessUnitClassification[] {
  const text = `${signal.title ?? ""} ${signal.snippet ?? ""}`.toLowerCase();
  const matches: BusinessUnitClassification[] = [];

  for (const businessUnit of PETYR_BUSINESS_UNITS) {
    const keywords = BU_KEYWORDS[businessUnit];
    const matched = keywords.filter((keyword) => text.includes(keyword));
    if (!matched.length) continue;

    matches.push({
      businessUnit,
      relevanceScore: Math.min(1, 0.45 + matched.length * 0.2),
      rationale: `Matched signal keywords: ${matched.join(", ")}`,
      provider: "local"
    });
  }

  return matches.length
    ? matches
    : [{
      businessUnit: "Other",
      relevanceScore: 0.35,
      rationale: "No official Business Unit keyword was strongly matched; using Other for MVP review.",
      provider: "local"
    }];
}
