import type { Metadata } from "next";
import { BookMarked, Eye, EyeOff, Layers, Star } from "lucide-react";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { seesWholeSchool } from "@/lib/scope";

import { toggleSubjectAction } from "../actions";
import { LevelPicker, SubjectForm } from "./subject-form";

export const metadata: Metadata = { title: "Subjects" };
export const dynamic = "force-dynamic";

export default async function SubjectsPage() {
  const user = await requirePermission("academic.structure.read");
  const canManage = userCan(user, "academic.structure.manage");

  // A teacher sees the subjects they actually teach. The office sees the
  // whole curriculum, which is what the curriculum map is for.
  const wholeSchool = seesWholeSchool(user);
  const subjectScope = wholeSchool
    ? {}
    : { offerings: { some: { teacherId: user.staffId ?? "" } } };

  const [subjects, levels] = await Promise.all([
    db.subject.findMany({
      ...(wholeSchool ? {} : { where: { isActive: true, ...subjectScope } }),
      orderBy: [{ sortKey: "asc" }, { name: "asc" }],
      include: {
        levels: { select: { classLevelId: true } },
        _count: { select: { offerings: true } },
      },
    }),
    db.classLevel.findMany({
      orderBy: { sequence: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const byDepartment = new Map<string, typeof subjects>();
  for (const subject of subjects) {
    const key = subject.department ?? "Unassigned";
    const list = byDepartment.get(key) ?? [];
    list.push(subject);
    byDepartment.set(key, list);
  }

  const core = subjects.filter((subject) => subject.isCore).length;
  const unmapped = subjects.filter(
    (subject) => subject.isActive && subject.levels.length === 0,
  ).length;
  const untaught = subjects.filter(
    (subject) => subject.isActive && subject._count.offerings === 0,
  ).length;

  const levelOptions = levels.map((level) => ({ value: level.id, label: level.name }));
  const departments = [...byDepartment.keys()]
    .filter((name) => name !== "Unassigned")
    .map((name) => ({ value: name, label: name }));

  return (
    <>
      <PageHeader
        title="Subjects"
        description="The subject catalogue and which levels teach each one."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Subjects"
          value={subjects.length}
          tone="violet"
          icon={<BookMarked className="size-4" />}
        />
        <StatCard
          label="Core"
          value={core}
          hint="Always on the report card"
          tone="info"
          icon={<Star className="size-4" />}
        />
        <StatCard
          label="Departments"
          value={byDepartment.size}
          tone="teal"
          icon={<Layers className="size-4" />}
        />
        <StatCard
          label="Not yet timetabled"
          value={untaught}
          hint="Active but assigned to no class"
          tone={untaught ? "warning" : "success"}
        />
      </div>

      <div className={canManage ? "grid gap-4 xl:grid-cols-[1fr_340px]" : ""}>
        <div className="space-y-4">
          {subjects.length === 0 ? (
            <Card>
              <EmptyState
                icon={<BookMarked className="size-5" />}
                title="No subjects yet"
                description="Add the first one on the right."
              />
            </Card>
          ) : null}

          {[...byDepartment.entries()].map(([department, list]) => (
            <Card key={department}>
              <CardHeader
                title={department}
                description={`${list.length} subject${list.length === 1 ? "" : "s"}`}
              />
              <ul className="divide-y divide-[var(--border)]">
                {list.map((subject) => (
                  <li key={subject.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`text-sm font-medium ${
                              subject.isActive
                                ? ""
                                : "text-[var(--text-subtle)] line-through"
                            }`}
                          >
                            {subject.name}
                          </span>
                          <span className="font-mono text-xs text-[var(--text-subtle)]">
                            {subject.code}
                          </span>
                          {subject.isCore ? <Badge tone="success">Core</Badge> : null}
                          {subject.isElective ? (
                            <Badge tone="info">Elective</Badge>
                          ) : null}
                          {subject.excludeFromAggregate ? (
                            <Badge tone="neutral">Not in aggregate</Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                          Pass mark {subject.passMark}% · taught in{" "}
                          {subject._count.offerings} class
                          {subject._count.offerings === 1 ? "" : "es"}
                          {subject.levels.length === 0 && subject.isActive ? (
                            <span className="text-[var(--warning)]">
                              {" "}
                              · not on any level&rsquo;s curriculum
                            </span>
                          ) : null}
                        </p>
                      </div>

                      {canManage ? (
                        <form action={toggleSubjectAction}>
                          <input type="hidden" name="id" value={subject.id} />
                          <button
                            type="submit"
                            title={subject.isActive ? "Retire subject" : "Restore subject"}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                          >
                            {subject.isActive ? (
                              <EyeOff className="size-3.5" />
                            ) : (
                              <Eye className="size-3.5" />
                            )}
                          </button>
                        </form>
                      ) : null}
                    </div>

                    {canManage ? (
                      <div className="mt-2">
                        <LevelPicker
                          subjectId={subject.id}
                          levels={levelOptions}
                          selected={subject.levels.map((link) => link.classLevelId)}
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        {canManage ? (
          <div className="space-y-4">
            <Card>
              <CardHeader title="New subject" />
              <SubjectForm departments={departments} />
            </Card>

            {unmapped > 0 ? (
              <Card>
                <CardBody className="text-xs text-[var(--text-muted)]">
                  <p className="mb-1.5 font-medium text-[var(--text)]">
                    {unmapped} subject{unmapped === 1 ? "" : "s"} not on any curriculum
                  </p>
                  <p>
                    A subject with no level cannot be picked up by the curriculum map,
                    so it will not appear when electives are chosen or when a level&rsquo;s
                    expected subjects are checked against what is actually taught.
                  </p>
                </CardBody>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
