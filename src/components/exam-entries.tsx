import { Armchair, CalendarClock } from "lucide-react";

import { Alert, Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import type { PortalExamEntry } from "@/lib/exam-portal";
import { formatDate } from "@/lib/utils";

/**
 * A candidate's own examinations, as they see them.
 *
 * The index number is the largest thing on the card, because it is the one
 * thing they are asked for at the door of the hall and the one thing they
 * forget. Everything else is the papers they personally sit — where, when, in
 * which seat, and what they may bring.
 *
 * Shared between the pupil's portal and the parent's, so the two cannot come
 * to show different halls for the same morning.
 */
export function ExamEntries({
  entries,
  showNames,
}: {
  entries: PortalExamEntry[];
  /** A parent with two children needs to know whose slip this is. */
  showNames?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock className="size-6" />}
        title="No examinations timetabled"
        description="Nothing has been published yet. The timetable appears here as soon as the school issues it."
      />
    );
  }

  return (
    <div className="space-y-5">
      {entries.map((entry) => (
        <Card key={`${entry.sessionId}-${entry.studentId}`}>
          <CardHeader
            title={entry.sessionName}
            description={`${formatDate(entry.startsOn, "long")} to ${formatDate(
              entry.endsOn,
              "long",
            )}${showNames ? `  ·  ${entry.studentName}` : ""}`}
          />
          <CardBody className="space-y-4">
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="text-[11px] font-medium tracking-wide text-[var(--text-subtle)] uppercase">
                Index number
              </p>
              <p className="numeric text-2xl font-semibold text-[var(--text)]">
                {entry.candidateNo}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Write this on every script.
              </p>
            </div>

            {entry.papers.length === 0 ? (
              <p className="text-sm text-[var(--text-subtle)]">
                No seats have been allocated yet. Check back nearer the time.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left">
                      <th className="py-2 pr-3 font-medium text-[var(--text-muted)]">
                        When
                      </th>
                      <th className="py-2 pr-3 font-medium text-[var(--text-muted)]">
                        Paper
                      </th>
                      <th className="py-2 pr-3 font-medium text-[var(--text-muted)]">
                        Where
                      </th>
                      <th className="py-2 font-medium text-[var(--text-muted)]">Bring</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.papers.map((paper) => {
                      const end = new Date(
                        paper.startsAt.getTime() + paper.durationMins * 60_000,
                      );
                      const clock = (date: Date) =>
                        date.toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        });

                      return (
                        <tr
                          key={paper.paperId}
                          className="border-b border-[var(--border)] last:border-0"
                        >
                          <td className="py-2 pr-3 align-top whitespace-nowrap">
                            <p className="numeric">
                              {paper.startsAt.toLocaleDateString("en-GB", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              })}
                            </p>
                            <p className="numeric text-xs text-[var(--text-subtle)]">
                              {clock(paper.startsAt)}-{clock(end)}
                            </p>
                          </td>
                          <td className="py-2 pr-3 align-top">
                            <p className="text-[var(--text)]">
                              {paper.subject}
                              {paper.title ? `, ${paper.title}` : ""}
                            </p>
                            {paper.attended ? (
                              <Badge
                                tone={paper.attended === "PRESENT" ? "success" : "danger"}
                              >
                                {paper.attended === "PRESENT" ? "Sat" : "Marked absent"}
                              </Badge>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 align-top">
                            <p className="text-[var(--text)]">{paper.hall ?? "-"}</p>
                            {paper.seatNo ? (
                              <p className="numeric inline-flex items-center gap-1 text-xs text-[var(--text-subtle)]">
                                <Armchair className="size-3" />
                                {paper.seatNo}
                              </p>
                            ) : null}
                          </td>
                          <td className="py-2 align-top text-[var(--text-muted)]">
                            {paper.materials ?? "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {entry.instructions ? (
              <Alert tone="info" title="Rules for the hall">
                <span className="whitespace-pre-line">{entry.instructions}</span>
              </Alert>
            ) : null}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
