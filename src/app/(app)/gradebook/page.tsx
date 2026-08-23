import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ClipboardList, TrendingUp, Users } from "lucide-react";

import { AiInsightCard, type InsightView } from "@/components/ai-insight";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatCard,
} from "@/components/ui";
import { isAiEnabled } from "@/lib/ai/client";
import { getCachedInsight } from "@/lib/ai/insights";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { taughtBy } from "@/lib/scope";
import { toNumber } from "@/lib/utils";

import { generateTeachingInsightAction } from "./actions";

export const metadata: Metadata = { title: "Gradebook" };
export const dynamic = "force-dynamic";

export default async function GradebookPage() {
  const user = await requirePermission(["assessment.read", "assessment.grade"]);

  const term = await db.term.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true, isLocked: true, resultsDueDate: true },
  });

  if (!term) {
    return (
      <>
        <PageHeader title="Gradebook" />
        <Alert tone="warning" title="No current term">
          Mark an academic term as current before entering marks.
        </Alert>
      </>
    );
  }

  // Teachers see their own classes; heads and admins see everything.
  const seesAll = userCan(user, "assessment.publish");

  const offerings = await db.subjectOffering.findMany({
    where: {
      termId: term.id,
      isActive: true,
      ...(seesAll ? {} : taughtBy(user.staffId ?? "")),
    },
    orderBy: [
      { classSection: { classLevel: { sequence: "asc" } } },
      { subject: { sortKey: "asc" } },
    ],
    select: {
      id: true,
      subject: { select: { name: true, passMark: true } },
      teacher: { select: { firstName: true, lastName: true } },
      classSection: {
        select: {
          name: true,
          classLevel: { select: { name: true } },
          // ACTIVE only. Enrolment rows are never deleted — a leaver is
          // flipped to WITHDRAWN and a promotion writes a fresh row for the
          // new year — so an unfiltered count is every pupil the class has
          // ever held. Measured against that, a fully marked class read 45%
          // and "0/4 fully marked", while the mark sheet itself (which does
          // filter, at gradebook/[offeringId]/page.tsx) read 100%.
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
      },
      assessments: {
        select: {
          weight: true,
          maxScore: true,
          isPublished: true,
          scores: { select: { score: true, isAbsent: true } },
        },
      },
    },
  });

  const rows = offerings.map((offering) => {
    const studentCount = offering.classSection._count.enrollments;
    const expected = studentCount * offering.assessments.length;
    const entered = offering.assessments.reduce(
      (sum, assessment) => sum + assessment.scores.length,
      0,
    );

    // Class average across every marked, non-absent score.
    const percentages: number[] = [];
    for (const assessment of offering.assessments) {
      const max = toNumber(assessment.maxScore) ?? 100;
      for (const score of assessment.scores) {
        if (score.isAbsent || score.score === null) continue;
        percentages.push(((toNumber(score.score) ?? 0) / max) * 100);
      }
    }

    return {
      id: offering.id,
      subject: offering.subject.name,
      passMark: offering.subject.passMark,
      className: `${offering.classSection.classLevel.name} ${offering.classSection.name}`,
      teacherName: offering.teacher
        ? `${offering.teacher.firstName} ${offering.teacher.lastName}`
        : null,
      studentCount,
      assessmentCount: offering.assessments.length,
      totalWeight: offering.assessments.reduce(
        (sum, assessment) => sum + (toNumber(assessment.weight) ?? 0),
        0,
      ),
      unpublished: offering.assessments.filter((entry) => !entry.isPublished).length,
      progress: expected ? Math.round((entered / expected) * 100) : 0,
      average: percentages.length
        ? Math.round(
            (percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10,
          ) / 10
        : null,
    };
  });

  const cachedInsight = user.staffId
    ? await getCachedInsight("TEACHING_EFFECTIVENESS", user.staffId)
    : null;

  const insight: InsightView | null = cachedInsight
    ? {
        title: cachedInsight.title,
        narrative: cachedInsight.narrative,
        findings: (cachedInsight.findings as InsightView["findings"]) ?? [],
        actions: (cachedInsight.actions as InsightView["actions"]) ?? [],
        createdAt: cachedInsight.createdAt,
        model: cachedInsight.model,
      }
    : null;

  const fullyMarked = rows.filter((row) => row.progress >= 100).length;
  const overallAverage = rows.filter((row) => row.average !== null);

  return (
    <>
      <PageHeader
        title="Gradebook"
        description={
          seesAll
            ? `All classes for ${term.name}.`
            : `The classes you teach this ${term.name.toLowerCase()}.`
        }
      />

      {term.isLocked ? (
        <Alert tone="warning" title="This term is locked" className="mb-5">
          Marks cannot be changed until an administrator reopens it.
        </Alert>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Classes"
          value={rows.length}
          tone="violet"
          icon={<BookOpen className="size-4" />}
        />
        <StatCard
          label="Students taught"
          value={rows.reduce((sum, row) => sum + row.studentCount, 0)}
          tone="info"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Fully marked"
          value={`${fullyMarked}/${rows.length}`}
          tone={fullyMarked === rows.length && rows.length > 0 ? "success" : "warning"}
          icon={<ClipboardList className="size-4" />}
        />
        <StatCard
          label="Average score"
          value={
            overallAverage.length
              ? `${(
                  overallAverage.reduce((sum, row) => sum + (row.average ?? 0), 0) /
                  overallAverage.length
                ).toFixed(1)}%`
              : "—"
          }
          tone="teal"
          icon={<TrendingUp className="size-4" />}
        />
      </div>

      {!seesAll && userCan(user, "ai.insight.view") ? (
        <div className="mb-5">
          <AiInsightCard
            insight={insight}
            enabled={(await isAiEnabled())}
            onGenerate={
              userCan(user, "ai.insight.generate")
                ? async () => {
                    "use server";
                    await generateTeachingInsightAction(term.id);
                  }
                : undefined
            }
            emptyHint="Claude will read the sequence of results in each of your classes and say what is working, what is not, and what to change."
          />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen className="size-5" />}
            title="No classes assigned"
            description="You are not currently assigned to teach any subject this term."
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/gradebook/${row.id}`}
              className="card block p-4 transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{row.subject}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {row.className}
                    {seesAll && row.teacherName ? ` · ${row.teacherName}` : ""}
                  </p>
                </div>
                {row.average !== null ? (
                  <Badge tone={row.average >= row.passMark ? "success" : "danger"}>
                    {row.average.toFixed(1)}%
                  </Badge>
                ) : null}
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Marks entered</span>
                  <span className="numeric font-medium">{row.progress}%</span>
                </div>
                <ProgressBar
                  value={row.progress}
                  tone={
                    row.progress >= 100
                      ? "success"
                      : row.progress > 0
                        ? "warning"
                        : "neutral"
                  }
                  label="Marking progress"
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="neutral">{row.studentCount} students</Badge>
                <Badge tone="neutral">{row.assessmentCount} assessments</Badge>
                {row.totalWeight !== 100 ? (
                  <Badge tone="warning">{row.totalWeight}% weighted</Badge>
                ) : null}
                {row.unpublished > 0 ? (
                  <Badge tone="info">{row.unpublished} unpublished</Badge>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
