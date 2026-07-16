import { NextResponse } from "next/server";
import { requirePetyrApiAnyPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getUserFeedbackSummary } from "@/services/petyrUserFeedbackService";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePetyrApiAnyPermission([PETYR_PERMISSIONS.feedbackManage, PETYR_PERMISSIONS.admin]);
  if (auth instanceof NextResponse) return auth;

  const summary = await getUserFeedbackSummary();

  return NextResponse.json(summary, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
