import { prisma } from "../../lib/db";
import { readIntelligenceConfig } from "./config";

type Queryable = {
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

export type IntelligenceDailyBudgetStatus = {
  limit: number;
  used: number;
  remaining: number;
  timezone: string;
  windowStartedAt: string;
  windowEndsAt: string;
};

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function getIntelligenceBudgetWindow(now = new Date()) {
  const startedAt = new Date(now);
  startedAt.setHours(0, 0, 0, 0);
  const endsAt = new Date(startedAt);
  endsAt.setDate(endsAt.getDate() + 1);
  return { startedAt, endsAt };
}

export async function getIntelligenceDailyBudgetStatus(
  db: Queryable = prisma,
  now = new Date()
): Promise<IntelligenceDailyBudgetStatus> {
  const config = readIntelligenceConfig();
  const window = getIntelligenceBudgetWindow(now);
  const rows = await db.$queryRaw<Array<{ usedRequests: number | bigint | string | null }>>`
    SELECT COALESCE(SUM("request_count"), 0) AS "usedRequests"
    FROM "company_intelligence_provider_request_log"
    WHERE "provider" IN ('exa', 'openrouter')
      AND "created_at" >= ${window.startedAt}
      AND "created_at" < ${window.endsAt}
  `;
  const used = toNumber(rows[0]?.usedRequests);
  const remaining = Math.max(config.dailyBudgetRequests - used, 0);

  return {
    limit: config.dailyBudgetRequests,
    used,
    remaining,
    timezone: config.scanTimezone,
    windowStartedAt: window.startedAt.toISOString(),
    windowEndsAt: window.endsAt.toISOString()
  };
}

export function canSpendIntelligenceRequests(status: IntelligenceDailyBudgetStatus, requestCount = 1) {
  return status.remaining >= requestCount;
}
