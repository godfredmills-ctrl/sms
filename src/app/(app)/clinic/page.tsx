import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, HeartPulse, Home, Stethoscope, Thermometer } from "lucide-react";

import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { Pager, pageOf } from "@/components/pager";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { seesWholeSchool } from "@/lib/scope";
import { formatDateTime, humanise, listName, relativeTime, toNumber } from "@/lib/utils";

import { VisitForm } from "./visit-form";

export const metadata: Metadata = { title: "Clinic" };
export const dynamic = "force-dynamic";

const PER_PAGE = 25;

/**
 * The school clinic's day.
 *
 * The visit log existed as a table and a panel on each student's medical tab,
 * but the nurse — whose login the demo prints on first seed — had no page of
 * their own: logging a visit meant finding the student's profile first, which
 * is exactly backwards when the child is standing in front of you.
 */
export default async function ClinicPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("student.medical.read");
  const canLog = userCan(user, "student.medical.update");

  // The day-book is the clinic's record of the whole school. A teacher holds
  // student.medical.read so that an allergy shows on their own class list —
  // not so that they can read every child's complaints. The nurse, the head
  // and the office (student.read) see the book; a teacher does not.
  if (!seesWholeSchool(user) && !canLog) notFound();

  const params = await searchParams;
  const { page, skip, take } = pageOf(params, PER_PAGE);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [visits, total, todayCount, weekCount, sentHomeWeek, students] =
    await Promise.all([
      db.clinicVisit.findMany({
        orderBy: { visitedAt: "desc" },
        skip,
        take,
        include: {
          medical: {
            select: {
              allergies: true,
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  otherNames: true,
                  admissionNo: true,
                  enrollments: {
                    where: { status: "ACTIVE" },
                    take: 1,
                    select: {
                      classSection: {
                        select: { name: true, classLevel: { select: { name: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      db.clinicVisit.count(),
      db.clinicVisit.count({ where: { visitedAt: { gte: startOfToday } } }),
      db.clinicVisit.count({ where: { visitedAt: { gte: weekAgo } } }),
      db.clinicVisit.count({
        where: { visitedAt: { gte: weekAgo }, outcome: "SENT_HOME" },
      }),
      canLog
        ? db.student.findMany({
            where: { status: "ENROLLED" },
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
            take: 1500,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              otherNames: true,
              admissionNo: true,
            },
          })
        : Promise.resolve([]),
    ]);

  return (
    <>
      <PageHeader
        title="Clinic"
        description="Visits, treatments and outcomes — with the emergency contacts one tick away."
        action={<RefreshButton />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Today"
          value={todayCount}
          tone={todayCount ? "info" : "success"}
          icon={<Stethoscope className="size-4" />}
        />
        <StatCard
          label="This week"
          value={weekCount}
          tone="violet"
          icon={<HeartPulse className="size-4" />}
        />
        <StatCard
          label="Sent home this week"
          value={sentHomeWeek}
          tone={sentHomeWeek ? "warning" : "success"}
          icon={<Home className="size-4" />}
        />
        <StatCard label="All recorded visits" value={total.toLocaleString()} tone="neutral" />
      </div>

      <div className={canLog ? "grid gap-4 lg:grid-cols-[1fr_360px]" : ""}>
        <div className="space-y-3">
          {visits.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Stethoscope className="size-5" />}
                title="No visits recorded"
                description={canLog ? "Log the first with the form." : "A quiet clinic."}
              />
            </Card>
          ) : (
            <Card>
              <CardHeader title="Visits" description="Newest first." />
              <ul className="divide-y divide-[var(--border)]">
                {visits.map((visit) => {
                  const student = visit.medical.student;
                  const section = student.enrollments[0]?.classSection;
                  const temperature = toNumber(visit.temperature);
                  const allergies =
                    (visit.medical.allergies as Array<{
                      name?: string;
                      severity?: string;
                    }> | null) ?? [];
                  const critical = allergies.filter(
                    (allergy) =>
                      allergy.severity === "SEVERE" ||
                      allergy.severity === "ANAPHYLAXIS",
                  );

                  return (
                    <li key={visit.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/students/${student.id}?tab=medical`}
                          className="text-sm font-medium hover:text-[var(--primary)]"
                        >
                          {listName(student)}
                        </Link>
                        <span className="text-xs text-[var(--text-subtle)]">
                          {student.admissionNo}
                          {section
                            ? ` · ${section.classLevel.name} ${section.name}`
                            : ""}
                        </span>
                        {/* The allergy the nurse must not learn about mid-dose. */}
                        {critical.map((allergy) => (
                          <Badge key={allergy.name} tone="danger">
                            <AlertTriangle className="size-2.5" />
                            {allergy.name}
                          </Badge>
                        ))}
                        <span className="flex-1" />
                        <span
                          className="text-xs text-[var(--text-subtle)]"
                          title={formatDateTime(visit.visitedAt)}
                        >
                          {relativeTime(visit.visitedAt)}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {visit.complaint}
                        {temperature !== null ? (
                          <span
                            className={`numeric ml-2 inline-flex items-center gap-0.5 text-xs ${
                              temperature >= 38
                                ? "font-semibold text-[var(--danger)]"
                                : "text-[var(--text-subtle)]"
                            }`}
                          >
                            <Thermometer className="size-3" />
                            {temperature.toFixed(1)}°C
                          </span>
                        ) : null}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge
                          tone={
                            visit.outcome === "SENT_HOME" ||
                            visit.outcome === "REFERRED"
                              ? "warning"
                              : "success"
                          }
                        >
                          {humanise(visit.outcome ?? "RETURNED_TO_CLASS")}
                        </Badge>
                        {visit.medicationGiven ? (
                          <span className="text-[var(--text-subtle)]">
                            {visit.medicationGiven}
                          </span>
                        ) : null}
                        {visit.guardianNotified ? (
                          <Badge tone="info">Family notified</Badge>
                        ) : null}
                        {visit.attendedBy ? (
                          <span className="text-[var(--text-subtle)]">
                            · {visit.attendedBy}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Pager
            basePath="/clinic"
            searchParams={params}
            page={page}
            perPage={PER_PAGE}
            total={total}
            label="visits"
          />
        </div>

        {canLog ? (
          <div>
            <Card className="lg:sticky lg:top-20">
              <CardHeader
                title="Log a visit"
                description="The child in front of you, not their profile page."
              />
              <VisitForm
                students={students.map((student) => ({
                  value: student.id,
                  label: listName(student),
                  description: student.admissionNo,
                }))}
              />
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
