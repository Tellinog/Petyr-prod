import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PetyrErrorPageAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
};

type PetyrErrorPageProps = {
  statusCode: string;
  eyebrow?: string;
  title: string;
  description: ReactNode;
  details?: ReactNode;
  actions?: PetyrErrorPageAction[];
};

const actionClasses = {
  primary: "bg-slate-900 text-white hover:bg-slate-800",
  secondary: "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
};

function PetyrErrorAction({ label, href, onClick, variant = "primary" }: PetyrErrorPageAction) {
  const className = cn(
    "inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition-colors",
    actionClasses[variant]
  );

  if (href) {
    return (
      <a className={className} href={href}>
        {label}
      </a>
    );
  }

  return (
    <button className={className} onClick={onClick} type="button">
      {label}
    </button>
  );
}

export function PetyrErrorPage({
  statusCode,
  eyebrow = "UNGUESS · Petyr",
  title,
  description,
  details,
  actions = [{ label: "Back to Forecasting", href: "/forecasting" }]
}: PetyrErrorPageProps) {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900 md:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <Card className="w-full overflow-hidden rounded-[28px] border-slate-200 bg-white shadow-sm">
          <CardContent className="grid gap-0 p-0 lg:grid-cols-[0.85fr_1.15fr]">
            <section className="flex min-h-[280px] flex-col justify-between bg-slate-950 p-8 text-white md:p-10">
              <div>
                <div className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200">
                  {eyebrow}
                </div>
                <div className="mt-10 text-7xl font-semibold tracking-tight md:text-8xl">{statusCode}</div>
              </div>
              <p className="mt-8 max-w-sm text-sm leading-6 text-slate-300">
                Petyr Forecasting remains available from the main workspace.
              </p>
            </section>

            <section className="flex flex-col justify-center p-8 md:p-10">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Forecasting workspace</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">{title}</h1>
              <div className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{description}</div>
              {details ? (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  {details}
                </div>
              ) : null}
              <div className="mt-8 flex flex-wrap gap-3">
                {actions.map((action) => (
                  <PetyrErrorAction key={`${action.label}-${action.href ?? "button"}`} {...action} />
                ))}
              </div>
            </section>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
