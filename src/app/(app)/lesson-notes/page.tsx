import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenCheck, CalendarCheck, ClipboardList, Clock } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { currentTerm } from "@/lib/current-term";
import { db } from "@/lib/db";
import {
  compliance,
  completeness,
  statusLabel,
  statusTone,
  termWeeks,
  timeliness,
  weekOfTerm,
} from "@/lib/lesson-notes";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Lesson notes" };
export const dynamic = "force-dynamic";

/**
 * A teacher's own notes for the term, one row per week per subject.
 *
 * Laid out by week rather than by subject, because that is the question a
 * teacher actually has on a Thursday afternoon: what have I not written for
 * next week. A list by subject answers a question nobody asks.
 */
export default async function LessonNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requirePermission([
    "academic.lessonnote.write",
    "academic.lessonnote.read",
    "academic.lessonnote.vet",
  ]);

  const term = await currentTerm();
  const { week: requested } = await searchParams;

  if (!term.termId) {
    return (
      <>
        <PageHeader title="Lesson notes" />
        <Alert tone="warning">
          There is no current term. Set one under Years and terms: a lesson note
          is filed against a week of a term, and without one there are no weeks.
        </Alert>
      </>
    );
  }

  const termRow = await db.term.findUnique({
    where: { id: term.termId },
    select: { name: true, startDate: true, endDate: true },
  });
  if (!termRow) return null;

  const weeks = termWeeks(termRow);
  const now = new Date();
  const thisWeek = weekOfTerm(now, termRow);
  const selected = Number(requested) || thisWeek;

  // Their own classes. A head who also teaches sees their own teaching here
  // and everybody else's in the vetting queue, which are different questions.
  const offerings = user.staffId
    ? await db.subjectOffering.findMany({
        where: {
          isActive: true,
          termId: term.termId,
          OR: [{ teacherId: user.staffId }, { coTeacherIds: { has: user.staffId } }],
        },
        orderBy: [
          { classSection: { classLevel: { sequence: "asc" } } },
          { subject: { name: "asc" } },
        ],
        select: {
          id: true,
          periodsPerWeek: true,
          subject: { select: { name: true } },
          classSection: {
            select: { name: true, classLevel: { select: { name: true } } },
          },
        },
      })
    : [];

  const notes = offerings.length
    ? await db.lessonNote.findMany({
        where: { offeringId: { in: offerings.map((offering) => offering.id) } },
        select: {
          id: true,
          offeringId: true,
          weekNumber: true,
          weekEnding: true,
          topic: true,
          status: true,
          submittedAt: true,
          vetterRemarks: true,
          objectives: true,
          rpk: true,
          materials: true,
          coreCompetencies: true,
          subTopic: true,
          introduction: true,
          development: true,
          closure: true,
          evaluation: true,
          homework: true,
          reflection: true,
        },
      })
    : [];

  const forWeek = new Map(
    notes
      .filter((note) => note.weekNumber === selected)
      .map((note) => [note.offeringId, note]),
  );

  // Weeks that have already happened, which is what compliance is measured
  // against. Counting the whole term in week two insults anybody up to date.
  const summary = compliance(notes, Math.max(0, thisWeek - 1) * offerings.length, now);

  const canVet = userCan(user, "academic.lessonnote.vet");
  const waiting = canVet
    ? await db.lessonNote.count({ where: { status: "SUBMITTED" } })
    : 0;

  return (
    <>
      <PageHeader
        title="Lesson notes"
        description={`${termRow.name}. This is week ${thisWeek} of ${weeks.length}.`}
        action={
          canVet ? (
            <LinkButton href="/lesson-notes/vetting" variant="outline" size="sm">
              <BookOpenCheck className="size-3.5" />
              Vetting{waiting ? ` (${waiting})` : ""}
            </LinkButton>
          ) : null
        }
      />

      {offerings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title="You are not teaching anything this term"
            description="Lesson notes are written against a subject in a class. Ask the registrar to assign your subjects for the term."
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Weeks so far"
              value={String(Math.max(0, thisWeek - 1))}
              hint={`${offerings.length} ${offerings.length === 1 ? "subject" : "subjects"}, so ${summary.expected} notes expected`}
              tone="violet"
              icon={<CalendarCheck className="size-4" />}
            />
            <StatCard
              label="Approved"
              value={String(summary.approved)}
              hint="Vetted and signed off"
              tone="success"
              icon={<BookOpenCheck className="size-4" />}
            />
            <StatCard
              label="Waiting or returned"
              value={String(summary.submitted + summary.returned)}
              hint={summary.returned ? `${summary.returned} sent back to you` : "With the head"}
              tone={summary.returned ? "warning" : "info"}
              icon={<Clock className="size-4" />}
            />
            <StatCard
              label="Not handed in"
              value={String(summary.missing)}
              hint={summary.missing ? "Weeks already taught" : "You are up to date"}
              tone={summary.missing ? "danger" : "success"}
              icon={<ClipboardList className="size-4" />}
            />
          </div>

          {summary.returned > 0 ? (
            <Alert tone="warning" className="mb-4">
              {summary.returned} {summary.returned === 1 ? "note has" : "notes have"} been
              sent back with remarks. They are marked below and need editing and
              handing in again.
            </Alert>
          ) : null}

          {/* The weeks, so a teacher can go back and fill in what they missed. */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {weeks.map((week) => {
              const done = notes.filter(
                (note) => note.weekNumber === week.weekNumber && note.status !== "DRAFT",
              ).length;
              const complete = done >= offerings.length;

              return (
                <Link
                  key={week.weekNumber}
                  href={`/lesson-notes?week=${week.weekNumber}`}
                  className={
                    week.weekNumber === selected
                      ? "rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-1.5 text-sm font-medium text-[var(--primary)]"
                      : "rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                  }
                >
                  {week.weekNumber}
                  {week.weekNumber <= thisWeek ? (
                    <span
                      className={`ml-1.5 inline-block size-1.5 rounded-full ${
                        complete ? "bg-[var(--success)]" : "bg-[var(--danger)]"
                      }`}
                    />
                  ) : null}
                </Link>
              );
            })}
          </div>

          <Card>
            <CardHeader
              title={`Week ${selected}`}
              description={`Ending ${formatDate(weeks[selected - 1]?.weekEnding ?? now)}. One note per subject.`}
            />
            <CardBody className="space-y-2">
              {offerings.map((offering) => {
                const note = forWeek.get(offering.id);
                const late = note ? timeliness(note, now) === "late" : false;

                return (
                  <Link
                    key={offering.id}
                    href={
                      note
                        ? `/lesson-notes/${note.id}`
                        : `/lesson-notes/new?offering=${offering.id}&week=${selected}`
                    }
                    className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-3 transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{offering.subject.name}</p>
                      <p className="truncate text-xs text-[var(--text-subtle)]">
                        {offering.classSection.classLevel.name} {offering.classSection.name}
                        {offering.periodsPerWeek
                          ? ` · ${offering.periodsPerWeek} periods a week`
                          : ""}
                      </p>
                      {note?.topic ? (
                        <p className="truncate text-xs text-[var(--text-muted)]">
                          {note.topic}
                        </p>
                      ) : null}
                      {note?.status === "RETURNED" && note.vetterRemarks ? (
                        <p className="truncate text-xs text-[var(--warning)]">
                          {note.vetterRemarks}
                        </p>
                      ) : null}
                    </div>

                    {note ? (
                      <>
                        {late ? <Badge tone="warning">Late</Badge> : null}
                        {note.status === "DRAFT" ? (
                          <span className="numeric text-xs text-[var(--text-subtle)]">
                            {completeness(note)}%
                          </span>
                        ) : null}
                        <Badge tone={statusTone(note.status) as never}>
                          {statusLabel(note.status)}
                        </Badge>
                      </>
                    ) : (
                      <Badge tone="neutral">Not started</Badge>
                    )}
                  </Link>
                );
              })}
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}
