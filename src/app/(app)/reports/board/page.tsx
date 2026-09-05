import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Printer } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  LinkButton,
  PageHeader,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { boardReport, periodsFor } from "@/lib/board-report";
import { completeness, gapLabel, gaps, printable } from "@/lib/board-report-rules";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Report to the board" };
export const dynamic = "force-dynamic";

/**
 * The paper a governing board or a proprietor actually receives.
 *
 * Every figure on it exists on some other screen. What has never existed is
 * the one document, which is why it gets assembled by hand the week before the
 * meeting out of six screens and a calculator, and why board papers and the
 * software disagree in ways nobody can adjudicate.
 *
 * The gaps are on the front page rather than buried. A board given twenty
 * figures does not notice that six are missing; told so, it asks about the
 * six, which is the only reason to admit them.
 */
export default async function BoardReportPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  await requirePermission(["report.read", "report.build"]);

  const { term: requested } = await searchParams;

  const terms = await db.term.findMany({
    orderBy: [{ startDate: "desc" }],
    take: 12,
    select: {
      id: true,
      name: true,
      startDate: true,
      isCurrent: true,
      academicYear: { select: { name: true } },
    },
  });

  const chosen =
    terms.find((entry) => entry.id === requested) ??
    terms.find((entry) => entry.isCurrent) ??
    terms[0];

  if (!chosen) {
    return (
      <>
        <PageHeader title="Report to the board" />
        <Alert tone="warning" title="There are no terms set up">
          A report to the board is a report on a term.{" "}
          <Link href="/academics/years" className="underline">
            Academic years
          </Link>{" "}
          is where they are created.
        </Alert>
      </>
    );
  }

  const { period, previous } = await periodsFor(chosen.id);
  if (!period) return null;

  const report = await boardReport(period, previous);
  const sections = printable(report.sections);
  const state = completeness(sections);
  const holes = gaps(sections);

  return (
    <>
      <PageHeader
        title="Report to the board"
        description={`${report.school}. ${period.label}, to ${formatDate(period.to)}.`}
        breadcrumb={
          <Link href="/reports" className="hover:text-[var(--text)]">
            Reports
          </Link>
        }
        action={
          <LinkButton
            href={`/api/board-report?term=${chosen.id}`}
            target="_blank"
            size="sm"
          >
            <Printer className="size-4" />
            Print
          </LinkButton>
        }
      />

      {terms.length > 1 ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {terms.map((entry) => (
            <Link
              key={entry.id}
              href={`/reports/board?term=${entry.id}`}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                entry.id === chosen.id
                  ? "border-transparent bg-[var(--button)] text-[var(--button-text)]"
                  : "border-[var(--border)] hover:bg-[var(--bg-subtle)]"
              }`}
            >
              {entry.name}, {entry.academicYear.name}
            </Link>
          ))}
        </div>
      ) : null}

      <Card className="mb-4">
        <CardBody className="space-y-2">
          <p className="text-sm">{state.wording}</p>
          {holes.length ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--text-muted)]">
                What the school cannot yet state, and why
              </summary>
              <ul className="mt-2 space-y-1">
                {holes.map((hole) => (
                  <li key={`${hole.section}-${hole.label}`} className="text-xs leading-relaxed">
                    <span className="font-medium">{gapLabel(hole)}:</span>{" "}
                    <span className="text-[var(--text-muted)]">{hole.why}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <p className="text-xs text-[var(--text-muted)]">
            Assembled {formatDateTime(report.generatedAt)}. Every figure says
            what it counted, so anything here can be checked against the screen
            it came from.
          </p>
        </CardBody>
      </Card>

      <div className="space-y-4">
        {sections.map((section) => (
          <Card key={section.key}>
            <CardHeader title={section.title} description={section.blurb} />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.figures.map((entry) => (
                  <div key={entry.label}>
                    <p className="text-xs tracking-wider text-[var(--text-subtle)] uppercase">
                      {entry.label}
                    </p>

                    {entry.value === null ? (
                      <>
                        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[var(--text-muted)] italic">
                          <AlertTriangle className="size-3.5 text-[var(--warning)]" />
                          Not available
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
                          {entry.missing}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="numeric mt-0.5 flex flex-wrap items-baseline gap-2 text-lg font-semibold">
                          {entry.value}
                          {entry.change ? (
                            <Badge
                              tone={
                                entry.change.direction === "level"
                                  ? "neutral"
                                  : entry.change.direction === "up"
                                    ? "success"
                                    : "warning"
                              }
                            >
                              {entry.change.wording}
                            </Badge>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
                          {entry.basis}
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {section.notes?.length ? (
                <div className="border-t border-[var(--border)] pt-3">
                  {section.notes.map((note) => (
                    <p
                      key={note}
                      className="text-xs leading-relaxed text-[var(--text-muted)]"
                    >
                      {note}
                    </p>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
        A comparison with the previous term is drawn only where the two periods
        are of comparable length. A term four weeks in, set against a whole one,
        reads as a collapse that did not happen, and the arithmetic saying so
        would be read out in a meeting by somebody who believed it.
      </p>
    </>
  );
}
