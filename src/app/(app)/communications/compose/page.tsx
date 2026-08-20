import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardHeader, PageHeader, StatusBadge } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { relativeTime } from "@/lib/utils";

import { ComposeForm } from "./compose-form";

export const metadata: Metadata = { title: "Send a message" };
export const dynamic = "force-dynamic";

/**
 * The bulk bar on the students list links here with ?students=a,b,c&channel=SMS.
 * Until this page read those, both were dropped on the floor: the form opened
 * with its own defaults — every guardian in the school — and the secretary who
 * had ticked twelve children sent to eight hundred families instead. The
 * audience layer supported studentIds all along (lib/messaging AudienceFilter);
 * nothing was passing them.
 */
export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission([
    "communication.sms.send",
    "communication.email.send",
    "communication.push.send",
  ]);

  const params = await searchParams;

  const requestedIds = String(params.students ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 500);

  const requestedChannel = String(params.channel ?? "").toUpperCase();
  const initialChannel = (["SMS", "EMAIL", "PUSH", "IN_APP"] as const).find(
    (option) => option === requestedChannel,
  );

  const [sections, templates, recentJobs, preselected] = await Promise.all([
    db.classSection.findMany({
      where: { isActive: true },
      orderBy: [{ classLevel: { sequence: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        classLevel: { select: { name: true } },
        _count: { select: { enrollments: true } },
      },
    }),
    db.messageTemplate.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, subject: true, body: true, smsBody: true },
    }),
    db.communicationJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        title: true,
        channel: true,
        status: true,
        totalCount: true,
        sentCount: true,
        failedCount: true,
        actualCostMinor: true,
        createdAt: true,
      },
    }),
    // Resolved to names, not just counted: "12 students selected" is a number
    // to be trusted or doubted, and the names are what let someone notice the
    // selection is not the one they made.
    requestedIds.length
      ? db.student.findMany({
          where: { id: { in: requestedIds } },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: { id: true, firstName: true, lastName: true, admissionNo: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Send a message"
        description="Reach parents, students or staff by SMS, email, push or the in-app inbox."
        breadcrumb={
          <Link href="/communications/announcements" className="hover:text-[var(--text)]">
            Communication
          </Link>
        }
      />

      <ComposeForm
        classes={sections.map((section) => ({
          value: section.id,
          label: `${section.classLevel.name} ${section.name}`,
          description: `${section._count.enrollments} students`,
        }))}
        templates={templates}
        initialChannel={initialChannel}
        initialStudents={preselected.map((student) => ({
          id: student.id,
          name: `${student.firstName} ${student.lastName}`,
        }))}
      />

      {recentJobs.length ? (
        <Card className="mt-5">
          <CardHeader
            title="Recent sends"
            description="Delivery is tracked per recipient."
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-muted)]">
                    Send
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-muted)]">
                    Channel
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                    Sent
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                    Failed
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                    Cost
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-[var(--text-muted)]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job) => (
                  <tr key={job.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2">
                      <p className="font-medium">{job.title}</p>
                      <p className="text-xs text-[var(--text-subtle)]">
                        {relativeTime(job.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-xs">{job.channel}</td>
                    <td className="numeric px-4 py-2 text-right">
                      {job.sentCount}/{job.totalCount}
                    </td>
                    <td
                      className={`numeric px-4 py-2 text-right ${
                        job.failedCount ? "text-[var(--danger)]" : ""
                      }`}
                    >
                      {job.failedCount}
                    </td>
                    <td className="numeric px-4 py-2 text-right">
                      {job.actualCostMinor ? formatMoney(job.actualCostMinor) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <StatusBadge status={job.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </>
  );
}
