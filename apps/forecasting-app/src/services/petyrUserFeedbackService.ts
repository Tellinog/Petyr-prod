import ExcelJS from "exceljs";
import { Prisma, UserFeedbackCategory, UserFeedbackStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { PetyrAuthIdentity } from "@/lib/petyr/authCore";
import {
  USER_FEEDBACK_CATEGORIES,
  USER_FEEDBACK_CATEGORY_LABELS,
  USER_FEEDBACK_STATUSES,
  USER_FEEDBACK_STATUS_LABELS
} from "@/lib/petyr/userFeedback";

export type UserFeedbackActivityEvent = {
  type: "page_view" | "click" | "submit";
  label: string;
  path?: string;
  at?: string;
};

export type UserFeedbackClientContext = {
  userAgent?: string;
  language?: string;
  viewport?: {
    width?: number;
    height?: number;
  };
  timezone?: string;
  referrer?: string;
};

export type UserFeedbackTicketListFilter = {
  status?: UserFeedbackStatus | "all";
};

const MAX_MESSAGE_LENGTH = 5000;
const MAX_TEXT_LENGTH = 300;
const MAX_ACTIVITY_ITEMS = 20;
const SECRET_PATTERN = /\b(?:token|secret|password|api[_-]?key|authorization|bearer|session|cookie)=?[A-Za-z0-9._~+/=-]{6,}\b/gi;

function trimText(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") return "";
  return value.replace(SECRET_PATTERN, "[redacted]").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeUrl(value: unknown) {
  const text = trimText(value, 1000);
  return text || "/";
}

function normalizePath(value: unknown) {
  const text = trimText(value, 1000);
  if (!text) return "/";

  try {
    return new URL(text, "http://petyr.local").pathname || "/";
  } catch {
    return text.startsWith("/") ? text : `/${text}`;
  }
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}

export function parseUserFeedbackCategory(value: unknown): UserFeedbackCategory | null {
  return typeof value === "string" && USER_FEEDBACK_CATEGORIES.includes(value as UserFeedbackCategory)
    ? value as UserFeedbackCategory
    : null;
}

export function parseUserFeedbackStatus(value: unknown): UserFeedbackStatus | null {
  return typeof value === "string" && USER_FEEDBACK_STATUSES.includes(value as UserFeedbackStatus)
    ? value as UserFeedbackStatus
    : null;
}

function sanitizeRecentActivity(value: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(value)) return [];

  return value.slice(-MAX_ACTIVITY_ITEMS).map((item) => {
    const event = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const type = event.type === "click" || event.type === "submit" || event.type === "page_view" ? event.type : "click";
    const label = trimText(event.label, 160) || "Unnamed interaction";
    const path = normalizePath(event.path);
    const at = trimText(event.at, 64);

    return {
      type,
      label,
      path,
      ...(at ? { at } : {})
    };
  });
}

function sanitizeClientContext(value: unknown): Prisma.InputJsonValue {
  const context = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const viewport = context.viewport && typeof context.viewport === "object"
    ? context.viewport as Record<string, unknown>
    : {};

  return {
    userAgent: trimText(context.userAgent, 300),
    language: trimText(context.language, 64),
    timezone: trimText(context.timezone, 120),
    referrer: trimText(context.referrer, 1000),
    viewport: {
      width: normalizeNumber(viewport.width),
      height: normalizeNumber(viewport.height)
    }
  };
}

export async function createUserFeedbackTicket(input: {
  category: UserFeedbackCategory;
  message: string;
  pagePath: unknown;
  pageUrl: unknown;
  recentActivity: unknown;
  clientContext: unknown;
  identity: PetyrAuthIdentity;
}) {
  const message = trimText(input.message, MAX_MESSAGE_LENGTH);
  if (!message) {
    throw new Error("Feedback message is required.");
  }

  return prisma.userFeedbackTicket.create({
    data: {
      category: input.category,
      message,
      pagePath: normalizePath(input.pagePath),
      pageUrl: normalizeUrl(input.pageUrl),
      recentActivity: sanitizeRecentActivity(input.recentActivity),
      clientContext: sanitizeClientContext(input.clientContext),
      submittedByEmail: input.identity.email,
      submittedByDisplayName: input.identity.user.displayName,
      submittedByRole: input.identity.role,
      accessSessionId: input.identity.accessSessionId,
      correlationId: input.identity.correlationId
    },
    select: {
      id: true,
      status: true,
      createdAt: true
    }
  });
}

export async function getUserFeedbackSummary() {
  const grouped = await prisma.userFeedbackTicket.groupBy({
    by: ["status"],
    _count: {
      _all: true
    }
  }).catch(() => []);

  const counts = {
    open: 0,
    inProgress: 0,
    resolved: 0,
    total: 0
  };

  for (const row of grouped) {
    const count = row._count._all;
    counts.total += count;
    if (row.status === UserFeedbackStatus.open) counts.open = count;
    if (row.status === UserFeedbackStatus.in_progress) counts.inProgress = count;
    if (row.status === UserFeedbackStatus.resolved) counts.resolved = count;
  }

  return counts;
}

export async function listUserFeedbackTickets(filter: UserFeedbackTicketListFilter = {}) {
  const where = filter.status && filter.status !== "all" ? { status: filter.status } : {};

  return prisma.userFeedbackTicket.findMany({
    where,
    orderBy: [
      { status: "asc" },
      { createdAt: "desc" }
    ],
    take: 500
  });
}

export async function updateUserFeedbackTicketStatus(input: {
  ticketId: string;
  status: UserFeedbackStatus;
  updatedBy: string;
}) {
  return prisma.userFeedbackTicket.update({
    where: {
      id: input.ticketId
    },
    data: {
      status: input.status,
      statusUpdatedAt: new Date(),
      statusUpdatedBy: input.updatedBy,
      resolvedAt: input.status === UserFeedbackStatus.resolved ? new Date() : null
    },
    select: {
      id: true,
      status: true,
      statusUpdatedAt: true,
      resolvedAt: true
    }
  });
}

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString() : "";
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "";
  }
}

