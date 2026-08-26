import type { Metadata } from "next";
import { CalendarDays, CalendarRange, PartyPopper, Sun, Trash2 } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, humanise } from "@/lib/utils";

import { deleteCalendarEventAction } from "../actions";
import { EventForm } from "./event-form";
import { MonthGrid } from "./month-grid";

export const metadata: Metadata = { title: "Academic calendar" };
export const dynamic = "force-dynamic";

const MONTH_FORMAT = new Intl.DateTimeFormat("en-GH", {
  month: "long",
  year: "numeric",
});

/** "2026-09" → the first of that month; anything else → this month. */
function parseMonth(value: string | string[] | undefined): Date {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = raw?.match(/^(\d{4})-(\d{1,2})$/);
  if (match) {
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    if (monthIndex >= 0 && monthIndex <= 11) return new Date(year, monthIndex, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export default async function AcademicCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission(["academic.structure.read", "attendance.read"]);
  const canManage = userCan(user, "academic.year.manage");
  const now = new Date();

  const params = await searchParams;
  const month = parseMonth(params.month);

  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      terms: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          name: true,
          sequence: true,
          startDate: true,
          endDate: true,
          isCurrent: true,
        },
      },
    },
  });

  // The whole year, past included. A calendar that only shows the future
  // cannot answer "when was the PTA meeting?", which is half of what a
  // school calendar is asked.
  const events = year
    ? await db.calendarEvent.findMany({
        where: {
          OR: [
            { academicYearId: year.id },
            {
              academicYearId: null,
              startsAt: { gte: year.startDate },
              endsAt: { lte: year.endDate },
            },
          ],
        },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          startsAt: true,
          endsAt: true,
          location: true,
          isHoliday: true,
          audiences: true,
          colour: true,
        },
      })
    : [];

  const currentTerm = year?.terms.find((term) => term.isCurrent) ?? null;
  const termProgress =
    currentTerm && now >= currentTerm.startDate && now <= currentTerm.endDate
      ? Math.round(
          ((now.getTime() - currentTerm.startDate.getTime()) /
            (currentTerm.endDate.getTime() - currentTerm.startDate.getTime())) *
            100,
        )
      : null;

  // endsAt for an all-day event is midnight at the START of its final day;
  // compared raw, an event still happening today reads as past all day.
  const endOfDay = (date: Date) => {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
  };
  const upcoming = events.filter((event) => endOfDay(event.endsAt) >= now);
  const nextHoliday = upcoming.find((event) => event.isHoliday);

  // The agenda under the grid covers only the month on display — the grid is
  // the overview, the list is where descriptions and the delete button live.
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);
  const monthEvents = events.filter(
    (event) => event.startsAt <= monthEnd && event.endsAt >= month,
  );

  return (
    <>
      <PageHeader
        title="Academic calendar"
        description={
          year
            ? `${year.name}: terms, holidays and events for the whole school year.`
            : "Terms, holidays and school events."
        }
        action={<RefreshButton />}
      />

      {!year ? (
        <Card>
          <EmptyState
            icon={<CalendarRange className="size-5" />}
            title="No current academic year"
            description="Mark a year as current under Academic years, and its calendar appears here."
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Academic year"
              value={year.name}
              hint={`${formatDate(year.startDate)} to ${formatDate(year.endDate)}`}
              tone="violet"
              icon={<CalendarRange className="size-4" />}
            />
            <StatCard
              label={currentTerm ? currentTerm.name : "No current term"}
              value={termProgress !== null ? `${termProgress}%` : "-"}
              hint={
                currentTerm
                  ? `Ends ${formatDate(currentTerm.endDate)}`
                  : "Mark a term as current"
              }
              tone={termProgress !== null ? "info" : "warning"}
              icon={<CalendarDays className="size-4" />}
            />
            <StatCard
              label="Events ahead"
              value={upcoming.length}
              tone="teal"
              icon={<PartyPopper className="size-4" />}
            />
            <StatCard
              label="Next holiday"
              value={nextHoliday ? formatDate(nextHoliday.startsAt) : "-"}
              hint={nextHoliday?.title}
              tone="success"
              icon={<Sun className="size-4" />}
            />
          </div>

          {/* The three terms as a band: the frame everything else sits in. */}
          <Card className="mb-5">
            <CardHeader title="Terms" />
            <CardBody className="grid gap-3 sm:grid-cols-3">
              {year.terms.map((term) => (
                <div
                  key={term.id}
                  className={`rounded-xl border p-4 ${
                    term.isCurrent
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                      : "border-[var(--border)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{term.name}</p>
                    {term.isCurrent ? <Badge tone="primary">Now</Badge> : null}
                  </div>
                  <p className="numeric mt-1 text-xs text-[var(--text-muted)]">
                    {formatDate(term.startDate)} to {formatDate(term.endDate)}
                  </p>
                </div>
              ))}
            </CardBody>
          </Card>

          <div className={canManage ? "grid gap-4 lg:grid-cols-[1fr_340px]" : ""}>
            <div className="space-y-4">
              <MonthGrid
                month={month}
                events={events}
                terms={year.terms}
                basePath="/academics/calendar"
              />

              {monthEvents.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<CalendarDays className="size-5" />}
                    title={`Nothing in ${MONTH_FORMAT.format(month)}`}
                    description={
                      canManage
                        ? "Add events with the form, or move to another month."
                        : "Events appear here once the office adds them."
                    }
                  />
                </Card>
              ) : (
                <Card>
                  <CardHeader
                    title={`In ${MONTH_FORMAT.format(month)}`}
                    description="Details of everything on the grid above."
                  />
                  <ul className="divide-y divide-[var(--border)]">
                      {monthEvents.map((event) => {
                        const past = endOfDay(event.endsAt) < now;
                        const multiDay =
                          event.startsAt.toDateString() !== event.endsAt.toDateString();
                        return (
                          <li
                            key={event.id}
                            className={`flex flex-wrap items-center gap-3 px-5 py-3 ${
                              past ? "opacity-55" : ""
                            }`}
                          >
                            <div
                              className="flex w-12 shrink-0 flex-col items-center rounded-lg py-1"
                              style={{
                                background: event.colour
                                  ? `${event.colour}22`
                                  : "var(--bg-subtle)",
                              }}
                            >
                              <span className="numeric text-lg leading-tight font-semibold">
                                {event.startsAt.getDate()}
                              </span>
                              <span className="text-[10px] tracking-wide text-[var(--text-subtle)] uppercase">
                                {event.startsAt.toLocaleString("en-GH", { weekday: "short" })}
                              </span>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="text-sm font-medium">{event.title}</p>
                                {event.isHoliday ? (
                                  <Badge tone="success">
                                    <Sun className="size-2.5" />
                                    Closed
                                  </Badge>
                                ) : null}
                                <Badge tone="neutral">{humanise(event.category)}</Badge>
                              </div>
                              <p className="text-xs text-[var(--text-subtle)]">
                                {multiDay
                                  ? `${formatDate(event.startsAt)} to ${formatDate(event.endsAt)}`
                                  : formatDate(event.startsAt)}
                                {event.location ? ` · ${event.location}` : ""}
                                {event.audiences.length < 3
                                  ? ` · ${event.audiences
                                      .map((audience) =>
                                        audience === "GUARDIAN"
                                          ? "Parents"
                                          : humanise(audience),
                                      )
                                      .join(", ")} only`
                                  : ""}
                              </p>
                              {event.description ? (
                                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                                  {event.description}
                                </p>
                              ) : null}
                            </div>

                            {canManage ? (
                              <form action={deleteCalendarEventAction}>
                                <input type="hidden" name="id" value={event.id} />
                                <Button
                                  type="submit"
                                  variant="ghost"
                                  size="sm"
                                  title="Remove this event"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </form>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
              )}
            </div>

            {canManage ? (
              <div>
                <Card className="lg:sticky lg:top-20">
                  <CardHeader
                    title="Add an event"
                    description="Appears on every portal it is shown to."
                  />
                  <EventForm />
                </Card>
              </div>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
