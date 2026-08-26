import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, TrendingUp, UserPlus, Users } from "lucide-react";

import { Alert, Badge, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { actsFor } from "@/lib/admission-rules";
import { pipeline, placesByLevel } from "@/lib/admissions";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, listName } from "@/lib/utils";

import { PipelineBoard, type BoardRow } from "./pipeline-board";
import { StartApplication } from "./start-application";

export const metadata: Metadata = { title: "Admissions" };
export const dynamic = "force-dynamic";

/**
 * The entrance papers this school sets.
 *
 * A constant rather than a settings table, because three papers is what every
 * school here sets and a table nobody ever edits is a table somebody has to
 * fill in before they can do anything. When a school needs its own list, this
 * becomes an OptionSet like the others.
 */
const PAPERS = ["English", "Mathematics", "Reasoning", "Interview task"];

export default async function AdmissionsPage() {
  const user = await requirePermission([
    "admission.read",
    "admission.manage",
    "admission.offer",
  ]);

  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true },
  });

  if (!year) {
    return (
      <>
        <PageHeader title="Admissions" description="The intake, seen whole." />
        <Alert tone="warning" title="There is no current academic year">
          An intake belongs to a year. Set one up under{" "}
          <Link href="/academics/years" className="underline">
            Academic years
          </Link>{" "}
          first.
        </Alert>
      </>
    );
  }

  const now = new Date();
  const [rows, seats, waiting, levels, enrolled] = await Promise.all([
    pipeline(year.id, now),
    placesByLevel(year.id, now),
    // Applicants with no application yet. Admitting a pupil under Students
    // creates the person; this is the intake attached to them, and the two
    // being separate is why the list can be non-empty at all.
    db.student.findMany({
      where: {
        status: { in: ["APPLICANT", "OFFERED"] },
        admissions: { none: { academicYearId: year.id } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, otherNames: true, admissionNo: true },
    }),
    db.classLevel.findMany({ orderBy: { sequence: "asc" }, select: { id: true, name: true } }),
    db.student.findMany({
      where: { status: "ENROLLED" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 2000,
      select: { id: true, firstName: true, lastName: true, otherNames: true, admissionNo: true },
    }),
  ]);

  // Filtered here, from the same table the actions enforce, so a button that
  // appears is a button that works.
  const mayOffer = userCan(user, "admission.offer");
  const mayAssess = userCan(user, "admission.assess");
  const mayInterview = userCan(user, "admission.interview");
  const mayManage = userCan(user, "admission.manage");
  // The letter route accepts either of these, so the link is gated on the
  // same pair rather than on the stage.
  const mayLetter = mayOffer || mayManage;

  const board: BoardRow[] = rows.map((row) => ({
    id: row.id,
    studentId: row.studentId,
    name: row.name,
    admissionNo: row.admissionNo,
    levelName: row.levelName,
    source: row.source,
    siblingName: row.siblingName,
    feePaid: row.feePaid,
    papers: row.papers,
    average: row.average,
    recommendation: row.recommendation,
    interviewNote: row.interviewNote,
    interviewAttendees: row.interviewAttendees,
    offerExpiresOn: row.offerExpiresOn ? formatDate(row.offerExpiresOn) : null,
    waitlistRank: row.waitlistRank,
    stage: row.stage,
    acts: actsFor(row.stage).filter((act) => {
      if (act === "ASSESS") return mayAssess;
      if (act === "INTERVIEW") return mayInterview;
      if (act === "WAITLIST") return mayManage;
      // ENROL is not offered here: it needs a class chosen, which is the
      // stage card on the pupil's own profile.
      if (act === "ENROL") return false;
      return mayOffer;
    }),
  }));

  const lapsed = board.filter((row) => row.stage === "EXPIRED");
  const accepted = board.filter((row) => row.stage === "ACCEPTED").length;
  const live = board.filter(
    (row) => !["ENROLLED", "WITHDRAWN", "DECLINED"].includes(row.stage),
  ).length;
  const places = seats.levels;
  const oversubscribed = places.filter((level) => level.over);

  return (
    <>
      <PageHeader
        title="Admissions"
        description={`${year.name}. The entrance papers, the interviews, the offers and the waiting list: the intake seen whole rather than one child at a time.`}
        action={
          userCan(user, "student.create") ? (
            <LinkButton href="/students/new" size="sm">
              <UserPlus className="size-4" />
              Admit an applicant
            </LinkButton>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Live applications"
          value={String(live)}
          hint="Still being decided"
          tone="neutral"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Offers lapsed"
          value={String(lapsed.length)}
          hint={lapsed.length ? "Places still being held" : "None outstanding"}
          tone={lapsed.length ? "danger" : "success"}
          icon={<AlertTriangle className="size-4" />}
        />
        <StatCard
          label="Accepted"
          value={String(accepted)}
          hint="Coming, and not yet enrolled"
          tone={accepted ? "success" : "neutral"}
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label="Seats free"
          value={String(places.reduce((sum, level) => sum + level.free, 0))}
          hint="Across every year group"
          tone={oversubscribed.length ? "warning" : "neutral"}
        />
      </div>

      {lapsed.length ? (
        <Alert
          tone="danger"
          title={`${lapsed.length} offer${lapsed.length === 1 ? " has" : "s have"} lapsed`}
          className="mb-4"
        >
          Nothing releases a lapsed offer on its own, so the seat is still being held.
          Ring the family, or give it away: either way it needs a decision.
        </Alert>
      ) : null}

      {seats.unplaced ? (
        <Alert tone="warning" title="Places promised against no year group" className="mb-4">
          {seats.unplaced} offer{seats.unplaced === 1 ? " is" : "s are"} outstanding without a
          year group, so {seats.unplaced === 1 ? "it belongs" : "they belong"} to no line
          below and {seats.unplaced === 1 ? "is" : "are"} counted in none of the seats.
          Set the year group on {seats.unplaced === 1 ? "it" : "them"}.
        </Alert>
      ) : null}

      {oversubscribed.length ? (
        <Alert tone="warning" title="More places promised than seats" className="mb-4">
          {oversubscribed
            .map(
              (level) =>
                `${level.name}: ${level.enrolled} enrolled and ${level.held} held, in ${level.seats} seats`,
            )
            .join(" · ")}
        </Alert>
      ) : null}

      <div className="mb-5 card p-4">
        <p className="mb-3 text-[11px] font-medium tracking-wide text-[var(--text-subtle)] uppercase">
          Places
        </p>
        <div className="flex flex-wrap gap-2">
          {places
            .filter((level) => level.seats > 0)
            .map((level) => (
              <span
                key={level.id}
                className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                {level.name}
                <Badge tone={level.over ? "danger" : level.free === 0 ? "warning" : "success"}>
                  {level.free} free
                </Badge>
                <span className="numeric text-xs text-[var(--text-subtle)]">
                  {level.enrolled}+{level.held}/{level.seats}
                </span>
              </span>
            ))}
        </div>
        <p className="mt-2 text-xs text-[var(--text-subtle)]">
          Seats are the sections&rsquo; capacities. A seat counts as taken by an enrolled
          pupil or an outstanding offer: including a lapsed one, because nothing gives
          that seat back on its own.
        </p>
      </div>

      {mayManage ? (
        <StartApplication
          applicants={waiting.map((student) => ({
            value: student.id,
            label: listName(student),
            description: student.admissionNo,
          }))}
          levels={levels.map((level) => ({ value: level.id, label: level.name }))}
          enrolled={enrolled.map((student) => ({
            value: student.id,
            label: listName(student),
            description: student.admissionNo,
          }))}
        />
      ) : null}

      <PipelineBoard
        rows={board}
        papers={PAPERS}
        today={now.toISOString().slice(0, 10)}
        mayLetter={mayLetter}
      />
    </>
  );
}
