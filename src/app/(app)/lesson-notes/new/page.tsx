import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { weekEndingFor, weeksInTerm } from "@/lib/lesson-notes";
import { formatDate } from "@/lib/utils";

import { NoteForm } from "../note-form";

export const metadata: Metadata = { title: "New lesson note" };
export const dynamic = "force-dynamic";

/**
 * A blank note for one subject and one week.
 *
 * Nothing is written until the teacher saves. A route that created the row on
 * open would fill the term with empty notes from people who clicked a week to
 * see what was in it, and a head's vetting queue is the place that would show.
 */
export default async function NewLessonNotePage({
  searchParams,
}: {
  searchParams: Promise<{ offering?: string; week?: string }>;
}) {
  const user = await requirePermission("academic.lessonnote.write");
  const { offering: offeringId, week } = await searchParams;

  if (!offeringId) notFound();

  const offering = await db.subjectOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      teacherId: true,
      coTeacherIds: true,
      subject: { select: { name: true } },
      classSection: { select: { name: true, classLevel: { select: { name: true } } } },
      term: { select: { name: true, startDate: true, endDate: true } },
    },
  });
  if (!offering || !offering.term) notFound();

  const mine =
    Boolean(user.staffId) &&
    [offering.teacherId, ...offering.coTeacherIds].includes(user.staffId ?? "");
  if (!mine && !userCan(user, "academic.lessonnote.vet")) notFound();

  const weeks = weeksInTerm(offering.term);
  const weekNumber = Math.min(Math.max(Number(week) || 1, 1), weeks);

  // Somebody arriving here for a week that already has a note goes to the note
  // rather than to a blank form that would fail on the unique index.
  const existing = await db.lessonNote.findUnique({
    where: { offeringId_weekNumber: { offeringId, weekNumber } },
    select: { id: true },
  });
  if (existing) redirect(`/lesson-notes/${existing.id}`);

  const section = `${offering.classSection.classLevel.name} ${offering.classSection.name}`;

  return (
    <>
      <PageHeader
        title={`Week ${weekNumber}`}
        description={`${offering.subject.name}, ${section}. ${offering.term.name}.`}
        breadcrumb={
          <Link href="/lesson-notes" className="hover:text-[var(--text)]">
            Lesson notes
          </Link>
        }
      />

      <NoteForm
        mine={mine}
        mayVet={false}
        subject={offering.subject.name}
        section={section}
        weekEnding={formatDate(weekEndingFor(weekNumber, offering.term))}
        values={{
          id: null,
          offeringId,
          weekNumber,
          status: "DRAFT",
          topic: "",
          subTopic: "",
          objectives: "",
          rpk: "",
          materials: "",
          coreCompetencies: "",
          introduction: "",
          development: "",
          closure: "",
          evaluation: "",
          homework: "",
          reflection: "",
          periodsPlanned: 0,
          vetterRemarks: null,
        }}
      />
    </>
  );
}
