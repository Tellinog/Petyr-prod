import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/db";
import type { IntelligenceInsightListItem } from "./types";

type InsightRow = {
  id: string;
  companyId: string;
  companyName: string;
  csmName: string | null;
  businessUnit: string;
  insightType: string;
  title: string;
  summary: string;
  rationale: string;
  suggestedAction: string;
  urgency: string;
  confidence: string | number | null;
  generatedAt: Date;
  sources: unknown;
  feedback: unknown;
};

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
}

function parseSources(value: unknown): IntelligenceInsightListItem["sources"] {
  return asArray(value).map((item) => ({
    id: String(item.id ?? ""),
    url: String(item.url ?? ""),
    title: typeof item.title === "string" ? item.title : null,
    sourceDomain: typeof item.sourceDomain === "string" ? item.sourceDomain : null,
    publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : null
  })).filter((source) => source.id && source.url);
}

function parseFeedback(value: unknown): IntelligenceInsightListItem["feedback"] {
  const item = asArray(value)[0] ?? {};
  return {
    useful: Number(item.useful ?? 0),
    notUseful: Number(item.notUseful ?? 0),
    unclearUsefulness: Number(item.unclearUsefulness ?? 0),
    accurate: Number(item.accurate ?? 0),
    inaccurate: Number(item.inaccurate ?? 0),
    unclearAccuracy: Number(item.unclearAccuracy ?? 0)
  };
}

export async function listIntelligenceInsights(filters: {
  csmName?: string | null;
  companyName?: string | null;
  businessUnit?: string | null;
  insightType?: string | null;
  urgency?: string | null;
  limit?: number;
}): Promise<IntelligenceInsightListItem[]> {
  const where: Prisma.Sql[] = [Prisma.sql`i."status" = 'active'`];
  if (filters.csmName) where.push(Prisma.sql`i."csm_name" = ${filters.csmName}`);
  if (filters.companyName) where.push(Prisma.sql`i."company_name" = ${filters.companyName}`);
  if (filters.businessUnit) where.push(Prisma.sql`i."business_unit" = ${filters.businessUnit}`);
  if (filters.insightType) where.push(Prisma.sql`i."insight_type" = ${filters.insightType}::"IntelligenceInsightType"`);
  if (filters.urgency) where.push(Prisma.sql`i."urgency" = ${filters.urgency}::"IntelligenceUrgency"`);
  const whereSql = Prisma.join(where, " AND ");
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);

  const rows = await prisma.$queryRaw<InsightRow[]>(Prisma.sql`
    SELECT
      i."id",
      i."company_id" AS "companyId",
      i."company_name" AS "companyName",
      i."csm_name" AS "csmName",
      i."business_unit" AS "businessUnit",
      i."insight_type"::text AS "insightType",
      i."title",
      i."summary",
      i."rationale",
      i."suggested_action" AS "suggestedAction",
      i."urgency"::text AS "urgency",
      i."confidence",
      i."generated_at" AS "generatedAt",
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', s."id",
          'url', s."canonical_url",
          'title', s."normalized_title",
          'sourceDomain', s."source_domain",
          'publishedAt', CASE WHEN s."published_at" IS NULL THEN NULL ELSE to_char(s."published_at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
        ))
        FROM "company_intelligence_insight_source" link
        JOIN "company_signal_item" s ON s."id" = link."signal_item_id"
        WHERE link."insight_id" = i."id"
      ), '[]'::jsonb) AS "sources",
      jsonb_build_array(jsonb_build_object(
        'useful', COUNT(f."id") FILTER (WHERE f."rating_usefulness" = 'useful'),
        'notUseful', COUNT(f."id") FILTER (WHERE f."rating_usefulness" = 'not_useful'),
        'unclearUsefulness', COUNT(f."id") FILTER (WHERE f."rating_usefulness" = 'unclear'),
        'accurate', COUNT(f."id") FILTER (WHERE f."rating_accuracy" = 'accurate'),
        'inaccurate', COUNT(f."id") FILTER (WHERE f."rating_accuracy" = 'inaccurate'),
        'unclearAccuracy', COUNT(f."id") FILTER (WHERE f."rating_accuracy" = 'unclear')
      )) AS "feedback"
    FROM "company_intelligence_insight" i
    LEFT JOIN "company_insight_feedback" f ON f."insight_id" = i."id"
    WHERE ${whereSql}
    GROUP BY i."id"
    ORDER BY i."generated_at" DESC
    LIMIT ${limit}
  `).catch(() => []);

  return rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    companyName: row.companyName,
    csmName: row.csmName,
    businessUnit: row.businessUnit,
    insightType: row.insightType,
    title: row.title,
    summary: row.summary,
    rationale: row.rationale,
    suggestedAction: row.suggestedAction,
    urgency: row.urgency,
    confidence: row.confidence === null ? null : Number(row.confidence),
    generatedAt: row.generatedAt.toISOString(),
    sources: parseSources(row.sources),
    feedback: parseFeedback(row.feedback)
  }));
}
