import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  Eye,
  EyeOff,
  MonitorPlay,
  Users,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { seesWholeSchool, teaches } from "@/lib/scope";
import { percentOf } from "@/lib/money";
import { fullName, relativeTime } from "@/lib/utils";

import { toggleCoursePublishedAction } from "./actions";
import { CourseForm } from "./course-form";

export const metadata: Metadata = { title: "Courses" };
export const dynamic = "force-dynamic";

export default async function LmsPage() {
  const user = await requirePermission(["lms.course.read", "lms.course.manage"]);
  // Staff surface only. Students hold lms.course.read for their portal, and
  // this page carries the answer key, the class results and the marking
  // queue — none of which survive a student opening the URL by hand.
  if (user.portal !== "STAFF") notFound();
  const canManage = userCan(user, "lms.course.manage");

  const [courses, offerings] = await Promise.all([
    db.course.findMany({
      orderBy: [{ status: "asc" }, { title: "asc" }],
      include: {
        offering: {
          select: {
            id: true,
            teacherId: true,
            coTeacherIds: true,
            subject: { select: { name: true, colour: true } },
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
          select: {
            isPublished: true,
            _count: { select: { lessons: true } },
            lessons: {
              select: {
                isPublished: true,
                _count: { select: { progress: true } },
              },
            },
          },
        },
        _count: { select: { assignments: true, quizzes: true, threads: true } },
      },
    }),
    canManage
      ? db.subjectOffering.findMany({
          where: { isActive: true, course: null },
          orderBy: { subject: { name: "asc" } },
          select: {
            id: true,
            subject: { select: { name: true } },
            classSection: {
              select: { name: true, classLevel: { select: { name: true } } },
            },
            teacher: { select: { firstName: true, lastName: true, title: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  // A teacher sees the courses attached to classes they actually teach.
  //
  // This used to ask `lms.course.read`, which every teacher preset holds via
  // expand("lms") — so the filter never applied to the one group it was
  // written for, and every teacher saw every course in the school.
  const visible = seesWholeSchool(user)
    ? courses
    : courses.filter((course) => teaches(course.offering, user.staffId));

  const published = visible.filter((course) => course.status === "PUBLISHED");
  const totalLessons = visible.reduce(
    (sum, course) =>
      sum + course.modules.reduce((inner, module) => inner + module._count.lessons, 0),
    0,
  );
  const totalAssignments = visible.reduce(
    (sum, course) => sum + course._count.assignments,
    0,
  );
  const reach = visible.reduce(
    (sum, course) => sum + (course.offering?.classSection._count.enrollments ?? 0),
    0,
  );

  const emptyPublished = visible.filter(
    (course) =>
      course.status === "PUBLISHED" &&
      course.modules.every((module) => module._count.lessons === 0),
  );

  return (
    <>
      <PageHeader
        title="Courses"
        description="The virtual learning environment: modules, lessons, assignments and quizzes."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Courses"
          value={visible.length}
          hint={`${published.length} published`}
          tone="violet"
          icon={<MonitorPlay className="size-4" />}
        />
        <StatCard
          label="Lessons"
          value={totalLessons}
          tone="info"
          icon={<BookOpen className="size-4" />}
        />
        <StatCard
          label="Assignments"
          value={totalAssignments}
          tone="teal"
          icon={<ClipboardList className="size-4" />}
        />
        <StatCard
          label="Students reached"
          value={reach.toLocaleString()}
          hint="Across published courses"
          tone="success"
          icon={<Users className="size-4" />}
        />
      </div>

      {emptyPublished.length ? (
        <Alert tone="warning" className="mb-4">
          {emptyPublished.length} published course
          {emptyPublished.length === 1 ? " has" : "s have"} no lessons in them. Students
          see the course and find nothing behind it, which reads as the system being
          broken rather than the course being new.
        </Alert>
      ) : null}

      <div className={canManage ? "grid gap-4 xl:grid-cols-[1fr_340px]" : ""}>
        <div className="space-y-4">
          {visible.length === 0 ? (
            <Card>
              <EmptyState
                icon={<MonitorPlay className="size-5" />}
                title="No courses yet"
                description={
                  canManage
                    ? "Create one on the right, add modules and lessons, then publish."
                    : "No course material has been published for you."
                }
              />
            </Card>
          ) : null}

          {visible.map((course) => {
            const lessons = course.modules.flatMap((module) => module.lessons);
            const publishedLessons = lessons.filter((lesson) => lesson.isPublished).length;
            const classSize = course.offering?.classSection._count.enrollments ?? 0;

            // Engagement is the share of lesson-views that could exist which
            // actually do — one row per student per published lesson.
            const possible = publishedLessons * classSize;
            const viewed = lessons.reduce(
              (sum, lesson) => sum + (lesson.isPublished ? lesson._count.progress : 0),
              0,
            );

            return (
              <Card key={course.id}>
                <CardHeader
                  title={
                    <Link
                      href={`/lms/${course.id}`}
                      className="flex items-center gap-2 hover:text-[var(--primary)]"
                    >
                      {course.offering?.subject.colour ? (
                        <span
                          aria-hidden
                          className="size-2.5 rounded-full"
                          style={{ background: course.offering.subject.colour }}
                        />
                      ) : null}
                      {course.title}
                    </Link>
                  }
                  description={
                    course.offering
                      ? `${course.offering.classSection.classLevel.name} ${course.offering.classSection.name}${
                          course.offering.teacher
                            ? ` · ${fullName(course.offering.teacher)}`
                            : ""
                        } · ${classSize} students`
                      : `${course.code} · standalone`
                  }
                  action={
                    <>
                      <Badge
                        tone={
                          course.status === "PUBLISHED"
                            ? "success"
                            : course.status === "ARCHIVED"
                              ? "neutral"
                              : "warning"
                        }
                      >
                        {course.status}
                      </Badge>
                      {canManage ? (
                        <form action={toggleCoursePublishedAction}>
                          <input type="hidden" name="id" value={course.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            disabled={
                              course.status !== "PUBLISHED" &&
                              course.modules.filter((module) => module.isPublished)
                                .length === 0
                            }
                          >
                            {course.status === "PUBLISHED" ? (
                              <>
                                <EyeOff className="size-3.5" />
                                Withdraw
                              </>
                            ) : (
                              <>
                                <Eye className="size-3.5" />
                                Publish
                              </>
                            )}
                          </Button>
                        </form>
                      ) : null}
                    </>
                  }
                />

                <CardBody className="space-y-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                    <span>{course.modules.length} modules</span>
                    <span>
                      {publishedLessons} of {lessons.length} lessons published
                    </span>
                    <span>{course._count.assignments} assignments</span>
                    <span>{course._count.quizzes} quizzes</span>
                    {course.allowDiscussion ? (
                      <span>{course._count.threads} discussion threads</span>
                    ) : null}
                  </div>

                  {possible > 0 ? (
                    <div>
                      <div className="mb-1 flex items-baseline justify-between text-xs">
                        <span className="text-[var(--text-muted)]">
                          Lesson engagement
                        </span>
                        <span className="numeric">
                          {percentOf(viewed, possible).toFixed(0)}%
                          <span className="ml-1.5 text-[var(--text-subtle)]">
                            {viewed} of {possible} possible views
                          </span>
                        </span>
                      </div>
                      <ProgressBar
                        value={percentOf(viewed, possible)}
                        tone={
                          percentOf(viewed, possible) >= 60
                            ? "success"
                            : percentOf(viewed, possible) >= 30
                              ? "warning"
                              : "danger"
                        }
                        label="Lesson engagement"
                      />
                    </div>
                  ) : null}

                  <p className="text-xs text-[var(--text-subtle)]">
                    Updated {relativeTime(course.updatedAt)}
                  </p>
                </CardBody>
              </Card>
            );
          })}
        </div>

        {canManage ? (
          <div className="space-y-4">
            <Card>
              <CardHeader
                title="New course"
                description="Created as a draft: students see nothing until it is published."
              />
              <CourseForm
                offerings={offerings.map((offering) => ({
                  value: offering.id,
                  label: `${offering.classSection.classLevel.name} ${offering.classSection.name}, ${offering.subject.name}`,
                  description: offering.teacher
                    ? fullName(offering.teacher)
                    : "No teacher assigned",
                }))}
              />
            </Card>

            {offerings.length === 0 ? (
              <Card>
                <CardBody className="text-xs text-[var(--text-muted)]">
                  Every class-subject assignment already has a course. Create a
                  standalone course by leaving the class field blank: that is how
                  clubs, CPD and holiday programmes are set up.
                </CardBody>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
