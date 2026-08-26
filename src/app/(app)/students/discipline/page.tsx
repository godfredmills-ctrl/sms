import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  FolderClosed,
  Gavel,
  ShieldAlert,
  UserX,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  Textarea,
} from "@/components/ui";
import { Pager, pageOf } from "@/components/pager";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, humanise, listName, relativeTime } from "@/lib/utils";

import { ownSectionIdsFor } from "@/lib/scope";

import { resolveIncidentAction } from "./actions";
import { CONDUCT_STATUS_TONES } from "./fields";
import { IncidentForm } from "./incident-form";

export const metadata: Metadata = { title: "Discipline" };
export const dynamic = "force-dynamic";

const PER_PAGE = 25;

/**
 * The discipline desk.
 *
 * The conduct tab on each student's profile shows their record; this page is
 * the school-wide view — the open cases that need deciding, and the form that
 * writes the record. Until this page existed, the DisciplinaryRecord table
 * was written only by the seed: the permission was declared, the tab was
 * built, and the form teacher had nowhere to report the fight.
 */
export default async function DisciplinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("student.discipline.manage");

  // A form teacher with student.read.own sees their classes' cases, exactly
  // as the students list scopes them — not the whole school's incident feed
  // and roster.
  const schoolWide = userCan(user, "student.read");
  const ownSections = schoolWide ? [] : await ownSectionIdsFor(user.staffId);
  const studentScope = schoolWide
    ? {}
    : {
        student: {
          enrollments: {
            some: { classSectionId: { in: ownSections }, status: "ACTIVE" as const },
          },
        },
      };

  const params = await searchParams;
  const { page, skip, take } = pageOf(params, PER_PAGE);

  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const quarterAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [records, total, openCount, monthCount, suspensions, students] =
    await Promise.all([
      db.disciplinaryRecord.findMany({
        where: studentScope,
        orderBy: { incidentAt: "desc" },
        skip,
        take,
        include: {
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
      }),
      db.disciplinaryRecord.count({ where: studentScope }),
      db.disciplinaryRecord.count({
        where: { ...studentScope, status: { not: "RESOLVED" } },
      }),
      db.disciplinaryRecord.count({
        where: { ...studentScope, incidentAt: { gte: monthAgo } },
      }),
      db.disciplinaryRecord.count({
        where: {
          ...studentScope,
          incidentAt: { gte: quarterAgo },
          sanction: { in: ["SUSPENSION", "EXPULSION"] },
        },
      }),
      db.student.findMany({
        where: schoolWide
          ? { status: "ENROLLED" }
          : {
              status: "ENROLLED",
              enrollments: {
                some: { classSectionId: { in: ownSections }, status: "ACTIVE" },
              },
            },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: 1500,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          otherNames: true,
          admissionNo: true,
        },
      }),
    ]);

  return (
    <>
      <PageHeader
        title="Discipline"
        description="Incidents, sanctions and resolutions: recorded once, read for years."
        action={<RefreshButton />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open cases"
          value={openCount}
          tone={openCount ? "warning" : "success"}
          icon={<FolderClosed className="size-4" />}
        />
        <StatCard
          label="Last 30 days"
          value={monthCount}
          tone="info"
          icon={<ShieldAlert className="size-4" />}
        />
        <StatCard
          label="Suspensions (90 days)"
          value={suspensions}
          tone={suspensions ? "danger" : "success"}
          icon={<UserX className="size-4" />}
        />
        <StatCard label="All records" value={total.toLocaleString()} tone="neutral" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {records.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ShieldAlert className="size-5" />}
                title="No incidents recorded"
                description="A clean school: or a quiet form. Record the first alongside."
              />
            </Card>
          ) : (
            <Card>
              <CardHeader
                title="Incidents"
                description={schoolWide ? "Newest first." : "Your classes, newest first."}
              />
              <ul className="divide-y divide-[var(--border)]">
                {records.map((record) => {
                  const section = record.student.enrollments[0]?.classSection;
                  const open = record.status !== "RESOLVED";

                  return (
                    <li key={record.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/students/${record.student.id}?tab=conduct`}
                          className="text-sm font-medium hover:text-[var(--primary)]"
                        >
                          {listName(record.student)}
                        </Link>
                        <span className="text-xs text-[var(--text-subtle)]">
                          {record.student.admissionNo}
                          {section
                            ? ` · ${section.classLevel.name} ${section.name}`
                            : ""}
                        </span>
                        <Badge
                          tone={
                            record.severity === "SEVERE" || record.severity === "MAJOR"
                              ? "danger"
                              : record.severity === "MODERATE"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {humanise(record.severity)}
                        </Badge>
                        <Badge tone={CONDUCT_STATUS_TONES[record.status] ?? "neutral"}>
                          {humanise(record.status)}
                        </Badge>
                        <span className="flex-1" />
                        <span
                          className="text-xs text-[var(--text-subtle)]"
                          title={formatDate(record.incidentAt, "long")}
                        >
                          {relativeTime(record.incidentAt)}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        <span className="font-medium text-[var(--text)]">
                          {humanise(record.category)}
                        </span>
                        {record.location ? ` · ${record.location}` : ""} -{" "}
                        {record.description}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        {record.sanction ? (
                          <Badge
                            tone={
                              record.sanction === "SUSPENSION" ||
                              record.sanction === "EXPULSION"
                                ? "danger"
                                : "warning"
                            }
                          >
                            <Gavel className="size-2.5" />
                            {humanise(record.sanction)}
                            {record.suspensionDays
                              ? ` · ${record.suspensionDays}d`
                              : ""}
                          </Badge>
                        ) : null}
                        {record.guardianNotified ? (
                          <Badge tone="info">Family notified</Badge>
                        ) : null}
                        {record.reportedBy ? (
                          <span className="text-[var(--text-subtle)]">
                            Reported by {record.reportedBy}
                          </span>
                        ) : null}
                        {record.resolution ? (
                          <span className="text-[var(--text-subtle)]">
                            · {record.resolution}
                            {record.handledBy ? `, ${record.handledBy}` : ""}
                          </span>
                        ) : null}
                      </div>

                      {open ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-medium text-[var(--primary)]">
                            Resolve this case
                          </summary>
                          <form
                            action={resolveIncidentAction}
                            className="mt-2 flex items-start gap-2"
                          >
                            <input type="hidden" name="id" value={record.id} />
                            <Textarea
                              name="resolution"
                              rows={1}
                              className="flex-1"
                              placeholder="How it was concluded: detention served, apology made, parents met…"
                            />
                            <Button type="submit" size="sm" variant="outline">
                              <CheckCircle2 className="size-3.5" />
                              Resolve
                            </Button>
                          </form>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Pager
            basePath="/students/discipline"
            searchParams={params}
            page={page}
            perPage={PER_PAGE}
            total={total}
            label="records"
          />
        </div>

        <div>
          <Card className="lg:sticky lg:top-20">
            <CardHeader
              title="Record an incident"
              description="Factual, dated, and on the file the day it happened."
            />
            <IncidentForm
              students={students.map((student) => ({
                value: student.id,
                label: listName(student),
                description: student.admissionNo,
              }))}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
