/**
 * Payroll arithmetic, checked against hand-computed figures.
 *
 * The one part of this system that decides what lands in someone's bank
 * account. These assertions are the difference between "the code runs" and
 * "the code is right": each expected value below was worked out from the
 * GRA monthly bands and the SSNIT split by hand, not read off the output.
 *
 *   npm run payroll:check
 *
 * Exits 1 on any mismatch, so it can gate a deploy.
 */
import {
  computePaye,
  computePayslip,
  PAYE_BANDS,
  TOP_BAND_STARTS_AT_MINOR,
} from "../src/lib/payroll";

let failures = 0;

function check(label: string, actual: number, expected: number) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `  [${ok ? "  ok  " : " FAIL "}] ${label}: ${(actual / 100).toFixed(2)}` +
      (ok ? "" : ` : expected ${(expected / 100).toFixed(2)}`),
  );
}

console.log("\nThe shape of the table");
// The assertion that matters most, because it does not depend on my
// arithmetic: the graduated bands must sum to exactly GH₵50,000 a month —
// GH₵600,000 a year — which is where the 35% rate starts by statute. The
// first version of this file tested a taxable amount where a wrong table and
// a right one happen to agree, and passed green over two bad widths.
check("graduated bands sum to GH₵50,000", TOP_BAND_STARTS_AT_MINOR, 5_000_000);
check("band count", PAYE_BANDS.length * 100, 700);
check("free band", (PAYE_BANDS[0].widthMinor ?? 0), 49000);
check("25% band width", (PAYE_BANDS[4].widthMinor ?? 0), 1639500);
check("30% band width", (PAYE_BANDS[5].widthMinor ?? 0), 2987500);

console.log("\nPAYE bands (monthly, GHS)");
// First GH₵490 is free.
check("taxable 490 → nil", computePaye(49000), 0);
// 490 free, next 110 at 5% = 5.50
check("taxable 600 → 5.50", computePaye(60000), 550);
// + next 130 at 10% = 13.00 → 18.50
check("taxable 730 → 18.50", computePaye(73000), 1850);
// + next 3,000 at 17.5% = 525 → 543.50
check("taxable 3,730 → 543.50", computePaye(373000), 54350);
// + next 16,395 at 25% = 4,098.75 → 4,642.25 at the top of the 25% band
check("taxable 20,125 → 4,642.25", computePaye(2012500), 464225);
// Every bounded band exhausted: 543.50 + 4,098.75 + 8,962.50 = 13,604.75
check("taxable 50,000 → 13,604.75", computePaye(5000000), 1360475);
// One cedi into the top band: + 0.35
check("taxable 50,001 → 13,605.10", computePaye(5000100), 1360510);
check("taxable 0 → nil", computePaye(0), 0);
check("negative taxable → nil", computePaye(-5000), 0);

console.log("\nWhole payslips");
{
  // GH₵1,500 basic + GH₵300 housing.
  // SSNIT ee = 5.5% of 1,500 = 82.50; gross 1,800; taxable 1,717.50
  // PAYE: 490 free, 110@5%=5.50, 130@10%=13.00, remaining 987.50@17.5%=172.8125
  //       → 191.31 (half-up on the pesewa)
  // net = 1,800 − 82.50 − 191.31 = 1,526.19
  const f = computePayslip({
    basicMinor: 150000,
    allowances: [{ name: "Housing", amountMinor: 30000 }],
  });
  check("gross", f.grossMinor, 180000);
  check("SSNIT employee (5.5% of basic)", f.ssnitEmployeeMinor, 8250);
  check("SSNIT employer (13% of basic)", f.ssnitEmployerMinor, 19500);
  check("taxable (gross − SSNIT)", f.taxableMinor, 171750);
  check("PAYE", f.payeMinor, 19131);
  check("net", f.netMinor, 152619);
}
{
  // A deduction list that outruns the pay must floor at zero, never negative.
  const f = computePayslip({
    basicMinor: 50000,
    otherDeductions: [{ name: "Salary advance", amountMinor: 900000 }],
  });
  check("net floors at zero", f.netMinor, 0);
}
{
  // No salary at all is a legitimate zero, not a crash.
  const f = computePayslip({ basicMinor: 0 });
  check("zero basic → zero net", f.netMinor, 0);
  check("zero basic → zero PAYE", f.payeMinor, 0);
}

console.log(
  failures ? `\n${failures} failure(s).\n` : "\nEvery figure matches the hand computation.\n",
);
process.exit(failures ? 1 : 0);
