import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  Eye,
  EyeOff,
  MessageSquare,
  Plus,
  Users,
} from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  EmptyState,
  Field,
  Input,
  PageHeader,
  ProgressBar,
  StatCard,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { percentOf } from "@/lib/money";
import { formatDateTime, fullName, humanise, relativeTime, toNumber } from "@/lib/utils";

import {
  createAssignmentAction,
  createLessonAction,
  createModuleAction,
  gradeSubmissionAction,
  toggleLessonPublishedAction,
} from "../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const course = await db.course.findUnique({
    where: { id },
    select: { title: true },
  });
  return { title: course?.title ?? "Course" };
}

export const dynamic = "force-dynamic";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission(["lms.course.read", "lms.course.manage"]);
  const { id } = await params;
  const canManage = userCan(user, "lms.course.manage");
  const canGrade = userCan(user, "lms.assignment.manage");

  const course = await db.course.findUnique({
    where: { id },
    include: {
      offering: {
        select: {
          subject: { select: { name: true } },
          classSection: {
            select: {
              name: true,
              classLevel: { select: { name: true } },
              _count: { select: { enrollments: true } },
            },
          },
          teacher: { select: { firstName: true, lastName: true, title: true } },
        },
      },
      modules: {
        orderBy: { sortKey: "asc" },
        include: {
          lessons: {
            orderBy: { sortKey: "asc" },
            include: { _count: { select: { progress: true, resources: true } } },
          },
        },
      },
      assignments: {
        orderBy: { dueAt: "asc" },
        include: {
          submissions: {
            include: {
              student: {
                select: { id: true, firstName: true, lastName: true, otherNames: true },
              },
            },
          },
        },
      },
      quizzes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          isPublished: true,
          passMark: true,
          _count: { select: { questions: true, attempts: true } },
        },
      },
      threads: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          isPinned: true,
          viewCount: true,
          createdAt: true,
        },
      },
    },
  });

  if (!course) notFound();

  const classSize = course.offering?.classSection._count.enrollments ?? 0;
  const lessons = course.modules.flatMap((module) => module.lessons);
  const publishedLessons = lessons.filter((lesson) => lesson.isPublished);

  const awaitingMarking = course.assignments.flatMap((assignment) =>
    assignment.submissions.filter(
      (submission) => submission.submittedAt && submission.score === null,
    ),
  );

  return (
    <>
      <PageHeader
        title={course.title}
        description={
          course.offering
            ? `${course.offering.classSection.classLevel.name} ${course.offering.classSection.name} · ${course.offering.subject.name}${
                course.offering.teacher ? ` · ${fullName(course.offering.teacher)}` : ""
              }`
            : `${course.code} · standalone course`
        }
        breadcrumb={
          <Link href="/lms" className="hover:text-[var(--text)]">
            Courses
          </Link>
        }
        action={
          <Badge tone={course.status === "PUBLISHED" ? "success" : "warning"}>
            {course.status}
          </Badge>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Lessons"
          value={`${publishedLessons.length}/${lessons.length}`}
          hint="Published of total"
          tone="violet"
          icon={<BookOpen className="size-4" />}
        />
        <StatCard
          label="Students"
          value={classSize}
          tone="info"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Assignments"
          value={course.assignments.length}
          tone="teal"
          icon={<ClipboardList className="size-4" />}
        />
        <StatCard
          label="Awaiting marking"
          value={awaitingMarking.length}
          tone={awaitingMarking.length ? "warning" : "success"}
          hint="Handed in, not yet graded"
        />
      </div>

      {awaitingMarking.length ? (
        <Alert tone="warning" className="mb-4">
          {awaitingMarking.length} submission
          {awaitingMarking.length === 1 ? " is" : "s are"} waiting to be marked. Work
          returned promptly is the single strongest predictor that students will hand
          the next piece in.
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* Modules and lessons ----------------------------------------- */}
          {course.modules.map((module) => (
            <Card key={module.id}>
              <CardHeader
                title={module.title}
                description={module.description ?? undefined}
                action={
                  <Badge tone={module.lessons.length ? "neutral" : "warning"}>
                    {module.lessons.length} lesson
                    {module.lessons.length === 1 ? "" : "s"}
                  </Badge>
                }
              />

              {module.lessons.length ? (
                <ul className="divide-y divide-[var(--border)]">
                  {module.lessons.map((lesson) => (
                    <li
                      key={lesson.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {lesson.title}
                          {!lesson.isPublished ? (
                            <Badge tone="warning" className="ml-1.5">
                              Draft
                            </Badge>
                          ) : null}
                        </p>
                        <p className="text-xs text-[var(--text-subtle)]">
                          {humanise(lesson.contentType)}
                          {lesson.durationMinutes ? ` · ${lesson.durationMinutes} min` : ""}
                          {lesson._count.resources
                            ? ` · ${lesson._count.resources} resources`
                            : ""}
                          {classSize
                            ? ` · viewed by ${lesson._count.progress} of ${classSize}`
                            : ""}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {classSize ? (
                          <div className="w-20">
                            <ProgressBar
                              value={percentOf(lesson._count.progress, classSize)}
                              tone={
                                percentOf(lesson._count.progress, classSize) >= 60
                                  ? "success"
                                  : "warning"
                              }
                              label={`${lesson.title} reach`}
                            />
                          </div>
                        ) : null}
                        {canManage ? (
                          <form action={toggleLessonPublishedAction}>
                            <input type="hidden" name="id" value={lesson.id} />
                            <input type="hidden" name="courseId" value={course.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              {lesson.isPublished ? (
                                <EyeOff className="size-3.5" />
                              ) : (
                                <Eye className="size-3.5" />
                              )}
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <CardBody>
                  <p className="text-sm text-[var(--text-muted)]">No lessons yet.</p>
                </CardBody>
              )}

              {canManage ? (
                <form
                  action={createLessonAction}
                  className="space-y-3 border-t border-[var(--border)] p-5"
                >
                  <input type="hidden" name="moduleId" value={module.id} />
                  <input type="hidden" name="courseId" value={course.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Lesson title" htmlFor={`lt-${module.id}`} required>
                      <Input id={`lt-${module.id}`} name="title" required />
                    </Field>
                    <Field label="Type" htmlFor={`ct-${module.id}`}>
                      <SearchableSelect
                        id={`ct-${module.id}`}
                        name="contentType"
                        clearable={false}
                        defaultValue="TEXT"
                        options={[
                          { value: "TEXT", label: "Written notes" },
                          { value: "VIDEO", label: "Video" },
                          { value: "SLIDES", label: "Slides" },
                          { value: "AUDIO", label: "Audio" },
                          { value: "FILE", label: "File" },
                          { value: "LINK", label: "External link" },
                          { value: "LIVE", label: "Live session" },
                        ]}
                      />
                    </Field>
                  </div>
                  <Field label="Content" htmlFor={`cn-${module.id}`}>
                    <Textarea id={`cn-${module.id}`} name="content" rows={3} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Video URL" htmlFor={`vu-${module.id}`}>
                      <Input id={`vu-${module.id}`} name="videoUrl" />
                    </Field>
                    <Field label="Link" htmlFor={`eu-${module.id}`}>
                      <Input id={`eu-${module.id}`} name="externalUrl" />
                    </Field>
                    <Field label="Minutes" htmlFor={`dm-${module.id}`}>
                      <Input
                        id={`dm-${module.id}`}
                        name="durationMinutes"
                        type="number"
                        min="1"
                      />
                    </Field>
                  </div>
                  <CheckboxField
                    name="isPublished"
                    defaultChecked
                    label="Publish immediately"
                  />
                  <Button type="submit" variant="outline" size="sm">
                    <Plus className="size-3.5" />
                    Add lesson
                  </Button>
                </form>
              ) : null}
            </Card>
          ))}

          {course.modules.length === 0 ? (
            <Card>
              <EmptyState
                icon={<BookOpen className="size-5" />}
                title="No modules yet"
                description="Add a module first — lessons live inside modules."
              />
            </Card>
          ) : null}

          {/* Assignments -------------------------------------------------- */}
          <Card>
            <CardHeader
              title="Assignments"
              description={`${course.assignments.length} set`}
            />
            {course.assignments.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {course.assignments.map((assignment) => {
                  const submitted = assignment.submissions.filter(
                    (submission) => submission.submittedAt,
                  );
                  const graded = submitted.filter(
                    (submission) => submission.score !== null,
                  );

                  return (
                    <li key={assignment.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium">
                              {assignment.title}
                            </span>
                            <Badge tone="neutral">{humanise(assignment.type)}</Badge>
                            {!assignment.isPublished ? (
                              <Badge tone="warning">Draft</Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-[var(--text-subtle)]">
                            {assignment.dueAt
                              ? `Due ${formatDateTime(assignment.dueAt)} (${relativeTime(assignment.dueAt)})`
                              : "No due date"}{" "}
                            · out of {Number(assignment.maxScore)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-xs">
                          <p className="numeric">
                            {submitted.length}/{classSize || submitted.length} handed in
                          </p>
                          <p className="text-[var(--text-subtle)]">
                            {graded.length} marked
                          </p>
                        </div>
                      </div>

                      {canGrade && submitted.length ? (
                        <ul className="mt-2 space-y-1.5">
                          {submitted
                            .filter((submission) => submission.score === null)
                            .slice(0, 8)
                            .map((submission) => (
                              <li key={submission.id}>
                                <form
                                  action={gradeSubmissionAction}
                                  className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] p-2"
                                >
                                  <input
                                    type="hidden"
                                    name="id"
                                    value={submission.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="courseId"
                                    value={course.id}
                                  />
                                  <span className="min-w-0 flex-1 truncate text-xs">
                                    {fullName(submission.student)}
                                    {submission.isLate ? (
                                      <Badge tone="warning" className="ml-1.5">
                                        Late
                                      </Badge>
                                    ) : null}
                                  </span>
                                  <Input
                                    name="score"
                                    type="number"
                                    min="0"
                                    max={Number(assignment.maxScore)}
                                    step="0.5"
                                    placeholder={`/${Number(assignment.maxScore)}`}
                                    aria-label="Score"
                                    className="w-20 text-right"
                                    required
                                  />
                                  <Input
                                    name="feedback"
                                    placeholder="Feedback"
                                    aria-label="Feedback"
                                    className="min-w-[140px] flex-1"
                                  />
                                  <Button type="submit" variant="outline" size="sm">
                                    Mark
                                  </Button>
                                </form>
                              </li>
                            ))}
                        </ul>
                      ) : null}

                      {graded.length ? (
                        <p className="mt-1.5 text-xs text-[var(--text-subtle)]">
                          Class average:{" "}
                          {(
                            graded.reduce(
                              (sum, submission) =>
                                sum + (toNumber(submission.score) ?? 0),
                              0,
                            ) / graded.length
                          ).toFixed(1)}{" "}
                          / {Number(assignment.maxScore)}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="Nothing set yet" />
            )}

            {canGrade ? (
              <form
                action={createAssignmentAction}
                className="space-y-3 border-t border-[var(--border)] p-5"
              >
                <input type="hidden" name="courseId" value={course.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Assignment title" htmlFor="a-title" required>
                    <Input id="a-title" name="title" required />
                  </Field>
                  <Field label="Type" htmlFor="a-type">
                    <SearchableSelect
                      id="a-type"
                      name="type"
                      clearable={false}
                      defaultValue="FILE_UPLOAD"
                      options={[
                        { value: "FILE_UPLOAD", label: "File upload" },
                        { value: "TEXT_ENTRY", label: "Written answer" },
                        { value: "LINK", label: "Link submission" },
                        { value: "OFFLINE", label: "Handed in on paper" },
                        { value: "QUIZ", label: "Quiz" },
                      ]}
                    />
                  </Field>
                </div>
                <Field label="Instructions" htmlFor="a-instructions">
                  <Textarea id="a-instructions" name="instructions" rows={2} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Due" htmlFor="a-due">
                    <Input id="a-due" name="dueAt" type="datetime-local" />
                  </Field>
                  <Field label="Out of" htmlFor="a-max">
                    <Input
                      id="a-max"
                      name="maxScore"
                      type="number"
                      min="1"
                      defaultValue={100}
                    />
                  </Field>
                  <Field label="Late penalty %" htmlFor="a-penalty">
                    <Input
                      id="a-penalty"
                      name="latePenaltyPercent"
                      type="number"
                      min="0"
                      max="100"
                      defaultValue={0}
                    />
                  </Field>
                </div>
                <div className="space-y-2">
                  <CheckboxField name="allowLate" defaultChecked label="Accept late work" />
                  <CheckboxField
                    name="isPublished"
                    defaultChecked
                    label="Publish to students now"
                  />
                </div>
                <Button type="submit" variant="outline" size="sm">
                  <Plus className="size-3.5" />
                  Add assignment
                </Button>
              </form>
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          {canManage ? (
            <Card>
              <CardHeader title="New module" />
              <form action={createModuleAction}>
                <CardBody className="space-y-3">
                  <input type="hidden" name="courseId" value={course.id} />
                  <Field label="Module title" htmlFor="m-title" required>
                    <Input
                      id="m-title"
                      name="title"
                      required
                      placeholder="Unit 1 — Matter"
                    />
                  </Field>
                  <Field label="Description" htmlFor="m-description">
                    <Textarea id="m-description" name="description" rows={2} />
                  </Field>
                  <Button type="submit" variant="outline" size="sm" className="w-full">
                    <Plus className="size-3.5" />
                    Add module
                  </Button>
                </CardBody>
              </form>
            </Card>
          ) : null}

          {course.syllabus ? (
            <Card>
              <CardHeader title="Syllabus" />
              <CardBody>
                <p className="text-sm whitespace-pre-wrap text-[var(--text-muted)]">
                  {course.syllabus}
                </p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Quizzes"
              action={<Badge tone="neutral">{course.quizzes.length}</Badge>}
            />
            {course.quizzes.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {course.quizzes.map((quiz) => (
                  <li key={quiz.id} className="px-5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm">{quiz.title}</span>
                      <StatusBadge status={quiz.isPublished ? "PUBLISHED" : "DRAFT"} />
                    </div>
                    <p className="text-xs text-[var(--text-subtle)]">
                      {quiz._count.questions} questions · {quiz._count.attempts} attempts
                      · pass {quiz.passMark}%
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <CardBody>
                <p className="text-sm text-[var(--text-muted)]">No quizzes yet.</p>
              </CardBody>
            )}
          </Card>

          {course.allowDiscussion ? (
            <Card>
              <CardHeader
                title="Discussion"
                action={<MessageSquare className="size-4 text-[var(--text-subtle)]" />}
              />
              {course.threads.length ? (
                <ul className="divide-y divide-[var(--border)]">
                  {course.threads.map((thread) => (
                    <li key={thread.id} className="px-5 py-2.5">
                      <p className="truncate text-sm">
                        {thread.isPinned ? (
                          <Badge tone="primary" className="mr-1.5">
                            Pinned
                          </Badge>
                        ) : null}
                        {thread.title}
                      </p>
                      <p className="text-xs text-[var(--text-subtle)]">
                        {thread.viewCount} views · {relativeTime(thread.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <CardBody>
                  <p className="text-sm text-[var(--text-muted)]">
                    No discussion threads yet.
                  </p>
                </CardBody>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
