/**
 * Double entry, and what it adds up to.
 *
 * Pure and client-safe, for the same reason the depreciation and stock rules
 * are: the trial balance on screen, the trial balance on the printed page, and
 * the tests must be the same arithmetic. An accountant checking a figure by
 * hand is the person this module exists for, and a ledger that gives two
 * answers is worth less than no ledger at all.
 *
 * Money is integer minor units (pesewas) throughout, as everywhere else in this
 * system. Nothing here divides, so nothing here rounds, which is the property
 * that lets a trial balance come out exactly equal rather than nearly.
 */

import { formatMoney } from "./money";

export const ACCOUNT_TYPES = [
  {
    value: "ASSET",
    label: "Asset",
    /** The side an increase is recorded on. */
    normal: "DEBIT",
    blurb: "What the school owns or is owed: bank, cash, fees receivable, equipment.",
    statement: "BALANCE_SHEET",
  },
  {
    value: "LIABILITY",
    label: "Liability",
    normal: "CREDIT",
    blurb: "What the school owes: suppliers, salaries payable, fees paid in advance.",
    statement: "BALANCE_SHEET",
  },
  {
    value: "EQUITY",
    // "Funds" rather than "Equity": it is what a school's governing board reads
    // on its own balance sheet, and the balance sheet section below is headed
    // the same way, so the two cannot disagree.
    label: "Funds",
    normal: "CREDIT",
    blurb: "The school's own funds and accumulated surplus.",
    statement: "BALANCE_SHEET",
  },
  {
    value: "INCOME",
    label: "Income",
    normal: "CREDIT",
    blurb: "Tuition, boarding, transport, and anything else the school earns.",
    statement: "INCOME_STATEMENT",
  },
  {
    value: "EXPENSE",
    label: "Expense",
    normal: "DEBIT",
    blurb: "Salaries, utilities, provisions, repairs, depreciation.",
    statement: "INCOME_STATEMENT",
  },
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number]["value"];
export type Side = "DEBIT" | "CREDIT";

export function normalSide(type: AccountType): Side {
  return ACCOUNT_TYPES.find((entry) => entry.value === type)?.normal ?? "DEBIT";
}

export function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPES.find((entry) => entry.value === type)?.label ?? type;
}

/** Income and expense close into the surplus; the rest carry forward. */
export function isProfitAndLoss(type: AccountType): boolean {
  return type === "INCOME" || type === "EXPENSE";
}

// -----------------------------------------------------------------------------
// Entries
// -----------------------------------------------------------------------------

export type Line = {
  accountId: string;
  /** Exactly one of these is non-zero. Both zero is a line that does nothing. */
  debitMinor: number;
  creditMinor: number;
};

export type EntryCheck = {
  debitMinor: number;
  creditMinor: number;
  differenceMinor: number;
  balanced: boolean;
  /** Every reason this entry cannot be posted, in the order a person would fix them. */
  problems: string[];
};

/**
 * Whether an entry may be posted, and why not.
 *
 * The rules are old and they are not negotiable: at least two lines, every line
 * on exactly one side, nothing negative, and the two sides equal. A ledger that
 * accepts an unbalanced entry stops being a ledger at that moment, and every
 * report drawn from it afterwards is wrong by an amount nobody can find.
 */
