/**
 * Checks that the data in the database hangs together.
 *
 * Prisma enforces that a row is valid. Nothing enforces that the rows are
 * collectively sensible — an academic year that ended last month, a course
 * with no lessons, a quiz nobody can open, an invoice whose balance does not
 * follow from its total. Every one of those seeded cleanly and surfaced much
 * later as a page that looked broken rather than empty.
 *
 * These are the invariants the data has to satisfy for the app to be worth
 * looking at, written as assertions rather than as things to remember to click.
 * Read-only: it counts and compares, and changes nothing.
 *
 *   npm run db:verify
 *
 * Exits 1 if anything FAILs, so it can gate a deploy. Written in TypeScript
 * rather than plain Node so that `tsc --noEmit` checks every query in here
 * against the generated client — a verifier that itself fails on a renamed
 * field is worse than no verifier.
 */
import { PrismaClient } from "@prisma/client";

import { computePayslip, parseAllowances } from "../src/lib/payroll";
import {
  CATEGORY_VALUES,
  SANCTION_VALUES,
  SEVERITY_VALUES,
} from "../src/app/(app)/students/discipline/fields";

try {
  // Node 20.6+. Absent locally, the variables come from the platform instead.
  (process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile(".env");
} catch {
  // No .env, or an older Node. Both fine.
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const db = new PrismaClient();
const now = new Date();

type Level = "pass" | "warn" | "fail";
type Result = { group: string; level: Level; label: string; detail: string };

const results: Result[] = [];

/** `detail` is what you would need to debug it, not a restatement of `label`. */
function record(group: string, level: Level, label: string, detail: string) {
  results.push({ group, level, label, detail });
}
const pass = (g: string, l: string, d = "") => record(g, "pass", l, d);
const warn = (g: string, l: string, d = "") => record(g, "warn", l, d);
const fail = (g: string, l: string, d = "") => record(g, "fail", l, d);

const day = (date: Date | null | undefined) =>
  date ? date.toISOString().slice(0, 10) : "-";
const within = (date: Date, start: Date, end: Date) => date >= start && date <= end;
const daysBetween = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / 86_400_000);

// --- The calendar ---------------------------------------------------------
// Nearly every screen filters by "current". If the current year or term does
// not contain today, the whole app describes a school that is not in session.

let currentTerm: { id: string; name: string; startDate: Date; endDate: Date } | null = null;

async function checkCalendar() {
  const g = "Calendar";

  const years = await db.academicYear.findMany({
    where: { isCurrent: true },
    select: { id: true, name: true, startDate: true, endDate: true },
  });

  if (years.length === 0) {
    fail(g, "A current academic year exists", "None is flagged isCurrent.");
    return;
  }
  if (years.length > 1) {
    fail(
      g,
      "Exactly one current academic year",
      `${years.length} are flagged: ${years.map((y) => y.name).join(", ")}`,
    );
  }

  const year = years[0];
  const span = `${day(year.startDate)} → ${day(year.endDate)}`;
  if (within(now, year.startDate, year.endDate)) {
    pass(g, `Academic year ${year.name} is in progress`, span);
  } else {
    fail(
      g,
      `Academic year ${year.name} does not contain today`,
      `${span}, today is ${day(now)}. Every "this year" figure is historical.`,
    );
  }

  const terms = await db.term.findMany({
    where: { isCurrent: true },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      academicYearId: true,
    },
  });

  if (terms.length === 0) {
    fail(g, "A current term exists", "None is flagged isCurrent.");
    return;
  }
  if (terms.length > 1) {
    fail(
      g,
      "Exactly one current term",
      `${terms.length} are flagged: ${terms.map((t) => t.name).join(", ")}`,
    );
  }

  const term = terms[0];
  currentTerm = term;
  const termSpan = `${day(term.startDate)} → ${day(term.endDate)}`;

  if (term.academicYearId !== year.id) {
    fail(
      g,
      "Current term belongs to the current year",
      `${term.name} sits in a different academic year.`,
    );
  }

  if (within(now, term.startDate, term.endDate)) {
    pass(g, `${term.name} is in progress`, `${termSpan}, ${daysBetween(now, term.endDate)} days left`);
  } else {
    fail(
      g,
      `${term.name} does not contain today`,
      `${termSpan}, today is ${day(now)}. Term countdowns will clamp to zero.`,
    );
  }
}

