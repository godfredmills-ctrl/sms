import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { statusLabel, statusTone, timeliness } from "@/lib/lesson-notes";
import { formatDate, formatDateTime, fullName } from "@/lib/utils";

import { NoteForm } from "../note-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const note = await db.lessonNote
    .findUnique({ where: { id }, select: { topic: true, weekNumber: true } })
    .catch(() => null);
  return { title: note ? `Week ${note.weekNumber}: ${note.topic}` : "Lesson note" };
}

export default async function LessonNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission([
    "academic.lessonnote.write",
    "academic.lessonnote.read",
    "academic.lessonnote.vet",
  ]);

  const { id } = await params;

  const note = await db.lessonNote.findUnique({
    where: { id },
    include: {
      vettedBy: { select: { firstName: true, lastName: true, title: true } },
      offering: {
        select: {
          id: true,
          teacherId: true,
          coTeacherIds: true,
          subject: { select: { name: true } },
          teacher: { select: { firstName: true, lastName: true, title: true } },
          classSection: {
            select: { name: true, classLevel: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!note) notFound();

  const mine =
    Boolean(user.staffId) &&
    [note.offering.teacherId, ...note.offering.coTeacherIds].includes(user.staffId ?? "");
  const mayVet = userCan(user, "academic.lessonnote.vet");
  const mayRead = userCan(user, "academic.lessonnote.read");

  // A teacher reads their own. Reading somebody else's is its own permission,
  // because a staff room where anyone can read anyone's preparation is a staff
  // room where people stop writing honestly in the reflection.
  if (!mine && !mayVet && !mayRead) notFound();

  const section = `${note.offering.classSection.classLevel.name} ${note.offering.classSection.name}`;
  const late = timeliness(note, new Date()) === "late";

  return (
    <>
      <PageHeader
        title={note.topic}
        description={`${note.offering.subject.name}, ${section}. Week ${note.weekNumber}, ending ${formatDate(note.weekEnding)}.`}
        breadcrumb={
          <Link href="/lesson-notes" className="hover:text-[var(--text)]">
            Lesson notes
          </Link>
        }
        action={
          <>
            {late ? <Badge tone="warning">Handed in late</Badge> : null}
            <Badge tone={statusTone(note.status) as never}>
              {statusLabel(note.status)}
            </Badge>
          </>
        }
      />

      {!mine ? (
        <Card className="mb-4">
          <CardHeader
            title="Written by"
            description={
              note.offering.teacher
                ? fullName(note.offering.teacher)
                : "Nobody is assigned to this subject"
            }
          />
          <CardBody className="text-sm text-[var(--text-muted)]">
            {note.submittedAt
              ? `Handed in ${formatDateTime(note.submittedAt)}.`
              : "Not handed in yet."}
            {note.vettedAt && note.vettedBy
              ? ` Vetted by ${fullName(note.vettedBy)} on ${formatDate(note.vettedAt)}.`
              : ""}
          </CardBody>
        </Card>
      ) : null}

      <NoteForm
        mine={mine}
        mayVet={mayVet}
        subject={note.offering.subject.name}
        section={section}
        weekEnding={formatDate(note.weekEnding)}
        values={{
          id: note.id,
          offeringId: note.offeringId,
          weekNumber: note.weekNumber,
          status: note.status,
          topic: note.topic,
          subTopic: note.subTopic ?? "",
          objectives: note.objectives.join("\n"),
          rpk: note.rpk ?? "",
          materials: note.materials.join("\n"),
          coreCompetencies: note.coreCompetencies.join("\n"),
          introduction: note.introduction ?? "",
          development: note.development ?? "",
          closure: note.closure ?? "",
          evaluation: note.evaluation ?? "",
          homework: note.homework ?? "",
          reflection: note.reflection ?? "",
          periodsPlanned: note.periodsPlanned,
          vetterRemarks: note.vetterRemarks,
        }}
      />

      {/* Read-only for anybody who is not the teacher: the form above only
          renders its fields while the note is editable, and it never is for
          somebody else's note. */}
      {!mine ? (
        <Card className="mt-4">
          <CardHeader title="The note" />
          <CardBody className="space-y-4 text-sm">
            {[
              ["Sub-topic", note.subTopic],
              ["Objectives", note.objectives.join("\n")],
              ["Relevant previous knowledge", note.rpk],
              ["Teaching and learning materials", note.materials.join("\n")],
              ["Core competencies", note.coreCompetencies.join("\n")],
              ["Introduction", note.introduction],
              ["Development", note.development],
              ["Closure", note.closure],
              ["Evaluation", note.evaluation],
              ["Homework", note.homework],
              ["Reflection", note.reflection],
            ]
              .filter(([, value]) => String(value ?? "").trim())
              .map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                    {label}
                  </p>
                  <p className="mt-0.5 leading-relaxed whitespace-pre-line">{value}</p>
                </div>
              ))}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
