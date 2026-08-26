import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CalendarOff,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
} from "lucide-react";

import { Badge, Card, CardBody, CardHeader, LinkButton } from "@/components/ui";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { payrollPeriodLabel } from "@/lib/payroll";
import { ownSectionIdsFor, taughtBy } from "@/lib/scope";
import { formatDate } from "@/lib/utils";

/**
 * The panels that answer "what is waiting on me".
 *
 * Every one of these returns null when there is nothing outstanding: a
 * dashboard that says "0 registers to take" every afternoon teaches people
 * to stop reading it.
 */

type Viewer = {
  id: string;
  staffId?: string | null;
  permissions: Set<string>;
};

/** Monday-first day number, the way the timetable stores it. */
function today(): number {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

// ---------------------------------------------------------------------------
// My day — the lessons ahead
// ---------------------------------------------------------------------------

export async function MyDayPanel({ viewer }: { viewer: Viewer }) {
  if (!viewer.staffId) return null;

  const lessons = await db.timetableSlot.findMany({
    where: { dayOfWeek: today(), offering: taughtBy(viewer.staffId) },
    orderBy: [{ startTime: "asc" }, { periodIndex: "asc" }],
    select: {
      id: true,
      startTime: true,
      endTime: true,
      room: true,
      classSection: {
        select: { name: true, classLevel: { select: { name: true } } },
      },
      offering: {
        select: { room: true, subject: { select: { name: true, colour: true } } },
      },
    },
  });

  if (!lessons.length) return null;

  // The lesson happening now, or the next one — the single fact a teacher
  // opens a dashboard for.
  const clock = new Date();
  const minutes = clock.getHours() * 60 + clock.getMinutes();
  const asMinutes = (time: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const current = lessons.find((lesson) => {
    const start = asMinutes(lesson.startTime);
    const end = asMinutes(lesson.endTime);
    return start !== null && end !== null && minutes >= start && minutes < end;
  });
  const next = lessons.find((lesson) => {
    const start = asMinutes(lesson.startTime);
    return start !== null && start > minutes;
  });
  const highlight = current ?? next;

  return (
    <Card>
      <CardHeader
        title="Your day"
        description={
          highlight
            ? `${current ? "Now" : "Next"}: ${highlight.classSection.classLevel.name} ${highlight.classSection.name}, ${highlight.offering?.subject.name ?? "-"} at ${highlight.startTime}`
            : "Your lessons are done for today."
        }
        action={
          <LinkButton href="/my-timetable" variant="outline" size="sm">
            <CalendarClock className="size-4" />
            Full week
          </LinkButton>
        }
      />
      <div className="flex gap-2 overflow-x-auto px-5 pb-4 pt-1">
        {lessons.map((lesson) => {
          const isNow = lesson.id === current?.id;
          return (
            <div
              key={lesson.id}
              className={`min-w-40 shrink-0 rounded-xl border p-3 ${
                isNow
                  ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                  : "border-[var(--border)]"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {lesson.offering?.subject.colour ? (
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: lesson.offering.subject.colour }}
                  />
                ) : null}
                <p className="truncate text-sm font-semibold">
                  {lesson.classSection.classLevel.name} {lesson.classSection.name}
                </p>
              </div>
              <p className="truncate text-xs text-[var(--text-muted)]">
                {lesson.offering?.subject.name ?? "-"}
              </p>
              <p className="numeric mt-1 text-xs text-[var(--text-subtle)]">
                {lesson.startTime}-{lesson.endTime}
                {lesson.room ?? lesson.offering?.room
                  ? ` · ${lesson.room ?? lesson.offering?.room}`
                  : ""}
              </p>
            </div>
          );
        })}
        <div aria-hidden className="w-px shrink-0" />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Registers still to take
// ---------------------------------------------------------------------------

export async function MyRegistersPanel({ viewer }: { viewer: Viewer }) {
  if (!viewer.staffId) return null;

  const term = await db.term.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  if (!term) return null;

  // Their own classes: the ones they teach and the register they own.
  const sectionIds = await ownSectionIdsFor(viewer.staffId);
  if (!sectionIds.length) return null;

  const [sections, taken] = await Promise.all([
    db.classSection.findMany({
      where: { id: { in: sectionIds }, isActive: true },
      orderBy: [{ classLevel: { sequence: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        classLevel: { select: { name: true } },
        _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
      },
    }),
    db.attendanceSession.findMany({
      where: {
        termId: term.id,
        classSectionId: { in: sectionIds },
        date: { gte: startOfToday() },
      },
      select: { classSectionId: true },
    }),
  ]);

  const done = new Set(taken.map((session) => session.classSectionId));
  const outstanding = sections.filter(
    (section) => !done.has(section.id) && section._count.enrollments > 0,
  );

  if (!outstanding.length) return null;

  return (
    <Card>
      <CardHeader
        title="Registers still to take"
        description={`${outstanding.length} of your ${sections.length} class${sections.length === 1 ? "" : "es"} today.`}
        action={
          <LinkButton href="/attendance" size="sm">
            <ClipboardCheck className="size-4" />
            Take attendance
          </LinkButton>
        }
      />
      <CardBody className="flex flex-wrap gap-2">
        {outstanding.map((section) => (
          <Link
            key={section.id}
            href={`/attendance?class=${section.id}`}
            className="rounded-full border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-1 text-xs font-medium text-[var(--warning)]"
          >
            {section.classLevel.name} {section.name}
            <span className="ml-1 opacity-70">
              {section._count.enrollments}
            </span>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Marking waiting on me
// ---------------------------------------------------------------------------

export async function MyMarkingPanel({ viewer }: { viewer: Viewer }) {
  if (!viewer.staffId) return null;

  const [submissions, quizzes] = await Promise.all([
    db.submission.count({
      where: {
        status: "SUBMITTED",
        score: null,
        assignment: { course: { offering: taughtBy(viewer.staffId) } },
      },
    }),
    db.quizAttempt.count({
      where: {
        status: "SUBMITTED",
        quiz: { course: { offering: taughtBy(viewer.staffId) } },
      },
    }),
  ]);

  if (!submissions && !quizzes) return null;

  return (
    <Card>
      <CardHeader
        title="Waiting to be marked"
        description="Work your students have handed in."
        action={
          <LinkButton href="/lms" variant="outline" size="sm">
            <ClipboardList className="size-4" />
            Open courses
          </LinkButton>
        }
      />
      <CardBody className="flex flex-wrap gap-4">
        {submissions ? (
          <div>
            <p className="numeric text-2xl font-semibold">{submissions}</p>
            <p className="text-xs text-[var(--text-muted)]">
              assignment{submissions === 1 ? "" : "s"}
            </p>
          </div>
        ) : null}
        {quizzes ? (
          <div>
            <p className="numeric text-2xl font-semibold">{quizzes}</p>
            <p className="text-xs text-[var(--text-muted)]">
              quiz attempt{quizzes === 1 ? "" : "s"} needing a human
            </p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Approvals and acknowledgements
// ---------------------------------------------------------------------------

export async function ApprovalsPanel({ viewer }: { viewer: Viewer }) {
  const canDecideLeave = viewer.permissions.has("staff.leave.manage");

  const [pendingLeave, memos, myLeave] = await Promise.all([
    canDecideLeave
      ? db.staffLeave.count({ where: { status: "PENDING" } })
      : Promise.resolve(0),
    db.memoRecipient.count({
      where: {
        userId: viewer.id,
        acknowledgedAt: null,
        archivedAt: null,
        memo: { requiresAck: true, status: { not: "DRAFT" } },
      },
    }),
    viewer.staffId
      ? db.staffLeave.count({ where: { staffId: viewer.staffId, status: "PENDING" } })
      : Promise.resolve(0),
  ]);

  if (!pendingLeave && !memos && !myLeave) return null;

  return (
    <Card>
      <CardHeader title="Waiting on you" />
      <CardBody className="space-y-2">
        {pendingLeave ? (
          <Link
            href="/leave"
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--bg-subtle)]"
          >
            <CalendarOff className="size-4 text-[var(--warning)]" />
            <span className="flex-1">
              {pendingLeave} leave request{pendingLeave === 1 ? "" : "s"} to decide
            </span>
            <Badge tone="warning">Decide</Badge>
          </Link>
        ) : null}
        {memos ? (
          <Link
            href="/communications/memos"
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--bg-subtle)]"
          >
            <FileSignature className="size-4 text-[var(--primary)]" />
            <span className="flex-1">
              {memos} memo{memos === 1 ? "" : "s"} to acknowledge
            </span>
            <Badge tone="primary">Read</Badge>
          </Link>
        ) : null}
        {myLeave ? (
          <p className="px-1 text-xs text-[var(--text-subtle)]">
            Your own leave request is still pending a decision.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// My pay — quiet, and last
// ---------------------------------------------------------------------------

export async function MyPayPanel({ viewer }: { viewer: Viewer }) {
  if (!viewer.staffId) return null;

  const slip = await db.payslip.findFirst({
    where: { staffId: viewer.staffId, run: { status: "PAID" } },
    orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }],
    select: {
      id: true,
      netMinor: true,
      run: { select: { year: true, month: true, paidAt: true } },
    },
  });
  if (!slip) return null;

  return (
    <Card>
      <CardHeader
        title="Your last payslip"
        description={`${payrollPeriodLabel(slip.run.year, slip.run.month)}${
          slip.run.paidAt ? ` · paid ${formatDate(slip.run.paidAt)}` : ""
        }`}
        action={
          <LinkButton href="/payroll/mine" variant="outline" size="sm">
            <Banknote className="size-4" />
            All payslips
          </LinkButton>
        }
      />
      <CardBody>
        <p className="numeric text-2xl font-semibold">
          {formatMoney(slip.netMinor, "GHS")}
        </p>
        <p className="text-xs text-[var(--text-muted)]">net pay</p>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The clinic today
// ---------------------------------------------------------------------------

export async function ClinicTodayPanel({ viewer }: { viewer: Viewer }) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [todayCount, sentHome, recent] = await Promise.all([
    db.clinicVisit.count({ where: { visitedAt: { gte: startOfToday() } } }),
    db.clinicVisit.count({
      where: { visitedAt: { gte: weekAgo }, outcome: "SENT_HOME" },
    }),
    db.clinicVisit.findMany({
      where: { visitedAt: { gte: startOfToday() } },
      orderBy: { visitedAt: "desc" },
      take: 4,
      select: {
        id: true,
        complaint: true,
        outcome: true,
        medical: {
          select: {
            student: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    }),
  ]);

  // Nothing today and nothing this week: the clinic has nothing to report.
  if (!todayCount && !sentHome) return null;

  const canLog = viewer.permissions.has("student.medical.update");

  return (
    <Card>
      <CardHeader
        title="The clinic today"
        description={`${todayCount} visit${todayCount === 1 ? "" : "s"} today · ${sentHome} sent home this week`}
        action={
          <LinkButton href="/clinic" variant="outline" size="sm">
            {canLog ? "Log a visit" : "Open the clinic"}
          </LinkButton>
        }
      />
      {recent.length ? (
        <ul className="divide-y divide-[var(--border)]">
          {recent.map((visit) => (
            <li key={visit.id} className="flex items-center gap-2 px-5 py-2 text-sm">
              <Link
                href={`/students/${visit.medical.student.id}?tab=medical`}
                className="min-w-0 flex-1 truncate font-medium hover:text-[var(--primary)]"
              >
                {visit.medical.student.firstName} {visit.medical.student.lastName}
              </Link>
              <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]">
                {visit.complaint}
              </span>
              {visit.outcome === "SENT_HOME" || visit.outcome === "REFERRED" ? (
                <Badge tone="warning">
                  <AlertTriangle className="size-2.5" />
                  {visit.outcome === "SENT_HOME" ? "Sent home" : "Referred"}
                </Badge>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <CardBody className="text-sm text-[var(--text-muted)]">
          Nobody has been in today.
        </CardBody>
      )}
    </Card>
  );
}
