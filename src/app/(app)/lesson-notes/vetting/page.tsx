import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BookOpenCheck, Clock, UserX } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { currentTerm } from "@/lib/current-term";
import { db } from "@/lib/db";
import { statusLabel, statusTone, timeliness, weekOfTerm } from "@/lib/lesson-notes";
import { formatDate, fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Vetting lesson notes" };
export const dynamic = "force-dynamic";

/**
 * The head's side of it: what is waiting, and who has not handed anything in.
 *
 * The second half is the one that is hard to do on paper. A pile of exercise
 * books tells a head what was handed in; it says nothing at all about the
 * teacher who handed nothing in, and that is the teacher worth knowing about.
 */
export default async function VettingPage() {
  const user = await requirePermission("academic.lessonnote.vet");
  const term = await currentTerm();

  if (!term.termId) {
    return (
      <>
        <PageHeader title="Vetting lesson notes" />
        <Alert tone="warning">There is no current term.</Alert>
      </>
    );
  }

  const termRow = await db.term.findUnique({
    where: { id: term.termId },
    select: { name: true, startDate: true, endDate: true },
  });
  if (!termRow) return null;

  const now = new Date();
  const thisWeek = weekOfTerm(now, termRow);

  const [waiting, offerings, notes] = await Promise.all([
    db.lessonNote.findMany({
      where: { status: "SUBMITTED" },
      orderBy: [{ weekNumber: "asc" }, { submittedAt: "asc" }],
      select: {
        id: true,
        weekNumber: true,
        weekEnding: true,
        topic: true,
        status: true,
        submittedAt: true,
        offering: {
          select: {
            teacher: { select: { firstName: true, lastName: true, title: true } },
            subject: { select: { name: true } },
            classSection: {
              select: { name: true, classLevel: { select: { name: true } } },
            },
          },
        },
      },
    }),
    db.subjectOffering.findMany({
      where: { isActive: true, termId: term.termId, teacherId: { not: null } },
      select: {
        id: true,
        teacherId: true,
        subject: { select: { name: true } },
        teacher: { select: { firstName: true, lastName: true, title: true } },
        classSection: {
          select: { name: true, classLevel: { select: { name: true } } },
        },
      },
    }),
    db.lessonNote.findMany({
      where: { offering: { termId: term.termId } },
      select: { offeringId: true, weekNumber: true, status: true },
    }),
  ]);

  /*
   * Who has not handed in what, for the weeks that have already happened.
   *
   * A draft does not count. It is a form somebody opened, not a note anybody
   * has seen, and counting it would let a teacher clear their record by
   * opening one and leaving it.
   */
  const handedIn = new Set(
    notes
      .filter((note) => note.status !== "DRAFT")
      .map((note) => `${note.offeringId}:${note.weekNumber}`),
  );

  const weeksSoFar = Math.max(0, thisWeek - 1);
  const gaps = new Map<
    string,
    { teacher: string; missing: number; subjects: Set<string> }
  >();

  for (const offering of offerings) {
    if (!offering.teacherId || !offering.teacher) continue;

    for (let week = 1; week <= weeksSoFar; week += 1) {
      if (handedIn.has(`${offering.id}:${week}`)) continue;

      const entry = gaps.get(offering.teacherId) ?? {
        teacher: fullName(offering.teacher),
        missing: 0,
        subjects: new Set<string>(),
      };
      entry.missing += 1;
      entry.subjects.add(
        `${offering.subject.name}, ${offering.classSection.classLevel.name} ${offering.classSection.name}`,
      );
      gaps.set(offering.teacherId, entry);
    }
  }

  const behind = [...gaps.values()].sort((a, b) => b.missing - a.missing);
  const expected = offerings.length * weeksSoFar;
  const approved = notes.filter((note) => note.status === "APPROVED").length;

  return (
    <>
      <PageHeader
        title="Vetting lesson notes"
        description={`${termRow.name}. ${weeksSoFar} ${weeksSoFar === 1 ? "week has" : "weeks have"} been taught.`}
        breadcrumb={
          <Link href="/lesson-notes" className="hover:text-[var(--text)]">
            Lesson notes
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Waiting for you"
          value={String(waiting.length)}
          hint={waiting.length ? "Handed in, not yet vetted" : "Nothing in the queue"}
          tone={waiting.length ? "warning" : "success"}
          icon={<Clock className="size-4" />}
        />
        <StatCard
          label="Approved"
          value={String(approved)}
          hint={expected ? `of ${expected} expected so far` : "Term has just started"}
          tone="success"
          icon={<BookOpenCheck className="size-4" />}
        />
        <StatCard
          label="Never handed in"
          value={String(Math.max(0, expected - handedIn.size))}
          hint="Weeks already taught"
          tone={expected - handedIn.size > 0 ? "danger" : "success"}
          icon={<AlertTriangle className="size-4" />}
        />
        <StatCard
          label="Teachers behind"
          value={String(behind.length)}
          hint={behind.length ? "Named below" : "Everybody is up to date"}
          tone={behind.length ? "warning" : "success"}
          icon={<UserX className="size-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Waiting to be vetted"
            description="Oldest week first, then whoever handed in first."
          />
          <CardBody className="space-y-2">
            {waiting.length === 0 ? (
              <EmptyState
                icon={<BookOpenCheck className="size-5" />}
                title="Nothing waiting"
                description="Every note handed in has been looked at."
              />
            ) : (
              waiting.map((note) => (
                <Link
                  key={note.id}
                  href={`/lesson-notes/${note.id}`}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-3 transition-colors hover:bg-[var(--bg-subtle)]"
                >
                  <span className="numeric flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-xs font-semibold">
                    {note.weekNumber}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{note.topic}</span>
                    <span className="block truncate text-xs text-[var(--text-subtle)]">
                      {note.offering.subject.name},{" "}
                      {note.offering.classSection.classLevel.name}{" "}
                      {note.offering.classSection.name}
                      {note.offering.teacher ? ` · ${fullName(note.offering.teacher)}` : ""}
                    </span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">
                      Week ending {formatDate(note.weekEnding)}
                    </span>
                  </span>

                  {timeliness(note, now) === "late" ? (
                    <Badge tone="warning">Late</Badge>
                  ) : null}
                  <Badge tone={statusTone(note.status) as never}>
                    {statusLabel(note.status)}
                  </Badge>
                </Link>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Who is behind"
            description="Weeks already taught with no note handed in. A draft does not count."
          />
          <CardBody className="space-y-2">
            {behind.length === 0 ? (
              <EmptyState
                icon={<BookOpenCheck className="size-5" />}
                title="Everybody is up to date"
                description={
                  weeksSoFar === 0
                    ? "The term has only just started."
                    : "Every subject has a note for every week taught so far."
                }
              />
            ) : (
              behind.map((entry) => (
                <div
                  key={entry.teacher}
                  className="rounded-xl border border-[var(--border)] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-medium">{entry.teacher}</p>
                    <Badge tone={entry.missing > 3 ? "danger" : "warning"}>
                      {entry.missing} missing
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-subtle)]">
                    {[...entry.subjects].slice(0, 3).join(" · ")}
                    {entry.subjects.size > 3 ? ` and ${entry.subjects.size - 3} more` : ""}
                  </p>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
        You cannot vet your own lesson notes, however senior you are. If you
        teach, somebody else has to look at yours, which is the point of vetting
        them. Signed in as {user.fullName}.
      </p>
    </>
  );
}
