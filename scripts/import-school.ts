/**
 * Load a real school from another system's fee register.
 *
 * Runs after `npm run school:new`, which creates the school profile, the
 * permission catalogue, the roles and the first administrator. This adds what
 * only the school's own records can supply: its academic years, its class
 * ladder, its pupils, what each level charges, and what each family still
 * owes from last term.
 *
 * Usage:
 *
 *   npm run school:import -- --file "../filtered-fee-records.xlsx"
 *   npm run school:import -- --file "..." --prefix SIS --reset
 *
 * The rules for reading the register live in src/lib/school-import.ts and are
 * tested by scripts/check-school-import.ts. This file is the part that writes.
 *
 * ---------------------------------------------------------------------------
 * What it deliberately does NOT do
 * ---------------------------------------------------------------------------
 *
 * It raises no invoice for the current term. The register has this term's fee
 * for nine of the fourteen levels and zero for the other five, and every one
 * of its 731 rows shows nothing paid, because the term is two days old. Filling
 * that gap would mean inventing what four classes are charged. Instead the
 * levels with a real rate get a published fee structure, the levels without
 * get last term's rate as an UNPUBLISHED draft, and the bursar runs billing
 * from the app once the figures are confirmed. A bill is the school's word to
 * a parent, and this script does not get to make it up.
 *
 * It creates no guardians, no staff and no timetable, because the register
 * contains none. An empty guardian list is a job to do; an invented one is a
 * fiction that outlives everyone who remembers it was invented.
 */

import path from "node:path";

import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

import {
  LEVELS,
  isPseudoClass,
  levelFor,
  looksLikeATermFee,
  modalFee,
  parseMoney,
  resolveSession,
  splitName,
  studentKey,
  suspectOrder,
  tidyName,
  type SourceRow,
} from "../src/lib/school-import";

const db = new PrismaClient();
const line = "─".repeat(72);

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function fail(title: string, details: string[]): never {
  console.error(`\n${line}\n  ${title}\n${line}\n`);
  for (const detail of details) console.error(`  ${detail}`);
  console.error("");
  process.exit(1);
}

function banner(title: string) {
  console.log(`\n${line}\n  ${title}\n${line}`);
}

