import Link from "next/link";
import { UserRoundCheck } from "lucide-react";

import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { addDays, kindLabel, kindTone, today } from "@/lib/cover-rules";
import { formatDate, fullName } from "@/lib/utils";

/**
 * Cover on the teacher's own page.
 *
 * The board a deputy head fills in is not where a teacher finds out they are
 * wanted at half past nine. This is: the same rows, read from the other end,
 * on the page they already open on a Monday morning. Without it the module is
 * a screen one person looks at, and the school goes on telling people in the
 * corridor.
 *
 * Both directions, because both are news. Cover you have been given is where
 * you have to be. Your own lessons while you are away is the question every
 * teacher asks the afternoon before they go, and answering it is most of what
 * makes somebody trust the board enough to stop asking.
 *
 * Renders nothing at all when there is neither. An empty card on a page that
 * is otherwise a timetable is furniture.
 */
export async function CoverCard({ staffId }: { staffId: string }) {
  const from = today();
  const to = addDays(from, 14);

  const [given, mine] = await Promise.all([
    db.coverAssignment.findMany({
      where: { coverStaffId: staffId, date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }],
      select: {
        id: true,
        date: true,
        kind: true,
        note: true,
        absentStaff: { select: { firstName: true, lastName: true, title: true } },
        slot: {
          select: {
            startTime: true,
            endTime: true,
            room: true,
            classSection: {
              select: { name: true, classLevel: { select: { name: true } } },
            },
            offering: { select: { subject: { select: { name: true } } } },
          },
        },
      },
    }),
    db.coverAssignment.findMany({
      where: { absentStaffId: staffId, date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }],
      select: {
        id: true,
        date: true,
        kind: true,
        coverStaff: { select: { firstName: true, lastName: true, title: true } },
        slot: {
          select: {
            startTime: true,
            classSection: {
              select: { name: true, classLevel: { select: { name: true } } },
            },
            offering: { select: { subject: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  if (given.length === 0 && mine.length === 0) return null;

  const where = (slot: { classSection: { name: string; classLevel: { name: string } } }) =>
    `${slot.classSection.classLevel.name} ${slot.classSection.name}`;

  return (
    <Card className="mb-4">
      <CardHeader
        title="Cover"
        description="The next fortnight. Arranged by whoever keeps the board."
        action={
          <Link href="/cover" className="text-xs hover:underline">
            The whole board
          </Link>
        }
      />
      <CardBody className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
            You are covering
          </p>

          {given.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Nothing this fortnight.</p>
          ) : (
            <ul className="space-y-2">
              {given.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-2.5"
                >
                  <UserRoundCheck className="mt-0.5 size-4 shrink-0 text-[var(--text-subtle)]" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {row.slot.offering?.subject.name ?? "A lesson"}, {where(row.slot)}
                    </p>
                    <p className="numeric text-xs text-[var(--text-subtle)]">
                      {formatDate(row.date)} · {row.slot.startTime}-{row.slot.endTime}
                      {row.slot.room ? ` · ${row.slot.room}` : ""}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      For {row.absentStaff ? fullName(row.absentStaff) : "a colleague"}
                      {row.kind === "TEACHER" ? "" : ` · ${kindLabel(row.kind)}`}
                    </p>
                    {row.note ? (
                      <p className="mt-0.5 text-xs leading-relaxed">{row.note}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
            Your classes while you are away
          </p>

          {mine.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              You have no lessons being covered.
            </p>
          ) : (
            <ul className="space-y-2">
              {mine.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.slot.offering?.subject.name ?? "A lesson"}, {where(row.slot)}
                    </p>
                    <p className="numeric text-xs text-[var(--text-subtle)]">
                      {formatDate(row.date)} · {row.slot.startTime}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {row.coverStaff ? fullName(row.coverStaff) : "Nobody: the period is lost"}
                    </p>
                  </div>
                  <Badge tone={kindTone(row.kind)}>{kindLabel(row.kind)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
