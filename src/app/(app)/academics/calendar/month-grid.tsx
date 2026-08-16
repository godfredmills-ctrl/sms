import Link from "next/link";
import { ChevronLeft, ChevronRight, Sun } from "lucide-react";

/**
 * A month of the academic calendar as an actual grid.
 *
 * Server-rendered: it is dates and links, nothing a browser needs a library
 * for. Weeks start on Monday, which is how Ghanaian schools think of a week.
 * Multi-day events appear on every day they span — a mid-term break is a
 * band across its week, not a dot on the day it begins.
 */

export type GridEvent = {
  id: string;
  title: string;
  category: string;
  startsAt: Date;
  endsAt: Date;
  isHoliday: boolean;
  colour: string | null;
};

/** Category → the token palette that paints its chip. */
const CATEGORY_TONES: Record<string, { bg: string; text: string }> = {
  HOLIDAY: { bg: "var(--success-soft)", text: "var(--success)" },
  EXAM: { bg: "var(--danger-soft)", text: "var(--danger)" },
  PTA: { bg: "var(--violet-soft)", text: "var(--violet)" },
  SPORTS: { bg: "var(--teal-soft)", text: "var(--teal)" },
  CULTURAL: { bg: "var(--warning-soft)", text: "var(--warning)" },
  TRIP: { bg: "var(--info-soft)", text: "var(--info)" },
  CPD: { bg: "var(--bg-subtle)", text: "var(--text-muted)" },
  MEETING: { bg: "var(--info-soft)", text: "var(--info)" },
  GENERAL: { bg: "var(--primary-soft)", text: "var(--primary)" },
};

function toneFor(event: GridEvent) {
  if (event.colour) return { bg: `${event.colour}22`, text: event.colour };
  return CATEGORY_TONES[event.category] ?? CATEGORY_TONES.GENERAL;
}

const dayStart = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthGrid({
  month,
  events,
  terms,
  basePath,
}: {
  /** First day of the displayed month. */
  month: Date;
  events: GridEvent[];
  terms: Array<{ name: string; startDate: Date; endDate: Date }>;
  basePath: string;
}) {
  const today = dayStart(new Date());
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  // Walk back to Monday, forward to Sunday, so the grid is whole weeks.
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const gridEnd = new Date(last);
  gridEnd.setDate(last.getDate() + ((7 - last.getDay()) % 7));

  const days: Date[] = [];
  for (let day = new Date(gridStart); day <= gridEnd; day.setDate(day.getDate() + 1)) {
    days.push(new Date(day));
  }

  const eventsOn = (day: Date) =>
    events.filter(
      (event) => dayStart(event.startsAt) <= day && dayStart(event.endsAt) >= day,
    );

  const termOn = (day: Date) =>
    terms.find((term) => dayStart(term.startDate) <= day && dayStart(term.endDate) >= day);

  const previous = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);

  const label = month.toLocaleString("en-GH", { month: "long", year: "numeric" });

  const navLink = (target: Date, title: string, children: React.ReactNode) => (
    <Link
      href={`${basePath}?month=${monthKey(target)}`}
      title={title}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]"
    >
      {children}
    </Link>
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-base font-semibold">{label}</h2>
        <div className="flex items-center gap-1.5">
          {navLink(previous, "Previous month", <ChevronLeft className="size-4" />)}
          <Link
            href={basePath}
            className="inline-flex h-8 items-center rounded-lg border border-[var(--border-strong)] px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
          >
            Today
          </Link>
          {navLink(next, "Next month", <ChevronRight className="size-4" />)}
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => (
          <div
            key={weekday}
            className="px-2 py-1.5 text-center text-[11px] font-medium tracking-wide text-[var(--text-subtle)] uppercase"
          >
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = day.getTime() === today.getTime();
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const dayEvents = inMonth ? eventsOn(day) : [];
          const holiday = dayEvents.some((event) => event.isHoliday);
          const term = inMonth ? termOn(day) : undefined;
          const shown = dayEvents.slice(0, 3);

          return (
            <div
              key={index}
              className={`min-h-24 border-r border-b border-[var(--border)] p-1.5 [&:nth-child(7n)]:border-r-0 ${
                !inMonth
                  ? "bg-[var(--bg-inset)] opacity-45"
                  : holiday
                    ? "bg-[var(--success-soft)]"
                    : isWeekend
                      ? "bg-[var(--bg-inset)]"
                      : ""
              }`}
              title={term ? term.name : inMonth ? "Vacation" : undefined}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`numeric inline-flex size-6 items-center justify-center rounded-full text-xs ${
                    isToday
                      ? "bg-[var(--primary)] font-semibold text-white"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {day.getDate()}
                </span>
                {holiday ? (
                  <Sun className="size-3 text-[var(--success)]" aria-label="School closed" />
                ) : null}
              </div>

              <div className="mt-1 space-y-0.5">
                {shown.map((event) => {
                  const tone = toneFor(event);
                  const isStart =
                    dayStart(event.startsAt).getTime() === day.getTime();
                  return (
                    <div
                      key={event.id}
                      title={event.title}
                      className="truncate rounded px-1.5 py-0.5 text-[11px] leading-4 font-medium"
                      style={{ background: tone.bg, color: tone.text }}
                    >
                      {/* Continuation days get a dash rather than repeating the
                          name at full weight — the eye reads the band. */}
                      {isStart ? event.title : `· ${event.title}`}
                    </div>
                  );
                })}
                {dayEvents.length > shown.length ? (
                  <p className="px-1 text-[10px] text-[var(--text-subtle)]">
                    +{dayEvents.length - shown.length} more below
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { monthKey };
