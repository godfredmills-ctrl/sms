/**
 * Renders a store issue voucher so it can be looked at.
 *
 * Specifically to check the signature lines. A run of underscores was once
 * parsed as underscore emphasis by the shared Markdown parser, and every
 * "Received by: ____ Date: ____" in this system silently became bold text with
 * the lines gone. That was found by rendering a PDF and looking at it, and no
 * test would have caught it — so this renders the one document in the store
 * module that has lines to sign on.
 */
import { writeFileSync } from "node:fs";

import { renderDocumentPdf } from "../src/lib/document-pdf";
import { formatQuantity, toMilli } from "../src/lib/stock-rules";

const out = process.env.SCRATCH ?? ".";

const lines = [
  { code: "SMIS/PRV/0001", name: "Rice, perfumed", unit: "sack", quantityMilli: toMilli(6) },
  { code: "SMIS/PRV/0002", name: "Cooking oil", unit: "litre", quantityMilli: toMilli(12.5) },
  {
    code: "SMIS/CLN/0001",
    name: "Disinfectant, concentrated, for the kitchen floors",
    unit: "litre",
    quantityMilli: toMilli(2.5),
  },
];

const body: string[] = [
  "| Code | Item | Quantity |",
  "| --- | --- | --- |",
  ...lines.map(
    (line) => `| ${line.code} | ${line.name} | ${formatQuantity(line.quantityMilli)} ${line.unit} |`,
  ),
  "",
  "Week 4 provisions for the dining hall.",
  "",
  "The goods listed above were issued from the school store and received in full.",
  "",
  "Issued by: ________________________    Date: ______________",
  "",
  "Received by: ______________________    Date: ______________",
  "",
];

async function main() {
  const pdf = await renderDocumentPdf({
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
    document: {
      title: "Store Issue Voucher",
      reference: "SIV/2026/0041",
      date: "24 August 2026",
      addressee: ["Ama Serwaa Boateng", "Dining hall"],
      salutation: null,
      body: body.join("\n"),
      closing: null,
      signatory: null,
      footnote: "Entered by Kofi Mensah. Queries to the school store.",
    },
  });

  writeFileSync(`${out}/store-voucher.pdf`, pdf);
  console.log(`\n  Wrote ${out}/store-voucher.pdf`);
  console.log("\n  What the body should render as:\n");
  for (const line of body) console.log(`    ${line}`);
  console.log("");
}

main();
