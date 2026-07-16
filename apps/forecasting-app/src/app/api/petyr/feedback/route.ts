import { NextResponse } from "next/server";
import { requirePetyrApiAnyPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  createUserFeedbackTicket,
  parseUserFeedbackCategory
} from "@/services/petyrUserFeedbackService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requirePetyrApiAnyPermission([
    PETYR_PERMISSIONS.read,
    PETYR_PERMISSIONS.feedbackManage,
    PETYR_PERMISSIONS.admin
  ]);
  if (auth instanceof NextResponse) return auth;

  const payload = await request.json().catch(() => null) as {
    category?: unknown;
    message?: unknown;
    pagePath?: unknown;
    pageUrl?: unknown;
    recentActivity?: unknown;
    clientContext?: unknown;
  } | null;

  const category = parseUserFeedbackCategory(payload?.category);
  const message = typeof payload?.message === "string" ? payload.message : "";

  if (!category || !message.trim()) {
    return NextResponse.json({ error: "Invalid feedback payload." }, { status: 400 });
  }

  try {
    const ticket = await createUserFeedbackTicket({
      category,
      message,
      pagePath: payload?.pagePath,
      pageUrl: payload?.pageUrl,
      recentActivity: payload?.recentActivity,
      clientContext: payload?.clientContext,
      identity: auth
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to submit feedback."
      },
      { status: 500 }
    );
  }
}
