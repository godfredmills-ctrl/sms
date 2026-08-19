import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Send } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { offeringOutOfScope } from "@/lib/scope";
import { toNumber } from "@/lib/utils";

import { publishAssessment } from "../actions";
import { AssessmentForm } from "./assessment-form";
import { MarkSheet, type SheetMarks } from "./mark-sheet";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}): Promise<Metadata> {
  const { offeringId } = await params;
  const offering = await db.subjectOffering.findUnique({
    where: { id: offeringId },
    select: {
      subject: { select: { name: true } },
      classSection: { select: { name: true } },
    },
  });
  return {
    title: offering
      ? `${offering.subject.name} · ${offering.classSection.name}`
      : "Gradebook",
  };
}


export default async function MarkSheetPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const user = await requirePermission(["assessment.read", "assessment.grade"]);
  const { offeringId } = await params;

  // The index lists only the teacher's own offerings, but a mark sheet is
  // reachable by URL. Without this, every child's marks in every subject
  // were one guessed id away — and the page already computed `isOwner`,
  // using it to disable the inputs rather than to refuse the read.
  if (await offeringOutOfScope(user, offeringId)) notFound();

  const offering = await db.subjectOffering.findUnique({
    where: { id: offeringId },
    include: {
      subject: { select: { name: true, passMark: true } },
      term: { select: { id: true, name: true, isLocked: true } },
      teacher: { select: { id: true, firstName: true, lastName: true, title: true } },
      classSection: {
        select: {
          id: true,
          name: true,
          classLevel: { select: { name: true } },
          enrollments: {
            where: { status: "ACTIVE" },
            orderBy: [{ rollNumber: "asc" }, { student: { lastName: "asc" } }],
            select: {
              rollNumber: true,
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  admissionNo: true,
                },
              },
            },
          },
        },
      },
      assessments: {
        orderBy: [{ isExam: "asc" }, { createdAt: "asc" }],
        include: { scores: { select: { studentId: true, score: true, isAbsent: true } } },
      },
    },
  });

  if (!offering) notFound();

  // The same question the save asks, asked the same way — see
  // gradebook/actions.ts. A read-only sheet for someone the action would
  // accept is as wrong as an editable one for someone it would refuse.
  const isOwner = !(await offeringOutOfScope(user, offering.id));
  const canGrade =
    userCan(user, "assessment.grade") &&
    (isOwner || userCan(user, "assessment.publish"));
  const readOnly = !canGrade || Boolean(offering.term?.isLocked);

  const students = offering.classSection.enrollments.map((enrolment) => ({
    id: enrolment.student.id,
    fullName: `${enrolment.student.firstName} ${enrolment.student.lastName}`,
    admissionNo: enrolment.student.admissionNo,
    rollNumber: enrolment.rollNumber,
  }));

  const assessments = offering.assessments.map((assessment) => ({
    id: assessment.id,
    title: assessment.title,
    category: assessment.category,
    maxScore: toNumber(assessment.maxScore) ?? 100,
    weight: toNumber(assessment.weight) ?? 0,
    isExam: assessment.isExam,
    isPublished: assessment.isPublished,
    isLocked: assessment.isLocked,
  }));

  const marks: SheetMarks = {};
  for (const assessment of offering.assessments) {
    for (const score of assessment.scores) {
      marks[`${score.studentId}:${assessment.id}`] = {
        score: toNumber(score.score),
        isAbsent: score.isAbsent,
      };
    }
  }

  // Completion tells a teacher at a glance what is left to mark.
  const expected = students.length * assessments.length;
  const entered = Object.keys(marks).length;
  const totalWeight = assessments.reduce((sum, entry) => sum + entry.weight, 0);
  const unpublished = assessments.filter((entry) => !entry.isPublished);

  return (
    <>
      <PageHeader
        title={`${offering.subject.name}`}
        description={`${offering.classSection.classLevel.name} ${offering.classSection.name} · ${offering.term?.name ?? "No term"}${
          offering.teacher
            ? ` · ${offering.teacher.title ?? ""} ${offering.teacher.firstName} ${offering.teacher.lastName}`.replace(
                /\s+/g,
                " ",
              )
            : ""
        }`}
        breadcrumb={
          <Link href="/gradebook" className="hover:text-[var(--text)]">
            Gradebook
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Students" value={students.length} tone="violet" />
        <StatCard label="Assessments" value={assessments.length} tone="info" />
        <StatCard
          label="Marks entered"
          value={expected ? `${Math.round((entered / expected) * 100)}%` : "—"}
          hint={`${entered} of ${expected}`}
          tone={entered >= expected && expected > 0 ? "success" : "warning"}
        />
        <StatCard
          label="Weighting"
          value={`${totalWeight}%`}
          tone={totalWeight === 100 ? "success" : "danger"}
          hint={totalWeight === 100 ? "Complete" : `${100 - totalWeight}% unallocated`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div>
          <MarkSheet
            offeringId={offering.id}
            students={students}
            assessments={assessments}
            initialMarks={marks}
            passMark={offering.subject.passMark}
            readOnly={readOnly}
          />
        </div>

        <div className="space-y-4">
          {userCan(user, "assessment.create") && !readOnly ? (
            <Card>
              <CardHeader
                title="Add an assessment"
                description="Weights across all assessments should total 100%."
              />
              <CardBody>
                <AssessmentForm
                  offeringId={offering.id}
                  remainingWeight={100 - totalWeight}
                />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Assessments"
              description="Publishing makes marks visible to students and guardians."
            />
            {assessments.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {assessments.map((assessment) => (
                  <li key={assessment.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{assessment.title}</p>
                        <p className="numeric text-xs text-[var(--text-subtle)]">
                          /{assessment.maxScore} · {assessment.weight}%
                        </p>
                      </div>
                      {assessment.isPublished ? (
                        <Badge tone="success">Published</Badge>
                      ) : (
                        <Badge tone="neutral">Draft</Badge>
                      )}
                    </div>

                    {!assessment.isPublished &&
                    userCan(user, "assessment.publish") &&
                    !readOnly ? (
                      <form
                        action={async () => {
                          "use server";
                          await publishAssessment(assessment.id);
                        }}
                        className="mt-2"
                      >
                        <Button type="submit" variant="outline" size="sm">
                          <Send className="size-3.5" />
                          Publish results
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <CardBody>
                <p className="text-sm text-[var(--text-muted)]">
                  No assessments yet. Add one to start entering marks.
                </p>
              </CardBody>
            )}
          </Card>

          {unpublished.length > 0 && !readOnly ? (
            <p className="text-xs text-[var(--text-subtle)]">
              {unpublished.length} assessment
              {unpublished.length === 1 ? " is" : "s are"} still unpublished, so the
              marks are not yet visible in the portals.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
