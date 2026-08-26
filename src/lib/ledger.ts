import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "./db";
import {
  balanceSheet,
  incomeStatement,
  trialBalance,
  type AccountTotals,
  type AccountType,
} from "./ledger-rules";

/**
 * The ledger, read.
 *
 * Every figure comes from summing posted lines. There is no balance column on
 * an account, deliberately, for the same reason a stock item has no quantity
 * column: a stored balance beside the entries that produced it is a second
 * answer to the same question, and the day the two disagree nobody can say
 * which is right.
 *
 * Only POSTED entries count. A draft is somebody's working and a void is a
 * mistake that was reversed; including either would put figures on a trial
 * balance that no accountant agreed to.
 */

export type Period = { from?: Date | null; to?: Date | null };

function entryWhere(period: Period): Prisma.JournalEntryWhereInput {
  return {
    status: "POSTED",
    ...(period.from || period.to
      ? {
          entryDate: {
            ...(period.from ? { gte: period.from } : {}),
            ...(period.to ? { lte: period.to } : {}),
          },
        }
      : {}),
  };
}

/**
 * Every account's totals for a period.
 *
 * Grouped in the database rather than by walking lines in memory: a school's
 * ledger runs to tens of thousands of lines over a few years, and the trial
 * balance is a page somebody opens rather than a report they wait for.
 */
export async function accountTotals(period: Period = {}): Promise<AccountTotals[]> {
  const [accounts, grouped] = await Promise.all([
    db.ledgerAccount.findMany({
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true, type: true },
    }),
    db.journalLine.groupBy({
      by: ["accountId"],
      where: { entry: entryWhere(period) },
      _sum: { debitMinor: true, creditMinor: true },
    }),
  ]);

  const sums = new Map(grouped.map((row) => [row.accountId, row._sum]));

  return accounts.map((account) => {
    const sum = sums.get(account.id);
    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type as AccountType,
      debitMinor: sum?.debitMinor ?? 0,
      creditMinor: sum?.creditMinor ?? 0,
    };
  });
}

export async function ledgerReports(period: Period = {}) {
  const totals = await accountTotals(period);
  return {
    totals,
    trial: trialBalance(totals),
    income: incomeStatement(totals),
    sheet: balanceSheet(totals),
  };
}

/**
 * One account's movements, with a running balance.
 *
 * This is the page somebody opens when a figure on a statement looks wrong,
 * so it shows the entries in date order with the balance after each one,
 * rather than only the total.
 */
export async function accountLedger(accountId: string, period: Period = {}) {
  const account = await db.ledgerAccount.findUnique({
    where: { id: accountId },
    select: { id: true, code: true, name: true, type: true, description: true },
  });
  if (!account) return null;

  const lines = await db.journalLine.findMany({
    where: { accountId, entry: entryWhere(period) },
    orderBy: [{ entry: { entryDate: "asc" } }, { entry: { reference: "asc" } }],
    take: 5_000,
    select: {
      id: true,
      debitMinor: true,
      creditMinor: true,
      memo: true,
      entry: {
        select: {
          id: true,
          reference: true,
          entryDate: true,
          narration: true,
          source: true,
        },
      },
    },
  });

  const normal = account.type === "ASSET" || account.type === "EXPENSE" ? 1 : -1;
  let running = 0;

  const rows = lines.map((line) => {
    running += normal * (line.debitMinor - line.creditMinor);
    return { ...line, balanceMinor: running };
  });

  return { account, rows, closingMinor: running };
}

export async function journalList(options: {
  status?: string;
  search?: string;
  take?: number;
  skip?: number;
}) {
  const search = options.search?.trim();

  const where: Prisma.JournalEntryWhereInput = {
    ...(options.status ? { status: options.status as never } : {}),
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: "insensitive" } },
            { narration: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [entries, total] = await Promise.all([
    db.journalEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { reference: "desc" }],
      take: options.take ?? 50,
      skip: options.skip ?? 0,
      select: {
        id: true,
        reference: true,
        entryDate: true,
        narration: true,
        status: true,
        source: true,
        postedAt: true,
        createdByLabel: true,
        reversesId: true,
        reversedBy: { select: { reference: true } },
        lines: { select: { debitMinor: true, creditMinor: true } },
      },
    }),
    db.journalEntry.count({ where }),
  ]);

  return {
    total,
    entries: entries.map((entry) => ({
      ...entry,
      totalMinor: entry.lines.reduce((sum, line) => sum + line.debitMinor, 0),
    })),
  };
}

export async function journalEntry(id: string) {
  return db.journalEntry.findUnique({
    where: { id },
    include: {
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { account: { select: { id: true, code: true, name: true, type: true } } },
      },
      term: { select: { name: true } },
      academicYear: { select: { name: true } },
      reverses: { select: { id: true, reference: true } },
      reversedBy: { select: { id: true, reference: true } },
    },
  });
}

/**
 * The next journal reference.
 *
 * Per calendar year, never reused, and taken from the highest already issued
 * rather than from a count: a count reuses the reference of anything removed,
 * and two entries wearing the same reference is the one thing a correction
 * cannot survive.
 */
export async function nextJournalReference(now: Date): Promise<string> {
  const prefix = `JV/${now.getFullYear()}/`;

  const latest = await db.journalEntry.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  const current = latest?.reference?.slice(prefix.length) ?? "0";
  return `${prefix}${String((Number.parseInt(current, 10) || 0) + 1).padStart(4, "0")}`;
}

export async function ledgerAccounts(options: { activeOnly?: boolean } = {}) {
  return db.ledgerAccount.findMany({
    where: options.activeOnly ? { isActive: true } : {},
    orderBy: [{ code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      description: true,
      isActive: true,
      isSystem: true,
      _count: { select: { lines: true } },
    },
  });
}

/**
 * Whether the chart of accounts has been set up at all.
 *
 * Used to send a bursar to the right screen rather than to an empty ledger
 * with no explanation.
 */
export async function hasChartOfAccounts(): Promise<boolean> {
  return (await db.ledgerAccount.count()) > 0;
}
