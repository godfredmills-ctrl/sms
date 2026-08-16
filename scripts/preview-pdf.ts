/**
 * Writes one of each generated document so a layout change can be looked at.
 *
 * There is no way to see a PDF from a diff, and the arithmetic that positions
 * a crest against a masthead is exactly the kind that reads correctly and comes
 * out overlapping. This renders the three built-in documents with realistic
 * content, into `$SCRATCH` or the working directory.
 *
 *   npm run pdf:preview
 *
 * It also asserts the one thing that cannot be checked by looking at a single
 * example: that a long school name wraps inside the space left by the crest
 * rather than running underneath it.
 */
import { writeFileSync } from "node:fs";

import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";

import { renderReportCardPdf, renderTablePdf, renderTemplatePdf } from "../src/lib/pdf";
import { starterLayout } from "../src/lib/templates";

const out = process.env.SCRATCH ?? ".";

const crestSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="shield" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16a06b"/><stop offset="1" stop-color="#0b5c3d"/></linearGradient></defs>
  <path d="M256 28 L436 96 V268 C436 372 356 442 256 484 C156 442 76 372 76 268 V96 Z" fill="url(#shield)" stroke="#d9a325" stroke-width="16" stroke-linejoin="round"/>
  <path d="M150 232 L256 196 L362 232 L362 256 L256 220 L150 256 Z" fill="#d9a325"/>
  <path d="M150 300 Q202 280 248 300 L248 374 Q202 354 150 374 Z" fill="#f8fafc"/>
  <path d="M264 300 Q310 280 362 300 L362 374 Q310 354 264 374 Z" fill="#f8fafc"/>
  <rect x="248" y="296" width="16" height="82" rx="4" fill="#d9a325"/>
</svg>`;

async function main() {
  const png = await sharp(Buffer.from(crestSvg)).png().toBuffer();
  const crest = { bytes: new Uint8Array(png), mimeType: "image/png" };

  writeFileSync(
    `${out}/report-card.pdf`,
    await renderReportCardPdf({
      school: {
        name: "Golden Crest International School",
        address: "12 Independence Avenue, Accra · +233 30 212 3456",
        motto: "Knowledge, Character, Service",
      },
      crest,
      heading: "TERMINAL REPORT — TERM 2, 2026/2027",
      student: {
        name: "Priscilla Naa Quartey",
        admissionNo: "GCS/2024/0390",
        className: "JHS 3 A",
        gender: "Female",
      },
      meta: [
        { label: "Term", value: "Term 2, 2026/2027" },
        { label: "Position", value: "4th of 32" },
        { label: "Attendance", value: "58 of 62 days" },
        { label: "Conduct", value: "Excellent" },
      ],
      subjects: [
        { subject: "Mathematics", ca: "28", exam: "54", total: "82", grade: "A1", position: "3rd", classAverage: "68.4", remark: "Excellent" },
        { subject: "English Language", ca: "26", exam: "49", total: "75", grade: "B2", position: "6th", classAverage: "66.1", remark: "Very good" },
        { subject: "Integrated Science", ca: "24", exam: "47", total: "71", grade: "B3", position: "8th", classAverage: "63.9", remark: "Good" },
        { subject: "Social Studies", ca: "27", exam: "51", total: "78", grade: "B2", position: "4th", classAverage: "65.0", remark: "Very good" },
        { subject: "Computing", ca: "29", exam: "56", total: "85", grade: "A1", position: "2nd", classAverage: "70.2", remark: "Outstanding" },
      ],
      summary: [
        { label: "Average", value: "78.2%" },
        { label: "Total", value: "391" },
        { label: "Grade", value: "B2" },
        { label: "Aggregate", value: "12" },
      ],
      remarks: [
        {
          label: "Form teacher",
          body: "A steady term. Priscilla contributes well in class and her written work has improved.",
          signatory: "Mrs Esi Appiah",
        },
        { label: "Head teacher", body: "A pleasing report. Keep it up next term.", signatory: "Mrs Abena Owusu" },
      ],
      footer: "Next term begins 12 October 2026.",
    }),
  );

  writeFileSync(
    `${out}/transcript.pdf`,
    await renderTablePdf({
      title: "Golden Crest International School — Academic Transcript",
      subtitle:
        "Priscilla Naa Quartey  ·  GCS/2024/0390  ·  Serial TR-2026-0004  ·  Issued 16 August 2026",
      headers: ["Year", "Term", "Subject", "Score", "Grade", "Point", "Credits"],
      rows: Array.from({ length: 9 }, (_, index) => [
        "2025/2026",
        `Term ${(index % 3) + 1}`,
        ["Mathematics", "English Language", "Integrated Science"][index % 3],
        String(70 + index),
        "B2",
        "3.00",
        "1.0",
      ]),
      footer:
        "Cumulative GPA 3.42 · Verify at /verify/K3M9-2QX7 · This document is void if altered.",
      crest,
    }),
  );

  writeFileSync(
    `${out}/certificate.pdf`,
    await renderTemplatePdf({
      layout: starterLayout("CERTIFICATE"),
      pageSize: "A4",
      orientation: "LANDSCAPE",
      context: {
        student: { fullName: "Priscilla Naa Quartey" },
        school: {
          name: "Golden Crest International School",
          motto: "Knowledge, Character, Service",
          logoUrl: "/api/media/demo",
        },
        document: {
          title: "CERTIFICATE OF MERIT",
          awardedFor: "Outstanding performance in the 2026 Science Fair",
          issuedOn: "16 August 2026",
          serialNumber: "CERT-2026-0031",
          verifyCode: "K3M9-2QX7",
          signedBy: "Mrs Abena Owusu",
          signatoryTitle: "Head Teacher",
        },
      },
      images: { "/api/media/demo": crest },
    }),
  );

  console.log(`Wrote report-card.pdf, transcript.pdf and certificate.pdf to ${out}`);
  await checkMastheadClearance();
}

/**
 * The masthead reserves a gutter for the crest and wraps into what is left.
 * This measures a deliberately long school name against those numbers, which
 * is the case that was actually overlapping before the gutter existed.
 */
async function checkMastheadClearance() {
  const probe = await PDFDocument.create();
  const bold = await probe.embedFont(StandardFonts.HelveticaBold);

  const long = "Golden Crest International School and Preparatory Academy";
  const cases = [
    { name: "report card", pageWidth: 595.28, margin: 40, gutter: 56, size: 15, text: long },
    {
      name: "transcript",
      pageWidth: 595.28,
      margin: 48,
      gutter: 52,
      size: 16,
      text: `${long} — Academic Transcript`,
    },
  ];

  let ok = true;
  for (const item of cases) {
    const available = item.pageWidth - item.margin * 2 - item.gutter;
    // The renderer wraps on spaces, so the widest word is the floor: no
    // wrapping can make a line narrower than its longest single word.
    const widest = Math.max(
      ...item.text.split(/\s+/).map((word) => bold.widthOfTextAtSize(word, item.size)),
    );
    const fits = widest <= available;
    if (!fits) ok = false;
    console.log(
      `  ${fits ? "ok  " : "FAIL"} ${item.name}: widest word ${widest.toFixed(0)}pt, ` +
        `${available.toFixed(0)}pt available beside the crest`,
    );
  }

  if (!ok) process.exit(1);
}

void main();
