import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CalendarRange, GraduationCap } from "lucide-react";

import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
} from "@/components/ui";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, fullName, humanise, toNumber } from "@/lib/utils";

import { PromotionForm, type PromotionSection } from "./promotion-form";

export const metadata: Metadata = { title: "Promotions" };
export const dynamic = "force-dynamic";

/**
 * The end-of-year move: classes go up, finalists graduate, exceptions repeat.
 *
 * This screen is how the system survives September. Everything else assumes
 * enrolments in the current year; this is the one place that creates next
 * year's.
 */
export default async function PromotionsPage() {
  await requirePermission("student.promote");

  const years = await db.academicYear.findMany({
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, startDate: true, isCurrent: true },
  });

  const fromYear = years.find((year) => year.isCurrent) ?? null;
  const toYears = fromYear
    ? years.filter((year) => year.startDate > fromYear.startDate)
    : [];

  // Every active class in the current year, with its students and their
  // latest published averages — the number a promotion meeting argues over.
  const sections = fromYear
    ? await db.classSection.findMany({
        where: {
          isActive: true,
          enrollments: { some: { academicYearId: fromYear.id, status: "ACTIVE" } },
        },
        orderBy: [{ classLevel: { sequence: "asc" } }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          classLevel: { select: { name: true, sequence: true } },
          enrollments: {
            where: { academicYearId: fromYear.id, status: "ACTIVE" },
            select: {
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  otherNames: true,
                  reportCards: {
                    where: { academicYearId: fromYear.id, status: "PUBLISHED" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { averageScore: true },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  const maxSequence = Math.max(
    0,
    ...sections.map((section) => section.classLevel.sequence),
  );

  const formSections: PromotionSection[] = sections.map((section) => ({
    id: section.id,
    label: `${section.classLevel.name} ${section.name}`,
    levelSequence: section.classLevel.sequence,
    isFinal: section.classLevel.sequence === maxSequence,
    students: section.enrollments
      .map((enrollment) => ({
        id: enrollment.student.id,
        name: fullName(enrollment.student),
        average: toNumber(enrollment.student.reportCards[0]?.averageScore),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));

  const recent = await db.promotionRecord.findMany({
    orderBy: { decidedAt: "desc" },
    take: 12,
    select: {
      id: true,
      decision: true,
      decidedAt: true,
      decidedBy: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Promotions"
        description="Classes move up, finalists graduate, exceptions repeat — one class at a time, with the record kept."
        action={<RefreshButton />}
      />

      {!fromYear ? (
        <Card>
          <EmptyState
            icon={<CalendarRange className="size-5" />}
            title="No current academic year"
            description="Mark one as current under Academic years."
          />
        </Card>
      ) : toYears.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ArrowUpRight className="size-5" />}
            title="Create next year first"
            description={`Promotion moves students out of ${fromYear.name} into a later academic year, and none exists yet.`}
          />
          <div className="px-5 pb-5 text-center">
            <LinkButton href="/academics/years" variant="outline" size="sm">
              Open Academic years
            </LinkButton>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader
              title={`Move a class out of ${fromYear.name}`}
              description="Everyone is promoted unless marked to repeat; a final-level class graduates instead."
            />
            <PromotionForm
              sections={formSections}
              fromYear={{ id: fromYear.id, name: fromYear.name }}
              toYears={toYears.map((year) => ({ value: year.id, label: year.name }))}
            />
          </Card>

          <div>
            <Card className="lg:sticky lg:top-20">
              <CardHeader title="Recent decisions" />
              {recent.length ? (
                <ul className="divide-y divide-[var(--border)]">
                  {recent.map((record) => (
                    <li key={record.id} className="flex items-center gap-2 px-4 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {record.student.firstName} {record.student.lastName}
                      </span>
                      <Badge
                        tone={
                          record.decision === "GRADUATED"
                            ? "violet"
                            : record.decision === "REPEATED"
                              ? "warning"
                              : "success"
                        }
                      >
                        {record.decision === "GRADUATED" ? (
                          <GraduationCap className="size-2.5" />
                        ) : null}
                        {humanise(record.decision)}
                      </Badge>
                      <span
                        className="shrink-0 text-[10px] text-[var(--text-subtle)]"
                        title={record.decidedBy ?? undefined}
                      >
                        {formatDate(record.decidedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 pb-5 text-xs text-[var(--text-subtle)]">
                  Nothing decided yet this year.
                </p>
              )}
              <p className="border-t border-[var(--border)] px-4 py-3 text-[11px] text-[var(--text-subtle)]">
                Full history sits on each student&rsquo;s profile, and every run is in
                the <Link href="/audit" className="underline">audit trail</Link>.
              </p>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
