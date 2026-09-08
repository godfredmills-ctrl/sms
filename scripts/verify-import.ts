/**
 * Reconcile an imported school against the register it came from.
 *
 * Run after scripts/import-school.ts, and run it again after importing into
 * production, because the two databases are loaded by separate invocations and
 * only one of them was watched. It reads the same spreadsheet and asks the
 * database the same questions: how many pupils, how many in each class, how
 * much was charged, how much was received, how much is still owed.
 *
 * The class-by-class roll is the part worth reading. A total can match while
 * two classes are swapped, and a school notices that on the first morning
 * register rather than in a summary.
 *
 * Exits non-zero on any mismatch, so it can gate a deployment.
 *
 *   npm run school:verify -- --file "../filtered-fee-records.xlsx"
 */

import path from "node:path";

import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

import { parseMoney, resolveSession, studentKey } from "../src/lib/school-import";

const db = new PrismaClient();

async function main() {
  const index = process.argv.indexOf("--file");
  const file = index === -1 ? null : process.argv[index + 1];
  if (!file || file.startsWith("--")) {
    console.error("\n  npm run school:verify -- --file <register.xlsx>\n");
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(file));
  const ws = wb.worksheets[0];

  const text = (row: ExcelJS.Row, c: number) => {
    let v: unknown = row.getCell(c).value;
    if (v && typeof v === "object" && "result" in v) v = (v as { result: unknown }).result;
    if (v && typeof v === "object" && "text" in v) v = (v as { text: unknown }).text;
    return v === null || v === undefined ? "" : String(v).trim();
  };

  const rows = [];
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
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

  const sessions = [...new Set(rows.map((r) => r.session))].filter(Boolean).sort();
  const currentSession = sessions[sessions.length - 1];
  const priorSession = sessions.length > 1 ? sessions[sessions.length - 2] : null;

  const cedis = (m: number) =>
    `GHS ${(m / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;

  const pass: string[] = [];
  const fail: string[] = [];
  const eq = (label: string, a: unknown, b: unknown) =>
    (a === b ? pass : fail).push(`${label}: database ${a} vs register ${b}`);

  // --- Head counts ---------------------------------------------------------

  const prior = priorSession
    ? resolveSession(rows.filter((r) => r.session === priorSession))
    : [];
  const current = resolveSession(rows.filter((r) => r.session === currentSession));
  const everyone = new Set([...prior, ...current].map((e) => e.key));
  const gone = current.filter((e) => e.hasLeft).length;

  eq("distinct pupils", await db.student.count(), everyone.size);
  eq("enrolled", await db.student.count({ where: { status: "ENROLLED" } }), everyone.size - gone);
  eq("recorded as having left", await db.student.count({ where: { status: "TRANSFERRED_OUT" } }), gone);

  // --- Class by class ------------------------------------------------------

  console.log("\n=== current roll, per class: database vs register ===");
  const year = await db.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year) {
    fail.push("no academic year is marked current");
  } else {
    let matched = 0;
    for (const level of await db.classLevel.findMany({ orderBy: { sequence: "asc" } })) {
      const inDb = await db.enrollment.count({
        where: { academicYearId: year.id, classSection: { classLevelId: level.id } },
      });
      const inSheet = current.filter((e) => e.levelCode === level.code).length;
      if (inDb === inSheet) matched += 1;
      else fail.push(`roll for ${level.name}: database ${inDb} vs register ${inSheet}`);
      console.log(
        `  ${inDb === inSheet ? "ok" : "XX"}  ${level.name.padEnd(11)} database ${String(inDb).padStart(3)}   register ${String(inSheet).padStart(3)}`,
      );
    }
    pass.push(`every class roll matches (${matched} levels)`);
  }

  // --- Money ---------------------------------------------------------------

  if (priorSession) {
    console.log("\n=== money ===");

    // The same one-row-per-child rule the importer used, rebuilt independently.
    const billed = new Map<string, { required: number; paid: number }>();
    for (const r of rows) {
      if (r.session !== priorSession) continue;
      if (r.requiredMinor === null || r.requiredMinor <= 0) continue;
      const key = studentKey(r.name);
      const seen = billed.get(key);
      if (!seen || r.requiredMinor > seen.required) {
        billed.set(key, { required: r.requiredMinor, paid: r.paidMinor ?? 0 });
      }
    }

    const charged = [...billed.values()].reduce((s, b) => s + b.required, 0);
    const received = [...billed.values()].reduce((s, b) => s + b.paid, 0);
    const owed = [...billed.values()].reduce((s, b) => s + Math.max(0, b.required - b.paid), 0);

    const agg = await db.invoice.aggregate({
      _sum: { totalMinor: true, paidMinor: true, balanceMinor: true },
      _count: true,
    });

    eq("invoices", agg._count, billed.size);
    eq("charged", agg._sum.totalMinor, charged);
    eq("received", agg._sum.paidMinor, received);
    eq("still owed", agg._sum.balanceMinor, owed);

    // Where the register's own total differs from what was billed, and why.
    const raw = rows
      .filter((r) => r.session === priorSession)
      .reduce((s, r) => s + (r.requiredMinor ?? 0), 0);
    console.log(`  every row in the register adds to  ${cedis(raw)}`);
    console.log(`  one row per child adds to          ${cedis(charged)}`);
    console.log(`  difference, being duplicate rows   ${cedis(raw - charged)}`);
    console.log(`  received                           ${cedis(received)}`);
    console.log(`  still owed                         ${cedis(owed)}`);

    const payments = await db.payment.aggregate({ _sum: { amountMinor: true }, _count: true });
    eq("payments total the invoiced receipts", payments._sum.amountMinor, agg._sum.paidMinor);

    const allocations = await db.paymentAllocation.aggregate({
      _sum: { amountMinor: true },
      _count: true,
    });
    eq("every payment is allocated to an invoice", allocations._count, payments._count);
    eq("allocations total the payments", allocations._sum.amountMinor, payments._sum.amountMinor);
  }

  // --- Fee structures ------------------------------------------------------

  if (year) {
    console.log("\n=== fee structures, current year ===");
    for (const structure of await db.feeStructure.findMany({
      where: { academicYearId: year.id },
      include: { classLevel: true, items: true },
      orderBy: { classLevel: { sequence: "asc" } },
    })) {
      const amount = structure.items.reduce((total, item) => total + item.amountMinor, 0);
      console.log(
        `  ${(structure.classLevel?.name ?? "-").padEnd(11)} ${cedis(amount).padStart(14)}  ${
          structure.isPublished ? "published" : "DRAFT"
        }`,
      );
    }
  }

  // --- Nothing orphaned ----------------------------------------------------

  if (year) {
    eq(
      "every enrolled pupil has a place this year",
      await db.student.count({
        where: { status: "ENROLLED", enrollments: { none: { academicYearId: year.id } } },
      }),
      0,
    );
  }
  eq("no negative balances", await db.invoice.count({ where: { balanceMinor: { lt: 0 } } }), 0);
  eq(
    "no pupil is enrolled twice in one year",
    (await db.enrollment.groupBy({
      by: ["studentId", "academicYearId"],
      having: { studentId: { _count: { gt: 1 } } },
    })).length,
    0,
  );

  console.log(`\n${"─".repeat(72)}`);
  for (const entry of pass) console.log(`  ok  ${entry}`);
  for (const entry of fail) console.log(`  XX  ${entry}`);
  console.log("─".repeat(72));
  console.log(fail.length === 0 ? "  Everything reconciles.\n" : `  ${fail.length} MISMATCHES\n`);

  await db.$disconnect();
  if (fail.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