// --- The demo logins ------------------------------------------------------
// A login that resolves to no person lands on the "not linked" page, which
// reads as a broken portal rather than a missing link.

const DEMO_LOGINS = [
  { email: process.env.SEED_ADMIN_EMAIL ?? "admin@school.edu.gh", link: "staff" },
  { email: "head@goldencrest.edu.gh", link: "staff" },
  { email: "bursar@goldencrest.edu.gh", link: "staff" },
  { email: "teacher@goldencrest.edu.gh", link: "staff" },
  { email: "student@goldencrest.edu.gh", link: "student" },
  { email: "parent@goldencrest.edu.gh", link: "guardian" },
] as const;

async function checkLogins() {
  const g = "Demo logins";

  for (const { email, link } of DEMO_LOGINS) {
    const user = await db.user.findUnique({
      where: { email },
      select: {
        status: true,
        passwordHash: true,
        portal: true,
        staff: { select: { id: true } },
        student: { select: { admissionNo: true } },
        guardian: { select: { id: true } },
      },
    });

    if (!user) {
      fail(g, email, "No such user.");
      continue;
    }
    if (user.status !== "ACTIVE") {
      fail(g, email, `Status is ${user.status}, so sign-in is refused.`);
      continue;
    }
    if (!user.passwordHash) {
      fail(g, email, "No password set.");
      continue;
    }

    if (link === "guardian") {
      if (!user.guardian) {
        fail(g, email, "Not linked to a guardian: the portal has nothing to show.");
        continue;
      }
      const wards = await db.studentGuardian.count({
        where: { guardianId: user.guardian.id },
      });
      if (wards === 0) fail(g, email, "Guardian has no wards.");
      else pass(g, email, `${user.portal} portal, ${wards} ward(s)`);
      continue;
    }

    if (link === "student") {
      if (!user.student) {
        fail(g, email, "Not linked to a student: the portal has nothing to show.");
        continue;
      }
      pass(g, email, `${user.portal} portal, ${user.student.admissionNo}`);
      continue;
    }

    if (!user.staff) {
      fail(g, email, "Not linked to a staff record: permissions resolve to none.");
      continue;
    }
    pass(g, email, `${user.portal} portal`);
  }
}

// --- What the student portal actually shows -------------------------------

async function checkStudentPortal() {
  const g = "Student portal";

  const user = await db.user.findUnique({
    where: { email: "student@goldencrest.edu.gh" },
    select: { student: { select: { id: true, firstName: true, lastName: true } } },
  });
  const student = user?.student;
  if (!student) return; // Already reported by checkLogins.

  const who = `${student.firstName} ${student.lastName}`;

  const enrolment = await db.enrollment.findFirst({
    where: { studentId: student.id, status: "ACTIVE" },
    select: {
      classSectionId: true,
      classSection: {
        select: {
          name: true,
          isActive: true,
          classLevel: { select: { name: true } },
        },
      },
    },
  });

  if (!enrolment) {
    fail(g, `${who} is enrolled`, "No ACTIVE enrolment: every portal page is empty.");
    return;
  }
  const className = `${enrolment.classSection.classLevel.name} ${enrolment.classSection.name}`;
  if (enrolment.classSection.isActive) pass(g, `${who} is in ${className}`);
  else warn(g, `${who} is in ${className}`, "That section is marked inactive.");

  const courses = await db.course.findMany({
    where: {
      status: "PUBLISHED",
      offering: { classSectionId: enrolment.classSectionId },
    },
    select: {
      id: true,
      title: true,
      modules: {
        select: { lessons: { where: { isPublished: true }, select: { id: true } } },
      },
    },
  });

  if (courses.length === 0) {
    fail(g, "Courses are visible", "No PUBLISHED course is attached to this student's section.");
  } else {
    const empty = courses.filter(
      (c) => c.modules.reduce((n, m) => n + m.lessons.length, 0) === 0,
    );
    if (empty.length) {
      fail(
        g,
        `${courses.length} course(s) visible`,
        `${empty.length} with no published lesson: ${empty.map((c) => c.title).join(", ")}`,
      );
    } else {
      pass(g, `${courses.length} course(s) visible`, "all have published lessons");
    }
  }

  // A quiz is only demoable if one can be sat now and one has closed, so both
  // the attempt flow and the results view have something to show.
  const quizzes = await db.quiz.findMany({
    where: { isPublished: true, courseId: { in: courses.map((c) => c.id) } },
    select: { title: true, opensAt: true, closesAt: true },
  });

  const open = quizzes.filter(
    (q) => (!q.opensAt || q.opensAt <= now) && (!q.closesAt || q.closesAt >= now),
  );
  const closed = quizzes.filter((q) => q.closesAt && q.closesAt < now);

  if (open.length === 0) {
    fail(g, "A quiz can be attempted now", `${quizzes.length} published, none open at ${day(now)}.`);
  } else {
    pass(g, "A quiz can be attempted now", open.map((q) => q.title).join(", "));
  }
  if (closed.length === 0) {
    warn(g, "A closed quiz exists", "Nothing to demonstrate results and answer review with.");
  } else {
    pass(g, "A closed quiz exists", closed.map((q) => q.title).join(", "));
  }

  const attendance = await db.attendanceRecord.count({ where: { studentId: student.id } });
  if (attendance === 0) fail(g, "Attendance history", "No records.");
  else pass(g, "Attendance history", `${attendance} records`);

  const scores = await db.assessmentScore.count({ where: { studentId: student.id } });
  if (scores === 0) fail(g, "Marks", "No assessment scores.");
  else pass(g, "Marks", `${scores} scores`);

  // The Results page shows published cards only, and a family portal with an
  // empty Results page reads as broken, not as pending.
  const published = await db.reportCard.count({
    where: { studentId: student.id, status: "PUBLISHED" },
  });
  if (published === 0) {
    fail(g, "A published report card", "The Results pages render empty.");
  } else {
    pass(g, "A published report card", `${published}`);
  }
}

