import { NextResponse } from "next/server";
import { requirePetyrApiAnyPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  getUserFeedbackSummary,
  listUserFeedbackTickets,
  parseUserFeedbackStatus
} from "@/services/petyrUserFeedbackService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePetyrApiAnyPermission([PETYR_PERMISSIONS.feedbackManage, PETYR_PERMISSIONS.admin]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const requestedStatus = url.searchParams.get("status");
  const status = requestedStatus === "all" ? "all" : parseUserFeedbackStatus(requestedStatus);
  const tickets = await listUserFeedbackTickets({ status: status ?? "all" });
  const summary = await getUserFeedbackSummary();

  return NextResponse.json(
    {
      tickets,
      summary
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
