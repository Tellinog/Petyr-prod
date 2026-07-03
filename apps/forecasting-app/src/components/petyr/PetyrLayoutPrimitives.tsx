import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PetyrTone = "neutral" | "info" | "success" | "warning" | "danger";

const noticeToneClasses: Record<PetyrTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  info: "border-blue-200 bg-blue-50 text-blue-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-900"
};

type PetyrPageShellProps = HTMLAttributes<HTMLElement> & {
  contentClassName?: string;
};

export function PetyrPageShell({ children, className, contentClassName, ...props }: PetyrPageShellProps) {
  return (
    <main className={cn("min-h-screen bg-slate-100 text-slate-900", className)} {...props}>
      <div className={cn("mx-auto flex max-w-[1600px] flex-col gap-6 p-6 md:p-8", contentClassName)}>
        {children}
      </div>
    </main>
  );
}

export type PetyrWorkspaceSection = "management" | "csm" | "company" | "entry";

type PetyrWorkspaceShellProps = Omit<PetyrPageShellProps, "children"> & {
  activeSection: PetyrWorkspaceSection;
  companyDetailHref?: string | null;
  forecastEntryHref?: string | null;
  canViewCsmOverview?: boolean;
  children: ReactNode;
};

const workspaceNavItems: Array<{
  key: PetyrWorkspaceSection;
  label: string;
}> = [
  { key: "management", label: "Management" },
  { key: "csm", label: "CSM Overview" },
  { key: "company", label: "Company Detail" },
  { key: "entry", label: "Forecast Entry" }
];

const workspaceHeaderCopy: Record<PetyrWorkspaceSection, { title: string; description: string }> = {
  management: {
    title: "Management",
    description:
      "Track annual objectives, Initial vs Ongoing Forecast, Closed revenue YTD, planned revenue, branch, Business Unit and CSM performance, plus risk signals."
  },
  csm: {
    title: "CSM Overview",
    description:
      "Review assigned company portfolios, monthly forecast comparisons, AI reference values and relevant insights. Open details or Forecast Entry when follow-up is needed."
  },
  company: {
    title: "Company Details",
    description:
      "Inspect a selected company in read-only mode: agreements, campaigns, residuals, Business Unit revenue, AI cache suggestions and forecast change history."
  },
  entry: {
    title: "Forecast Entry",
    description:
      "Enter and review CSM-owned monthly and annual forecasts by company and Business Unit, with editability rules, notes, status updates and AI Forecast support."
  }
};

function PetyrWorkspaceNavLink({
  active,
  disabled,
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  active: boolean;
  disabled?: boolean;
}) {
  const navClassName = cn(
    "inline-flex items-center justify-center whitespace-nowrap rounded-xl px-3 py-3 text-sm font-medium transition-all",
    active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50",
    disabled && "cursor-not-allowed text-slate-400 hover:bg-transparent",
    className
  );

  if (disabled || !props.href) {
    return (
      <span aria-disabled="true" className={navClassName}>
        {children}
      </span>
    );
  }

  return (
    <a className={navClassName} {...props}>
      {children}
    </a>
  );
}

function buildForecastEntryFaqHref(forecastEntryHref: string | null) {
  const fallbackHref = "/forecasting/entry/faq";

  if (!forecastEntryHref) {
    return fallbackHref;
  }

  const [hrefWithoutHash] = forecastEntryHref.split("#");
  const queryStart = hrefWithoutHash.indexOf("?");

  if (queryStart < 0) {
    return fallbackHref;
  }

  const queryString = hrefWithoutHash.slice(queryStart + 1);
  return queryString ? `${fallbackHref}?${queryString}` : fallbackHref;
}