export function checkEntry(lines: Line[]): EntryCheck {
  const problems: string[] = [];

  let debitMinor = 0;
  let creditMinor = 0;
  let meaningful = 0;

  lines.forEach((line, index) => {
    const debit = Math.round(line.debitMinor || 0);
    const credit = Math.round(line.creditMinor || 0);
    const position = index + 1;

    if (debit < 0 || credit < 0) {
      // A negative debit is a credit written the wrong way round. Allowing it
      // makes every total ambiguous and hides sign errors inside a balanced
      // entry.
      problems.push(`Line ${position}: an amount cannot be negative.`);
      return;
    }

    if (debit > 0 && credit > 0) {
      problems.push(`Line ${position}: put the amount on one side, not both.`);
      return;
    }

    if (debit === 0 && credit === 0) return;

    if (!line.accountId) {
      problems.push(`Line ${position}: choose an account.`);
      return;
    }

    meaningful += 1;
    debitMinor += debit;
    creditMinor += credit;
  });

  if (meaningful < 2) {
    problems.push("An entry needs at least two lines: something given and something received.");
  }

  const differenceMinor = debitMinor - creditMinor;
  if (differenceMinor !== 0) {
    // In cedis, because that is what the person fixing it is thinking in.
    // Raw pesewas made the message arithmetic somebody had to do themselves.
    problems.push(
      `The entry is out by ${formatMoney(Math.abs(differenceMinor))}. Debits and credits must be equal.`,
    );
  }

  return {
    debitMinor,
    creditMinor,
    differenceMinor,
    balanced: differenceMinor === 0 && meaningful >= 2 && problems.length === 0,
    problems,
  };
}

/**
 * The entry that undoes another one.
 *
 * A posted entry is never edited or deleted. The correction is its mirror,
 * posted on its own date, so both the mistake and the fix are on the record.
 * That is what makes a ledger auditable rather than merely current.
 */
export function reverseLines(lines: Line[]): Line[] {
  return lines.map((line) => ({
    accountId: line.accountId,
    debitMinor: Math.round(line.creditMinor || 0),
    creditMinor: Math.round(line.debitMinor || 0),
  }));
}

// -----------------------------------------------------------------------------
// Balances
// -----------------------------------------------------------------------------

export type AccountTotals = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debitMinor: number;
  creditMinor: number;
};

export type AccountBalance = AccountTotals & {
  /**
   * Positive means the account stands on its normal side.
   *
   * A bank account with money in it is a positive asset; one that is overdrawn
   * is a negative asset rather than a liability, because the ledger reports
   * what the accounts say rather than reclassifying them quietly.
   */
  balanceMinor: number;
  /** Which column it belongs in on a trial balance. */
  side: Side;
  /** The amount to print in that column, always positive. */
  columnMinor: number;
};

export function balanceOf(totals: AccountTotals): AccountBalance {
  const normal = normalSide(totals.type);
  const balanceMinor =
    normal === "DEBIT"
      ? totals.debitMinor - totals.creditMinor
      : totals.creditMinor - totals.debitMinor;

  // An account standing on the wrong side of its nature is printed on that
  // side rather than as a negative, which is what a trial balance does.
  const side: Side = balanceMinor >= 0 ? normal : normal === "DEBIT" ? "CREDIT" : "DEBIT";

  return {
    ...totals,
    balanceMinor,
    side,
    columnMinor: Math.abs(balanceMinor),
  };
}

export type TrialBalance = {
  rows: AccountBalance[];
  debitMinor: number;
  creditMinor: number;
  balanced: boolean;
  differenceMinor: number;
};

/**
 * The trial balance.
 *
 * It balances if and only if every entry behind it balanced, which is why it is
 * the first thing anybody checks. Accounts with no movement and no balance are
 * left out, because a trial balance is a working document and forty empty lines
 * make it harder to read rather than more complete.
 */
export function trialBalance(totals: AccountTotals[]): TrialBalance {
  const rows = totals
    .map(balanceOf)
    .filter((row) => row.debitMinor !== 0 || row.creditMinor !== 0);

  let debitMinor = 0;
  let creditMinor = 0;

  for (const row of rows) {
    if (row.side === "DEBIT") debitMinor += row.columnMinor;
    else creditMinor += row.columnMinor;
  }

  return {
    rows,
    debitMinor,
    creditMinor,
    differenceMinor: debitMinor - creditMinor,
    balanced: debitMinor === creditMinor,
  };
}

// -----------------------------------------------------------------------------
// Statements
// -----------------------------------------------------------------------------

export type StatementSection = {
  label: string;
  rows: AccountBalance[];
  totalMinor: number;
};

