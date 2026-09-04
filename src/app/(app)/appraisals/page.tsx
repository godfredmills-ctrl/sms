import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, Inbox, UserCheck } from "lucide-react";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requireUser, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { overall, statusLabel, statusTone } from "@/lib/appraisal-rules";
import { fullName } from "@/lib/utils";

import { OpenAppraisalForm } from "./appraisal-forms";

export const metadata: Metadata = { title: "Appraisals" };
export const dynamic = "force-dynamic";

/**
 * Appraisals: yours, the ones you conduct, and the school's.
 *
 * No permission gates the page. Every member of staff has an appraisal record
 * and it is their own; what is gated is conducting one and reading everybody
 * else's, and those are decided below rather than at the door.
 */
export default async function AppraisalsPage() {
  const user = await requireUser();

  const mayConduct = userCan(user, "staff.appraisal.conduct");
  const mayReadAll = userCan(user, "staff.appraisal.read");
  const mayManage = userCan(user, "staff.appraisal.manage");

  const select = {
    id: true,
    status: true,
    staffId: true,
    appraiserId: true,
    academicYear: { select: { name: true } },
    term: { select: { name: true } },
    staff: { select: { firstName: true, lastName: true, title: true, jobTitle: true } },
    appraiser: { select: { firstName: true, lastName: true, title: true } },
    scores: { select: { criterion: true, rating: true } },
  } as const;

  const [mine, conducting, everything, staff, years, terms] = await Promise.all([
    user.staffId
      ? db.appraisal.findMany({
          where: { staffId: user.staffId },
          orderBy: { createdAt: "desc" },
          select,
        })
      : Promise.resolve([]),

    user.staffId && mayConduct
      ? db.appraisal.findMany({
          where: { appraiserId: user.staffId },
          orderBy: { createdAt: "desc" },
          select,
        })
      : Promise.resolve([]),

    mayReadAll
      ? db.appraisal.findMany({ orderBy: { createdAt: "desc" }, take: 300, select })
      : Promise.resolve([]),

    mayManage
      ? db.staff.findMany({
          where: { status: "ACTIVE" },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: { id: true, firstName: true, lastName: true, title: true, jobTitle: true },
        })
      : Promise.resolve([]),

    mayManage
      ? db.academicYear.findMany({
          orderBy: { startDate: "desc" },
          take: 5,
          select: { id: true, name: true },
        })
      : Promise.resolve([]),

    mayManage
      ? db.term.findMany({
          where: { academicYear: { isCurrent: true } },
          orderBy: { sequence: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const waitingOnMe = conducting.filter(
    (row) => row.status === "SELF_ASSESSED" || row.status === "DRAFT" || row.status === "DISPUTED",
  );
  const waitingOnThem = mine.filter((row) => row.status === "APPRAISED" || row.status === "DRAFT");
  const disputed = everything.filter((row) => row.status === "DISPUTED");

  return (
    <>
      <PageHeader
        title="Appraisals"
        description="What the school holds about how a year has gone, written by two people rather than one."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Waiting on you"
          value={String(waitingOnMe.length + waitingOnThem.length)}
          hint={
            waitingOnMe.length + waitingOnThem.length
              ? "Yours to write, sign or answer"
              : "Nothing to do"
          }
          tone={waitingOnMe.length + waitingOnThem.length ? "warning" : "success"}
          icon={<Inbox className="size-4" />}
        />
        <StatCard
          label="You appraise"
          value={String(conducting.length)}
          hint={mayConduct ? "People assigned to you" : "You do not appraise anybody"}
          tone="neutral"
          icon={<UserCheck className="size-4" />}
        />
        {mayReadAll ? (
          <>
            <StatCard
              label="Across the school"
              value={String(everything.length)}
              tone="neutral"
              icon={<ClipboardCheck className="size-4" />}
            />
            <StatCard
              label="Not agreed"
              value={String(disputed.length)}
              hint={
                disputed.length
                  ? "The appraisee has recorded disagreement"
                  : "Every finished one was agreed"
              }
              tone={disputed.length ? "danger" : "success"}
              icon={<ClipboardCheck className="size-4" />}
            />
          </>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Yours"
            description="Your own record. You write the first half of it."
          />
          <CardBody className="space-y-2">
            {mine.length === 0 ? (
              <EmptyState
                icon={<ClipboardCheck className="size-5" />}
                title="Nothing opened for you yet"
                description="Whoever manages staff opens an appraisal for a year and names who will conduct it."
              />
            ) : (
              mine.map((row) => <Row key={row.id} row={row} showWho="appraiser" />)
            )}
          </CardBody>
        </Card>

        {mayConduct ? (
          <Card>
            <CardHeader
              title="People you appraise"
              description="Nobody appraises themselves, so your own is not here."
            />
            <CardBody className="space-y-2">
              {conducting.length === 0 ? (
                <EmptyState
                  icon={<UserCheck className="size-5" />}
                  title="Nobody is assigned to you"
                  description="Whoever manages staff decides who appraises whom."
                />
              ) : (
                conducting.map((row) => <Row key={row.id} row={row} showWho="staff" />)
              )}
            </CardBody>
          </Card>
        ) : null}
      </div>

      {mayManage ? (
        <Card className="mt-4">
          <CardHeader
            title="Open an appraisal"
            description="One per person per period. The appraiser is chosen here, because this system holds no reporting line and inventing one would put the wrong name on a personnel record."
          />
          <CardBody>
            <OpenAppraisalForm
              staff={staff.map((person) => ({
                value: person.id,
                label: fullName(person),
                description: person.jobTitle ?? undefined,
              }))}
              years={years.map((year) => ({ value: year.id, label: year.name }))}
              terms={terms.map((term) => ({ value: term.id, label: term.name }))}
            />
          </CardBody>
        </Card>
      ) : null}

      {mayReadAll && everything.length ? (
        <Card className="mt-4">
          <CardHeader title="Across the school" description="Newest first." />
          <CardBody className="space-y-2">
            {everything.map((row) => (
              <Row key={row.id} row={row} showWho="staff" />
            ))}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

type RowData = {
  id: string;
  status: string;
  academicYear: { name: string };
  term: { name: string } | null;
  staff: { firstName: string; lastName: string; title: string | null; jobTitle: string | null };
  appraiser: { firstName: string; lastName: string; title: string | null };
  scores: Array<{ criterion: string; rating: number | null }>;
};

function Row({ row, showWho }: { row: RowData; showWho: "staff" | "appraiser" }) {
  const summary = overall(row.scores);
  const who = showWho === "staff" ? fullName(row.staff) : fullName(row.appraiser);

  return (
    <Link
      href={`/appraisals/${row.id}`}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] p-3 transition-colors hover:bg-[var(--bg-subtle)]"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{who}</span>
        <span className="block truncate text-xs text-[var(--text-subtle)]">
          {row.term?.name ?? row.academicYear.name}
          {showWho === "staff" && row.staff.jobTitle ? ` · ${row.staff.jobTitle}` : ""}
          {showWho === "appraiser" ? " · appraised by them" : ""}
        </span>
      </span>

      {summary.complete ? (
        <span className="numeric text-sm font-semibold">
          {summary.average} · {summary.band}
        </span>
      ) : (
        <span className="text-xs text-[var(--text-subtle)]">
          {summary.rated} of {summary.of} rated
        </span>
      )}

      <Badge tone={statusTone(row.status) as never}>{statusLabel(row.status)}</Badge>
    </Link>
  );
}