export function PetyrWorkspaceShell({
  activeSection,
  companyDetailHref = null,
  forecastEntryHref = null,
  canViewCsmOverview = false,
  children,
  ...props
}: PetyrWorkspaceShellProps) {
  const headerCopy = workspaceHeaderCopy[activeSection];
  const helpHref = buildForecastEntryFaqHref(forecastEntryHref);
  const hrefs: Record<PetyrWorkspaceSection, string | null> = {
    management: "/forecasting?view=management",
    csm: canViewCsmOverview ? "/forecasting?view=csm" : null,
    company: companyDetailHref,
    entry: forecastEntryHref
  };
  const visibleNavItems = workspaceNavItems.filter((item) => item.key !== "csm" || canViewCsmOverview);

  return (
    <PetyrPageShell {...props}>
      <div className="relative rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className={cn(helpHref ? "pr-24" : undefined)}>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
            UNGUESS · Petyr
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{headerCopy.title}</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            {headerCopy.description}
          </p>
        </div>
        {helpHref ? (
          <a
            aria-label="Open Forecast Entry FAQ"
            className="absolute right-6 top-6 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 md:right-8 md:top-8"
            href={helpHref}
            title="Forecast Entry FAQ"
          >
            <span className="text-base leading-none">?</span>
            <span>FAQ</span>
          </a>
        ) : null}
      </div>

      <nav
        aria-label="Petyr forecasting sections"
        className={cn(
          "grid h-auto grid-cols-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm",
          visibleNavItems.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3"
        )}
      >
        {visibleNavItems.map((item) => (
          <PetyrWorkspaceNavLink
            key={item.key}
            active={activeSection === item.key}
            disabled={!hrefs[item.key]}
            href={hrefs[item.key] ?? undefined}
          >
            {item.label}
          </PetyrWorkspaceNavLink>
        ))}
      </nav>

      {children}
    </PetyrPageShell>
  );
}

type DivPropsWithoutNativeTitle = Omit<HTMLAttributes<HTMLDivElement>, "title">;

type PetyrSectionTitleProps = DivPropsWithoutNativeTitle & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PetyrSectionTitle({ title, description, actions, className, ...props }: PetyrSectionTitleProps) {
  return (
    <div className={cn("mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between", className)} {...props}>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PetyrCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <Card className={cn("rounded-2xl border-slate-200 shadow-sm", className)} {...props} />;
}

type PetyrSupportCardProps = DivPropsWithoutNativeTitle & {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  details?: ReactNode;
  detailsSummary?: ReactNode;
};

export function PetyrSupportCard({
  title,
  description,
  badge,
  actions,
  details,
  detailsSummary = "Details",
  children,
  className,
  ...props
}: PetyrSupportCardProps) {
  return (
    <PetyrCard className={cn("bg-white/95", className)} {...props}>
      <CardHeader className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{title}</CardTitle>
              {badge ? <Badge variant="outline">{badge}</Badge> : null}
            </div>
            {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        {children}
        {details ? (
          <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <summary className="cursor-pointer text-sm font-medium text-slate-900">{detailsSummary}</summary>
            <div className="mt-3">{details}</div>
          </details>
        ) : null}
      </CardContent>
    </PetyrCard>
  );
}

type PetyrKpiCardProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  helper?: ReactNode;
  badge?: ReactNode;
  valueClassName?: string;
};

export function PetyrKpiCard({ label, value, helper, badge, className, valueClassName, ...props }: PetyrKpiCardProps) {
  return (
    <PetyrCard className={className} {...props}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-500">{label}</div>
            <div className={cn("mt-1 text-xl font-semibold text-slate-900", valueClassName)}>{value}</div>
          </div>
          {badge ? <Badge variant="outline">{badge}</Badge> : null}
        </div>
        {helper ? <div className="mt-2 text-xs text-slate-500">{helper}</div> : null}
      </CardContent>
    </PetyrCard>
  );
}

export function PetyrTwoColumnGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid grid-cols-1 gap-6 xl:grid-cols-2", className)} {...props} />;
}

type PetyrEmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function PetyrEmptyState({ children, className, ...props }: PetyrEmptyStateProps) {
  return (
    <div
      className={cn("rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500", className)}
      {...props}
    >
      {children}
    </div>
  );
}

type PetyrInlineNoticeProps = HTMLAttributes<HTMLDivElement> & {
  tone?: PetyrTone;
};

export function PetyrInlineNotice({ tone = "neutral", className, ...props }: PetyrInlineNoticeProps) {
  return <div className={cn("rounded-xl border px-4 py-3 text-sm", noticeToneClasses[tone], className)} {...props} />;
}