// --- Quizzes are answerable -----------------------------------------------
// A choice question with no correct option cannot be marked, and a second
// correct option on a single-answer question makes full marks unreachable.

async function checkQuizzes() {
  const g = "Quizzes";

  const quizzes = await db.quiz.findMany({
    where: { isPublished: true },
    select: {
      title: true,
      questions: {
        select: {
          type: true,
          prompt: true,
          acceptedAnswers: true,
          options: { select: { isCorrect: true } },
        },
      },
    },
  });

  if (quizzes.length === 0) {
    warn(g, "Published quizzes exist", "None found.");
    return;
  }

  const problems: string[] = [];
  for (const quiz of quizzes) {
    if (quiz.questions.length === 0) {
      problems.push(`${quiz.title}: no questions`);
      continue;
    }
    for (const question of quiz.questions) {
      const label = `${quiz.title}: "${question.prompt.slice(0, 40)}"`;
      const single = question.type === "MULTIPLE_CHOICE" || question.type === "TRUE_FALSE";

      if (single || question.type === "MULTIPLE_ANSWER") {
        const correct = question.options.filter((option) => option.isCorrect).length;
        if (question.options.length < 2) {
          problems.push(`${label} has ${question.options.length} option(s)`);
        } else if (correct === 0) {
          problems.push(`${label} has no correct option`);
        } else if (single && correct > 1) {
          problems.push(`${label} is single-answer but has ${correct} correct options`);
        }
      } else if (
        (question.type === "SHORT_ANSWER" || question.type === "FILL_BLANK") &&
        question.acceptedAnswers.length === 0
      ) {
        problems.push(`${label} accepts no answer`);
      }
    }
  }

  if (problems.length) {
    fail(g, `${quizzes.length} published quizzes`, problems.slice(0, 5).join("; "));
  } else {
    const questions = quizzes.reduce((n, quiz) => n + quiz.questions.length, 0);
    pass(g, `${quizzes.length} published quizzes`, `${questions} markable questions`);
  }
}

// --- Money adds up --------------------------------------------------------