const cedis = (minor: number) =>
  `GHS ${(minor / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------
// The academic calendar
// ---------------------------------------------------------------------------

/**
 * Ghanaian term dates, built UTC.
 *
 * Written with Date.UTC because that is how the rest of the system reads a
 * term: src/lib/billing-cycle.ts says so explicitly, and a term date built at
 * local midnight in a timezone ahead of Greenwich reads back as the day
 * before, which moves a bill into the wrong month once a year.
 *
 * The dates themselves are the standard Ghanaian pattern and are ESTIMATES.
 * The register records no term dates at all. They are reported at the end of
 * the run so the school can correct them, which takes a minute on the academic
 * year screen and cannot be done at all if nobody is told they were guessed.
 */
function termsFor(startYear: number) {
  const day = (year: number, month: number, date: number) =>
    new Date(Date.UTC(year, month - 1, date));
  return [
    {
      name: "First Term",
      sequence: 1,
      startDate: day(startYear, 9, 8),
      endDate: day(startYear, 12, 18),
    },
    {
      name: "Second Term",
      sequence: 2,
      startDate: day(startYear + 1, 1, 12),
      endDate: day(startYear + 1, 4, 2),
    },
    {
      name: "Third Term",
      sequence: 3,
      startDate: day(startYear + 1, 5, 4),
      endDate: day(startYear + 1, 7, 30),
    },
  ];
}

// ---------------------------------------------------------------------------
// Reading the workbook
// ---------------------------------------------------------------------------

async function readRegister(file: string): Promise<SourceRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.worksheets[0];
  if (!sheet) fail("That workbook has no sheets", [file]);

  const text = (row: ExcelJS.Row, column: number): string => {
    let value: unknown = row.getCell(column).value;
    if (value && typeof value === "object" && "result" in value) {
      value = (value as { result: unknown }).result;
    }
    if (value && typeof value === "object" && "text" in value) {
      value = (value as { text: unknown }).text;
    }
    return value === null || value === undefined ? "" : String(value).trim();
  };

  const rows: SourceRow[] = [];
  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    const name = text(row, 5);
    if (!name) continue;
    rows.push({
      session: text(row, 1),
      term: text(row, 2),
      cls: text(row, 3),
      name,
      requiredMinor: parseMoney(text(row, 6)),
      paidMinor: parseMoney(text(row, 7)),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------

async function main() {
  const file = argument("file");
  if (!file) {
    fail("Which file?", [
      "npm run school:import -- --file \"../filtered-fee-records.xlsx\"",
      "",
      "--file    the register exported from the old system (.xlsx)",
      "--prefix  admission number prefix, e.g. SIS (default: from the school name)",
      "--reset   delete previously imported pupils and start again",
    ]);
  }

  const resolved = path.resolve(file);
  const rows = await readRegister(resolved);
  if (rows.length === 0) fail("That register has no rows with a name in it", [resolved]);

  // --- Which database is this? ---------------------------------------------

  /**
   * Say the target out loud, and make a remote one deliberate.
   *
   * This script deletes when given --reset, and the difference between the
   * throwaway Postgres on this machine and a school's live database is one
   * environment variable that nobody reads. Naming the host every run costs a
   * line; requiring --remote before writing to anything that is not this
   * machine costs a word, and both are cheaper than restoring from backup.
   */
  let host = "(unparseable DATABASE_URL)";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    // Leave the placeholder. A malformed URL is its own diagnosis.
  }
  const isLocal = /^(localhost|127\.0\.0\.1|::1)$/.test(host);

  console.log(`\n  Database: ${host}${isLocal ? "  (this machine)" : "  REMOTE"}`);

  if (!isLocal && !has("remote")) {
    fail(`That is not a database on this machine: ${host}`, [
      "This script writes a whole school, and deletes one when given --reset.",
      "Pointing it at a live database by leaving DATABASE_URL set is the one",
      "mistake worth making impossible.",
      "",
      "If you meant it, say so:",
      "",
      "    npm run school:import -- --file <register.xlsx> --remote",
      "",
      "Take a backup first. There is no undo.",
    ]);
  }

  const school = await db.school.findFirst();
  if (!school) {
    fail("There is no school on this database yet", [
      "This script adds pupils to a school; it does not create one, because",
      "the school profile, the roles and the first administrator all have to",
      "exist before anybody can log in and look at what was imported.",
      "",
      "Run this first:",
      "",
      '    npm run school:new -- --name "The School" \\',
      "      --email head@school.edu.gh --admin \"Head Teacher\"",
    ]);
  }

  // --- Sessions present in the file ----------------------------------------

  const sessions = [...new Set(rows.map((row) => row.session))].filter(Boolean).sort();
  if (sessions.length === 0) fail("No session column values in that register", [resolved]);
  const currentSession = sessions[sessions.length - 1];

  banner("Reading the register");
  console.log(`  ${resolved}`);
  console.log(`  ${rows.length} rows, sessions: ${sessions.join(", ")}`);
  console.log(`  current session: ${currentSession}`);

  const unknownClasses = [
    ...new Set(
      rows
        .map((row) => row.cls)
        .filter((cls) => cls && !isPseudoClass(cls) && !levelFor(cls)),
    ),
  ];
  if (unknownClasses.length) {
    fail("The register contains classes this ladder does not have", [
      ...unknownClasses.map((cls) => `    ${cls}`),
      "",
      "Add them to LEVELS in src/lib/school-import.ts, in the right place in",
      "the sequence, then run this again. Guessing where a class sits in the",
      "ladder would put children in the wrong year and promote them wrongly",
      "for as long as the school uses this system.",
    ]);
  }

  // --- Refuse to run over an existing roster --------------------------------

  const existingStudents = await db.student.count();
  if (existingStudents > 0 && !has("reset")) {
    fail(`This database already has ${existingStudents} pupils`, [
      "Importing again would create a second copy of every child.",
      "",
      "If those pupils are from an earlier run of this script and you want to",
      "start again, add --reset. It deletes every pupil, enrolment, invoice,",
      "payment, fee structure, class and academic year on this database.",
      "",
      "If they are real, do not use --reset. Restore from a backup instead.",
    ]);
  }

  if (has("reset") && existingStudents > 0) {
    banner(`Deleting ${existingStudents} existing pupils and everything attached`);
    // Order matters: children before parents, because these are real foreign
    // keys rather than a convention somebody remembered to follow.
    await db.payment.deleteMany({});
    await db.invoiceLine.deleteMany({});
    await db.invoice.deleteMany({});
    await db.enrollment.deleteMany({});
    await db.student.deleteMany({});
    await db.feeStructureItem.deleteMany({});
    await db.feeStructure.deleteMany({});
    await db.classSection.deleteMany({});
    await db.classLevel.deleteMany({});
    await db.term.deleteMany({});
    await db.academicYear.deleteMany({});
    console.log("  done.");
  }

  // --- Academic years and terms --------------------------------------------

  banner("Academic years and terms");

  const yearIds = new Map<string, string>();
  const termIds = new Map<string, string>();

  for (const session of sessions) {
    const startYear = Number(session.slice(0, 4));
    if (!Number.isFinite(startYear)) {
      fail(`Cannot read a start year from the session "${session}"`, [
        "Expected something like 2026/2027.",
      ]);
    }
    const terms = termsFor(startYear);
    const isCurrent = session === currentSession;

    const year = await db.academicYear.create({
      data: {
        schoolId: school.id,
        name: session,
        startDate: terms[0].startDate,
        endDate: terms[2].endDate,
        isCurrent,
      },
    });
    yearIds.set(session, year.id);

    // Which term of this session the register actually covers. Everything
    // financial hangs off it, so it is read from the file rather than assumed.
    const termNames = [
      ...new Set(rows.filter((row) => row.session === session).map((row) => row.term)),
    ];

    for (const term of terms) {
      const covered = termNames.includes(term.name);
      const created = await db.term.create({
        data: {
          academicYearId: year.id,
          name: term.name,
          sequence: term.sequence,
          startDate: term.startDate,
          endDate: term.endDate,
          isCurrent: isCurrent && covered,
        },
      });
      termIds.set(`${session}|${term.name}`, created.id);
    }

    console.log(
      `  ${session}${isCurrent ? "  (current)" : ""}: three terms, register covers ${termNames.join(", ")}`,
    );
  }

  // --- The class ladder -----------------------------------------------------

  banner("Class levels and sections");

  const levelIds = new Map<string, string>();
  const sectionIds = new Map<string, string>();

  const currentRows = rows.filter((row) => row.session === currentSession);
  const currentRoster = resolveSession(currentRows);

  for (const level of LEVELS) {
    const created = await db.classLevel.create({
      data: {
        name: level.name,
        code: level.code,
        sequence: level.sequence,
        stage: level.stage,
      },
    });
    levelIds.set(level.code, created.id);

    const heads = currentRoster.filter((entry) => entry.levelCode === level.code).length;
    const section = await db.classSection.create({
      data: {
        classLevelId: created.id,
        name: level.name,
        code: level.code,
        // One section per level, because the register records no streams.
        // Capacity is set above the current roll so the class does not read as
        // over-subscribed on the day it is imported.
        capacity: Math.max(30, heads + 5),
      },
    });
    sectionIds.set(level.code, section.id);
    console.log(`  ${level.name.padEnd(11)} ${String(heads).padStart(3)} pupils`);
  }

  // --- What each level charges ----------------------------------------------

  banner("Fee structures");

  const tuition = await db.feeCategory.upsert({
    where: { code: "TUITION" },
    update: {},
    create: {
      name: "Tuition",
      code: "TUITION",
      description:
        "The termly fee as carried over from the previous system, which recorded a single figure per pupil rather than a breakdown.",
      isRecurring: true,
      isMandatory: true,
      sortKey: 1,
    },
  });

  /** The rate a level charged in a given session, from what pupils were billed. */
  const rateFor = (session: string, levelCode: string): number | null =>
    modalFee(
      rows
        .filter(
          (row) =>
            row.session === session &&
            levelFor(row.cls)?.code === levelCode,
        )
        .map((row) => row.requiredMinor),
    );

  const priorSession = sessions.length > 1 ? sessions[sessions.length - 2] : null;
  const carriedForward: string[] = [];
  const noRateAtAll: string[] = [];

  for (const session of sessions) {
    const yearId = yearIds.get(session)!;
    const termNames = [
      ...new Set(rows.filter((row) => row.session === session).map((row) => row.term)),
    ];
    const termId = termIds.get(`${session}|${termNames[0]}`) ?? null;
    const isCurrent = session === currentSession;

    for (const level of LEVELS) {
      const stated = rateFor(session, level.code);
      const trustworthy = looksLikeATermFee(stated);

      // A level whose own figure is missing or implausible takes last term's,
      // and takes it as a draft. Nothing that was not in the register gets
      // published, so nothing invented can bill anybody.
      let amount = trustworthy ? stated : null;
      let published = trustworthy;
      let note: string | null = null;

      if (amount === null && isCurrent && priorSession) {
        const previous = rateFor(priorSession, level.code);
        if (looksLikeATermFee(previous)) {
          amount = previous;
          published = false;
          note = `Carried forward from ${priorSession}: the previous system had no usable fee for ${level.name} this session. Confirm the amount before publishing.`;
          carriedForward.push(level.name);
        }
      }

      if (amount === null) {
        if (isCurrent) noRateAtAll.push(level.name);
        continue;
      }

      const structure = await db.feeStructure.create({
        data: {
          academicYearId: yearId,
          termId,
          classLevelId: levelIds.get(level.code)!,
          name: `${level.name}, ${termNames[0]}`,
          boarderType: "ALL",
          studentType: "ALL",
          currency: "GHS",
          isPublished: published,
          notes: note,
        },
      });

      await db.feeStructureItem.create({
        data: {
          structureId: structure.id,
          categoryId: tuition.id,
          description: "Tuition",
          amountMinor: amount,
          sortKey: 1,
        },
      });
    }

    const made = await db.feeStructure.count({ where: { academicYearId: yearId } });
    console.log(`  ${session}: ${made} structures`);
  }

  // --- The pupils -----------------------------------------------------------

  banner("Pupils");

  const priorRoster = priorSession
    ? resolveSession(rows.filter((row) => row.session === priorSession))
    : [];

  const everyone = new Map<string, { sourceName: string }>();
  for (const entry of [...priorRoster, ...currentRoster]) {
    if (!everyone.has(entry.key)) everyone.set(entry.key, { sourceName: entry.sourceName });
  }

  const current = new Map(currentRoster.map((entry) => [entry.key, entry]));
  const prior = new Map(priorRoster.map((entry) => [entry.key, entry]));

  const prefix =
    argument("prefix") ??
    (school.shortName ||
      school.name
        .split(/\s+/)
        .filter((word) => /^[A-Za-z]/.test(word))
        .map((word) => word[0])
        .join("")
        .slice(0, 4))
      .toUpperCase();

  const admissionYear = Number(currentSession.slice(0, 4));

  // Sorted so the numbers run in register order and a re-run produces the same
  // sequence, which matters the first time somebody compares two printouts.
  const ordered = [...everyone.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const studentRows = ordered.map(([key, { sourceName }], index) => {
    const name = splitName(sourceName);
    const now = current.get(key);
    const before = prior.get(key);
    const left = now?.hasLeft ?? false;

    return {
      admissionNo: `${prefix}/${admissionYear}/${String(index + 1).padStart(4, "0")}`,
      firstName: name.firstName,
      lastName: name.lastName,
      otherNames: name.otherNames,
      status: left ? ("TRANSFERRED_OUT" as const) : ("ENROLLED" as const),
      admissionType: before ? "CONTINUING" : "NEW",
      admittedIntoLevel: (before ?? now)?.lastLevelCode ?? null,
      exitReason: left ? "Changed school" : null,
      transferredTo: left ? "Unknown. The previous system recorded only that they left." : null,
      // The register's own spelling, kept verbatim. The split above is right
      // about nine times in ten and this is what makes the other tenth
      // recoverable.
      notes: `Imported from the previous system. Name as recorded there: "${sourceName}".${
        suspectOrder(sourceName)
          ? " The first word looks like a given name rather than a surname, so check the split."
          : ""
      }`,
    };
  });

  await db.student.createMany({ data: studentRows });

  const studentIds = new Map(
    (await db.student.findMany({ select: { id: true, admissionNo: true } })).map(
      (student) => [student.admissionNo, student.id] as const,
    ),
  );
  const idFor = (index: number) =>
    studentIds.get(`${prefix}/${admissionYear}/${String(index + 1).padStart(4, "0")}`)!;

  const leavers = studentRows.filter((student) => student.status === "TRANSFERRED_OUT").length;
  const flagged = studentRows.filter((student) => student.notes.includes("check the split")).length;
  console.log(`  ${studentRows.length} pupils created`);
  console.log(`  ${studentRows.length - leavers} enrolled, ${leavers} recorded as having left`);
  console.log(`  ${flagged} names flagged for a human to check`);

  // --- Enrolments -----------------------------------------------------------

  banner("Enrolments");

  const enrolments: Array<{
    studentId: string;
    classSectionId: string;
    academicYearId: string;
    status: "ACTIVE" | "COMPLETED" | "TRANSFERRED";
  }> = [];

  ordered.forEach(([key], index) => {
    const studentId = idFor(index);

    const before = prior.get(key);
    if (priorSession && before?.lastLevelCode) {
      enrolments.push({
        studentId,
        classSectionId: sectionIds.get(before.lastLevelCode)!,
        academicYearId: yearIds.get(priorSession)!,
        status: before.hasLeft ? "TRANSFERRED" : "COMPLETED",
      });
    }

    const now = current.get(key);
    if (now?.levelCode) {
      enrolments.push({
        studentId,
        classSectionId: sectionIds.get(now.levelCode)!,
        academicYearId: yearIds.get(currentSession)!,
        status: "ACTIVE",
      });
    }
  });

  await db.enrollment.createMany({ data: enrolments });
  const active = enrolments.filter((entry) => entry.status === "ACTIVE").length;
  console.log(`  ${enrolments.length} enrolments (${active} active this session)`);

  // --- Last term's bills, and what is still owed ----------------------------

  if (priorSession) {
    banner(`Fees carried over from ${priorSession}`);

    const priorYearId = yearIds.get(priorSession)!;
    const priorTermName = [
      ...new Set(rows.filter((row) => row.session === priorSession).map((row) => row.term)),
    ][0];
    const priorTermId = termIds.get(`${priorSession}|${priorTermName}`) ?? null;
    const issued = new Date(Date.UTC(Number(priorSession.slice(0, 4)) + 1, 4, 4));

    // One row per child. The register can hold two rows for the same child
    // and the larger bill is the real one; billing the smaller would quietly
    // forgive money the school is owed.
    const billed = new Map<string, { required: number; paid: number }>();
    for (const row of rows) {
      if (row.session !== priorSession) continue;
      if (row.requiredMinor === null || row.requiredMinor <= 0) continue;
      const key = studentKey(row.name);
      const existing = billed.get(key);
      if (!existing || row.requiredMinor > existing.required) {
        billed.set(key, { required: row.requiredMinor, paid: row.paidMinor ?? 0 });
      }
    }

    const invoiceRows: Array<{
      studentId: string;
      academicYearId: string;
      termId: string | null;
      invoiceNo: string;
      title: string;
      status: "PAID" | "PART_PAID" | "ISSUED";
      subtotalMinor: number;
      totalMinor: number;
      paidMinor: number;
      balanceMinor: number;
      issueDate: Date;
      paidAt: Date | null;
      notes: string;
    }> = [];
    const paymentRows: Array<{
      studentId: string;
      receiptNo: string;
      reference: string;
      amountMinor: number;
      channel: "CASH";
      provider: "MANUAL";
      status: "SUCCESS";
      paidAt: Date;
      narration: string;
    }> = [];

    ordered.forEach(([key], index) => {
      const record = billed.get(key);
      if (!record) return;
      const studentId = idFor(index);
      const balance = record.required - record.paid;
      const sequence = String(index + 1).padStart(4, "0");

      invoiceRows.push({
        studentId,
        academicYearId: priorYearId,
        termId: priorTermId,
        invoiceNo: `INV/${priorSession.slice(0, 4)}/${sequence}`,
        title: `${priorTermName}, ${priorSession}`,
        status: balance <= 0 ? "PAID" : record.paid > 0 ? "PART_PAID" : "ISSUED",
        subtotalMinor: record.required,
        totalMinor: record.required,
        paidMinor: record.paid,
        balanceMinor: balance > 0 ? balance : 0,
        issueDate: issued,
        paidAt: balance <= 0 ? issued : null,
        notes: "Opening balance carried over from the previous system.",
      });

      if (record.paid > 0) {
        paymentRows.push({
          studentId,
          receiptNo: `RCT/${priorSession.slice(0, 4)}/${sequence}`,
          reference: `IMPORT-${priorSession.slice(0, 4)}-${sequence}`,
          amountMinor: record.paid,
          channel: "CASH",
          provider: "MANUAL",
          status: "SUCCESS",
          paidAt: issued,
          // One payment stands for what may have been several. The register
          // records a running total per pupil, not the instalments behind it,
          // and splitting that total into invented receipts would put dates
          // and amounts in the ledger that nobody ever received.
          narration: `Total received during ${priorTermName} ${priorSession}, as recorded in the previous system. Individual receipts were not carried over.`,
        });
      }
    });

    await db.invoice.createMany({ data: invoiceRows });

    const invoiceIds = new Map(
      (await db.invoice.findMany({ select: { id: true, invoiceNo: true } })).map(
        (invoice) => [invoice.invoiceNo, invoice.id] as const,
      ),
    );

    await db.invoiceLine.createMany({
      data: invoiceRows.map((invoice) => ({
        invoiceId: invoiceIds.get(invoice.invoiceNo)!,
        categoryId: tuition.id,
        description: `Tuition, ${invoice.title}`,
        unitPriceMinor: invoice.subtotalMinor,
        amountMinor: invoice.subtotalMinor,
        sortKey: 1,
      })),
    });

    await db.payment.createMany({ data: paymentRows });

    // Allocate each payment to the invoice it settled. The invoice already
    // carries its own paid and balance figures, so the totals would look right
    // without this — but the invoice screen, the payments screen and the parent
    // portal all read allocations to answer "what did this money pay for", and
    // without one every imported receipt reads as unallocated cash.
    const paymentIds = new Map(
      (await db.payment.findMany({ select: { id: true, receiptNo: true } })).map(
        (payment) => [payment.receiptNo, payment.id] as const,
      ),
    );

    await db.paymentAllocation.createMany({
      data: paymentRows.map((payment) => ({
        paymentId: paymentIds.get(payment.receiptNo)!,
        invoiceId: invoiceIds.get(payment.receiptNo.replace("RCT/", "INV/"))!,
        amountMinor: payment.amountMinor,
        allocatedAt: issued,
      })),
    });

    const charged = invoiceRows.reduce((sum, invoice) => sum + invoice.totalMinor, 0);
    const received = invoiceRows.reduce((sum, invoice) => sum + invoice.paidMinor, 0);
    const owing = invoiceRows.reduce((sum, invoice) => sum + invoice.balanceMinor, 0);

    console.log(`  ${invoiceRows.length} invoices, ${paymentRows.length} payments`);
    console.log(`  charged  ${cedis(charged)}`);
    console.log(`  received ${cedis(received)}  (${((received / charged) * 100).toFixed(1)}%)`);
    console.log(`  still owed ${cedis(owing)}`);
  }

  // --- What the school now has to do ---------------------------------------

  banner("Imported. What still needs a human");

  const notes: string[] = [];

  notes.push(
    "Term dates are estimates. The register recorded none, so the standard",
    "Ghanaian pattern was used. Correct them under Academic years before the",
    "first report card, since attendance and results hang off them.",
  );

  if (carriedForward.length) {
    notes.push(
      "",
      `${carriedForward.length} levels have DRAFT fee structures carrying last`,
      `session's rate forward: ${carriedForward.join(", ")}.`,
      "The previous system had no usable figure for them this term. Confirm the",
      "amounts and publish them, then run billing. Nothing bills while they are",
      "drafts.",
    );
  }

  if (noRateAtAll.length) {
    notes.push(
      "",
      `No fee could be determined at all for: ${noRateAtAll.join(", ")}.`,
      "Create a structure for these by hand.",
    );
  }

  if (flagged) {
    notes.push(
      "",
      `${flagged} pupils have a name whose first word looks like a given name`,
      "rather than a surname. Each one says so in their notes. Search the pupil",
      "list for \"check the split\" to review them.",
    );
  }

  notes.push(
    "",
    "No guardians, staff or timetable were imported, because the register",
    "contains none. Until guardians exist, no parent can be sent an invoice",
    "and nobody can sign in to the parent portal.",
    "",
    "No invoice was raised for the current term. Publish this term's fee",
    "structures, then use Finance to bill the whole school at once.",
  );

  for (const note of notes) console.log(`  ${note}`);
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
