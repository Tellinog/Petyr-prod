"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  USER_FEEDBACK_STATUS_LABELS,
  USER_FEEDBACK_STATUSES,
  type UserFeedbackStatusValue
} from "@/lib/petyr/userFeedback";

export default function PetyrFeedbackStatusControl({
  ticketId,
  initialStatus
}: {
  ticketId: string;
  initialStatus: UserFeedbackStatusValue;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<UserFeedbackStatusValue>(initialStatus);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function updateStatus(nextStatus: UserFeedbackStatusValue) {
    setStatus(nextStatus);
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/petyr/admin/feedback/${encodeURIComponent(ticketId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: nextStatus })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "Unable to update ticket status.");
      }

      router.refresh();
    } catch (error) {
      setStatus(initialStatus);
      setError(error instanceof Error ? error.message : "Unable to update ticket status.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <select
        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 shadow-sm"
        value={status}
        disabled={isSaving}
        onChange={(event) => void updateStatus(event.target.value as UserFeedbackStatusValue)}
        aria-label="Feedback ticket status"
      >
        {USER_FEEDBACK_STATUSES.map((item) => (
          <option key={item} value={item}>
            {USER_FEEDBACK_STATUS_LABELS[item]}
          </option>
        ))}
      </select>
      {isSaving ? <div className="text-xs text-slate-500">Saving...</div> : null}
      {error ? <div className="text-xs text-rose-700">{error}</div> : null}
    </div>
  );
}