async function checkFinance() {
  const g = "Finance";

  const invoices = await db.invoice.findMany({
    select: {
      invoiceNo: true,
      subtotalMinor: true,
      discountMinor: true,
      taxMinor: true,
      totalMinor: true,
      paidMinor: true,
      balanceMinor: true,
      dueDate: true,
    },
  });

  if (invoices.length === 0) {
    fail(g, "Invoices exist", "None.");
    return;
  }

  const badTotal = invoices.filter(
    (i) => i.subtotalMinor - i.discountMinor + i.taxMinor !== i.totalMinor,
  );
  const badBalance = invoices.filter((i) => i.totalMinor - i.paidMinor !== i.balanceMinor);

  if (badTotal.length) {
    fail(
      g,
      "Invoice totals reconcile",
      `${badTotal.length} where subtotal − discount + tax ≠ total, e.g. ${badTotal[0].invoiceNo}`,
    );
  } else {
    pass(g, "Invoice totals reconcile", `${invoices.length} invoices`);
  }

  if (badBalance.length) {
    fail(
      g,
      "Invoice balances reconcile",
      `${badBalance.length} where total − paid ≠ balance, e.g. ${badBalance[0].invoiceNo}`,
    );
  } else {
    pass(g, "Invoice balances reconcile");
  }

  // Arrears are the point of the finance module; with everything paid on time
  // those screens render an empty state that reads as broken.
  const overdue = invoices.filter(
    (i) => i.balanceMinor > 0 && i.dueDate !== null && i.dueDate < now,
  );
  if (overdue.length === 0) {
    warn(g, "Overdue invoices exist", "Arrears and reminder screens will be empty.");
  } else {
    const owed = overdue.reduce((n, i) => n + i.balanceMinor, 0);
    pass(
      g,
      "Overdue invoices exist",
      `${overdue.length} owing GH₵${Math.round(owed / 100).toLocaleString()}`,
    );
  }

  const rules = await db.reminderRule.findMany({ select: { name: true, audience: true } });
  const known = new Set(["BILL_PAYERS", "ALL_GUARDIANS", "STUDENT", "EVERYONE"]);
  const strays = rules.filter((rule) => !known.has(rule.audience));
  if (strays.length) {
    // An unrecognised audience does not throw — it falls back to bill payers —
    // so the only symptom is a reminder reaching the wrong person.
    fail(
      g,
      "Reminder audiences are recognised",
      strays.map((rule) => `${rule.name} → "${rule.audience}"`).join("; "),
    );
  } else if (rules.length) {
    pass(g, "Reminder audiences are recognised", `${rules.length} rules`);
  }
}

/**
 * Branding artwork has two distinct ways to be wrong, and neither announces
 * itself to the person who set it.
 *
 * A link to somewhere else renders on screen and is skipped by the PDF
 * renderer, which reads only this school's own storage. A privately filed
 * image is the mirror image: it renders for whoever uploaded it and returns
 * 401 to everyone with no session — the login page, the public site, the
 * verification page a scanned certificate leads to. Both look correct from
 * the desk of the person who configured them.
 */
function checkArtwork(
  group: string,
  label: string,
  value: string | null | undefined,
  options: { public: boolean; where: string },
) {
  const url = (value ?? "").trim();

  if (!url) {
    warn(group, label, `Not set, ${options.where} render without it.`);
    return;
  }

  const path = url.startsWith("/")
    ? url
    : (() => {
        try {
          return new URL(url).pathname;
        } catch {
          return url;
        }
      })();

  if (path.startsWith("/api/media/")) {
    pass(group, label, url);
  } else if (path.startsWith("/api/files/")) {
    if (options.public) {
      warn(
        group,
        label,
        "Filed privately, so it is missing for anyone not signed in. Re-upload it from the branding settings.",
      );
    } else {
      pass(group, label, url);
    }
  } else {
    warn(group, label, `${url} is not in the school's storage, so documents render without it.`);
  }
}

// --- Things that render to a document or a public page --------------------

