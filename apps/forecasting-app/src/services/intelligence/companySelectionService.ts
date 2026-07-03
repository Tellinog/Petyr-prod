import {
  getCanonicalCompanyOwnershipPairs,
  type CanonicalCompanyOwnershipPair
} from "../petyrCompanyOwnershipService";
import { prisma } from "../../lib/db";
import type { IntelligenceCompanyContext } from "./types";

type StatusRow = {
  companyName: string;
  isActive: boolean;
};

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function getCompanyStatuses() {
  const rows = await prisma.$queryRaw<StatusRow[]>`
    SELECT "company_name" AS "companyName", "is_active" AS "isActive"
    FROM "company_forecast_status"
  `.catch(() => []);

  return new Map(rows.map((row) => [row.companyName.trim().toLowerCase(), row.isActive]));
}

function toContext(pair: CanonicalCompanyOwnershipPair, statuses: Map<string, boolean>): IntelligenceCompanyContext {
  const key = pair.companyName.trim().toLowerCase();

  return {
    companyId: slug(pair.companyName),
    companyName: pair.companyName,
    csmName: pair.csmName || null,
    branchName: pair.branchName,
    aliases: [],
    domain: null,
    isActive: statuses.get(key) ?? true
  };
}

export async function selectCompaniesForIntelligence(input: {
  companyName?: string | null;
  maxCompanies: number;
  includeInactive?: boolean;
}) {
  const [pairs, statuses] = await Promise.all([
    getCanonicalCompanyOwnershipPairs(),
    getCompanyStatuses()
  ]);
  const requestedCompany = input.companyName?.trim().toLowerCase();
  const contexts = pairs
    .map((pair) => toContext(pair, statuses))
    .filter((company) => !requestedCompany || company.companyName.trim().toLowerCase() === requestedCompany)
    .filter((company) => input.includeInactive || company.isActive)
    .slice(0, Math.max(1, input.maxCompanies));

  return contexts;
}
