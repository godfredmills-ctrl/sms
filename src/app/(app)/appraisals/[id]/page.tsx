import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  PageHeader,
} from "@/components/ui";
import { requireUser, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  appraiserEditable,
  evidence,
  overall,
  selfEditable,
  statusHint,
  statusLabel,
  statusTone,
  type Evidence,
  type Role,
} from "@/lib/appraisal-rules";
import { factsFor } from "@/lib/appraisals";
import { formatDate, formatDateTime, fullName } from "@/lib/utils";

import { AppraisalForm, MoveForm, SelfAssessmentForm } from "../appraisal-forms";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const row = await db.appraisal
    .findUnique({
      where: { id },
      select: { staff: { select: { firstName: true, lastName: true } } },
    })
    .catch(() => null);
  return {
    title: row ? `Appraisal: ${row.staff.firstName} ${row.staff.lastName}` : "Appraisal",
  };
}

/**
 * One appraisal, from both sides.
 *
 * The order down the page is the order it happens in and the order it should
 * be read in: what the person said about their own year first, then the facts
 * the system holds, then the judgement. Putting the ratings at the top would
 * make everything under them look like justification.
 */
export default async function AppraisalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const row = await db.appraisal.findUnique({
    where: { id },
    include: {
      staff: { select: { id: true, firstName: true, lastName: true, title: true, jobTitle: true, department: true } },
      appraiser: { select: { firstName: true, lastName: true, title: true } },
      academicYear: { select: { name: true, startDate: true, endDate: true } },
      term: { select: { name: true, startDate: true, endDate: true } },
      scores: true,
      targets: { orderBy: { sortKey: "asc" } },
    },
  });
  if (!row) notFound();

  const roles: Role[] = [];
  if (user.staffId === row.staffId) roles.push("appraisee");
  if (user.staffId === row.appraiserId) roles.push("appraiser");

  // Your own, the ones you conduct, or the whole school if that is your job.
  // An appraisal is a personnel record and nobody else has any business in it.
  if (roles.length === 0 && !userCan(user, "staff.appraisal.read")) notFound();

  const isAppraisee = roles.includes("appraisee");
  const isAppraiser = roles.includes("appraiser");

  const summary = overall(row.scores);
  const periodLabel = row.term?.name ?? row.academicYear.name;

  /*
   * The evidence: the snapshot if there is one, otherwise as it stands now.
   *
   * Once an appraisal is recorded the figures are frozen, because a year later
   * the numbers underneath a signed document would no longer be the numbers
   * the person signed against. Before that they are live, so an appraiser
   * writing today is looking at today.
   */
  const facts: Evidence[] = Array.isArray(row.evidence)
    ? (row.evidence as unknown as Evidence[])
    : evidence(
        await factsFor(row.staffId, {
          from: row.term?.startDate ?? row.academicYear.startDate,
          to: row.term?.endDate ?? row.academicYear.endDate,
          academicYearId: row.academicYearId,
        }),
        periodLabel,
      );

  return (
    <>
      <PageHeader
        title={fullName(row.staff)}
        description={`${periodLabel}. ${statusHint(row.status)}`}
        breadcrumb={
          <Link href="/appraisals" className="hover:text-[var(--text)]">
            Appraisals
          </Link>
        }
        action={
          <>
            {summary.complete ? (
              <Badge tone="neutral">
                {summary.average} · {summary.band}
              </Badge>
            ) : null}
            <Badge tone={statusTone(row.status) as never}>{statusLabel(row.status)}</Badge>
          </>
        }
      />

      {row.status === "DISPUTED" && row.response ? (
        <Alert tone="danger" title="Not agreed" className="mb-4">
          {row.response}
        </Alert>
      ) : null}

      {row.status === "AGREED" && row.response ? (
        <Alert tone="success" title="Agreed, and they added" className="mb-4">
          {row.response}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Their own account"
              description={
                row.selfAssessedAt
                  ? `Written ${formatDate(row.selfAssessedAt)}, before anybody rated them.`
                  : "Written by the appraisee, before anybody rates them."
              }
            />
            <CardBody>
              <SelfAssessmentForm
                id={row.id}
                value={row.selfAssessment ?? ""}
                editable={isAppraisee && selfEditable(row.status)}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="What the system holds"
              description={
                row.evidence
                  ? "As it stood on the day this was recorded."
                  : "As it stands now. Frozen when the appraisal is recorded."
              }
            />
            <CardBody className="space-y-3">
              {facts.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Nothing recorded for this person over this period.
                </p>
              ) : (
                facts.map((fact) => (
                  <div key={fact.label} className="flex flex-wrap items-baseline gap-x-3">
                    <span className="w-44 shrink-0 text-xs tracking-wider text-[var(--text-subtle)] uppercase">
                      {fact.label}
                    </span>
                    <span className="numeric text-sm font-medium">{fact.value}</span>
                    <span className="w-full text-xs leading-relaxed text-[var(--text-muted)]">
                      {fact.note}
                    </span>
                  </div>
                ))
              )}

              <p className="border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--text-muted)]">
                These are counts, not a score, and nothing here is added up into
                one. A teacher whose notes are late every week because they are
                covering for two absent colleagues is not a worse teacher than
                one with an empty timetable and immaculate paperwork. The
                ratings below come from somebody who has been in the room.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="The appraisal"
              description={
                row.appraisedAt
                  ? `Recorded ${formatDate(row.appraisedAt)} by ${fullName(row.appraiser)}.`
                  : `To be written by ${fullName(row.appraiser)}.`
              }
            />
            <CardBody className="space-y-4">
              <AppraisalForm
                id={row.id}
                scores={row.scores.map((score) => ({
                  criterion: score.criterion,
                  rating: score.rating,
                  note: score.note,
                }))}
                comment={row.appraiserComment ?? ""}
                targets={row.targets.map((target) => ({
                  description: target.description,
                  reviewBy: target.reviewBy
                    ? target.reviewBy.toISOString().slice(0, 10)
                    : "",
                }))}
                editable={isAppraiser && appraiserEditable(row.status)}
              />

              {!isAppraiser && row.appraiserComment ? (
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {row.appraiserComment}
                </p>
              ) : null}

              {!isAppraiser && row.targets.length ? (
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                    Targets
                  </p>
                  <ul className="space-y-1">
                    {row.targets.map((target) => (
                      <li key={target.id} className="text-sm">
                        {target.description}
                        {target.reviewBy ? (
                          <span className="text-[var(--text-subtle)]">
                            {" "}
                            (by {formatDate(target.reviewBy)})
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="What happens next" />
            <CardBody>
              <MoveForm id={row.id} status={row.status} roles={roles} />

              {isAppraiser && row.status === "APPRAISED" ? (
                <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
                  It is with them now. Only the person being appraised can agree
                  to it or disagree with it, which is the whole of what the
                  signature means.
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="The record" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Appraisee", value: fullName(row.staff) },
                  { label: "Post", value: row.staff.jobTitle ?? "Not stated" },
                  { label: "Department", value: row.staff.department ?? "Not stated" },
                  { label: "Appraiser", value: fullName(row.appraiser) },
                  { label: "Period", value: periodLabel },
                  {
                    label: "Self-assessment",
                    value: row.selfAssessedAt ? formatDateTime(row.selfAssessedAt) : "Not sent",
                  },
                  {
                    label: "Appraised",
                    value: row.appraisedAt ? formatDateTime(row.appraisedAt) : "Not yet",
                  },
                  {
                    label: "Answered",
                    value: row.respondedAt ? formatDateTime(row.respondedAt) : "Not yet",
                  },
                  {
                    label: "Overall",
                    value: summary.complete
                      ? `${summary.average} · ${summary.band}`
                      : `${summary.rated} of ${summary.of} headings rated`,
                  },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
