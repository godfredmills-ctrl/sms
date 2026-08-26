/**
 * Ghanaian payroll arithmetic.
 *
 * Pure functions over integer pesewas — no database, no formatting — so the
 * one part of this system that lands in someone's bank account can be read,
 * argued with, and checked against a payslip by hand.
 *
 * The order of operations is the law's, not a convenience:
 *   1. gross            = basic + allowances
 *   2. SSNIT employee   = 5.5% of BASIC (the employer adds 13% on top)
 *   3. taxable income   = gross − SSNIT employee
 *   4. PAYE             = the monthly graduated bands applied to that
 *   5. net              = gross − SSNIT employee − PAYE − other deductions
 *
 * SSNIT is deducted before tax — computing PAYE on the gross would overtax
 * every member of staff every month, and it is the classic payroll bug.
 *
 * The rates below are the current Ghana Revenue Authority monthly bands and
 * the SSNIT Tier-1/2 split. They are constants rather than settings on
 * purpose: a school should not be able to quietly invent its own tax table,
 * and when the law changes this file changes with a comment saying when.
 */

/** Employee's SSNIT contribution: 5.5% of basic salary. */
export const SSNIT_EMPLOYEE_RATE = 0.055;
/** Employer's SSNIT contribution: 13% of basic salary, paid on top. */
export const SSNIT_EMPLOYER_RATE = 0.13;

/**
 * Monthly PAYE bands (2024 rates, GHS). Each band taxes only the income
 * that falls inside it; the last band has no upper bound.
 *
 * The widths come from the First Schedule to Act 896 as amended, divided by
 * twelve — every annual figure divides exactly. The check that keeps them
 * honest is that the graduated bands sum to exactly GH₵50,000 a month
 * (GH₵600,000 a year), the statutory point where 35% begins:
 *
 *   490 + 110 + 130 + 3,000 + 16,395 + 29,875 = 50,000
 *
 * scripts/check-payroll.ts asserts that sum. It is the assertion that would
 * have caught the first version of this table, where two widths were off and
 * put the top band at GH₵49,759 — a number that appears in no Act.
 */
export const PAYE_BANDS: Array<{ widthMinor: number | null; rate: number }> = [
  { widthMinor: 49000, rate: 0 }, // first GH₵490 — free
  { widthMinor: 11000, rate: 0.05 }, // next GH₵110
  { widthMinor: 13000, rate: 0.1 }, // next GH₵130
  { widthMinor: 300000, rate: 0.175 }, // next GH₵3,000
  { widthMinor: 1639500, rate: 0.25 }, // next GH₵16,395
  { widthMinor: 2987500, rate: 0.3 }, // next GH₵29,875
  { widthMinor: null, rate: 0.35 }, // above GH₵50,000
];

/** Where the top rate starts: the sum of every bounded band, in pesewas. */
export const TOP_BAND_STARTS_AT_MINOR = PAYE_BANDS.reduce(
  (total, band) => total + (band.widthMinor ?? 0),
  0,
);

export type Allowance = { name: string; amountMinor: number };

export type PayslipInput = {
  basicMinor: number;
  allowances?: Allowance[] | null;
  otherDeductions?: Allowance[] | null;
};

export type PayslipFigures = {
  basicMinor: number;
  allowancesMinor: number;
  grossMinor: number;
  ssnitEmployeeMinor: number;
  ssnitEmployerMinor: number;
  taxableMinor: number;
  payeMinor: number;
  otherDeductionsMinor: number;
  netMinor: number;
};

/** Rounds to whole pesewas — half up, the way a payslip does. */
function round(value: number): number {
  return Math.round(value);
}

function sum(entries: Allowance[] | null | undefined): number {
  return (entries ?? []).reduce(
    (total, entry) => total + (Number.isFinite(entry.amountMinor) ? entry.amountMinor : 0),
    0,
  );
}

/** PAYE on a month's taxable income, in pesewas. */
export function computePaye(taxableMinor: number): number {
  if (taxableMinor <= 0) return 0;

  let remaining = taxableMinor;
  let tax = 0;

  for (const band of PAYE_BANDS) {
    if (remaining <= 0) break;
    const slice = band.widthMinor === null ? remaining : Math.min(remaining, band.widthMinor);
    tax += slice * band.rate;
    remaining -= slice;
  }

  return round(tax);
}

/**
 * Every figure on one payslip, from a basic salary and its allowances.
 *
 * Allowances are taxable and pensionable-exempt here: SSNIT is charged on
 * the basic alone, which is how a Ghanaian payslip reads, while PAYE is
 * charged on everything less the SSNIT deduction.
 */
export function computePayslip(input: PayslipInput): PayslipFigures {
  const basicMinor = Math.max(0, round(input.basicMinor));
  const allowancesMinor = Math.max(0, sum(input.allowances));
  const grossMinor = basicMinor + allowancesMinor;

  const ssnitEmployeeMinor = round(basicMinor * SSNIT_EMPLOYEE_RATE);
  const ssnitEmployerMinor = round(basicMinor * SSNIT_EMPLOYER_RATE);

  const taxableMinor = Math.max(0, grossMinor - ssnitEmployeeMinor);
  const payeMinor = computePaye(taxableMinor);

  const otherDeductionsMinor = Math.max(0, sum(input.otherDeductions));

  // Never negative: a deduction list that outruns the pay is a data error,
  // and a payslip showing a negative net would be acted on as if it meant
  // the staff member owed the school money.
  const netMinor = Math.max(
    0,
    grossMinor - ssnitEmployeeMinor - payeMinor - otherDeductionsMinor,
  );

  return {
    basicMinor,
    allowancesMinor,
    grossMinor,
    ssnitEmployeeMinor,
    ssnitEmployerMinor,
    taxableMinor,
    payeMinor,
    otherDeductionsMinor,
    netMinor,
  };
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "August 2026" for a run's year and 1-based month. */
export function payrollPeriodLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? "-"} ${year}`;
}

/** Parses the allowance JSON a Staff row or Payslip carries. */
export function parseAllowances(value: unknown): Allowance[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const record = entry as { name?: unknown; amountMinor?: unknown };
      const name = typeof record?.name === "string" ? record.name.trim() : "";
      const amountMinor = Number(record?.amountMinor);
      return { name, amountMinor };
    })
    .filter((entry) => entry.name && Number.isFinite(entry.amountMinor) && entry.amountMinor > 0);
}
