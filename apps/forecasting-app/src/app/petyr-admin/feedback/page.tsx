import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PetyrFeedbackStatusControl from "@/components/petyr/PetyrFeedbackStatusControl";
import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  USER_FEEDBACK_CATEGORY_LABELS,
  USER_FEEDBACK_STATUS_LABELS,
  type UserFeedbackStatusValue
} from "@/lib/petyr/userFeedback";
import {
  getUserFeedbackSummary,
  listUserFeedbackTickets,
  parseUserFeedbackStatus
} from "@/services/petyrUserFeedbackService";

export const dynamic = "force-dynamic";

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "n/a";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

function statusBadgeClass(status: UserFeedbackStatusValue) {
  if (status === "open") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "in_progress") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Unable to render context.";
  }
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PetyrAdminFeedbackPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePetyrPagePermission(PETYR_PERMISSIONS.admin);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedStatus = firstParam(resolvedSearchParams.status);
  const status = requestedStatus === "all" ? "all" : parseUserFeedbackStatus(requestedStatus) ?? "all";
  const [summary, tickets] = await Promise.all([
    getUserFeedbackSummary(),
    listUserFeedbackTickets({ status })
  ]);

  const statusLinks: Array<{ value: "all" | UserFeedbackStatusValue; label: string; count: number }> = [
    { value: "all", label: "All", count: summary.total },
    { value: "open", label: "Open", count: summary.open },
    { value: "in_progress", label: "In progress", count: summary.inProgress },
    { value: "resolved", label: "Resolved", count: summary.resolved }
  ];

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="space-y-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Feedback tickets</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Review product feedback submitted from Petyr pages, inspect sanitized context and update ticket status.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
              href="/petyr-admin"
            >
              Back to Petyr Admin
            </Link>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
              href="/forecasting"
            >
              Back to Forecasting
            </Link>
            <a
              className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800"
              href="/api/petyr/admin/feedback/export-xlsx"
            >
              Export Excel
            </a>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Ticket queue</CardTitle>
            <CardDescription>Open tickets need review. In-progress and resolved tickets remain exportable for audit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs font-medium uppercase text-slate-500">Open</div>
                <div className="mt-1 text-2xl font-semibold text-slate-950">{summary.open}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs font-medium uppercase text-slate-500">In progress</div>
                <div className="mt-1 text-2xl font-semibold text-slate-950">{summary.inProgress}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs font-medium uppercase text-slate-500">Resolved</div>
                <div className="mt-1 text-2xl font-semibold text-slate-950">{summary.resolved}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs font-medium uppercase text-slate-500">Total</div>
                <div className="mt-1 text-2xl font-semibold text-slate-950">{summary.total}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {statusLinks.map((item) => {
                const active = item.value === status;
                return (
                  <Link
                    key={item.value}
                    className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors ${
                      active
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                    href={`/petyr-admin/feedback?status=${item.value}`}
                  >
                    {item.label}
                    <span className={active ? "text-slate-200" : "text-slate-500"}>{item.count}</span>
                  </Link>
                );
              })}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Category</th>
                    <th className="px-3 py-3">Message</th>
                    <th className="px-3 py-3">Page</th>
                    <th className="px-3 py-3">Submitted by</th>
                    <th className="px-3 py-3">Created</th>
                    <th className="px-3 py-3">Context</th>
                    <th className="px-3 py-3">Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {tickets.map((ticket) => {
                    const ticketStatus = ticket.status as UserFeedbackStatusValue;
                    return (
                      <tr key={ticket.id} className="align-top">
                        <td className="px-3 py-3">
                          <Badge variant="outline" className={statusBadgeClass(ticketStatus)}>
                            {USER_FEEDBACK_STATUS_LABELS[ticketStatus]}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{USER_FEEDBACK_CATEGORY_LABELS[ticket.category]}</td>
                        <td className="max-w-sm px-3 py-3 text-slate-900">
                          <div className="whitespace-pre-wrap break-words">{ticket.message}</div>
                          <div className="mt-2 text-xs text-slate-500">{ticket.id}</div>
                        </td>
                        <td className="max-w-xs px-3 py-3 text-slate-700">
                          <div className="font-medium text-slate-900">{ticket.pagePath}</div>
                          <div className="mt-1 break-all text-xs text-slate-500">{ticket.pageUrl}</div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          <div className="font-medium text-slate-900">{ticket.submittedByDisplayName || ticket.submittedByEmail}</div>
                          <div className="text-xs text-slate-500">{ticket.submittedByEmail}</div>
                          <div className="mt-1 text-xs text-slate-500">{ticket.submittedByRole}</div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatDateTime(ticket.createdAt)}
                          {ticket.statusUpdatedAt ? (
                            <div className="mt-1 text-xs text-slate-500">
                              Status updated {formatDateTime(ticket.statusUpdatedAt)}
                            </div>
                          ) : null}
                        </td>
                        <td className="min-w-[260px] px-3 py-3">
                          <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <summary className="cursor-pointer text-sm font-medium text-slate-900">View sanitized context</summary>
                            <div className="mt-3 space-y-3">
                              <div>
                                <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Recent activity</div>
                                <pre className="max-h-56 overflow-auto rounded-lg bg-white p-2 text-xs text-slate-700">
                                  {stringifyJson(ticket.recentActivity)}
                                </pre>
                              </div>
                              <div>
                                <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Client context</div>
                                <pre className="max-h-56 overflow-auto rounded-lg bg-white p-2 text-xs text-slate-700">
                                  {stringifyJson(ticket.clientContext)}
                                </pre>
                              </div>
                            </div>
                          </details>
                        </td>
                        <td className="min-w-[170px] px-3 py-3">
                          <PetyrFeedbackStatusControl ticketId={ticket.id} initialStatus={ticketStatus} />
                        </td>
                      </tr>
                    );
                  })}
                  {!tickets.length ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-sm text-slate-500" colSpan={8}>
                        No feedback tickets found for this filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
