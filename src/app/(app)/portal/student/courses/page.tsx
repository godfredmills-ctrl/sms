import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  FileQuestion,
  MonitorPlay,
  PlayCircle,
} from "lucide-react";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatCard,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { percentOf } from "@/lib/money";
import { humanise } from "@/lib/utils";

import { NotLinked } from "../not-linked";

export const metadata: Metadata = { title: "My Courses" };
export const dynamic = "force-dynamic";

export default async function StudentCoursesPage() {
  const user = await requireUser();
  if (!user.studentId) return <NotLinked title="My Courses" />;

  const enrolment = await db.enrollment.findFirst({
    where: { studentId: user.studentId, status: "ACTIVE" },
    select: { classSectionId: true },
  });

  const courses = enrolment
    ? await db.course.findMany({
        where: {
          status: "PUBLISHED",
          offering: { classSectionId: enrolment.classSectionId },
        },
        orderBy: { title: "asc" },
        include: {
          offering: {
            select: {
              subject: { select: { name: true, colour: true } },
              teacher: { select: { firstName: true, lastName: true, title: true } },
            },
          },
          modules: {
            where: { isPublished: true },
            orderBy: { sortKey: "asc" },
            include: {
              lessons: {
                where: { isPublished: true },
                orderBy: { sortKey: "asc" },
                include: {
                  progress: {
                    where: { studentId: user.studentId },
                    select: { completedAt: true, percent: true },
                  },
                },
              },
            },
          },
          quizzes: {
            where: { isPublished: true },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              title: true,
              passMark: true,
              closesAt: true,
              timeLimitMinutes: true,
              _count: { select: { questions: true } },
              attempts: {
                where: { studentId: user.studentId },
                orderBy: { attempt: "desc" },
                take: 1,
                select: { status: true, percent: true, passed: true },
              },
            },
          },
        },
      })
    : [];

  const allLessons = courses.flatMap((course) =>
    course.modules.flatMap((module) => module.lessons),
  );
  const completed = allLessons.filter((lesson) => lesson.progress[0]?.completedAt).length;

  return (
    <>
      <PageHeader
        title="My courses"
        description="Lesson material for every subject you are taking."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Courses"
          value={courses.length}
          tone="violet"
          icon={<MonitorPlay className="size-4" />}
        />
        <StatCard label="Lessons" value={allLessons.length} tone="info" />
        <StatCard
          label="Completed"
          value={completed}
          hint={`${percentOf(completed, allLessons.length).toFixed(0)}% of the material`}
          tone="success"
          icon={<CheckCircle2 className="size-4" />}
        />
        <StatCard
          label="Remaining"
          value={allLessons.length - completed}
          tone={allLessons.length - completed ? "warning" : "success"}
        />
      </div>

      {courses.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MonitorPlay className="size-5" />}
            title="No courses published"
            description="Your teachers have not published any online course material yet."
          />
        </Card>
      ) : null}

      <div className="space-y-4">
        {courses.map((course) => {
          const lessons = course.modules.flatMap((module) => module.lessons);
          const done = lessons.filter((lesson) => lesson.progress[0]?.completedAt).length;
          const share = percentOf(done, lessons.length);

          return (
            <Card key={course.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {course.offering?.subject.colour ? (
                      <span
                        aria-hidden
                        className="size-2.5 rounded-full"
                        style={{ background: course.offering.subject.colour }}
                      />
                    ) : null}
                    {course.title}
                  </span>
                }
                description={
                  course.offering?.teacher
                    ? `${course.offering.teacher.title ?? ""} ${course.offering.teacher.firstName} ${course.offering.teacher.lastName}`.trim()
                    : course.code
                }
                action={
                  <Badge tone={share >= 80 ? "success" : share > 0 ? "info" : "neutral"}>
                    {done}/{lessons.length} lessons
                  </Badge>
                }
              />

              <CardBody className="space-y-3">
                <ProgressBar
                  value={share}
                  tone={share >= 80 ? "success" : share >= 40 ? "info" : "warning"}
                  label={`${course.title} ${share.toFixed(0)}% complete`}
                />

                {course.modules.map((module) => (
                  <div key={module.id}>
                    <p className="mb-1 text-xs font-semibold tracking-wide uppercase">
                      {module.title}
                    </p>
                    <ul className="space-y-1">
                      {module.lessons.map((lesson) => {
                        const isDone = Boolean(lesson.progress[0]?.completedAt);
                        return (
                          <li key={lesson.id}>
                            <Link
                              href={`/portal/student/courses/${course.id}/lessons/${lesson.id}`}
                              className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-subtle)]"
                            >
                              {isDone ? (
                                <CheckCircle2 className="size-4 shrink-0 text-[var(--success)]" />
                              ) : (
                                <Circle className="size-4 shrink-0 text-[var(--text-subtle)]" />
                              )}
                              <span className="min-w-0 flex-1 truncate">
                                {lesson.title}
                              </span>
                              <span className="shrink-0 text-xs text-[var(--text-subtle)]">
                                {humanise(lesson.contentType)}
                                {lesson.durationMinutes
                                  ? ` · ${lesson.durationMinutes}m`
                                  : ""}
                              </span>
                              <PlayCircle className="size-4 shrink-0 text-[var(--text-subtle)]" />
                            </Link>
                          </li>
                        );
                      })}
                      {module.lessons.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-[var(--text-subtle)]">
                          No lessons published in this module yet.
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ))}

                {course.modules.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    No material published yet.
                  </p>
                ) : null}

                {course.quizzes.length ? (
                  <div className="border-t border-[var(--border)] pt-3">
                    <p className="mb-1.5 text-xs font-semibold tracking-wide uppercase">
                      Quizzes
                    </p>
                    <ul className="space-y-1">
                      {course.quizzes.map((quiz) => {
                        const attempt = quiz.attempts[0];
                        const done = attempt && attempt.status !== "IN_PROGRESS";

                        return (
                          <li key={quiz.id}>
                            <Link
                              href={`/portal/student/quizzes/${quiz.id}`}
                              className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-subtle)]"
                            >
                              <FileQuestion className="size-4 shrink-0 text-[var(--text-subtle)]" />
                              <span className="min-w-0 flex-1 truncate">
                                {quiz.title}
                              </span>
                              <span className="shrink-0 text-xs text-[var(--text-subtle)]">
                                {quiz._count.questions} questions
                                {quiz.timeLimitMinutes
                                  ? ` · ${quiz.timeLimitMinutes}m`
                                  : ""}
                              </span>
                              {done ? (
                                <Badge
                                  tone={
                                    attempt.status === "SUBMITTED"
                                      ? "warning"
                                      : attempt.passed
                                        ? "success"
                                        : "danger"
                                  }
                                >
                                  {attempt.status === "SUBMITTED"
                                    ? "Marking"
                                    : `${Number(attempt.percent ?? 0).toFixed(0)}%`}
                                </Badge>
                              ) : attempt ? (
                                <Badge tone="info">In progress</Badge>
                              ) : (
                                <Badge tone="neutral">Not started</Badge>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
