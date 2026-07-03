import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  createInsightFeedback,
  validateAccuracyRating,
  validateUsefulnessRating
} from "@/services/intelligence/feedbackService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  const payload = await request.json().catch(() => null) as {
    insightId?: unknown;
    ratingUsefulness?: unknown;
    ratingAccuracy?: unknown;
    feedbackText?: unknown;
  } | null;
  const insightId = typeof payload?.insightId === "string" ? payload.insightId.trim() : "";
  const ratingUsefulness = validateUsefulnessRating(payload?.ratingUsefulness);
  const ratingAccuracy = validateAccuracyRating(payload?.ratingAccuracy);

  if (!insightId || !ratingUsefulness || !ratingAccuracy) {
    return NextResponse.json({ error: "Invalid Intelligence feedback payload." }, { status: 400 });
  }

  const feedback = await createInsightFeedback({
    insightId,
    ratingUsefulness,
    ratingAccuracy,
    feedbackText: typeof payload?.feedbackText === "string" ? payload.feedbackText.trim().slice(0, 2000) : null,
    submittedBy: auth.email
  });

  return NextResponse.json({ feedback }, { status: 201 });
}
