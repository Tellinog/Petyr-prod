import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { PetyrSectionTitle } from "@/components/petyr/PetyrLayoutPrimitives";

type ForecastEntryFaqItemProps = {
  question: string;
  children: ReactNode;
};

function ForecastEntryFaqItem({ question, children }: ForecastEntryFaqItemProps) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900">
        <span>{question}</span>
        <span className="text-lg leading-none text-slate-400 transition group-open:rotate-45">+</span>
      </summary>
      <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">{children}</div>
    </details>
  );
}

export function ForecastEntryFaq() {
  return (
    <section id="forecast-entry-faq" className="space-y-4" aria-labelledby="forecast-entry-faq-title">
      <PetyrSectionTitle
        title={<span id="forecast-entry-faq-title">Forecast Entry FAQ</span>}
        description="How Petyr explains monthly and annual forecast fields, input windows, logs, deterministic preview, AI Forecast and Forecast Intelligence boundaries."
        actions={<Badge variant="outline">FAQ</Badge>}
      />
      <div className="space-y-3">
        <ForecastEntryFaqItem question="What is Forecast Ongoing?">
          <p>
            Forecast Ongoing is the current working forecast for the selected period. It represents the latest CSM-owned estimate that can keep
            changing as new information arrives, and it is the value Management uses as the live Ongoing Forecast reference.
          </p>
          <p>
            In Monthly Forecast Entry, Ongoing Forecast becomes the active editable field from day 16 of the month onward. In Annual Forecast Entry,
            Ongoing Forecast is the annual forecast value that remains editable after the Forecast Initial window closes.
          </p>
        </ForecastEntryFaqItem>

        <ForecastEntryFaqItem question="What is Previous Month Forecast?">
          <p>
            Previous Month Forecast is the monthly forecast value entered for the loaded month before the Ongoing Forecast window opens. It captures
            the CSM expectation while the month is still in its first half, before day 16 switches editing to Ongoing Forecast.
          </p>
          <p>
            For the current month, days 1-15 edit Previous Month Forecast. Future months also edit Previous Month Forecast. Past months are locked
            and remain visible for audit and comparison only.
          </p>
        </ForecastEntryFaqItem>

        <ForecastEntryFaqItem question="What is Forecast Initial?">
          <p>
            Forecast Initial is the first annual forecast for a company and year. It is entered through Annual Forecast Entry and then freezes after
            the initial planning window, so Management can compare the fixed Initial Forecast with the later Ongoing Forecast.
          </p>
          <p>
            The normal Forecast Initial window runs from December 10 of the previous year through January 10 of the target year. Admins can unlock a
            target year from Petyr Admin when an exceptional correction window is needed; locking the year again restores the normal rule without
            changing saved Initial Forecast values.
          </p>
        </ForecastEntryFaqItem>

        <ForecastEntryFaqItem question="What are logs?">
          <p>
            Logs are Petyr's audit trail for effective forecast changes. When a Monthly or Annual Forecast Entry save actually changes a value or
            supported status field, Petyr creates a save session and change-log rows that record what changed, the source workflow, who saved it and
            when it happened.
          </p>
          <p>
            Logs stay intentionally sparse: unchanged rows do not create synthetic log entries. They support traceability for forecast updates without
            replacing the forecast tables themselves.
          </p>
        </ForecastEntryFaqItem>

        <ForecastEntryFaqItem question="What are the input deadlines?">
          <p>
            Monthly Forecast Entry follows the loaded month. Days 1-15 are for Previous Month Forecast input; from day 16 onward, input moves to
            Ongoing Forecast. Past months are locked, while future months allow Previous Month Forecast input.
          </p>
          <p>
            Annual Forecast Entry uses December 10 through January 10 as the normal Forecast Initial input window for the target year. After that
            window closes, Forecast Initial is frozen and annual updates continue through Ongoing Forecast, unless an admin explicitly unlocks the
            target year for exceptional Initial Forecast entry.
          </p>
        </ForecastEntryFaqItem>

        <ForecastEntryFaqItem question="How does forecast urgency ordering work?">
          <p>
            The dedicated Forecast Entry route sorts companies by a server-side priority score: active companies receive a positive base score,
            inactive companies receive a large negative score but remain visible, ready data receives an additional readiness score, companies
            with no previous-month and no ongoing forecast receive a missing-forecast boost, and agreement residual value increases priority.
          </p>
          <p>
            The current dedicated-route score is: active status score + data-readiness score + missing-forecast score + residual agreement value.
            Ties fall back to company name ascending so the order stays deterministic. The approved preview rendering also considers near-expiring
            agreements; adding expiry to the canonical dedicated route is still a documented TODO.
          </p>
        </ForecastEntryFaqItem>

        <ForecastEntryFaqItem question="What monthly forecast field can be edited?">
          <p>
            Petyr centralizes monthly editability in <code className="rounded bg-slate-100 px-1 py-0.5">getForecastEntryMode</code>. Past months
            are always locked. For the current month, days 1-15 edit the previous-month forecast and day 16 onward edits the ongoing forecast.
            Future months edit previous-month forecast. Closed revenue and AI Forecast stay read-only in every case.
          </p>
        </ForecastEntryFaqItem>

        <ForecastEntryFaqItem question="Why does deterministic preview run before AI or LLM reasoning?">
          <p>
            The preview is the safe, auditable baseline. It reads PostgreSQL-backed Petyr data, calculates eligible company + Business Unit + future
            month rows, validates the target set and writes no database rows. It also gives users a result when OpenRouter is not configured or when
            an LLM response fails validation.
          </p>
          <p>
            This prevents the LLM from inventing numbers from a blank prompt: every AI Forecast starts from deterministic baseline candidates and
            business signals owned by Petyr.
          </p>
        </ForecastEntryFaqItem>

        <ForecastEntryFaqItem question="How is the deterministic baseline calculated?">
          <p>
            For each eligible future month and official Business Unit, Petyr calculates historical weighted baseline, monthly seasonality, run-rate
            and planned campaign value. Positive historical, seasonality and run-rate signals are averaged, then the final baseline uses the larger
            value between that signal average and valid planned campaigns for the target month.
          </p>
          <p>
            Historical weighting favors recent revenue and comparable same-month history. Run-rate uses completed current-year months when available,
            otherwise recent history, and dampens volatile data. Planned campaigns use only the documented future-planned statuses: Setup and
            Recruiting.
          </p>
        </ForecastEntryFaqItem>

        <ForecastEntryFaqItem question="How does agreement residual pressure influence the forecast?">
          <p>
            Petyr considers only active agreements with residual greater than zero and a future expiry date. It compares the active residual value with
            deterministic future forecast coverage before the nearest expiry or year-end horizon. If coverage is below residual, the preview exposes a
            coverage gap and operational advice.
          </p>
          <p>
            This signal is now allocated over remaining agreement months and attributed to Business Units through sanitized title tokens, linked campaign history or company history when available. Expired residuals are handled as a separate alert category and are not treated as future residual pressure.
          </p>
        </ForecastEntryFaqItem>

        <ForecastEntryFaqItem question="What does Forecast Intelligence do, and what can it never do?">
          <p>
            Forecast Intelligence receives Petyr's locally computed deterministic forecast payload and returns validated JSON business interpretation:
            stakeholder notes, risks, watchouts and opportunities only. Each item must explain the relevant amount, timing or exposure with payload-backed numeric evidence.
          </p>
          <p>
            It must not calculate, recalculate, adjust, smooth, round, override or invent forecast values. It also must not use CSM-entered monthly or
            annual forecast values as input, and it must never update CSM forecast, closed revenue, management objectives, Initial Forecast or annual
            forecast data.
          </p>
        </ForecastEntryFaqItem>

        <ForecastEntryFaqItem question="Which other deterministic alerts support Forecast Entry decisions?">
          <p>
            Petyr alerting is rule-based and does not use an LLM. Existing alert logic covers expiring agreements within 60 days, high active residuals,
            inactive companies, missing forecast updates, locked past months, closed revenue under forecast, CSM forecast materially below AI Forecast
            and Business Units below historical pace.
          </p>
          <p>
            Some alert factors are visible in CSM Overview or Company Detail before they become part of the canonical Forecast Entry ordering score;
            unresolved scoring alignment remains documented in the company-ordering TODOs.
          </p>
        </ForecastEntryFaqItem>
      </div>
    </section>
  );
}
