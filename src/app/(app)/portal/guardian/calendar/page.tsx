import type { Metadata } from "next";
import { CalendarDays, PartyPopper, Sun } from "lucide-react";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, humanise, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "School Calendar" };
export const dynamic = "force-dynamic";

export default async function GuardianCalendarPage() {
  await requireUser();

  const now = new Date();

  const [events, term] = await Promise.all([
    db.calendarEvent.findMany({
      where: { audiences: { has: "GUARDIAN" }, endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 60,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        startsAt: true,
        endsAt: true,
        allDay: true,
        location: true,
        isHoliday: true,
        colour: true,
      },
    }),
    db.term.findFirst({
      where: { isCurrent: true },
      select: {
        name: true,
        startDate: true,
        endDate: true,
        academicYear: { select: { name: true } },
      },
    }),
  ]);

  const holidays = events.filter((event) => event.isHoliday);
  const daysLeft = term
    ? Math.max(
        0,
        Math.ceil((term.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      )
    : null;

  // Grouped by month so a long list reads as a plan rather than a stream.
  const byMonth = new Map<string, typeof events>();
  for (const event of events) {
    const key = event.startsAt.toLocaleDateString("en-GH", {
      month: "long",
      year: "numeric",
    });
    const list = byMonth.get(key) ?? [];
    list.push(event);
    byMonth.set(key, list);
  }

  return (
    <>
      <PageHeader
        title="School calendar"
        description="Term dates, holidays and events you need to plan around."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Current term"
          value={term?.name ?? "—"}
          hint={term?.academicYear.name}
          tone="violet"
          icon={<CalendarDays className="size-4" />}
        />
        <StatCard
          label="Term ends"
          value={term ? formatDate(term.endDate) : "—"}
          hint={daysLeft !== null ? `${daysLeft} days away` : undefined}
          tone="info"
        />
        <StatCard
          label="Upcoming events"
          value={events.length}
          tone="teal"
          icon={<PartyPopper className="size-4" />}
        />
        <StatCard
          label="Holidays ahead"
          value={holidays.length}
          tone="success"
          icon={<Sun className="size-4" />}
        />
      </div>

      {events.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="size-5" />}
            title="Nothing scheduled"
            description="The school has not published any upcoming events."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {[...byMonth.entries()].map(([month, list]) => (
            <Card key={month}>
              <CardHeader title={month} description={`${list.length} events`} />
              <ul className="divide-y divide-[var(--border)]">
                {list.map((event) => (
                  <li key={event.id} className="flex gap-3 px-5 py-3">
                    <div
                      className="w-14 shrink-0 rounded-lg py-1.5 text-center"
                      style={{
                        background: event.colour
                          ? `${event.colour}22`
                          : "var(--bg-subtle)",
                      }}
                    >
                      <p className="numeric text-lg leading-none font-semibold">
                        {event.startsAt.getDate()}
                      </p>
                      <p className="text-[10px] text-[var(--text-subtle)] uppercase">
                        {event.startsAt.toLocaleDateString("en-GH", {
                          weekday: "short",
                        })}
                      </p>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium">{event.title}</p>
                        {event.isHoliday ? (
                          <Badge tone="success">Holiday</Badge>
                        ) : (
                          <Badge tone="neutral">{humanise(event.category)}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-subtle)]">
                        {event.allDay
                          ? "All day"
                          : `${formatDateTime(event.startsAt)}`}
                        {event.location ? ` · ${event.location}` : ""} ·{" "}
                        {relativeTime(event.startsAt)}
                      </p>
                      {event.description ? (
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {event.description}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {term ? (
        <Card className="mt-4">
          <CardBody className="text-xs text-[var(--text-muted)]">
            {term.name} runs from {formatDate(term.startDate)} to{" "}
            {formatDate(term.endDate)}.
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