export async function exportUserFeedbackTicketsWorkbook() {
  const tickets = await listUserFeedbackTickets({ status: "all" });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Petyr";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Feedback Tickets");
  sheet.columns = [
    { header: "Ticket ID", key: "id", width: 28 },
    { header: "Status", key: "status", width: 16 },
    { header: "Category", key: "category", width: 18 },
    { header: "Message", key: "message", width: 60 },
    { header: "Page path", key: "pagePath", width: 38 },
    { header: "Page URL", key: "pageUrl", width: 60 },
    { header: "Submitted by email", key: "submittedByEmail", width: 32 },
    { header: "Submitted by name", key: "submittedByDisplayName", width: 28 },
    { header: "Submitted role", key: "submittedByRole", width: 24 },
    { header: "Created at", key: "createdAt", width: 26 },
    { header: "Updated at", key: "updatedAt", width: 26 },
    { header: "Status updated at", key: "statusUpdatedAt", width: 26 },
    { header: "Status updated by", key: "statusUpdatedBy", width: 32 },
    { header: "Resolved at", key: "resolvedAt", width: 26 },
    { header: "Recent activity JSON", key: "recentActivity", width: 70 },
    { header: "Client context JSON", key: "clientContext", width: 70 },
    { header: "Access session ID", key: "accessSessionId", width: 34 },
    { header: "Correlation ID", key: "correlationId", width: 34 }
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length }
  };

  for (const ticket of tickets) {
    sheet.addRow({
      id: ticket.id,
      status: USER_FEEDBACK_STATUS_LABELS[ticket.status],
      category: USER_FEEDBACK_CATEGORY_LABELS[ticket.category],
      message: ticket.message,
      pagePath: ticket.pagePath,
      pageUrl: ticket.pageUrl,
      submittedByEmail: ticket.submittedByEmail,
      submittedByDisplayName: ticket.submittedByDisplayName ?? "",
      submittedByRole: ticket.submittedByRole,
      createdAt: formatDate(ticket.createdAt),
      updatedAt: formatDate(ticket.updatedAt),
      statusUpdatedAt: formatDate(ticket.statusUpdatedAt),
      statusUpdatedBy: ticket.statusUpdatedBy ?? "",
      resolvedAt: formatDate(ticket.resolvedAt),
      recentActivity: stringifyJson(ticket.recentActivity),
      clientContext: stringifyJson(ticket.clientContext),
      accessSessionId: ticket.accessSessionId,
      correlationId: ticket.correlationId
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
