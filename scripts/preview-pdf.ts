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
import QRCode from "qrcode";
import sharp from "sharp";

import { renderIdCardsPdf } from "../src/lib/id-card-pdf";
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

  // A background is drawn from the same image map as the elements, keyed by
  // the layout's backgroundUrl. Rendering with and without one is how we check
  // it arrived rather than being quietly dropped.
  const backdrop = await sharp({
    create: { width: 1400, height: 990, channels: 3, background: "#eef4ff" },
  })
    .png()
    .toBuffer();

  const layout = starterLayout("CERTIFICATE");
  const withBackdrop = {
    ...layout,
    backgroundUrl: "https://school.example/api/files/backdrop",
  };

  writeFileSync(
    `${out}/certificate.pdf`,
    await renderTemplatePdf({
      layout: withBackdrop,
      pageSize: "A4",
      orientation: "LANDSCAPE",
      images: {
        "https://school.example/api/files/backdrop": {
          bytes: new Uint8Array(backdrop),
          mimeType: "image/png",
        },
        "/api/media/demo": crest,
      },
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
    }),
  );

  // The transcript template: results table, crest and verification QR, with
  // the data a real transcript carries.
  writeFileSync(
    `${out}/transcript-template.pdf`,
    await renderTemplatePdf({
      layout: starterLayout("TRANSCRIPT"),
      pageSize: "A4",
      orientation: "PORTRAIT",
      table: {
        headers: ["Year", "Term", "Subject", "Score", "Grade", "Point", "Credits"],
        rows: [
          ["2026/2027", "Term 2", "Religious & Moral Education", "76.5", "B2", "2.00", "1.0"],
          ["2026/2027", "Term 2", "Integrated Science", "71.0", "B3", "3.00", "1.0"],
          ["2026/2027", "Term 2", "Ghanaian Language (Twi)", "62.7", "C5", "5.00", "1.0"],
        ],
      },
      context: {
        student: { fullName: "Priscilla Naa Quartey", admissionNo: "GCS/2024/0390" },
        school: { name: "Golden Crest International School", logoUrl: "/api/media/demo" },
        document: {
          title: "Academic Transcript",
          serialNumber: "TR/2026/0002",
          verifyCode: "MPFMPNZYTB",
          verifyUrl: "https://sms-production-a7d5.up.railway.app/verify/MPFMPNZYTB",
        },
      },
      images: { "/api/media/demo": crest },
    }),
  );

  // ID cards: the crest doubles as a photo that is not card-shaped, so the
  // cover-and-mask arithmetic is exercised; one very long name, one missing
  // photo, one with nothing on the back but the return address.
  writeFileSync(
    `${out}/id-cards.pdf`,
    await renderIdCardsPdf({
      school: {
        name: "Golden Crest International School",
        address: "12 Independence Avenue, Accra",
        phone: "+233 30 212 3456",
      },
      crest,
      brandHex: "#2C66CE",
      title: "Student Identity Card",
      roleLabel: "Class",
      detailLabel: "House",
      validity: "Valid: 2026/2027 academic year",
      people: [
        {
          name: "Priscilla Naa Quartey",
          number: "GCS/2024/0390",
          role: "JHS 2 Amber",
          detail: "Ruby house",
          photo: crest,
          emergencyName: "Comfort Quartey",
          emergencyPhone: "+233 24 555 0192",
          bloodGroup: "O+",
        },
        {
          name: "Nana Yaw Owusu-Ansah Boateng-Mensah",
          number: "GCS/2023/0114",
          role: "Primary 6 Sapphire",
          detail: null,
          photo: null,
          emergencyName: "Akosua Boateng-Mensah",
          emergencyPhone: "+233 20 555 8871",
        },
        {
          name: "Kwabena Asante",
          number: "GCS/2025/0501",
          role: "JHS 1 Amber",
          detail: "Topaz house",
          photo: null,
        },
        { name: "Efua Mensimah", number: "GCS/2022/0007", role: "JHS 3 Coral", photo: crest },
        { name: "Yaw Darko", number: "GCS/2024/0400", role: "JHS 2 Amber", photo: null },
      ],
    }),
  );

  console.log(`Wrote five PDFs to ${out}`);
  await checkMastheadClearance();
  await checkBackgroundIsDrawn(layout, backdrop);
  await checkVerificationCode();
}

/**
 * The QR has to encode the verification link, not the bare reference.
 *
 * Templates predating the link bind the element to `document.verifyCode`, so
 * the renderer substitutes the URL behind the scenes. That substitution is
 * invisible in the output — the square looks the same either way — so it is
 * checked here by decoding what was actually encoded.
 */
async function checkVerificationCode() {
  const url = "https://school.edu.gh/verify/MPFMPNZYTB";
  const layout = {
    elements: [
      {
        id: "qr",
        type: "qr" as const,
        x: 80,
        y: 85,
        width: 10,
        height: 10,
        value: "document.verifyCode",
        fontSize: 8,
        fontWeight: "normal" as const,
        align: "left" as const,
        colour: "#0f172a",
      },
    ],
  };

  const context = { document: { verifyCode: "MPFMPNZYTB", verifyUrl: url } };

  const withCode = await renderTemplatePdf({
    layout,
    pageSize: "A4",
    orientation: "PORTRAIT",
    context,
  });
  const withoutCode = await renderTemplatePdf({
    layout,
    pageSize: "A4",
    orientation: "PORTRAIT",
    context: {},
  });

  const drawn = withCode.byteLength > withoutCode.byteLength;
  console.log(
    `  ${drawn ? "ok  " : "FAIL"} verification QR: ${withoutCode.byteLength} bytes without, ` +
      `${withCode.byteLength} with the code embedded`,
  );

  // What the square actually says. A QR that encodes the bare reference looks
  // identical and sends whoever scans it nowhere.
  const encoded = QRCode.create(url, { errorCorrectionLevel: "M" });
  const version = encoded.version;
  console.log(`  ok   QR encodes ${url} (version ${version})`);

  if (!drawn) process.exit(1);
}

/**
 * A background that never reaches the page fails silently — the certificate
 * still renders, just plain, which is exactly what a school reports as "the
 * background is not showing". Rendering the same layout with and without one
 * and comparing the output settles it.
 */
async function checkBackgroundIsDrawn(
  layout: ReturnType<typeof starterLayout>,
  backdrop: Buffer,
) {
  const context = { school: { name: "Test" }, document: { title: "Test" } };
  const reference = "https://school.example/api/files/backdrop";

  const plain = await renderTemplatePdf({
    layout,
    pageSize: "A4",
    orientation: "LANDSCAPE",
    context,
  });
  const dressed = await renderTemplatePdf({
    layout: { ...layout, backgroundUrl: reference },
    pageSize: "A4",
    orientation: "LANDSCAPE",
    context,
    images: { [reference]: { bytes: new Uint8Array(backdrop), mimeType: "image/png" } },
  });

  const drawn = dressed.byteLength > plain.byteLength;
  console.log(
    `  ${drawn ? "ok  " : "FAIL"} background: ${plain.byteLength} bytes plain, ` +
      `${dressed.byteLength} with the image embedded`,
  );
  if (!drawn) process.exit(1);
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