export type IncomeStatement = {
  income: StatementSection;
  expenses: StatementSection;
  surplusMinor: number;
};

/**
 * Income less expenditure for a period.
 *
 * Called a surplus rather than a profit, because that is what a school's
 * governing board calls it and what its auditors write.
 */
export function incomeStatement(totals: AccountTotals[]): IncomeStatement {
  const balances = totals.map(balanceOf);

  const income = balances.filter((row) => row.type === "INCOME" && row.balanceMinor !== 0);
  const expenses = balances.filter((row) => row.type === "EXPENSE" && row.balanceMinor !== 0);

  const incomeTotal = income.reduce((sum, row) => sum + row.balanceMinor, 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + row.balanceMinor, 0);

  return {
    income: { label: "Income", rows: income, totalMinor: incomeTotal },
    expenses: { label: "Expenditure", rows: expenses, totalMinor: expenseTotal },
    surplusMinor: incomeTotal - expenseTotal,
  };
}

export type BalanceSheet = {
  assets: StatementSection;
  liabilities: StatementSection;
  equity: StatementSection;
  /** The period's surplus, which has not been closed into equity yet. */
  surplusMinor: number;
  assetsMinor: number;
  fundedMinor: number;
  balanced: boolean;
  differenceMinor: number;
};

/**
 * What the school owns against what funds it.
 *
 * The period's surplus is shown as its own line under equity rather than being
 * folded in, because until the year is closed it has not been transferred
 * anywhere, and a balance sheet that silently absorbed it would not tie to the
 * income statement printed beside it.
 */
export function balanceSheet(totals: AccountTotals[]): BalanceSheet {
  const balances = totals.map(balanceOf);
  const surplusMinor = incomeStatement(totals).surplusMinor;

  const pick = (type: AccountType) =>
    balances.filter((row) => row.type === type && row.balanceMinor !== 0);

  const assets = pick("ASSET");
  const liabilities = pick("LIABILITY");
  const equity = pick("EQUITY");

  const total = (rows: AccountBalance[]) =>
    rows.reduce((sum, row) => sum + row.balanceMinor, 0);

  const assetsMinor = total(assets);
  const fundedMinor = total(liabilities) + total(equity) + surplusMinor;

  return {
    assets: { label: "Assets", rows: assets, totalMinor: assetsMinor },
    liabilities: { label: "Liabilities", rows: liabilities, totalMinor: total(liabilities) },
    equity: { label: "Funds", rows: equity, totalMinor: total(equity) },
    surplusMinor,
    assetsMinor,
    fundedMinor,
    differenceMinor: assetsMinor - fundedMinor,
    balanced: assetsMinor === fundedMinor,
  };
}

// -----------------------------------------------------------------------------
// Account codes
// -----------------------------------------------------------------------------

/**
 * The conventional numbering, which every accountant reads without being told:
 * 1000s assets, 2000s liabilities, 3000s funds, 4000s income, 5000s expenditure.
 */
export function codeRangeFor(type: AccountType): { from: number; to: number } {
  switch (type) {
    case "ASSET":
      return { from: 1000, to: 1999 };
    case "LIABILITY":
      return { from: 2000, to: 2999 };
    case "EQUITY":
      return { from: 3000, to: 3999 };
    case "INCOME":
      return { from: 4000, to: 4999 };
    case "EXPENSE":
      return { from: 5000, to: 5999 };
  }
}

/**
 * Whether a code sits in the range its type implies.
 *
 * A warning rather than a refusal: a school that already numbers its accounts
 * some other way should be able to carry that numbering across rather than be
 * told its own chart is invalid.
 */
export function codeMatchesType(code: string, type: AccountType): boolean {
  const numeric = Number.parseInt(code.trim(), 10);
  if (!Number.isFinite(numeric)) return true;
  const range = codeRangeFor(type);
  return numeric >= range.from && numeric <= range.to;
}
