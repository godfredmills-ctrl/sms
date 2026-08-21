import type { Metadata } from "next";
import Link from "next/link";
import { Award, Download, FileText, TrendingUp } from "lucide-react";

import { TrendChart } from "@/components/charts";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatScoreCell } from "@/lib/marks-math";
import { formatDate, ordinal, toNumber } from "@/lib/utils";

import { NotLinked } from "../not-linked";

export const metadata: Metadata = { title: "My Results" };
export const dynamic = "force-dynamic";

export default async function StudentResultsPage() {
  const user = await requireUser();
  if (!user.studentId) return <NotLinked title="My Results" />;

  const reports = await db.reportCard.findMany({
    where: { studentId: user.studentId, status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    include: {
      term: { select: { name: true } },
      academicYear: { select: { name: true } },
      classSection: {
        select: { name: true, classLevel: { select: { name: true } } },
      },
      lines: {
        orderBy: { sortKey: "asc" },
        include: { subject: { select: { name: true } } },
      },
    },
  });

  const latest = reports[0];

  // Oldest first, so the trend reads left to right the way a school year runs.
  const trend = [...reports]
    .reverse()
    .map((report) => ({
      term: `${report.term.name} ${report.academicYear.name}`,
      average: toNumber(report.averageScore) ?? 0,
    }))
    .filter((point) => point.average > 0);

  const best = reports.reduce<{ score: number; term: string } | null>(
    (found, report) => {
      const score = toNumber(report.averageScore) ?? 0;
      if (!found || score > found.score) return { score, term: report.term.name };
      return found;
    },
    null,
  );

  return (
    <>
      <PageHeader
        title="My results"
        description="Published report cards, subject by subject."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Latest average"
          value={
            latest ? `${(toNumber(latest.averageScore) ?? 0).toFixed(1)}%` : "—"
          }
          hint={latest?.term.name}
          tone="violet"
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label="Position"
          value={
            latest?.positionInClass
              ? `${ordinal(latest.positionInClass)}`
              : "—"
          }
          hint={latest?.classSize ? `of ${latest.classSize}` : undefined}
          tone="success"
          icon={<Award className="size-4" />}
        />
        <StatCard
          label="Best term"
          value={best ? `${best.score.toFixed(1)}%` : "—"}
          hint={best?.term}
          tone="teal"
        />
        <StatCard
          label="Reports published"
          value={reports.length}
          tone="info"
          icon={<FileText className="size-4" />}
        />
      </div>

      {reports.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="size-5" />}
            title="No published results"
            description="Your report cards will appear here once the school publishes them."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {trend.length > 1 ? (
            <TrendChart
              title="Average over time"
              description="Each published term, oldest first."
              rows={trend}
              categoryKey="term"
              categoryLabel="Term"
              series={[{ key: "average", label: "Average", format: "percent" }]}
              yDomain={[0, 100]}
              area
            />
          ) : null}

          {reports.map((report) => (
            <Card key={report.id}>
              <CardHeader
                title={`${report.term.name} · ${report.academicYear.name}`}
                description={`${report.classSection.classLevel.name} ${report.classSection.name}${
                  report.publishedAt ? ` · published ${formatDate(report.publishedAt)}` : ""
                }`}
                action={
                  <>
                    {report.overallGrade ? (
                      <Badge tone="success">{report.overallGrade}</Badge>
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
                        <th className="py-1.5 pr-3 text-right font-medium">CA</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Exam</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Total</th>
                        <th className="py-1.5 pr-3 font-medium">Grade</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Position</th>
                        <th className="py-1.5 font-medium">Remark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.lines.map((line) => (
                        <tr
                          key={line.id}
                          className="border-b border-[var(--border)] last:border-0"
                        >
                          <td className="py-1.5 pr-3">{line.subject.name}</td>
                          <td className="numeric py-1.5 pr-3 text-right">
                            {formatScoreCell(toNumber(line.caScore), {
                              absent: line.caAbsent,
                            })}
                          </td>
                          <td className="numeric py-1.5 pr-3 text-right">
                            {formatScoreCell(toNumber(line.examScore), {
                              absent: line.examAbsent,
                            })}
                          </td>
                          <td className="numeric py-1.5 pr-3 text-right font-medium">
                            {toNumber(line.totalScore)?.toFixed(1) ?? "—"}
                          </td>
                          <td className="py-1.5 pr-3">
                            {line.grade ? <Badge tone="neutral">{line.grade}</Badge> : "—"}
                          </td>
                          <td className="numeric py-1.5 pr-3 text-right">
                            {line.position ?? "—"}
                          </td>
                          <td className="py-1.5 text-[var(--text-muted)]">
                            {line.remark ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {report.formTeacherRemark || report.headTeacherRemark ? (
                  <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                    {report.formTeacherRemark ? (
                      <div>
                        <p className="text-xs font-medium text-[var(--text-muted)]">
                          Form teacher
                        </p>
                        <p className="text-sm">{report.formTeacherRemark}</p>
                      </div>
                    ) : null}
                    {report.headTeacherRemark ? (
                      <div>
                        <p className="text-xs font-medium text-[var(--text-muted)]">
                          Head teacher
                        </p>
                        <p className="text-sm">{report.headTeacherRemark}</p>
                      </div>
                    ) : null}
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