async function checkOutputs() {
  const g = "Documents & site";

  for (const kind of ["CERTIFICATE", "TRANSCRIPT"]) {
    const templates = await db.documentTemplate.findMany({
      where: { kind, isActive: true },
      select: { name: true, layout: true, isDefault: true },
    });

    if (templates.length === 0) {
      fail(g, `${kind} template`, "None: issuing falls back to a plain layout.");
      continue;
    }
    // A template row with no elements produces a blank page, which reads as a
    // rendering bug rather than an unfinished template.
    const blank = templates.filter((template) => {
      const layout = template.layout as { elements?: unknown } | null;
      return !layout || !Array.isArray(layout.elements) || layout.elements.length === 0;
    });
    if (blank.length) {
      fail(
        g,
        `${kind} template`,
        `${blank.length} with no elements: ${blank.map((t) => t.name).join(", ")}`,
      );
    } else if (!templates.some((template) => template.isDefault)) {
      warn(g, `${kind} template`, `${templates.length} found, none marked default.`);
    } else {
      pass(g, `${kind} template`, templates.map((t) => t.name).join(", "));
    }
  }

  const school = await db.school.findFirst({ select: { logoUrl: true } });
  checkArtwork(g, "School logo", school?.logoUrl, {
    public: true,
    where: "sidebar, report cards, the login page and the verification page",
  });

  const site = await db.site.findFirst({
    select: { id: true, isPublished: true, name: true, logoUrl: true },
  });
  if (!site) {
    warn(g, "Website", "No site record.");
    return;
  }
  if (!site.isPublished) warn(g, "Website", `${site.name} is not published.`);
  checkArtwork(g, "Website logo", site.logoUrl, {
    public: true,
    where: "the public site header",
  });

  // The admission form is the public site's one interactive element, and a
  // block type the renderer does not recognise renders as nothing — silently.
  const admissionsPage = await db.sitePage.findFirst({
    where: { siteId: site.id, slug: "admissions", status: "PUBLISHED" },
    select: { blocks: true },
  });
  const hasEnquiryForm =
    Array.isArray(admissionsPage?.blocks) &&
    (admissionsPage.blocks as Array<{ type?: string }>).some(
      (block) => block?.type === "admissionForm",
    );
  if (!admissionsPage) {
    warn(g, "Admissions page", "Not published: prospective parents have nowhere to apply.");
  } else if (!hasEnquiryForm) {
    warn(g, "Admissions page", "Published, but carries no enquiry form block.");
  } else {
    pass(g, "Admissions page", "enquiry form present");
  }

  const home = await db.sitePage.findFirst({
    where: { siteId: site.id, isHomePage: true },
    select: { title: true, status: true, blocks: true },
  });
  if (!home) {
    fail(g, "Website home page", "No page is marked isHomePage.");
  } else if (home.status !== "PUBLISHED") {
    warn(g, "Website home page", `${home.title} is ${home.status}.`);
  } else if (!Array.isArray(home.blocks) || home.blocks.length === 0) {
    fail(g, "Website home page", "blocks is not a non-empty array: the page renders bare.");
  } else {
    pass(g, "Website home page", `${home.blocks.length} blocks`);
  }
}

// --- Structural coherence -------------------------------------------------

async function checkStructure() {
  const g = "Structure";

  const orphanSections = await db.classSection.count({
    where: { isActive: true, formTeacherId: null },
  });
  if (orphanSections) {
    warn(g, "Active sections have a form teacher", `${orphanSections} without one.`);
  } else {
    pass(g, "Active sections have a form teacher");
  }

  const emptyCourses = await db.course.count({
    where: {
      status: "PUBLISHED",
      modules: { none: { lessons: { some: { isPublished: true } } } },
    },
  });
  if (emptyCourses) {
    fail(g, "Published courses have lessons", `${emptyCourses} published with nothing to read.`);
  } else {
    pass(g, "Published courses have lessons");
  }

  // A class with no timetable and an elections page with no election both look
  // like a broken module rather than absent demo data, and both were caused by
  // a seed filter that stopped matching after something was renamed.
  const sectionsWithoutTimetable = await db.classSection.count({
    where: { isActive: true, timetableSlots: { none: {} } },
  });
  if (sectionsWithoutTimetable) {
    fail(
      g,
      "Every class has a timetable",
      `${sectionsWithoutTimetable} active section(s) with no slots: those timetables render empty.`,
    );
  } else {
    pass(g, "Every class has a timetable");
  }

  const elections = await db.election.count();
  if (elections === 0) {
    warn(g, "Elections exist", "The elections module has nothing to show.");
  } else {
    pass(g, "Elections exist", `${elections}`);
  }

  const noGuardian = await db.student.count({
    where: { status: "ENROLLED", guardians: { none: {} } },
  });
  if (noGuardian) {
    fail(
      g,
      "Enrolled students have a guardian",
      `${noGuardian} without one: nobody to contact or bill.`,
    );
  } else {
    pass(g, "Enrolled students have a guardian");
  }

  // The discipline vocabulary lives in fields.ts and the seed writes its own
  // strings — this is the assertion that the two never drift. A category the
  // page cannot label renders as raw SNAKE_CASE and looks like a bug.
  const disciplinary = await db.disciplinaryRecord.findMany({
    select: { category: true, severity: true, sanction: true, status: true, resolution: true },
  });
  if (disciplinary.length === 0) {
    warn(g, "Disciplinary records exist", "The discipline desk has nothing to show.");
  } else {
    const strayVocab = disciplinary.filter(
      (record) =>
        !CATEGORY_VALUES.includes(record.category as never) ||
        !SEVERITY_VALUES.includes(record.severity as never) ||
        (record.sanction && !SANCTION_VALUES.includes(record.sanction as never)),
    ).length;
    if (strayVocab) {
      fail(
        g,
        "Discipline vocabulary matches fields.ts",
        `${strayVocab} record(s) use values the form does not offer.`,
      );
    } else {
      pass(g, "Discipline vocabulary matches fields.ts", `${disciplinary.length} records`);
    }

    const unresolved = disciplinary.filter(
      (record) => record.status === "RESOLVED" && !record.resolution,
    ).length;
    if (unresolved) {
      warn(
        g,
        "Resolved cases carry a resolution",
        `${unresolved} resolved with no note of how.`,
      );
    } else {
      pass(g, "Resolved cases carry a resolution");
    }
  }

  if (!currentTerm) return;
  const term = currentTerm;

  // Registers belong to the term on screen and must already have happened.
  // Sessions outside that window exist in the table but are never displayed.
  const strayAttendance = await db.attendanceSession.count({
    where: {
      termId: term.id,
      OR: [{ date: { lt: term.startDate } }, { date: { gt: term.endDate } }],
    },
  });
  if (strayAttendance) {
    fail(
      g,
      "Attendance sits inside its term",
      `${strayAttendance} session(s) outside ${day(term.startDate)} → ${day(term.endDate)}.`,
    );
  } else {
    pass(g, "Attendance sits inside its term");
  }

  const futureAttendance = await db.attendanceSession.count({ where: { date: { gt: now } } });
  if (futureAttendance) {
    warn(g, "No attendance in the future", `${futureAttendance} session(s) after today.`);
  }

  const strayAssessments = await db.assessment.count({
    where: { termId: term.id, conductedOn: { lt: term.startDate } },
  });
  if (strayAssessments) {
    warn(
      g,
      "Assessments sit inside their term",
      `${strayAssessments} conducted before the term began.`,
    );
  } else {
    pass(g, "Assessments sit inside their term");
  }
}

