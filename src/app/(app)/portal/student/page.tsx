import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarCheck,
  ClipboardList,
  FileText,
  Megaphone,
  MonitorPlay,
  Wallet,
} from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  ProgressBar,
  StatCard,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStudentStatement } from "@/lib/finance";
import { formatMoney, percentOf } from "@/lib/money";
import { formatDate, formatPercent, relativeTime, toNumber } from "@/lib/utils";

import { NotLinked } from "./not-linked";

export const metadata: Metadata = { title: "My Learning" };
export const dynamic = "force-dynamic";

export default async function StudentPortalPage() {
  const user = await requireUser();
  if (!user.studentId) return <NotLinked />;

  const [student, statement, announcements] = await Promise.all([
    db.student.findUnique({
      where: { id: user.studentId },
      select: {
        id: true,
        firstName: true,
        enrollments: {
          where: { status: "ACTIVE" },
          take: 1,
          select: {
            classSection: {
              select: {
                id: true,
                name: true,
                classLevel: { select: { name: true } },
              },
            },
          },
        },
        attendance: { select: { status: true } },
        reportCards: {
          where: { status: "PUBLISHED" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            averageScore: true,
            positionInClass: true,
            classSize: true,
            overallGrade: true,
            term: { select: { name: true } },
          },
        },
        submissions: {
          select: {
            id: true,
            status: true,
            score: true,
            assignment: {
              select: {
                id: true,
                title: true,
                dueAt: true,
                maxScore: true,
                course: { select: { title: true } },
              },
            },
          },
        },
      },
    }),
    getStudentStatement(user.studentId),
    db.announcement.findMany({
      where: { status: "PUBLISHED", audiences: { has: "STUDENT" } },
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      take: 4,
      select: {
        id: true,
        title: true,
        summary: true,
        priority: true,
        isPinned: true,
        publishedAt: true,
      },
    }),
  ]);

  if (!student) return <NotLinked />;

  const section = student.enrollments[0]?.classSection;

  const [courses, upcoming] = await Promise.all([
    section
      ? db.course.findMany({
          where: {
            status: "PUBLISHED",
            offering: { classSectionId: section.id },
          },
          select: {
            id: true,
            title: true,
            code: true,
            offering: { select: { subject: { select: { name: true } } } },
            modules: {
              where: { isPublished: true },
              select: {
                lessons: {
                  where: { isPublished: true },
                  select: {
                    id: true,
                    progress: {
                      where: { studentId: user.studentId! },
                      select: { completedAt: true },
                    },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    db.assignment.findMany({
      where: {
        isPublished: true,
        dueAt: { gte: new Date() },
        ...(section ? { course: { offering: { classSectionId: section.id } } } : {}),
      },
      orderBy: { dueAt: "asc" },
      take: 6,
      select: {
        id: true,
        title: true,
        dueAt: true,
        course: { select: { title: true } },
        submissions: {
          where: { studentId: user.studentId },
          select: { status: true },
        },
      },
    }),
  ]);

  const attendanceTotal = student.attendance.length;
  const attendancePresent = student.attendance.filter((record) =>
    ["PRESENT", "LATE", "EXCUSED", "HALF_DAY"].includes(record.status),
  ).length;
  const attendanceRate = percentOf(attendancePresent, attendanceTotal);

  const graded = student.submissions.filter(
    (submission) => submission.score !== null,
  );
  const averageMark = graded.length
    ? graded.reduce((sum, submission) => {
        const max = toNumber(submission.assignment.maxScore) ?? 100;
        return sum + ((toNumber(submission.score) ?? 0) / max) * 100;
      }, 0) / graded.length
    : null;

  const lessonsTotal = courses.reduce(
    (sum, course) =>
      sum + course.modules.reduce((inner, module) => inner + module.lessons.length, 0),
    0,
  );
  const lessonsDone = courses.reduce(
    (sum, course) =>
      sum +
      course.modules.reduce(
        (inner, module) =>
          inner +
          module.lessons.filter((lesson) => lesson.progress[0]?.completedAt).length,
        0,
      ),
    0,
  );

  const report = student.reportCards[0];
  const notSubmitted = upcoming.filter(
    (assignment) =>
      !assignment.submissions[0] ||
      assignment.submissions[0].status === "NOT_STARTED" ||
      assignment.submissions[0].status === "DRAFT",
  );

  return (
    <>
      <PageHeader
        title={`Hello, ${student.firstName}`}
        description={
          section
            ? `${section.classLevel.name} ${section.name}`
            : "You are not currently enrolled in a class."
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Attendance"
          value={attendanceTotal ? formatPercent(attendanceRate) : "—"}
          hint={`${attendancePresent} of ${attendanceTotal} sessions`}
          tone={
            attendanceRate >= 92 ? "success" : attendanceRate >= 85 ? "warning" : "danger"
          }
          icon={<CalendarCheck className="size-4" />}
          href="/portal/student/attendance"
        />
        <StatCard
          label="Coursework average"
          value={averageMark === null ? "—" : `${averageMark.toFixed(1)}%`}
          hint={`${graded.length} graded pieces`}
          tone="violet"
          icon={<ClipboardList className="size-4" />}
          href="/portal/student/assignments"
        />
        <StatCard
          label="Lessons completed"
          value={lessonsTotal ? `${lessonsDone}/${lessonsTotal}` : "—"}
          hint={lessonsTotal ? formatPercent(percentOf(lessonsDone, lessonsTotal)) : undefined}
          tone="info"
          icon={<MonitorPlay className="size-4" />}
          href="/portal/student/courses"
        />
        <StatCard
          label="Fees outstanding"
          value={formatMoney(statement.balanceMinor, "GHS", { compact: true })}
          tone={statement.balanceMinor > 0 ? "warning" : "success"}
          icon={<Wallet className="size-4" />}
          href="/portal/student/fees"
        />
      </div>

      {notSubmitted.length ? (
        <Alert tone="warning" className="mb-4">
          You have {notSubmitted.length} piece{notSubmitted.length === 1 ? "" : "s"} of
          work due that {notSubmitted.length === 1 ? "has" : "have"} not been submitted.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Due soon"
              action={
                <LinkButton
                  href="/portal/student/assignments"
                  variant="ghost"
                  size="sm"
                >
                  All assignments
                </LinkButton>
              }
            />
            {upcoming.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {upcoming.map((assignment) => {
                  const submission = assignment.submissions[0];
                  const submitted =
                    submission &&
                    ["SUBMITTED", "GRADED", "RETURNED", "LATE"].includes(
                      submission.status,
                    );
                  return (
                    <li
                      key={assignment.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {assignment.title}
                        </p>
                        <p className="text-xs text-[var(--text-subtle)]">
                          {assignment.course.title} · due{" "}
                          {relativeTime(assignment.dueAt)}
                        </p>
                      </div>
                      <Badge tone={submitted ? "success" : "warning"}>
                        {submitted ? "Submitted" : "Not submitted"}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={<ClipboardList className="size-5" />}
                title="Nothing due"
                description="No assignments are outstanding right now."
              />
            )}
          </Card>

          <Card>
            <CardHeader
              title="Announcements"
              action={
                <LinkButton
                  href="/portal/student/announcements"
                  variant="ghost"
                  size="sm"
                >
                  View all
                </LinkButton>
              }
            />
            {announcements.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {announcements.map((announcement) => (
                  <li key={announcement.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{announcement.title}</p>
                      {announcement.isPinned ? <Badge tone="primary">Pinned</Badge> : null}
                      {announcement.priority === "URGENT" ? (
                        <Badge tone="danger">Urgent</Badge>
                      ) : null}
                    </div>
                    {announcement.summary ? (
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {announcement.summary}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-[var(--text-subtle)]">
                      {relativeTime(announcement.publishedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Megaphone className="size-5" />} title="Nothing new" />
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Latest report" />
            <CardBody>
              {report ? (
                <>
                  <p className="numeric text-3xl font-semibold">
                    {toNumber(report.averageScore)?.toFixed(1) ?? "—"}%
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {report.term.name}
                    {report.overallGrade ? ` · grade ${report.overallGrade}` : ""}
                  </p>
                  {report.positionInClass ? (
                    <p className="text-xs text-[var(--text-subtle)]">
                      Position {report.positionInClass} of {report.classSize}
                    </p>
                  ) : null}
                  <Link
                    href={`/reports/cards/${report.id}`}
                    className="mt-3 inline-block text-sm text-[var(--primary)] hover:underline"
                  >
                    Open report card →
                  </Link>
                </>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  No results have been published yet.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Course progress"
              action={
                <LinkButton href="/portal/student/courses" variant="ghost" size="sm">
                  Open
                </LinkButton>
              }
            />
            {courses.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {courses.map((course) => {
                  const lessons = course.modules.flatMap((module) => module.lessons);
                  const done = lessons.filter(
                    (lesson) => lesson.progress[0]?.completedAt,
                  ).length;
                  const share = percentOf(done, lessons.length);

                  return (
                    <li key={course.id} className="px-5 py-3">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-sm">{course.title}</span>
                        <span className="numeric text-xs text-[var(--text-subtle)]">
                          {done}/{lessons.length}
                        </span>
                      </div>
                      <ProgressBar
                        value={share}
                        tone={share >= 80 ? "success" : share >= 40 ? "info" : "warning"}
                        label={`${course.title} ${share.toFixed(0)}%`}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={<MonitorPlay className="size-5" />}
                title="No courses yet"
              />
            )}
          </Card>

          <Card>
            <CardHeader title="Fees" />
            <CardBody>
              <p className="numeric text-2xl font-semibold">
                {formatMoney(statement.balanceMinor)}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {statement.balanceMinor > 0
                  ? `outstanding of ${formatMoney(statement.billedMinor)} billed`
                  : "Fully paid — thank you."}
              </p>
              {statement.invoices[0]?.dueDate ? (
                <p className="mt-1 text-xs text-[var(--text-subtle)]">
                  Next due {formatDate(statement.invoices[0].dueDate)}
                </p>
              ) : null}
              <LinkButton
                href="/portal/student/fees"
                variant="outline"
                size="sm"
                className="mt-3 w-full"
              >
                <FileText className="size-3.5" />
                View statement
              </LinkButton>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
