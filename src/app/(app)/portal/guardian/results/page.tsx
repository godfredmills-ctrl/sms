import type { Metadata } from "next";
import Link from "next/link";
import { Award, Download, FileText } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, fullName, ordinal, toNumber } from "@/lib/utils";

import { NotLinked } from "../not-linked";
import { wardsFor } from "../wards";

export const metadata: Metadata = { title: "Results" };
export const dynamic = "force-dynamic";

export default async function GuardianResultsPage() {
  const user = await requireUser();
  if (!user.guardianId) return <NotLinked title="Results" />;

  const links = await wardsFor(user.guardianId);
  if (!links.length) return <NotLinked title="Results" />;

  // Only guardians flagged to receive reports see them. A parent without
  // custody may legitimately be on the contact list without being entitled to
  // academic records, and that distinction is the school's to make.
  const entitled = links.filter((link) => link.receivesReports);

  const reports = entitled.length
    ? await db.reportCard.findMany({
        where: {
          status: "PUBLISHED",
          studentId: { in: entitled.map((link) => link.student.id) },
        },
        orderBy: { createdAt: "desc" },
        include: {
          term: { select: { name: true } },
          academicYear: { select: { name: true } },
          student: {
            select: { id: true, firstName: true, lastName: true, otherNames: true },
          },
          lines: {
            orderBy: { sortKey: "asc" },
            include: { subject: { select: { name: true } } },
          },
        },
      })
    : [];

  return (
    <>
      <PageHeader
        title="Results"
        description="Published report cards for your children."
      />

      {entitled.length < links.length ? (
        <Alert tone="info" className="mb-4">
          Reports are shown only for children whose record lists you as a recipient of
          academic reports. Contact the office if that is wrong.
        </Alert>
      ) : null}

      {reports.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="size-5" />}
            title="No published results"
            description="Report cards appear here once the school publishes them."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardHeader
                title={`${fullName(report.student)} · ${report.term.name}`}
                description={`${report.academicYear.name}${
                  report.publishedAt ? ` · published ${formatDate(report.publishedAt)}` : ""
                }`}
                action={
                  <>
                    {report.averageScore ? (
                      <Badge tone="violet">
                        {(toNumber(report.averageScore) ?? 0).toFixed(1)}%
                      </Badge>
                    ) : null}
                    {report.positionInClass ? (
                      <Badge tone="success">
                        <Award className="size-2.5" />
                        {ordinal(report.positionInClass)} of {report.classSize}
                      </Badge>
                    ) : null}
                    <a
                      href={`/api/report-cards/${report.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                    >
                      <Download className="size-3.5" />
                      PDF
                    </a>
                    <Link
                      href={`/reports/cards/${report.id}`}
                      className="inline-flex h-8 items-center rounded-lg border border-[var(--border-strong)] px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                    >
                      Full report
                    </Link>
                  </>
                }
              />
              <CardBody>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                        <th className="py-1.5 pr-3 font-medium">Subject</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Total</th>
                        <th className="py-1.5 pr-3 font-medium">Grade</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Class avg</th>
                        <th className="py-1.5 font-medium">Remark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.lines.map((line) => {
                        const score = toNumber(line.totalScore);
                        const average = toNumber(line.classAverage);
                        const above = score !== null && average !== null && score >= average;

                        return (
                          <tr
                            key={line.id}
                            className="border-b border-[var(--border)] last:border-0"
                          >
                            <td className="py-1.5 pr-3">{line.subject.name}</td>
                            <td
                              className={`numeric py-1.5 pr-3 text-right font-medium ${
                                score === null
                                  ? ""
                                  : above
                                    ? "text-[var(--success)]"
                                    : "text-[var(--warning)]"
                              }`}
                            >
                              {score?.toFixed(1) ?? "—"}
                            </td>
                            <td className="py-1.5 pr-3">
                              {line.grade ? (
                                <Badge tone="neutral">{line.grade}</Badge>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="numeric py-1.5 pr-3 text-right text-[var(--text-muted)]">
                              {average?.toFixed(1) ?? "—"}
                            </td>
                            <td className="py-1.5 text-[var(--text-muted)]">
                              {line.remark ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {report.formTeacherRemark ? (
                  <div className="mt-3 border-t border-[var(--border)] pt-3">
                    <p className="text-xs font-medium text-[var(--text-muted)]">
                      Form teacher
                    </p>
                    <p className="text-sm">{report.formTeacherRemark}</p>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
