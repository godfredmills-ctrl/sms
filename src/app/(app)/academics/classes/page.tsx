import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BookOpen, School, TriangleAlert, Users } from "lucide-react";

import {
  Alert,
  Badge,
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
import { percentOf } from "@/lib/money";
import { fullName } from "@/lib/utils";

import { LevelForm, OfferingForm, SectionForm } from "./forms";

export const metadata: Metadata = { title: "Class sections" };
export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const user = await requirePermission("academic.structure.read");
  const canManage = userCan(user, "academic.structure.manage");

  const [levels, teachers, subjects, currentYear] = await Promise.all([
    db.classLevel.findMany({
      orderBy: { sequence: "asc" },
      include: {
        sections: {
          orderBy: { name: "asc" },
          include: {
            formTeacher: { select: { firstName: true, lastName: true, title: true } },
            _count: {
              select: {
                enrollments: { where: { status: "ACTIVE" } },
                offerings: { where: { isActive: true } },
              },
            },
          },
        },
        _count: { select: { subjects: true } },
      },
    }),
    db.staff.findMany({
      where: { status: "ACTIVE", isTeaching: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        title: true,
        department: true,
        _count: { select: { offerings: true } },
      },
    }),
    db.subject.findMany({
      where: { isActive: true },
      orderBy: [{ sortKey: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true, department: true },
    }),
    db.academicYear.findFirst({
      where: { isCurrent: true },
      select: { name: true, terms: { where: { isCurrent: true }, select: { name: true } } },
    }),
  ]);

  const sections = levels.flatMap((level) =>
    level.sections.map((section) => ({ ...section, level })),
  );

  const totalStudents = sections.reduce(
    (sum, section) => sum + section._count.enrollments,
    0,
  );
  const totalCapacity = sections.reduce((sum, section) => sum + section.capacity, 0);
  const overCapacity = sections.filter(
    (section) => section._count.enrollments > section.capacity,
  );
  const withoutFormTeacher = sections.filter((section) => !section.formTeacher);
  const withoutSubjects = sections.filter((section) => section._count.offerings === 0);

  const teacherOptions = teachers.map((teacher) => ({
    value: teacher.id,
    label: fullName(teacher),
    description: `${teacher.department ?? "No department"} · ${teacher._count.offerings} classes`,
  }));

  return (
    <>
      <PageHeader
        title="Class sections"
        description={
          currentYear
            ? `${currentYear.name}${currentYear.terms[0] ? ` · ${currentYear.terms[0].name}` : ""}`
            : "No current academic year set."
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Classes"
          value={sections.length}
          hint={`${levels.length} levels`}
          tone="violet"
          icon={<School className="size-4" />}
        />
        <StatCard
          label="Students placed"
          value={totalStudents.toLocaleString()}
          tone="info"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Capacity used"
          value={`${percentOf(totalStudents, totalCapacity).toFixed(0)}%`}
          hint={`${totalStudents} of ${totalCapacity} places`}
          tone={
            percentOf(totalStudents, totalCapacity) > 95
              ? "danger"
              : percentOf(totalStudents, totalCapacity) > 80
                ? "warning"
                : "success"
          }
        />
        <StatCard
          label="Classes needing attention"
          value={withoutFormTeacher.length + withoutSubjects.length}
          hint="No form teacher or no subjects"
          tone={withoutFormTeacher.length + withoutSubjects.length ? "warning" : "success"}
          icon={<TriangleAlert className="size-4" />}
        />
      </div>

      {!currentYear ? (
        <Alert tone="warning" className="mb-4">
          No academic year is marked current, so subjects cannot be assigned and
          nothing can be invoiced or graded. Set one under Academic years.
        </Alert>
      ) : null}

      {overCapacity.length ? (
        <Alert tone="danger" className="mb-4">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {overCapacity.length} class{overCapacity.length === 1 ? " is" : "es are"} over
            capacity: {overCapacity.map((section) => section.code).join(", ")}.
          </span>
        </Alert>
      ) : null}

      <div className={canManage ? "grid gap-4 xl:grid-cols-[1fr_340px]" : ""}>
        <div className="space-y-4">
          {levels.length === 0 ? (
            <Card>
              <EmptyState
                icon={<School className="size-5" />}
                title="No class levels yet"
                description="Start by adding a level such as JHS 1, then create its classes."
              />
            </Card>
          ) : null}

          {levels.map((level) => (
            <Card key={level.id}>
              <CardHeader
                title={level.name}
                description={`${level.sections.length} class${
                  level.sections.length === 1 ? "" : "es"
                } · ${level._count.subjects} subjects on the curriculum map`}
                action={
                  <>
                    <Badge tone="neutral">#{level.sequence}</Badge>
                    {level.stage ? <Badge tone="info">{level.stage}</Badge> : null}
                  </>
                }
              />

              {level.sections.length ? (
                <ul className="divide-y divide-[var(--border)]">
                  {level.sections.map((section) => {
                    const fill = percentOf(section._count.enrollments, section.capacity);
                    return (
                      <li key={section.id} className="px-5 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {level.name} {section.name}
                              <span className="ml-1.5 font-mono text-xs text-[var(--text-subtle)]">
                                {section.code}
                              </span>
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {section.formTeacher ? (
                                fullName(section.formTeacher)
                              ) : (
                                <span className="text-[var(--warning)]">
                                  No form teacher
                                </span>
                              )}
                              {section.roomName ? ` · ${section.roomName}` : ""}
                              {section.stream ? ` · ${section.stream}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              tone={section._count.offerings ? "neutral" : "warning"}
                            >
                              <BookOpen className="size-2.5" />
                              {section._count.offerings}
                            </Badge>
                            <Link
                              href={`/academics/timetable?section=${section.id}`}
                              className="inline-flex h-7 items-center rounded-lg border border-[var(--border-strong)] px-2.5 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                            >
                              Timetable
                            </Link>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center gap-3">
                          <ProgressBar
                            value={fill}
                            tone={fill > 100 ? "danger" : fill > 85 ? "warning" : "success"}
                            label={`${section._count.enrollments} of ${section.capacity}`}
                            className="flex-1"
                          />
                          <span className="numeric shrink-0 text-xs text-[var(--text-subtle)]">
                            {section._count.enrollments}/{section.capacity}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <CardBody>
                  <p className="text-sm text-[var(--text-muted)]">
                    No classes at this level yet.
                  </p>
                </CardBody>
              )}
            </Card>
          ))}
        </div>

        {canManage ? (
          <div className="space-y-4">
            <Card>
              <CardHeader title="New class" />
              <SectionForm
                levels={levels.map((level) => ({
                  value: level.id,
                  label: level.name,
                  description: `${level.sections.length} classes`,
                }))}
                teachers={teacherOptions}
              />
            </Card>

            <Card>
              <CardHeader
                title="Assign a subject"
                description="Creates the class–subject–teacher link the gradebook and register work from."
              />
              <OfferingForm
                sections={sections.map((section) => ({
                  value: section.id,
                  label: `${section.level.name} ${section.name}`,
                  description: section.code,
                  group: section.level.name,
                }))}
                subjects={subjects.map((subject) => ({
                  value: subject.id,
                  label: subject.name,
                  description: subject.code,
                  group: subject.department ?? "Other",
                }))}
                teachers={teacherOptions}
              />
            </Card>

            <Card>
              <CardHeader title="New level" />
              <LevelForm />
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
