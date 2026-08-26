import type { Metadata } from "next";
import { CheckCircle2, ClipboardList, Clock, TriangleAlert } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, humanise, relativeTime, toNumber } from "@/lib/utils";

import { NotLinked } from "../not-linked";

export const metadata: Metadata = { title: "Assignments" };
export const dynamic = "force-dynamic";

export default async function StudentAssignmentsPage() {
  const user = await requireUser();
  if (!user.studentId) return <NotLinked title="Assignments" />;

  const enrolment = await db.enrollment.findFirst({
    where: { studentId: user.studentId, status: "ACTIVE" },
    select: { classSectionId: true },
  });

  const assignments = enrolment
    ? await db.assignment.findMany({
        where: {
          isPublished: true,
          course: { offering: { classSectionId: enrolment.classSectionId } },
        },
        orderBy: [{ dueAt: "asc" }],
        include: {
          course: { select: { title: true } },
          submissions: {
            where: { studentId: user.studentId },
            orderBy: { attempt: "desc" },
            take: 1,
          },
        },
      })
    : [];

  const now = new Date();

  const decorated = assignments.map((assignment) => {
    const submission = assignment.submissions[0];
    const submitted = Boolean(submission?.submittedAt);
    const graded = submission?.score !== null && submission?.score !== undefined;
    const overdue =
      !submitted && assignment.dueAt !== null && assignment.dueAt < now;

    return { assignment, submission, submitted, graded, overdue };
  });

  const outstanding = decorated.filter((entry) => !entry.submitted);
  const overdue = decorated.filter((entry) => entry.overdue);
  const gradedEntries = decorated.filter((entry) => entry.graded);

  const average = gradedEntries.length
    ? gradedEntries.reduce((sum, entry) => {
        const max = toNumber(entry.assignment.maxScore) ?? 100;
        return sum + ((toNumber(entry.submission?.score) ?? 0) / max) * 100;
      }, 0) / gradedEntries.length
    : null;

  return (
    <>
      <PageHeader
        title="Assignments"
        description="Everything set for you, what you have handed in, and how it was marked."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Set"
          value={decorated.length}
          tone="violet"
          icon={<ClipboardList className="size-4" />}
        />
        <StatCard
          label="Not handed in"
          value={outstanding.length}
          tone={outstanding.length ? "warning" : "success"}
          icon={<Clock className="size-4" />}
        />
        <StatCard
          label="Overdue"
          value={overdue.length}
          tone={overdue.length ? "danger" : "success"}
          icon={<TriangleAlert className="size-4" />}
        />
        <StatCard
          label="Average mark"
          value={average === null ? "-" : `${average.toFixed(1)}%`}
          hint={`${gradedEntries.length} marked`}
          tone="success"
          icon={<CheckCircle2 className="size-4" />}
        />
      </div>

      {overdue.length ? (
        <Alert tone="danger" className="mb-4">
          {overdue.length} assignment{overdue.length === 1 ? " is" : "s are"} past the
          due date and not handed in. Late work may lose marks: check with your
          teacher.
        </Alert>
      ) : null}

      {decorated.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title="Nothing set"
            description="No assignments have been published for your class."
          />
        </Card>
      ) : (
        <Card>
          <CardHeader title="All assignments" />
          <ul className="divide-y divide-[var(--border)]">
            {decorated.map(({ assignment, submission, submitted, graded, overdue: late }) => {
              const max = toNumber(assignment.maxScore) ?? 100;
              const score = toNumber(submission?.score);
              const percent = score === null ? null : (score / max) * 100;

              return (
                <li key={assignment.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{assignment.title}</span>
                        <Badge tone="neutral">{humanise(assignment.type)}</Badge>
                        {late ? <Badge tone="danger">Overdue</Badge> : null}
                        {submission?.isLate ? (
                          <Badge tone="warning">Handed in late</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {assignment.course.title}
                        {assignment.dueAt
                          ? ` · due ${formatDateTime(assignment.dueAt)} (${relativeTime(assignment.dueAt)})`
                          : " · no due date"}
                      </p>
                      {assignment.instructions ? (
                        <p className="mt-1 text-xs text-[var(--text-subtle)]">
                          {assignment.instructions}
                        </p>
                      ) : null}
                    </div>

                    <div className="shrink-0 text-right">
                      {submission ? (
                        <StatusBadge status={submission.status} />
                      ) : (
                        <Badge tone="neutral">Not started</Badge>
                      )}
                      {graded && percent !== null ? (
                        <p className="numeric mt-1 text-sm font-semibold">
                          {score}/{max}
                          <span className="ml-1.5 text-xs text-[var(--text-subtle)]">
                            {percent.toFixed(0)}%
                          </span>
                        </p>
                      ) : submitted ? (
                        <p className="mt-1 text-xs text-[var(--text-subtle)]">
                          Awaiting marking
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {submission?.feedback ? (
                    <div className="mt-2 rounded-lg bg-[var(--bg-subtle)] p-3">
                      <p className="text-xs font-medium text-[var(--text-muted)]">
                        Teacher feedback
                      </p>
                      <p className="mt-0.5 text-sm">{submission.feedback}</p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <CardBody className="border-t border-[var(--border)]">
            <p className="text-xs text-[var(--text-subtle)]">
              Submissions are made in class or through your teacher&rsquo;s chosen
              method. This page is the record of what has been set and marked.
            </p>
          </CardBody>
        </Card>
      )}
    </>
  );
}
