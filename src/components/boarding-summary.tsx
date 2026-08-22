import { BedDouble, Phone } from "lucide-react";

import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { EXEAT_STATUSES, isOverdue } from "@/lib/boarding-rules";
import type { PortalBed, PortalExeat } from "@/lib/boarding-portal";
import { formatDate, formatDateTime } from "@/lib/utils";

const TONE = new Map(EXEAT_STATUSES.map((entry) => [entry.value, entry] as const));

/**
 * A boarder's room and their leave-out, as their family sees it.
 *
 * The house parent's name and telephone number sit at the top, because that is
 * the number a parent looks for at ten at night and the moment they cannot
 * find it is the moment they need it.
 *
 * Shared between the pupil's portal and the parent's, so the two cannot come
 * to show different rooms for the same child.
 */
export function BoardingSummary({
  beds,
  exeats,
  showNames,
  now,
}: {
  beds: PortalBed[];
  exeats: Map<string, PortalExeat[]>;
  /** A parent with two children needs to know whose room this is. */
  showNames?: boolean;
  /** The server's clock, so overdue does not depend on the reader's phone. */
  now: Date;
}) {
  if (beds.length === 0) {
    return (
      <EmptyState
        icon={<BedDouble className="size-6" />}
        title="Not in boarding"
        description="No room is allocated. If that is wrong, the boarding office will know."
      />
    );
  }

  return (
    <div className="space-y-5">
      {beds.map((bed) => {
        const theirs = exeats.get(bed.studentId) ?? [];
        return (
          <Card key={bed.studentId}>
            <CardHeader
              title={showNames ? bed.studentName : bed.houseName}
              description={
                showNames
                  ? `${bed.houseName} · ${bed.roomName}${bed.bedLabel ? ` · ${bed.bedLabel}` : ""}`
                  : `${bed.roomName}${bed.bedLabel ? ` · ${bed.bedLabel}` : ""} · since ${formatDate(bed.since)}`
              }
            />
            <CardBody className="space-y-4">
              <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="text-[11px] font-medium tracking-wide text-[var(--text-subtle)] uppercase">
                  House parent
                </p>
                <p className="text-[var(--text)]">{bed.houseParent ?? "Not yet appointed"}</p>
                {bed.houseParentPhone ? (
                  <a
                    href={`tel:${bed.houseParentPhone}`}
                    className="numeric mt-1 inline-flex items-center gap-1.5 text-sm text-[var(--primary)]"
                  >
                    <Phone className="size-3.5" />
                    {bed.houseParentPhone}
                  </a>
                ) : null}
              </div>

              <div>
                <p className="mb-2 text-[11px] font-medium tracking-wide text-[var(--text-subtle)] uppercase">
                  Leave-out
                </p>
                {theirs.length === 0 ? (
                  <p className="text-sm text-[var(--text-subtle)]">
                    No leave-out recorded. A boarder off the compound is signed out to a
                    named adult and signed back in, and it appears here.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {theirs.map((exeat) => {
                      const status = TONE.get(
                        exeat.status as (typeof EXEAT_STATUSES)[number]["value"],
                      );
                      const late = isOverdue(exeat, now);
                      return (
                        <li key={exeat.id} className="py-2">
                          <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text)]">
                            {exeat.destination}
                            {late ? (
                              <Badge tone="danger">Overdue</Badge>
                            ) : status ? (
                              <Badge tone={status.tone}>{status.label}</Badge>
                            ) : null}
                          </p>
                          <p className="text-xs text-[var(--text-subtle)]">
                            {exeat.reason} · with {exeat.releasedToName} ·{" "}
                            {formatDateTime(exeat.departsAt)} to{" "}
                            {formatDateTime(exeat.dueBackAt)}
                            {exeat.signedOutAt
                              ? ` · left ${formatDateTime(exeat.signedOutAt)}`
                              : ""}
                            {exeat.signedInAt
                              ? ` · back ${formatDateTime(exeat.signedInAt)}`
                              : ""}
                          </p>
                          {exeat.decisionNote ? (
                            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                              {exeat.decisionNote}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
