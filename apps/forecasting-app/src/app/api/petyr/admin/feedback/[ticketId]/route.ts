import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  parseUserFeedbackStatus,
  updateUserFeedbackTicketStatus
} from "@/services/petyrUserFeedbackService";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  const { ticketId } = await params;
  const payload = await request.json().catch(() => null) as { status?: unknown } | null;
  const status = parseUserFeedbackStatus(payload?.status);

  if (!ticketId || !status) {
    return NextResponse.json({ error: "Invalid feedback status update." }, { status: 400 });
  }

  try {
    const ticket = await updateUserFeedbackTicketStatus({
      ticketId,
      status,
      updatedBy: auth.email
    });

    return NextResponse.json({ ticket });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update feedback ticket."
      },
      { status: 500 }
    );
  }
}
