/**
 * Tests for the general ledger's arithmetic.
 *
 * A ledger that accepts one unbalanced entry stops being a ledger at that
 * moment, and every report drawn from it afterwards is wrong by an amount
 * nobody can find. Most of what follows is about the ways an entry can look
 * fine and not be: a negative debit standing in for a credit, an amount on both
 * sides of one line, a single line that balances against nothing.
 */

import {
  ACCOUNT_TYPES,
  accountTypeLabel,
  balanceOf,
  balanceSheet,
  checkEntry,
  codeMatchesType,
  codeRangeFor,
  incomeStatement,
  isProfitAndLoss,
  normalSide,
  reverseLines,
  trialBalance,
  type AccountTotals,
  type Line,
} from "../src/lib/ledger-rules";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) passed += 1;
  else failures.push(`${name}\n      expected ${b}\n      actual   ${a}`);
}

function ok(name: string, condition: boolean) {
  check(name, condition, true);
}

const debit = (accountId: string, amount: number): Line => ({
  accountId,
  debitMinor: amount,
  creditMinor: 0,
});
const credit = (accountId: string, amount: number): Line => ({
  accountId,
  debitMinor: 0,
  creditMinor: amount,
});

const totals = (
  accountId: string,
  type: AccountTotals["type"],
  debitMinor: number,
  creditMinor: number,
): AccountTotals => ({
  accountId,
  code: accountId,
  name: accountId,
  type,
  debitMinor,
  creditMinor,
});

// -----------------------------------------------------------------------------
// Sides
// -----------------------------------------------------------------------------

check("assets increase on the debit side", normalSide("ASSET"), "DEBIT");
check("expenses increase on the debit side", normalSide("EXPENSE"), "DEBIT");
check("liabilities increase on the credit side", normalSide("LIABILITY"), "CREDIT");
check("funds increase on the credit side", normalSide("EQUITY"), "CREDIT");
check("income increases on the credit side", normalSide("INCOME"), "CREDIT");

ok("income closes into the surplus", isProfitAndLoss("INCOME"));
ok("expenditure closes into the surplus", isProfitAndLoss("EXPENSE"));
ok("an asset carries forward", !isProfitAndLoss("ASSET"));

check("a type has a label", accountTypeLabel("EQUITY"), "Funds");
check("an unknown type shows as itself", accountTypeLabel("NONSENSE"), "NONSENSE");

// -----------------------------------------------------------------------------
// Whether an entry may be posted
// -----------------------------------------------------------------------------

// A fee invoice: the family owes the school, and the school has earned it.
const invoice = checkEntry([debit("1200", 150_000), credit("4100", 150_000)]);
ok("a balanced entry is accepted", invoice.balanced);
check("its debits are totalled", invoice.debitMinor, 150_000);
check("its credits are totalled", invoice.creditMinor, 150_000);
check("with nothing left over", invoice.differenceMinor, 0);
check("and nothing to fix", invoice.problems, []);

// Several lines a side, which is the ordinary case for a payroll entry.
const payroll = checkEntry([
  debit("5100", 800_000),
  credit("2200", 120_000),
  credit("2300", 60_000),
  credit("1100", 620_000),
]);
ok("many lines a side still balance", payroll.balanced);
check("the totals agree", [payroll.debitMinor, payroll.creditMinor], [800_000, 800_000]);

// The failures.
const short = checkEntry([debit("1200", 150_000), credit("4100", 140_000)]);
ok("an entry that is out is refused", !short.balanced);
check("and says by how much", short.differenceMinor, 10_000);
// The message a bursar reads has to be in the money they think in.
ok(
  "in cedis, not raw pesewas",
  short.problems.some((problem) => problem.includes("100.00")),
);
ok(
  "and never in bare pesewas",
  !short.problems.some((problem) => problem.includes("10000 ")),
);

const lonely = checkEntry([debit("1200", 150_000)]);
ok("one line cannot balance against nothing", !lonely.balanced);
ok(
  "and it says so plainly",
  lonely.problems.some((problem) => problem.includes("at least two lines")),
);

// A negative debit is a credit written the wrong way round. Allowing it makes
// every total ambiguous and hides sign errors inside an entry that adds up.
const negative = checkEntry([debit("1200", -150_000), credit("4100", -150_000)]);
ok("a negative amount is refused", !negative.balanced);
ok(
  "on both lines",
  negative.problems.filter((problem) => problem.includes("cannot be negative")).length === 2,
);

