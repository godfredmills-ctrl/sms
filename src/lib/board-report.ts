import "server-only";

import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { outstandingTotal } from "@/lib/requisition-rules";
import {
  budgetUse,
  change,
  collectionRate,
  comparable,
  figure,
  rateOf,
  unavailable,
  withChange,
  type Section,
} from "@/lib/board-report-rules";

/**
 * The termly report to the board, assembled from every module.
 *
 * Nothing here computes anything a screen does not already compute; the point
 * is that it computes them all at once, from the same database, on one piece
 * of paper. What a board currently receives is assembled by hand the week
 * before the meeting out of six screens and a calculator, which is why board
 * papers and the software disagree, quietly and routinely.
 *
 * Every figure carries what it counted. Every figure the school cannot state
 * honestly says so rather than showing a zero. Comparisons with the previous
 * term are drawn only where the two periods are of comparable length, which
 * they usually are not for a term still running.
 */

export type Period = {
  id: string;
  label: string;
  from: Date;
  to: Date;
  academicYearId: string;
  days: number;
};

export type BoardReport = {
  school: string;
  period: Period;
  previous: Period | null;
  sections: Section[];
  generatedAt: Date;
};

function days(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

/** The term to report on, and the one before it for comparison. */
export async function periodsFor(termId: string): Promise<{
  period: Period | null;
  previous: Period | null;
}> {
  const term = await db.term.findUnique({
    where: { id: termId },
    select: {
      id: true,
      name: true,
      sequence: true,
      startDate: true,
      endDate: true,
      academicYearId: true,
      academicYear: { select: { name: true } },
    },
  });
  if (!term) return { period: null, previous: null };

  const before = await db.term.findFirst({
    where: {
      academicYearId: term.academicYearId,
      sequence: { lt: term.sequence },
    },
    orderBy: { sequence: "desc" },
    select: { id: true, name: true, startDate: true, endDate: true, academicYearId: true },
  });

  // A term still running is reported up to today, not to its end date. The
  // alternative is dividing this term's four weeks of attendance by a full
  // term's worth of sessions, which reports a school as having collapsed.
  const now = new Date();
  const to = term.endDate < now ? term.endDate : now;

  return {
    period: {
      id: term.id,
      label: `${term.name}, ${term.academicYear.name}`,
      from: term.startDate,
      to,
      academicYearId: term.academicYearId,
      days: days(term.startDate, to),
    },
    previous: before
      ? {
          id: before.id,
          label: before.name,
          from: before.startDate,
          to: before.endDate,
          academicYearId: before.academicYearId,
          days: days(before.startDate, before.endDate),
        }
      : null,
  };
}

/**
 * Build the report.
 *
 * One function rather than a section per file, because the sections share
 * their period and half their queries, and because the interesting thing
 * about the document is that it is one document.
 */
export async function boardReport(period: Period, previous: Period | null): Promise<BoardReport> {
  const school = await db.school.findFirst({ select: { name: true } });
  const fair = comparable(period, previous);

  const sections: Section[] = [];

  // --- Enrolment -----------------------------------------------------------

  const [onRoll, admitted, left, byLevel] = await Promise.all([
    db.student.count({ where: { status: "ENROLLED" } }),
    db.student.count({
      where: { status: "ENROLLED", admissionDate: { gte: period.from, lte: period.to } },
    }),
    db.student.count({
      where: {
        status: { in: ["TRANSFERRED_OUT", "WITHDRAWN"] },
        updatedAt: { gte: period.from, lte: period.to },
      },
    }),
    db.classLevel.findMany({
      where: { isActive: true },
      orderBy: { sequence: "asc" },
      select: {
        name: true,
        sections: {
          select: { _count: { select: { enrollments: true } } },
        },
      },
    }),
  ]);

  const boarders = await db.student.count({ where: { status: "ENROLLED", isBoarder: true } });

  sections.push({
    key: "enrolment",
    title: "Enrolment",
    blurb: "Who is on the roll, and how that moved over the term.",
    figures: [
      figure("On roll", String(onRoll), "Pupils with a status of enrolled, counted today."),
      figure(
        "Admitted this term",
        String(admitted),
        `Pupils whose admission date falls in ${period.label}.`,
      ),
      figure(
        "Left this term",
        String(left),
        "Pupils transferred or withdrawn, by the date the record was changed.",
      ),
      figure(
        "Year groups with pupils",
        String(byLevel.filter((level) => level.sections.some((s) => s._count.enrollments > 0)).length),
        `Of ${byLevel.length} year groups set up.`,
      ),
      figure("Boarders", String(boarders), "Enrolled pupils marked as boarding."),
    ],
  });

  // --- Attendance ----------------------------------------------------------

  const [records, previousRecords] = await Promise.all([
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { session: { date: { gte: period.from, lte: period.to } } },
      _count: true,
    }),
    previous
      ? db.attendanceRecord.groupBy({
          by: ["status"],
          where: { session: { date: { gte: previous.from, lte: previous.to } } },
          _count: true,
        })
      : Promise.resolve([]),
  ]);

  const marked = records.reduce((sum, row) => sum + row._count, 0);
  const present = records
    .filter((row) => row.status === "PRESENT" || row.status === "LATE")
    .reduce((sum, row) => sum + row._count, 0);

  const previousMarked = previousRecords.reduce((sum, row) => sum + row._count, 0);
  const previousPresent = previousRecords
    .filter((row) => row.status === "PRESENT" || row.status === "LATE")
    .reduce((sum, row) => sum + row._count, 0);

  const rate = rateOf(present, marked);
  const previousRate = rateOf(previousPresent, previousMarked);

  sections.push({
    key: "attendance",
    title: "Attendance",
    blurb: "Of the registers that were actually marked.",
    figures: [
      rate === null
        ? unavailable(
            "Attendance",
            "No registers were marked in this period, so there is no rate to state. That is a fact about the marking, not about the pupils.",
          )
        : withChange(
            figure(
              "Attendance",
              `${rate}%`,
              `Present or late, over ${marked.toLocaleString()} marks. ${period.label}.`,
            ),
            // Points, never per cent: 94 against 91 is three points, and the
            // other wording is read as a third of what happened.
            fair ? change(rate, previousRate, "points") : null,
          ),
      figure(
        "Marks recorded",
        marked.toLocaleString(),
        "Every pupil-session marked in the period, across all classes.",
      ),
    ],
    notes: fair
      ? []
      : previous
        ? [
            `No comparison with ${previous.label} is drawn: the two periods are not of comparable length, and a part-term set against a whole one reads as a decline that did not happen.`,
          ]
        : [],
  });

  // --- Attainment ----------------------------------------------------------

  const scores = await db.assessmentScore.findMany({
    where: {
      isAbsent: false,
      score: { not: null },
      assessment: { termId: period.id },
    },
    select: { score: true, assessment: { select: { maxScore: true } } },
  });

  /*
   * maxScore is a Decimal and score is a Decimal, so both go through Number
   * before any arithmetic. Prisma Decimals coerce to a string under + and the
   * average would come out as a concatenation, silently and enormously.
   */
  const marks = scores
    .map((row) => ({
      score: Number(row.score),
      max: Number(row.assessment.maxScore),
    }))
    .filter((row) => row.max > 0 && Number.isFinite(row.score))
    .map((row) => (row.score / row.max) * 100);

  const average =
    marks.length > 0
      ? Math.round((marks.reduce((sum, mark) => sum + mark, 0) / marks.length) * 10) / 10
      : null;

  sections.push({
    key: "attainment",
    title: "Attainment",
    blurb: "Marks entered this term, across every subject.",
    figures: [
      average === null
        ? unavailable(
            "Average mark",
            "No marks have been entered for this term. An average of nothing is not zero.",
          )
        : figure(
            "Average mark",
            `${average}%`,
            `Over ${marks.length.toLocaleString()} marks. An absent pupil is not counted as a zero.`,
          ),
      figure(
        "Marks entered",
        marks.length.toLocaleString(),
        "Scores recorded against assessments in this term.",
      ),
    ],
  });

  // --- Teaching ------------------------------------------------------------

  const [notesHandedIn, notesApproved, coverArranged, coverLost] = await Promise.all([
    db.lessonNote.count({
      where: { status: { not: "DRAFT" }, weekEnding: { gte: period.from, lte: period.to } },
    }),
    db.lessonNote.count({
      where: { status: "APPROVED", weekEnding: { gte: period.from, lte: period.to } },
    }),
    db.coverAssignment.count({
      where: { date: { gte: period.from, lte: period.to }, kind: { not: "CANCELLED" } },
    }),
    db.coverAssignment.count({
      where: { date: { gte: period.from, lte: period.to }, kind: "CANCELLED" },
    }),
  ]);

  sections.push({
    key: "teaching",
    title: "Teaching",
    blurb: "Preparation vetted, and lessons covered when somebody was away.",
    figures: [
      figure(
        "Lesson notes handed in",
        notesHandedIn.toLocaleString(),
        "Notes past draft, for weeks ending in this period.",
      ),
      figure(
        "Vetted and approved",
        notesApproved.toLocaleString(),
        notesHandedIn > 0
          ? `${rateOf(notesApproved, notesHandedIn)}% of those handed in.`
          : "Of those handed in.",
      ),
      figure(
        "Periods covered",
        coverArranged.toLocaleString(),
        "Lessons taught by somebody other than the timetabled teacher.",
      ),
      figure(
        "Periods lost",
        coverLost.toLocaleString(),
        "Nobody was free and the lesson did not happen. Each carries a recorded reason.",
      ),
    ],
  });

  // --- Money ---------------------------------------------------------------

  const [invoices, payments, expenses, spentThisYear, budgets, commitments] = await Promise.all([
    db.invoice.aggregate({
      where: { issueDate: { gte: period.from, lte: period.to }, status: { not: "CANCELLED" } },
      _sum: { totalMinor: true, balanceMinor: true },
    }),
    db.payment.aggregate({
      where: { paidAt: { gte: period.from, lte: period.to }, status: "SUCCESS" },
      _sum: { amountMinor: true },
    }),
    db.expense.aggregate({
      where: {
        incurredOn: { gte: period.from, lte: period.to },
        status: { in: ["APPROVED", "PAID"] },
      },
      _sum: { amountMinor: true },
    }),
    /*
     * And the same again for the whole year, because the budget is annual.
     *
     * The first version measured a term of spending against a year of budget
     * and printed "1.8% used" directly beneath "Spent: GHS 0.00". Both figures
     * were arithmetically correct and together they were nonsense: a board
     * reading them would conclude the school had spent nothing and was
     * comfortably inside a budget it had not touched. Like against like, or
     * not at all.
     */
    db.expense.aggregate({
      where: {
        academicYearId: period.academicYearId,
        status: { in: ["APPROVED", "PAID"] },
      },
      _sum: { amountMinor: true },
    }),
    db.budgetLine.aggregate({
      where: { academicYearId: period.academicYearId },
      _sum: { amountMinor: true },
    }),
    db.requisition.findMany({
      where: { status: "APPROVED", academicYearId: period.academicYearId },
      select: { lines: { select: { quantity: true, estimatedUnitMinor: true, fulfilledQty: true } } },
    }),
  ]);

  const billed = invoices._sum.totalMinor ?? 0;
  const outstanding = invoices._sum.balanceMinor ?? 0;
  const collected = payments._sum.amountMinor ?? 0;
  const spent = expenses._sum.amountMinor ?? 0;
  const spentYear = spentThisYear._sum.amountMinor ?? 0;
  const budget = budgets._sum.amountMinor ?? null;
  const committed = commitments.reduce((sum, row) => sum + outstandingTotal(row.lines), 0);

  const rateCollected = collectionRate(billed, collected);
  const use = budgetUse(budget, spentYear, committed);

  sections.push({
    key: "money",
    title: "Money",
    blurb: "In, out, and against what was budgeted for the year.",
    figures: [
      figure("Billed", formatMoney(billed), `Invoices raised in ${period.label}, cancellations excluded.`),
      figure("Collected", formatMoney(collected), "Completed payments received in the period."),
      rateCollected === null
        ? unavailable(
            "Collection rate",
            "Nothing was invoiced in this period, so there is no proportion to state. That is not a collection rate of nought.",
          )
        : figure(
            "Collection rate",
            `${rateCollected}%`,
            "Collected in the period over billed in the period. Families paying a term ahead can carry it over a hundred.",
          ),
      figure("Outstanding", formatMoney(outstanding), "Balance still owed on invoices raised in the period."),
      figure(
        "Spent this term",
        formatMoney(spent),
        `Bills approved or paid with a cost date inside ${period.label}. Nought here means nothing was recorded in the term, which is not the same as the school having spent nothing.`,
      ),
      figure(
        "Spent this year",
        formatMoney(spentYear),
        "Bills approved or paid across the academic year. This is the figure the annual budget is measured against.",
      ),
      figure(
        "Committed",
        formatMoney(committed),
        "Requisitions approved for the year and not yet met. Gone, though no invoice exists.",
      ),
      use.percent === null
        ? unavailable(
            "Against budget",
            "No budget has been set for the year, so there is nothing to measure the spending against.",
          )
        : figure(
            "Against budget",
            `${use.percent}% used, ${formatMoney(use.leftMinor ?? 0)} left`,
            `Spent this year and committed together, against ${formatMoney(budget ?? 0)} budgeted for the year. Both sides are annual: a term of spending against a year of budget is a figure with no meaning.`,
          ),
    ],
  });

  // --- Staffing ------------------------------------------------------------

  const [staffCount, teaching, leaveRows, unassigned, appraisals] = await Promise.all([
    db.staff.count({ where: { status: "ACTIVE" } }),
    db.staff.count({ where: { status: "ACTIVE", isTeaching: true } }),
    db.staffLeave.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: period.to },
        endDate: { gte: period.from },
      },
      select: { days: true },
    }),
    db.subjectOffering.count({
      where: { isActive: true, termId: period.id, teacherId: null },
    }),
    db.appraisal.groupBy({
      by: ["status"],
      where: { academicYearId: period.academicYearId },
      _count: true,
    }),
  ]);

  const settled = appraisals
    .filter((row) => row.status === "AGREED" || row.status === "DISPUTED")
    .reduce((sum, row) => sum + row._count, 0);
  const disputed = appraisals
    .filter((row) => row.status === "DISPUTED")
    .reduce((sum, row) => sum + row._count, 0);
  const openedAppraisals = appraisals.reduce((sum, row) => sum + row._count, 0);

  sections.push({
    key: "staffing",
    title: "Staffing",
    blurb: "Who the school employs, and what the year has asked of them.",
    figures: [
      figure("Staff", String(staffCount), "Active staff records."),
      figure("Teaching staff", String(teaching), "Of those, marked as teaching."),
      figure(
        "Days of approved leave",
        String(leaveRows.reduce((sum, row) => sum + row.days, 0)),
        "Working days on approved leave overlapping the period.",
      ),
      unassigned === 0
        ? figure("Subjects with no teacher", "0", "Every active subject this term has somebody assigned.")
        : figure(
            "Subjects with no teacher",
            String(unassigned),
            "Active subjects this term with nobody assigned to teach them.",
          ),
      openedAppraisals === 0
        ? unavailable(
            "Appraisals",
            "No appraisals have been opened for this year, so there is nothing to report on.",
          )
        : figure(
            "Appraisals settled",
            `${settled} of ${openedAppraisals}`,
            disputed > 0
              ? `Agreed or disputed. ${disputed} ${disputed === 1 ? "was" : "were"} not agreed by the person it is about.`
              : "Agreed or disputed. None was disputed.",
          ),
    ],
  });

  // --- Boarding ------------------------------------------------------------

  const [beds, filled, exeats, overdue] = await Promise.all([
    db.boardingRoom.aggregate({ where: { active: true }, _sum: { capacity: true } }),
    db.boardingAllocation.count({ where: { endedOn: null } }),
    db.boardingExeat.count({
      where: { departsAt: { gte: period.from, lte: period.to } },
    }),
    db.boardingExeat.count({
      where: { status: "OUT", dueBackAt: { lt: new Date() } },
    }),
  ]);

  if ((beds._sum.capacity ?? 0) > 0 || filled > 0) {
    sections.push({
      key: "boarding",
      title: "Boarding",
      blurb: "Beds, and who has been off the premises.",
      figures: [
        figure(
          "Beds",
          `${filled} of ${beds._sum.capacity ?? 0} filled`,
          "Open allocations against the capacity of rooms in use.",
        ),
        figure("Leave-out granted", String(exeats), "Boarders signed out in the period."),
        overdue === 0
          ? figure("Overdue now", "0", "Nobody is signed out past their due time.")
          : figure(
              "Overdue now",
              String(overdue),
              "Signed out and past the time they were due back, as of this report.",
            ),
      ],
    });
  }

  // --- Admissions ----------------------------------------------------------

  const [applications, offered, accepted] = await Promise.all([
    db.admissionApplication.count({
      where: { academicYearId: period.academicYearId },
    }),
    db.admissionApplication.count({
      where: { academicYearId: period.academicYearId, offeredOn: { not: null } },
    }),
    db.admissionApplication.count({
      where: { academicYearId: period.academicYearId, acceptedOn: { not: null } },
    }),
  ]);

  if (applications > 0) {
    sections.push({
      key: "admissions",
      title: "Admissions",
      blurb: "The intake for this academic year.",
      figures: [
        figure("Applications", String(applications), "Received for this academic year."),
        figure("Offers made", String(offered), "Applications with an offer date."),
        figure(
          "Offers accepted",
          String(accepted),
          offered > 0 ? `${rateOf(accepted, offered)}% of offers made.` : "Of offers made.",
        ),
      ],
    });
  }

  return {
    school: school?.name ?? "The school",
    period,
    previous,
    sections,
    generatedAt: new Date(),
  };
}
