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

export default async function ComposePage() {
  await requirePermission([
    "communication.sms.send",
    "communication.email.send",
    "communication.push.send",
  ]);

  const [sections, templates, recentJobs] = await Promise.all([
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