const bothSides = checkEntry([
  { accountId: "1200", debitMinor: 100, creditMinor: 100 },
  credit("4100", 100),
]);
ok("an amount on both sides of one line is refused", !bothSides.balanced);
ok(
  "and named by its line number",
  bothSides.problems.some((problem) => problem.startsWith("Line 1")),
);

const noAccount = checkEntry([
  { accountId: "", debitMinor: 100, creditMinor: 0 },
  credit("4100", 100),
]);
ok("a line with an amount and no account is refused", !noAccount.balanced);

// Empty lines are how a form arrives: eight rows, two filled in. They are not
// an error, they are simply nothing.
const withBlanks = checkEntry([
  debit("1200", 150_000),
  credit("4100", 150_000),
  { accountId: "", debitMinor: 0, creditMinor: 0 },
  { accountId: "", debitMinor: 0, creditMinor: 0 },
]);
ok("blank rows are ignored rather than refused", withBlanks.balanced);
check("no entry at all is refused", checkEntry([]).balanced, false);

// -----------------------------------------------------------------------------
// Reversal
// -----------------------------------------------------------------------------

const original = [debit("1200", 150_000), credit("4100", 150_000)];
const reversed = reverseLines(original);
check("a reversal swaps the sides", reversed, [
  { accountId: "1200", debitMinor: 0, creditMinor: 150_000 },
  { accountId: "4100", debitMinor: 150_000, creditMinor: 0 },
]);
ok("and it balances too", checkEntry(reversed).balanced);
// Posting both must leave the accounts exactly where they started.
const net = checkEntry([...original, ...reversed]);
check("together they net to nothing", net.debitMinor - net.creditMinor, 0);
check("reversing twice returns the original", reverseLines(reversed), original);

// -----------------------------------------------------------------------------
// Balances
// -----------------------------------------------------------------------------

const bank = balanceOf(totals("1100", "ASSET", 500_000, 180_000));
check("an asset's balance is debits less credits", bank.balanceMinor, 320_000);
check("and sits in the debit column", bank.side, "DEBIT");
check("at its absolute value", bank.columnMinor, 320_000);

const payable = balanceOf(totals("2100", "LIABILITY", 40_000, 190_000));
check("a liability's balance is credits less debits", payable.balanceMinor, 150_000);
check("and sits in the credit column", payable.side, "CREDIT");

// An overdrawn bank account is a negative asset, not a liability. The ledger
// reports what the accounts say rather than reclassifying them quietly, but it
// prints the figure on the side it actually falls.
const overdrawn = balanceOf(totals("1100", "ASSET", 100_000, 260_000));
check("an overdrawn asset goes negative", overdrawn.balanceMinor, -160_000);
check("and is printed on the other side", overdrawn.side, "CREDIT");
check("as a positive figure", overdrawn.columnMinor, 160_000);

// -----------------------------------------------------------------------------
// The trial balance
// -----------------------------------------------------------------------------

const chart: AccountTotals[] = [
  totals("1100", "ASSET", 900_000, 300_000), // bank
  totals("1200", "ASSET", 450_000, 200_000), // fees receivable
  totals("2100", "LIABILITY", 50_000, 180_000), // suppliers
  totals("3100", "EQUITY", 0, 400_000), // accumulated fund
  totals("4100", "INCOME", 0, 800_000), // tuition
  totals("5100", "EXPENSE", 480_000, 0), // salaries
  totals("5200", "EXPENSE", 0, 0), // never used
];

const tb = trialBalance(chart);
ok("a trial balance drawn from balanced entries balances", tb.balanced);
check("with no difference", tb.differenceMinor, 0);
// An account with no movement at all is a line nobody needs to read.
check("untouched accounts are left out", tb.rows.length, 6);
check("the debit column", tb.debitMinor, 600_000 + 250_000 + 480_000);
check("equals the credit column", tb.creditMinor, 130_000 + 400_000 + 800_000);

// The check has to be capable of failing, or it proves nothing.
const broken = trialBalance([totals("1100", "ASSET", 100_000, 0)]);
ok("an unbalanced chart is reported as unbalanced", !broken.balanced);
check("by the amount it is out", broken.differenceMinor, 100_000);
check("an empty ledger balances trivially", trialBalance([]).balanced, true);