// --- Report ---------------------------------------------------------------

/**
 * Payroll: the one module whose bugs end up in someone's bank account.
 * Every stored payslip is recomputed from its own basic and allowances and
 * compared with what was written down — a drift means the arithmetic changed
 * under slips that had already been issued.
 */
async function checkPayroll() {
  const g = "Payroll";

  const runs = await db.payrollRun.count();
  if (runs === 0) {
    warn(g, "Payroll runs exist", "The payroll module has nothing to show.");
    return;
  }
  pass(g, "Payroll runs exist", String(runs));

  const slips = await db.payslip.findMany({
    select: {
      id: true,
      basicMinor: true,
      allowances: true,
      grossMinor: true,
      ssnitEmployeeMinor: true,
      payeMinor: true,
      netMinor: true,
    },
  });

  let drifted = 0;
  let negative = 0;
  for (const slip of slips) {
    const figures = computePayslip({
      basicMinor: slip.basicMinor,
      allowances: parseAllowances(slip.allowances),
    });
    if (
      figures.grossMinor !== slip.grossMinor ||
      figures.ssnitEmployeeMinor !== slip.ssnitEmployeeMinor ||
      figures.payeMinor !== slip.payeMinor ||
      figures.netMinor !== slip.netMinor
    ) {
      drifted += 1;
    }
    if (slip.netMinor < 0 || slip.grossMinor < slip.netMinor) negative += 1;
  }

  if (drifted) {
    warn(
      g,
      "Stored payslips match the current rules",
      `${drifted} of ${slips.length} differ: expected after a tax-table change, wrong otherwise.`,
    );
  } else {
    pass(g, "Stored payslips match the current rules", `${slips.length} slips`);
  }

  if (negative) {
    fail(g, "Net pay is sane", `${negative} slip(s) with impossible figures.`);
  } else {
    pass(g, "Net pay is sane");
  }

  // A paid run whose staff cannot be paid is the failure a bursar discovers
  // at the bank, not on screen.
  const cashSlips = await db.payslip.count({
    where: { paymentMethod: "CASH", run: { status: { in: ["APPROVED", "PAID"] } } },
  });
  if (cashSlips) {
    warn(
      g,
      "Approved payslips have payment details",
      `${cashSlips} fall back to cash.`,
    );
  } else {
    pass(g, "Approved payslips have payment details");
  }
}

