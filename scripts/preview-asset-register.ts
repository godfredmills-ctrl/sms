/**
 * Renders the printed asset register so it can be looked at.
 *
 * The register is a wide table with three money columns, and the failures that
 * matter are the ones a test cannot see: a column truncated to nothing, the
 * footer note running off the page, totals that disagree with the rows above
 * them. This builds one from the same rules module the application uses.
 */
import { writeFileSync } from "node:fs";

import {
  conditionLabel,
  depreciate,
  disposalResult,
  registerTotals,
  statusLabel,
  type RegisterLine,
} from "../src/lib/asset-rules";
import { renderReportPdf } from "../src/lib/report-pdf";

const out = process.env.SCRATCH ?? ".";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

const money = (minor: number) =>
  `GHS ${(minor / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortDate = (date: Date | null) =>
  date ? date.toISOString().slice(0, 10) : "-";

type Row = RegisterLine & {
  tag: string;
  name: string;
  category: string;
  location: string;
  custodian: string;
  condition: string;
};

const rows: Row[] = [
  {
    tag: "SMIS/VEH/0001",
    name: "Toyota Hiace minibus",
    category: "Motor vehicles",
    location: "Transport yard",
    custodian: "-",
    condition: "FAIR",
    status: "IN_USE",
    costMinor: 18_000_000,
    residualMinor: 1_800_000,
    usefulLifeYears: 8,
    purchasedOn: daysAgo(1_400),
    disposalProceedsMinor: 0,
  },
  {
    tag: "SMIS/PLT/0001",
    name: "Perkins 60kVA standby generator with acoustic canopy",
    category: "Plant and machinery",
    location: "Administration block",
    custodian: "-",
    condition: "GOOD",
    status: "IN_USE",
    costMinor: 24_500_000,
    residualMinor: 1_225_000,
    usefulLifeYears: 10,
    purchasedOn: daysAgo(1_100),
    disposalProceedsMinor: 0,
  },
  {
    tag: "SMIS/ICT/0001",
    name: "HP ProBook laptop",
    category: "ICT equipment",
    location: "Administration block",
    custodian: "Abena Owusu-Ansah",
    condition: "GOOD",
    status: "IN_USE",
    costMinor: 1_150_000,
    residualMinor: 0,
    usefulLifeYears: 4,
    purchasedOn: daysAgo(500),
    disposalProceedsMinor: 0,
  },
  {
    tag: "SMIS/ICT/0002",
    name: "Epson projector",
    category: "ICT equipment",
    location: "Assembly hall",
    custodian: "-",
    condition: "GOOD",
    status: "MISSING",
    costMinor: 480_000,
    residualMinor: 0,
    usefulLifeYears: 4,
    purchasedOn: daysAgo(900),
    disposalProceedsMinor: 0,
  },
  {
    tag: "SMIS/LND/0001",
    name: "School land, Adenta parcel",
    category: "Land and buildings",
    location: "-",
    custodian: "-",
    condition: "GOOD",
    status: "IN_USE",
    costMinor: 120_000_000,
    residualMinor: 0,
    usefulLifeYears: null,
    purchasedOn: daysAgo(4_000),
    disposalProceedsMinor: 0,
  },
  {
    tag: "SMIS/VEH/0003",
    name: "Nissan Urvan minibus (former)",
    category: "Motor vehicles",
    location: "-",
    custodian: "-",
    condition: "POOR",
    status: "DISPOSED",
    costMinor: 9_500_000,
    residualMinor: 950_000,
    usefulLifeYears: 8,
    purchasedOn: daysAgo(3_000),
    disposedOn: daysAgo(90),
    disposalProceedsMinor: 700_000,
  },
];

const asOf = new Date();
const totals = registerTotals(rows, asOf);

async function main() {
const pdf = await renderReportPdf({
  letterhead: {
    image: null,
    school: {
      name: "St Michael's International School",
      motto: "Knowledge and Character",
      address: "P.O. Box 118, 12 Independence Avenue, Adenta, Accra",
      phone: "+233 30 123 4567",
      email: "office@stmichaels.edu.gh",
      website: "stmichaels.edu.gh",
      registrationNo: "GES/PS/2009/0182",
    },
    crest: null,
    brandHex: "#2C66CE",
  } as never,
  report: {
    title: "Asset register",
    subtitle: `${totals.heldCount} held · ${money(totals.costMinor)} at cost · ${money(totals.netBookMinor)} written down`,
    meta: `As at ${asOf.toDateString()} · prepared by Kofi Mensah`,
    columns: [
      { key: "tag", label: "Tag" },
      { key: "name", label: "Asset" },
      { key: "category", label: "Category" },
      { key: "location", label: "Where" },
      { key: "custodian", label: "Held by" },
      { key: "state", label: "State" },
      { key: "purchased", label: "Bought" },
      { key: "cost", label: "Cost", numeric: true },
      { key: "depreciation", label: "Depreciated", numeric: true },
      { key: "value", label: "Written down to", numeric: true },
    ],
    rows: rows.map((row) => {
      const value = depreciate(row, asOf);
      return {
        tag: row.tag,
        name: row.name,
        category: row.category,
        location: row.location,
        custodian: row.custodian,
        state: `${statusLabel(row.status)} · ${conditionLabel(row.condition)}`,
        purchased: shortDate(row.purchasedOn),
        cost: money(row.costMinor),
        depreciation: value.notDepreciated ? "not depreciated" : money(value.accumulatedMinor),
        value: row.status === "DISPOSED" ? "disposed" : money(value.netBookMinor),
      };
    }),
    footerNote: [
      `Held: ${totals.heldCount}. Disposed of: ${totals.disposedCount}. Cannot be found: ${totals.missingCount}.`,
      `At cost ${money(totals.costMinor)}, less depreciation ${money(totals.accumulatedMinor)}, written down to ${money(totals.netBookMinor)}.`,
      totals.disposalGainMinor !== 0
        ? `${totals.disposalGainMinor >= 0 ? "Gain" : "Loss"} on disposals: ${money(Math.abs(totals.disposalGainMinor))}.`
        : null,
      "Depreciation is straight line, charged monthly from the date of purchase and never taken below residual value. Items with no useful life set are carried at cost.",
    ]
      .filter(Boolean)
      .join(" "),
  },
});

writeFileSync(`${out}/asset-register.pdf`, pdf);

console.log(`\n  Wrote ${out}/asset-register.pdf\n`);
console.log("  The figures it should show:");
for (const row of rows) {
  const value = depreciate(row, asOf);
  console.log(
    `    ${row.tag.padEnd(14)} cost ${money(row.costMinor).padStart(16)}  ` +
      `depreciated ${money(value.accumulatedMinor).padStart(16)}  ` +
      `worth ${money(value.netBookMinor).padStart(16)}${row.status === "DISPOSED" ? "  (disposed)" : ""}`,
  );
}
const sale = disposalResult(rows.find((row) => row.status === "DISPOSED")!);
console.log(
  `\n    Disposal: sold for ${money(sale!.proceedsMinor)} against ${money(sale!.netBookMinor)} on the books` +
    `, ${sale!.gainMinor >= 0 ? "gain" : "loss"} of ${money(Math.abs(sale!.gainMinor))}`,
);
console.log(
  `\n    Totals: cost ${money(totals.costMinor)} - depreciation ${money(totals.accumulatedMinor)}` +
    ` = ${money(totals.netBookMinor)}  (reconciles: ${totals.costMinor - totals.accumulatedMinor === totals.netBookMinor})\n`,
);
}

main();
