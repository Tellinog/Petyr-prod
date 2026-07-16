"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type FeedbackCategory = "bug" | "experience" | "data_issue" | "other";

type FeedbackActivityEvent = {
  type: "page_view" | "click" | "submit";
  label: string;
  path: string;
  at: string;
};

const activityStorageKey = "petyr.feedback.recentActivity";
const maxActivityItems = 20;
const maxLabelLength = 160;
const secretPattern = /\b(?:token|secret|password|api[_-]?key|authorization|bearer|session|cookie)=?[A-Za-z0-9._~+/=-]{6,}\b/gi;

const categories: Array<{ value: FeedbackCategory; label: string }> = [
  { value: "bug", label: "Bug" },
  { value: "experience", label: "Experience" },
  { value: "data_issue", label: "Data issue" },
  { value: "other", label: "Other" }
];

function redact(value: string) {
  return value.replace(secretPattern, "[redacted]").replace(/\s+/g, " ").trim().slice(0, maxLabelLength);
}

function readActivity(): FeedbackActivityEvent[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(activityStorageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(-maxActivityItems) : [];
  } catch {
    return [];
  }
}

function writeActivity(events: FeedbackActivityEvent[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(activityStorageKey, JSON.stringify(events.slice(-maxActivityItems)));
}

function pushActivity(event: FeedbackActivityEvent) {
  const events = readActivity();
  events.push(event);
  writeActivity(events);
}

function getElementLabel(element: Element | null) {
  if (!element) return "";
  const label =
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.getAttribute("data-feedback-label") ||
    element.textContent ||
    element.getAttribute("href") ||
    "";

  return redact(label);
}

function getFormLabel(form: HTMLFormElement) {
  return redact(
    form.getAttribute("aria-label") ||
    form.getAttribute("data-feedback-label") ||
    form.id ||
    form.name ||
    form.getAttribute("action") ||
    "Form submit"
  );
}

function buildClientContext() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    referrer: document.referrer,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    }
  };
}

export default function PetyrFeedbackButton({ canReviewFeedback }: { canReviewFeedback: boolean }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [openFeedbackCount, setOpenFeedbackCount] = useState<number | null>(null);
  const isHidden = useMemo(() => pathname?.startsWith("/auth") || pathname?.includes("/auth/"), [pathname]);

  useEffect(() => {
    if (!pathname || isHidden) return;

    pushActivity({
      type: "page_view",
      label: `Opened ${pathname}`,
      path: pathname,
      at: new Date().toISOString()
    });
  }, [isHidden, pathname]);

  useEffect(() => {
    if (isHidden) return;

    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const element = target?.closest("button,a,[role='button']");
      const label = getElementLabel(element ?? null);
      if (!label) return;

      pushActivity({
        type: "click",
        label,
        path: window.location.pathname,
        at: new Date().toISOString()
      });
    }

    function onSubmit(event: SubmitEvent) {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form) return;

      pushActivity({
        type: "submit",
        label: getFormLabel(form),
        path: window.location.pathname,
        at: new Date().toISOString()
      });
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [isHidden]);

  useEffect(() => {
    if (!canReviewFeedback || isHidden) return;

    let isMounted = true;
    void fetch("/api/petyr/admin/feedback/summary", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load feedback summary.");
        return response.json() as Promise<{ open?: number }>;
      })
      .then((summary) => {
        if (isMounted) setOpenFeedbackCount(typeof summary.open === "number" ? summary.open : 0);
      })
      .catch(() => {
        if (isMounted) setOpenFeedbackCount(0);
      });

    return () => {
      isMounted = false;
    };
  }, [canReviewFeedback, isHidden]);

  if (isHidden) return null;

  async function submitFeedback() {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setStatus("error");
      setErrorMessage("Describe what happened before submitting feedback.");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const response = await fetch("/api/petyr/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          category,
          message: trimmedMessage,
          pagePath: window.location.pathname,
          pageUrl: window.location.href,
          recentActivity: readActivity(),
          clientContext: buildClientContext()
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "Unable to submit feedback.");
      }

      setStatus("success");
      if (canReviewFeedback) {
        setOpenFeedbackCount((current) => (current ?? 0) + 1);
      }
      setMessage("");
      setCategory("bug");
      window.setTimeout(() => {
        setIsOpen(false);
        setStatus("idle");
      }, 1400);
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Unable to submit feedback.");
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-[calc(100vw-2rem)] text-slate-950">
      {isOpen ? (
        <div className="mb-3 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">Send feedback</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Petyr will attach your user, current page and recent sanitized actions.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-8 shrink-0 px-3 text-xs"
                onClick={() => setIsOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>

          <form
            className="space-y-4 px-4 py-4"
            aria-label="Petyr feedback form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitFeedback();
            }}
          >
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-900">Category</legend>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
                      category === item.value
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    )}
                    onClick={() => setCategory(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-900">What happened?</span>
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Tell us what happened, what you expected, or which data looks wrong."
                maxLength={5000}
                rows={5}
              />
            </label>

            {status === "success" ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Thanks - feedback saved.
              </div>
            ) : null}
            {status === "error" ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={status === "submitting"}>
                {status === "submitting" ? "Sending..." : "Submit feedback"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="flex items-center overflow-hidden rounded-xl shadow-lg">
        <Button
          type="button"
          className="h-11 rounded-none px-4 shadow-none"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          Feedback
        </Button>
        {canReviewFeedback ? (
          <Link
            href="/petyr-admin/feedback"
            className="inline-flex h-11 items-center gap-2 border-l border-slate-700 bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            Review feedback
            <span
              className="inline-flex min-w-6 items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-xs font-semibold tabular-nums text-slate-950"
              aria-label={`${openFeedbackCount ?? 0} open feedback tickets`}
            >
              {openFeedbackCount ?? 0}
            </span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