/**
 * The student roll and the enrolments underneath it must agree.
 *
 * Registers, headcount, analytics and the billing run all read "ENROLLED
 * student with an ACTIVE enrolment". A record where those two disagree is a
 * child who is invoiced but not on any register, or on a register while
 * counted as gone — and it is invisible on every screen because each screen
 * only reads one half of the pair.
 */
async function checkStudentLifecycle() {
  const g = "Student lifecycle";

  const enrolledWithoutEnrolment = await db.student.count({
    where: { status: "ENROLLED", enrollments: { none: { status: "ACTIVE" } } },
  });
  if (enrolledWithoutEnrolment) {
    fail(
      g,
      "Enrolled students have an active enrolment",
      `${enrolledWithoutEnrolment} are on the roll with no class: invoiced, never on a register.`,
    );
  } else {
    pass(g, "Enrolled students have an active enrolment");
  }

  const leftButStillEnrolled = await db.student.count({
    where: {
      status: { in: ["WITHDRAWN", "TRANSFERRED_OUT", "GRADUATED"] },
      enrollments: { some: { status: "ACTIVE" } },
    },
  });
  if (leftButStillEnrolled) {
    fail(
      g,
      "Leavers are off the register",
      `${leftButStillEnrolled} have left but keep an active enrolment: still billed, still counted.`,
    );
  } else {
    pass(g, "Leavers are off the register");
  }

  const leftWithoutReason = await db.student.count({
    where: {
      status: { in: ["WITHDRAWN", "TRANSFERRED_OUT"] },
      OR: [{ exitReason: null }, { exitDate: null }],
    },
  });
  if (leftWithoutReason) {
    warn(
      g,
      "Departures record a reason and a date",
      `${leftWithoutReason} left with no reason or no date on file.`,
    );
  } else {
    pass(g, "Departures record a reason and a date");
  }

  // A class over its capacity is usually a transfer that skipped the check.
  const sections = await db.classSection.findMany({
    where: { isActive: true },
    select: {
      name: true,
      capacity: true,
      classLevel: { select: { name: true } },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  const overfull = sections.filter(
    (section) => section._count.enrollments > section.capacity,
  );
  if (overfull.length) {
    warn(
      g,
      "No class is over capacity",
      overfull
        .map(
          (section) =>
            `${section.classLevel.name} ${section.name} ${section._count.enrollments}/${section.capacity}`,
        )
        .join(", "),
    );
  } else {
    pass(g, "No class is over capacity");
  }
}

const MARK: Record<Level, string> = { pass: "  ok  ", warn: " warn ", fail: " FAIL " };

// Wrapped rather than top-level await: the project compiles to CommonJS, where
// esbuild rejects it.
async function main() {
  await db.$queryRaw`SELECT 1`;

  await checkCalendar();
  await checkLogins();
  await checkStudentPortal();
  await checkQuizzes();
  await checkFinance();
  await checkOutputs();
  await checkStructure();
  await checkPayroll();
  await checkStudentLifecycle();

  let group: string | null = null;
  for (const result of results) {
    if (result.group !== group) {
      group = result.group;
      console.log(`\n${group}`);
    }
    console.log(
      `  [${MARK[result.level]}] ${result.label}${result.detail ? ` , ${result.detail}` : ""}`,
    );
  }

  const failed = results.filter((r) => r.level === "fail").length;
  const warned = results.filter((r) => r.level === "warn").length;

  console.log(
    `\n${results.length - failed - warned} passed, ${warned} warning(s), ${failed} failure(s).`,
  );
  if (failed) console.log("Re-seed with `npm run db:seed`, or fix the data before showing this.");

  return failed;
}

main()
  .then(async (failed) => {
    await db.$disconnect();
    process.exit(failed ? 1 : 0);
  })
  .catch(async (error: unknown) => {
    // Prisma leads with the failed invocation and a code frame, so the first
    // line is usually blank and the useful one is further down.
    const reason = String((error as Error).message)
      .split("\n")
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length > 0 &&
          !line.startsWith("Invalid `") &&
          !line.startsWith("await") &&
          !line.includes("^"),
      );
    console.error(`Could not verify: ${reason ?? String(error)}`);
    await db.$disconnect();
    process.exit(1);
  });
