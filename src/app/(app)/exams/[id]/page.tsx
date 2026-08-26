import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Armchair, Eye, Printer, TriangleAlert } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { clashesIn } from "@/lib/exams";
import { formatDate, toNumber } from "@/lib/utils";

import { EnterCandidates, PublishSession } from "./enter-candidates";
import { DeletePaper, EditPaper, PaperEditor, type Option } from "./paper-editor";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await db.examSession.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: session?.name ?? "Examinations" };
}

const STATUS_TONE = { DRAFT: "warning", PUBLISHED: "success", COMPLETED: "neutral" } as const;
const STATUS_LABEL = {
  DRAFT: "Being set up",
  PUBLISHED: "Timetable out",
  COMPLETED: "Sat",
} as const;

/** "Mon 16 Mar · 09:00 – 10:30" */
function when(startsAt: Date, durationMins: number): string {
  const end = new Date(startsAt.getTime() + durationMins * 60_000);
  const time = (date: Date) =>
    date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${startsAt.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })} · ${time(startsAt)} to ${time(end)}`;
}

export default async function ExamSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission([
    "assessment.exam.read",
    "assessment.exam.manage",
    "assessment.exam.attendance",
  ]);
  const { id } = await params;
  const canManage = userCan(user, "assessment.exam.manage");

  const session = await db.examSession.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      startsOn: true,
      endsOn: true,
      instructions: true,
      academicYearId: true,
      term: { select: { name: true, academicYear: { select: { name: true } } } },
    },
  });
  if (!session) notFound();

  const [papers, clashes, levels, subjects, candidateCounts] = await Promise.all([
    db.examPaper.findMany({
      where: { sessionId: id },
      orderBy: [{ startsAt: "asc" }, { classLevelId: "asc" }],
      select: {
        id: true,
        title: true,
        startsAt: true,
        durationMins: true,
        maxMarks: true,
        weight: true,
        materials: true,
        notes: true,
        subjectId: true,
        classLevelId: true,
        subject: { select: { name: true } },
        classLevel: { select: { name: true } },
        invigilators: {
          select: { role: true, staff: { select: { firstName: true, lastName: true } } },
        },
        _count: { select: { seats: true } },
      },
    }),
    clashesIn(id),
    db.classLevel.findMany({
      orderBy: { sequence: "asc" },
      select: {
        id: true,
        name: true,
        sections: {
          select: {
            _count: {
              select: {
                enrollments: { where: { status: "ACTIVE" } },
              },
            },
          },
        },
      },
    }),
    db.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.examCandidate.groupBy({
      by: ["classSectionId"],
      where: { sessionId: id },
      _count: true,
    }),
  ]);

  // Candidates are stored against a section; the panel counts by year group,
  // so the sections are folded up into their levels here.
  const sectionLevel = new Map(
    (
      await db.classSection.findMany({ select: { id: true, classLevelId: true } })
    ).map((section) => [section.id, section.classLevelId]),
  );
  const enteredByLevel = new Map<string, number>();
  for (const row of candidateCounts) {
    const levelId = row.classSectionId ? sectionLevel.get(row.classSectionId) : null;
    if (!levelId) continue;
    enteredByLevel.set(levelId, (enteredByLevel.get(levelId) ?? 0) + row._count);
  }

  const levelOptions = levels.map((level) => ({
    id: level.id,
    name: level.name,
    entered: enteredByLevel.get(level.id) ?? 0,
    enrolled: level.sections.reduce(
      (sum, section) => sum + section._count.enrollments,
      0,
    ),
  }));

  const blocking = clashes.filter((clash) => clash.severity === "blocking");
  const warnings = clashes.filter((clash) => clash.severity === "warning");
  const totalCandidates = [...enteredByLevel.values()].reduce((sum, count) => sum + count, 0);
  const seated = papers.reduce((sum, paper) => sum + paper._count.seats, 0);
  const unseatedPapers = papers.filter((paper) => paper._count.seats === 0).length;

  const subjectOptions: Option[] = subjects;
  const levelPickList: Option[] = levels.map((level) => ({ id: level.id, name: level.name }));
  const firstDay = session.startsOn.toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title={session.name}
        description={[
          session.term
            ? `${session.term.name}, ${session.term.academicYear.name}`
            : null,
          `${formatDate(session.startsOn)} to ${formatDate(session.endsOn)}`,
        ]
          .filter(Boolean)
          .join("  ·  ")}
        breadcrumb={
          <Link href="/exams" className="hover:text-[var(--text)]">
            Examinations
          </Link>
        }
        action={
          <>
            <Badge tone={STATUS_TONE[session.status]}>{STATUS_LABEL[session.status]}</Badge>
            <LinkButton
              href={`/api/exams/${session.id}/timetable`}
              target="_blank"
              size="sm"
              variant="secondary"
            >
              <Printer className="size-4" />
              Timetable
            </LinkButton>
            {totalCandidates > 0 ? (
              <LinkButton
                href={`/api/exams/${session.id}/slips`}
                target="_blank"
                size="sm"
                variant="secondary"
              >
                <Printer className="size-4" />
                Candidate slips
              </LinkButton>
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Papers" value={String(papers.length)} tone="neutral" />
        <StatCard
          label="Candidates"
          value={String(totalCandidates)}
          hint="Entered, with index numbers"
          tone="neutral"
        />
        <StatCard
          label="Seats allocated"
          value={String(seated)}
          hint={
            unseatedPapers
              ? `${unseatedPapers} paper${unseatedPapers === 1 ? " has" : "s have"} no seating yet`
              : "Every paper is seated"
          }
          tone={unseatedPapers ? "warning" : "success"}
          icon={<Armchair className="size-4" />}
        />
        <StatCard
          label="Clashes"
          value={String(blocking.length)}
          hint={warnings.length ? `${warnings.length} to look at` : "Nothing blocking"}
          tone={blocking.length ? "danger" : "success"}
          icon={<TriangleAlert className="size-4" />}
        />
      </div>

      {blocking.length ? (
        <Alert tone="danger" title="These have to be settled first" className="mb-4">
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {blocking.map((clash, index) => (
              <li key={index}>{clash.message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {warnings.length ? (
        <Alert tone="warning" title="Worth a look" className="mb-4">
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {warnings.map((clash, index) => (
              <li key={index}>{clash.message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              title="Timetable"
              description="A paper is a subject for a year group at an hour."
              action={
                canManage ? (
                  <PaperEditor
                    sessionId={session.id}
                    subjects={subjectOptions}
                    levels={levelPickList}
                    defaultDate={firstDay}
                  />
                ) : null
              }
            />
            <CardBody>
              {papers.length === 0 ? (
                <p className="text-sm text-[var(--text-subtle)]">
                  No papers yet. Add the first and the seating follows from it.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {papers.map((paper) => {
                    const chief = paper.invigilators.find((one) => one.role === "CHIEF");
                    return (
                      <li key={paper.id} className="py-3">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text)]">
                              <Link
                                href={`/exams/${session.id}/papers/${paper.id}`}
                                className="font-medium hover:text-[var(--primary)]"
                              >
                                {paper.subject.name}
                                {paper.title ? `, ${paper.title}` : ""}
                              </Link>
                              <Badge tone="neutral">{paper.classLevel.name}</Badge>
                              {paper._count.seats === 0 ? (
                                <Badge tone="warning">Not seated</Badge>
                              ) : null}
                            </p>
                            <p className="numeric text-xs text-[var(--text-subtle)]">
                              {when(paper.startsAt, paper.durationMins)}
                              {paper.maxMarks ? ` · out of ${paper.maxMarks}` : ""}
                              {paper._count.seats
                                ? ` · ${paper._count.seats} seated`
                                : ""}
                            </p>
                            <p className="text-xs text-[var(--text-subtle)]">
                              {[
                                chief
                                  ? `Chief: ${chief.staff.firstName} ${chief.staff.lastName}`
                                  : "No chief invigilator",
                                paper.invigilators.length > 1
                                  ? `${paper.invigilators.length - 1} assisting`
                                  : null,
                                paper.materials,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <Link
                              href={`/exams/${session.id}/papers/${paper.id}`}
                              aria-label={`Open ${paper.subject.name}`}
                              className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                            >
                              <Eye className="size-4" />
                            </Link>
                            {canManage ? (
                              <>
                                <EditPaper
                                  sessionId={session.id}
                                  subjects={subjectOptions}
                                  levels={levelPickList}
                                  draft={{
                                    id: paper.id,
                                    subjectId: paper.subjectId,
                                    classLevelId: paper.classLevelId,
                                    title: paper.title ?? "",
                                    startsAt: localInput(paper.startsAt),
                                    durationMins: paper.durationMins,
                                    maxMarks: paper.maxMarks ? String(paper.maxMarks) : "",
                                    weight:
                                      toNumber(paper.weight) !== null
                                        ? String(toNumber(paper.weight))
                                        : "",
                                    materials: paper.materials ?? "",
                                    notes: paper.notes ?? "",
                                  }}
                                />
                                <DeletePaper id={paper.id} />
                              </>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          {canManage ? (
            <Card>
              <CardHeader
                title="Candidates"
                description="Entering a year group hands out its index numbers."
              />
              <CardBody>
                <EnterCandidates sessionId={session.id} levels={levelOptions} />
              </CardBody>
            </Card>
          ) : null}

          {canManage ? (
            <Card>
              <CardHeader title="Timetable status" />
              <CardBody>
                <PublishSession
                  sessionId={session.id}
                  status={session.status}
                  blocking={blocking.length}
                />
              </CardBody>
            </Card>
          ) : null}

          {session.instructions ? (
            <Card>
              <CardHeader
                title="Instructions to candidates"
                description="Printed on every hall list and slip."
              />
              <CardBody>
                <p className="text-sm whitespace-pre-line text-[var(--text-muted)]">
                  {session.instructions}
                </p>
              </CardBody>
            </Card>
          ) : (
            <Alert tone="info" title="No instructions set">
              The rules about phones, calculators and late arrival print at the head of
              every hall list and candidate slip. Add them when you edit these
              examinations.
            </Alert>
          )}

          {papers.length > 0 && totalCandidates === 0 ? (
            <Alert tone="warning" title="Nobody is entered yet">
              <AlertTriangle className="mb-1 inline size-4" /> Papers with no candidates
              cannot be seated. Enter the year groups first.
            </Alert>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * A Date as a datetime-local input wants it.
 *
 * Built from the local parts rather than from toISOString, which converts to
 * UTC first — an hour typed as 09:00 in Accra came back 09:00 only because
 * Ghana sits on UTC, and would be an hour out anywhere that does not.
 */
function localInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