// -----------------------------------------------------------------------------
// The statements
// -----------------------------------------------------------------------------

const statement = incomeStatement(chart);
check("income is totalled", statement.income.totalMinor, 800_000);
check("expenditure is totalled", statement.expenses.totalMinor, 480_000);
check("the surplus is the difference", statement.surplusMinor, 320_000);
check("an unused expense account is not listed", statement.expenses.rows.length, 1);

const deficit = incomeStatement([
  totals("4100", "INCOME", 0, 200_000),
  totals("5100", "EXPENSE", 350_000, 0),
]);
check("spending more than was earned is a negative surplus", deficit.surplusMinor, -150_000);

const sheet = balanceSheet(chart);
check("assets are totalled", sheet.assetsMinor, 600_000 + 250_000);
check("liabilities are totalled", sheet.liabilities.totalMinor, 130_000);
check("funds are totalled", sheet.equity.totalMinor, 400_000);
// The surplus is its own line until the year is closed, so the sheet ties to
// the income statement printed beside it.
check("the surplus is carried separately", sheet.surplusMinor, 320_000);
check("what funds the assets", sheet.fundedMinor, 130_000 + 400_000 + 320_000);
ok("and the two sides agree", sheet.balanced);
check("with no difference", sheet.differenceMinor, 0);

// The property that matters: any set of balanced entries produces a balance
// sheet that balances. Built here from entries rather than from totals typed
// by hand, so the test cannot agree with itself by construction.
const entries: Line[][] = [
  [debit("1200", 900_000), credit("4100", 900_000)], // billed the term
  [debit("1100", 700_000), credit("1200", 700_000)], // families paid
  [debit("5100", 520_000), credit("1100", 520_000)], // paid salaries
  [debit("5300", 45_000), credit("2100", 45_000)], // an unpaid bill
  [debit("1100", 250_000), credit("3100", 250_000)], // funds put in
];

const rolled = new Map<string, AccountTotals>();
const typeOf: Record<string, AccountTotals["type"]> = {
  "1100": "ASSET",
  "1200": "ASSET",
  "2100": "LIABILITY",
  "3100": "EQUITY",
  "4100": "INCOME",
  "5100": "EXPENSE",
  "5300": "EXPENSE",
};

for (const lines of entries) {
  ok(`the entry touching ${lines[0].accountId} balances`, checkEntry(lines).balanced);
  for (const line of lines) {
    const row =
      rolled.get(line.accountId) ??
      totals(line.accountId, typeOf[line.accountId], 0, 0);
    row.debitMinor += line.debitMinor;
    row.creditMinor += line.creditMinor;
    rolled.set(line.accountId, row);
  }
}

const posted = [...rolled.values()];
ok("the trial balance of real entries balances", trialBalance(posted).balanced);
ok("and so does the balance sheet", balanceSheet(posted).balanced);
check(
  "the surplus on the sheet is the one on the income statement",
  balanceSheet(posted).surplusMinor,
  incomeStatement(posted).surplusMinor,
);
check("which is what was earned less what was spent", incomeStatement(posted).surplusMinor, 900_000 - 565_000);

// -----------------------------------------------------------------------------
// Codes
// -----------------------------------------------------------------------------

check("assets are the 1000s", codeRangeFor("ASSET"), { from: 1000, to: 1999 });
check("income is the 4000s", codeRangeFor("INCOME"), { from: 4000, to: 4999 });
ok("a bank account in the 1000s fits", codeMatchesType("1100", "ASSET"));
ok("tuition in the 1000s does not", !codeMatchesType("1100", "INCOME"));
// A school that already numbers its accounts some other way keeps its numbering.
ok("a non-numeric code is never wrong", codeMatchesType("BANK-01", "ASSET"));
ok("nor is an empty one", codeMatchesType("", "INCOME"));

ok(
  "every account type has a distinct value",
  new Set(ACCOUNT_TYPES.map((entry) => entry.value)).size === ACCOUNT_TYPES.length,
);
ok(
  "and belongs to one statement or the other",
  ACCOUNT_TYPES.every(
    (entry) =>
      entry.statement === "BALANCE_SHEET" || entry.statement === "INCOME_STATEMENT",
  ),
);

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} ledger checks passed.`);
