import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/db";
import {
  INTELLIGENCE_ACCURACY_RATINGS,
  INTELLIGENCE_USEFULNESS_RATINGS,
  type IntelligenceAccuracyRating,
  type IntelligenceUsefulnessRating
} from "./types";

export function validateUsefulnessRating(value: unknown): IntelligenceUsefulnessRating | null {
  return typeof value === "string" && INTELLIGENCE_USEFULNESS_RATINGS.includes(value as never)
    ? value as IntelligenceUsefulnessRating
    : null;
}

export function validateAccuracyRating(value: unknown): IntelligenceAccuracyRating | null {
  return typeof value === "string" && INTELLIGENCE_ACCURACY_RATINGS.includes(value as never)
    ? value as IntelligenceAccuracyRating
    : null;
}

type FeedbackDb = Pick<typeof prisma, "$executeRaw">;

export async function createInsightFeedback(input: {
  insightId: string;
  ratingUsefulness: IntelligenceUsefulnessRating;
  ratingAccuracy: IntelligenceAccuracyRating;
  feedbackText?: string | null;
  submittedBy: string;
}, db: FeedbackDb = prisma) {
  const id = randomUUID();

  await db.$executeRaw`
    INSERT INTO "company_insight_feedback" (
      "id", "insight_id", "rating_usefulness", "rating_accuracy", "feedback_text", "submitted_by"
    )
    VALUES (
      ${id}, ${input.insightId}, ${input.ratingUsefulness}::"IntelligenceFeedbackUsefulness",
      ${input.ratingAccuracy}::"IntelligenceFeedbackAccuracy", ${input.feedbackText ?? null}, ${input.submittedBy}
    )
  `;

  return { id };
}

export async function getFeedbackSummary() {
  const rows = await prisma.$queryRaw<Array<{
    ratingUsefulness: string;
    ratingAccuracy: string;
    count: bigint;
  }>>`
    SELECT
      "rating_usefulness"::text AS "ratingUsefulness",
      "rating_accuracy"::text AS "ratingAccuracy",
      COUNT(*)::bigint AS "count"
    FROM "company_insight_feedback"
    GROUP BY "rating_usefulness", "rating_accuracy"
  `.catch(() => []);

  return rows.map((row) => ({
    ratingUsefulness: row.ratingUsefulness,
    ratingAccuracy: row.ratingAccuracy,
    count: Number(row.count)
  }));
}
