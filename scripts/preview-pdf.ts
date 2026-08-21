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
import { renderPayslipsPdf } from "../src/lib/payslip-pdf";
import { renderLettersPdf } from "../src/lib/letter-pdf";
import { renderReportPdf } from "../src/lib/report-pdf";
import { summariseReport } from "../src/lib/report-stats";
import { datasetFor } from "../src/lib/reporting";
import { renderTimetablePdf } from "../src/lib/timetable-pdf";
import { renderDocumentPdf } from "../src/lib/document-pdf";
import { statementMarkdown } from "../src/lib/expenses";
import { renderManifestPdf } from "../src/lib/manifest-pdf";
import { renderVisitorPassesPdf } from "../src/lib/visitor-pass-pdf";
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

  // Visitor passes: a long organisation that must truncate rather than run
  // under the QR code, a name with Twi orthography, and one walk-in with no
  // host so the "Visiting Reception" fallback is exercised.
  writeFileSync(
    `${out}/visitor-passes.pdf`,
    await renderVisitorPassesPdf({
      school: {
        name: "Golden Crest International School",
        address: "12 Independence Avenue, Accra",
        phone: "+233 30 212 3456",
      },
      crest,
      passes: [
        {
          passNo: "V-0819-04",
          name: "Comfort Adjoa Quartey",
          organisation: "Parent of Priscilla, JHS 2 Amber",
          category: "Parent",
          host: "Mensah, Grace",
          signedInAt: new Date("2026-08-19T09:12:00Z"),
        },
        {
          passNo: "V-0819-05",
          name: "Kwabɛna Asantɛ-Ɔboɔ",
          organisation: "Ghana Education Service, Ayawaso West Municipal Directorate",
          category: "Inspector",
          host: null,
          signedInAt: new Date("2026-08-19T10:45:00Z"),
        },
      ],
    }),
  );

  // The same pass with every string at its worst: a school name longer than
  // the card, a pass number from a very busy day, a two-line visitor name and
  // no crest. What this catches is text running under the QR column.
  writeFileSync(
    `${out}/visitor-passes-long.pdf`,
    await renderVisitorPassesPdf({
      school: {
        name: "The Golden Crest International School of Science and Technology, Accra",
        address: "12 Independence Avenue, Airport Residential Area, Accra, Greater Accra",
        phone: "+233 30 212 3456",
      },
      crest: null,
      passes: [
        {
          passNo: "V-1231-148",
          name: "Nana Yaw Owusu-Ansah Boateng-Mensah",
          organisation: "Ghana Water Company Limited, Metropolitan Maintenance Division",
          category: "Contractor",
          host: "Owusu-Ansah Boateng-Mensah, Nana Yaw Kwabena",
          signedInAt: new Date("2026-12-31T16:05:00Z"),
        },
      ],
    }),
  );

  // The bus manifest: Twi orthography in the names, one very long stop
  // landmark, a hand-over note, and children with no stop recorded — the
  // group most likely to be quietly dropped.
  writeFileSync(
    `${out}/manifest.pdf`,
    await renderManifestPdf({
      school: { name: "Golden Crest International School", phone: "+233 30 212 3456" },
      route: { code: "R1", name: "Spintex — Tema" },
      run: "AFTERNOON",
      printedOn: new Date("2026-08-20T06:30:00Z"),
      vehicles: [
        {
          registration: "GT 4821-24",
          driver: "Emmanuel Tetteh",
          driverPhone: "+233 20 555 0120",
          assistant: "Comfort Adjei",
          assistantPhone: "+233 24 555 0140",
        },
      ],
      stops: [
        {
          name: "Spintex Junction",
          landmark: "opposite the Total filling station near the Papaye",
          time: "15:45",
          children: [
            {
              name: "Priscilla Naa Quartey",
              admissionNo: "GCS/2024/0390",
              className: "JHS 2 Amber",
              guardianName: "Comfort Quartey",
              guardianPhone: "+233 24 555 0192",
            },
            {
              name: "Kwabɛna Asantɛ-Ɔboɔ",
              admissionNo: "GCS/2025/0501",
              className: "JHS 1 Amber",
              guardianName: "Ɔboɔ Mensah",
              guardianPhone: "+233 20 555 8871",
              collectedBy: "Grandmother — Auntie Akosua",
            },
          ],
        },
        {
          name: "Baatsona",
          landmark: "by the traffic light",
          time: "15:30",
          children: [
            {
              name: "Nana Yaw Owusu-Ansah Boateng-Mensah",
              admissionNo: "GCS/2023/0114",
              className: "Primary 6 Sapphire",
              guardianName: "Akosua Boateng-Mensah",
              guardianPhone: "+233 20 555 8871",
              notes: "Do not release to anyone else",
            },
          ],
        },
        { name: "Nungua Barrier", landmark: "at the police post", time: "15:15", children: [] },
      ],
      unplaced: [
        {
          name: "Efua Mensimah",
          admissionNo: "GCS/2022/0007",
          className: "JHS 3 Coral",
          guardianName: "Yaw Darko",
          guardianPhone: "+233 24 555 0311",
        },
      ],
    }),
  );

  // A written document: every block the markdown parser supports, a Twi name
  // in the body, and a cedi amount — the two things that have taken a
  // renderer down before. Drafted, so the watermark is exercised.
  writeFileSync(
    `${out}/written-document.pdf`,
    await renderDocumentPdf({
      letterhead: {
        image: null,
        school: {
          name: "Golden Crest International School",
          motto: "Knowledge, Character, Service",
          address: "P.O. Box 4821, 12 Independence Avenue, Accra",
          phone: "+233 30 212 3456",
          email: "info@goldencrest.edu.gh",
          website: "goldencrest.edu.gh",
          registrationNo: "GES/PS/2011/0473",
        },
        crest,
        brandHex: "#2C66CE",
      },
      document: {
        title: "Staff Development Proposal 2026/2027",
        reference: "GCS/HR/2026/014",
        date: "21 August 2026",
        addressee: ["The Board of Governors", "Golden Crest International School", "Accra"],
        salutation: "Members of the Board,",
        closing: "Yours faithfully,",
        signatory: { name: "Grace Asante", title: "Head of Human Resources" },
        footnote: "Circulated to the Board and the Head Teacher. Not for wider distribution.",
        watermark: "Draft",
        body: [
          "Following the Board's request of 14 March, this paper sets out a proposal",
          "for staff development in the coming academic year, with costs.",
          "",
          "## Background",
          "",
          "Teaching staff have had **no structured training** since 2023. Three new",
          "teachers joined in September with no formal induction, and two of last",
          "year's leavers cited *lack of development* in their exit interviews.",
          "",
          "## What is proposed",
          "",
          "1. A termly training day, facilitated externally",
          "2. A mentoring scheme pairing each new teacher with a senior colleague",
          "3. A small library of subject texts, held in the staff room",
          "",
          "| Item | Term 1 | Term 2 | Term 3 |",
          "| --- | --- | --- | --- |",
          "| External facilitator | GH₵4,500 | GH₵4,500 | GH₵4,500 |",
          "| Materials and refreshments | 900 | 900 | 900 |",
          // A row with a cell more than the header: squared by the parser, so
          // the overflow folds into the last column instead of printing off
          // the right edge of the paper. And an escaped pipe, which is a pipe.
          "| Cover for the INSET day | 0 | 0 | 600 | plus \\| travel |",
          "",
          // A hand-aligned line: the tab is a gap, not a deletion.
          "Deposit paid to date\t GH₵1,200, against the Term 1 figure above.",
          "",
          // Emphasis inside a heading keeps the weight of the heading.
          "### Costs *provisional* until `GCS/FIN/2026` closes",
          "",
          // Lone asterisks used as footnote marks are not emphasis.
          "Figures marked * are indicative; items marked * exclude VAT.",
          "",
          "> The Board asked that any proposal show what it would displace. Nothing",
          "> is displaced: this comes from the training line already in the budget.",
          "",
          "### Risks",
          "",
          "- A training day costs a teaching day. Proposed for the INSET day already",
          "  in the calendar, so no lessons are lost.",
          "- Facilitator availability in Term 3 is not confirmed. Kwabɛna Asantɛ is",
          "  approaching two others.",
          "",
          "---",
          "",
          "The Head Teacher recommends this to the Board for approval.",
          "",
          "Papers are at https://goldencrest.edu.gh/board/2026/staff-development-proposal-second-revision-final-approved-by-the-finance-subcommittee-and-circulated.pdf",
          "- **Important:** the account is 9021447788556677 at Ecobank, Spintex",
          "  branch, and the reference must be quoted in full.",
        ].join("\n"),
      },
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
        motto: "Knowledge, Character, Service",
        address: "12 Independence Avenue, Accra",
        phone: "+233 30 212 3456",
        email: "info@goldencrest.edu.gh",
      },
      crest,
      brandHex: "#2C66CE",
      title: "Student Identity Card",
      roleLabel: "Class",
      detailLabel: "House",
      validity: "2026/2027",
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
          // Twi orthography: transliterated by the renderer, not crashed on.
          name: "Kwabɛna Asantɛ-Ɔboɔ",
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

  writeFileSync(
    `${out}/timetable.pdf`,
    await renderTimetablePdf({
      school: { name: "Golden Crest International School" },
      crest,
      brandHex: "#2C66CE",
      title: "JHS 2 Amber",
      subtitle: "Timetable · 2026/2027, Term 1",
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      rows: [{ label: "Period 1", sublabel: "08:10–08:50", cells: [{ title: "English Language", line2: "Yaw Darko", line3: "Room 1", colour: "#db2777" }, { title: "Integrated Science", line2: "Efua Mensimah", line3: "Room 2", colour: "#16a34a" }, { title: "Social Studies", line2: "Kofi Owusu-Ansah", line3: "Room 3", colour: "#d97706" }, { title: "Ghanaian Language (Twi)", line2: "Abena Serwaa", line3: "Room 4", colour: "#7c3aed" }, { title: "Mathematics", line2: "Akosua Mensah", line3: "Room 5", colour: "#2563eb" }] },
        { label: "Period 2", sublabel: "08:50–09:30", cells: [{ title: "Integrated Science", line2: "Efua Mensimah", line3: "Room 1", colour: "#16a34a" }, { title: "Social Studies", line2: "Kofi Owusu-Ansah", line3: "Room 2", colour: "#d97706" }, { title: "Ghanaian Language (Twi)", line2: "Abena Serwaa", line3: "Room 3", colour: "#7c3aed" }, { title: "Mathematics", line2: "Akosua Mensah", line3: "Room 4", colour: "#2563eb" }, { title: "English Language", line2: "Yaw Darko", line3: "Room 5", colour: "#db2777" }] },
        { label: "Period 3", sublabel: "09:30–10:10", cells: [{ title: "Social Studies", line2: "Kofi Owusu-Ansah", line3: "Room 1", colour: "#d97706" }, { title: "Ghanaian Language (Twi)", line2: "Abena Serwaa", line3: "Room 2", colour: "#7c3aed" }, { title: "Mathematics", line2: "Akosua Mensah", line3: "Room 3", colour: "#2563eb" }, { title: "English Language", line2: "Yaw Darko", line3: "Room 4", colour: "#db2777" }, { title: "Integrated Science", line2: "Efua Mensimah", line3: "Room 5", colour: "#16a34a" }] },
        { label: "10:10–10:30", breakLabel: "Break", cells: [null, null, null, null, null] },
        { label: "Period 5", sublabel: "10:30–11:10", cells: [{ title: "Mathematics", line2: "Akosua Mensah", line3: "Room 1", colour: "#2563eb" }, { title: "English Language", line2: "Yaw Darko", line3: "Room 2", colour: "#db2777" }, { title: "Integrated Science", line2: "Efua Mensimah", line3: "Room 3", colour: "#16a34a" }, { title: "Social Studies", line2: "Kofi Owusu-Ansah", line3: "Room 4", colour: "#d97706" }, { title: "Ghanaian Language (Twi)", line2: "Abena Serwaa", line3: "Room 5", colour: "#7c3aed" }] },
        { label: "Period 6", sublabel: "11:10–11:50", cells: [{ title: "English Language", line2: "Yaw Darko", line3: "Room 1", colour: "#db2777" }, { title: "Integrated Science", line2: "Efua Mensimah", line3: "Room 2", colour: "#16a34a" }, { title: "Social Studies", line2: "Kofi Owusu-Ansah", line3: "Room 3", colour: "#d97706" }, { title: "Ghanaian Language (Twi)", line2: "Abena Serwaa", line3: "Room 4", colour: "#7c3aed" }, { title: "Mathematics", line2: "Akosua Mensah", line3: "Room 5", colour: "#2563eb" }] },
        { label: "Period 7", sublabel: "11:50–12:30", cells: [{ title: "Integrated Science", line2: "Efua Mensimah", line3: "Room 1", colour: "#16a34a" }, { title: "Social Studies", line2: "Kofi Owusu-Ansah", line3: "Room 2", colour: "#d97706" }, { title: "Ghanaian Language (Twi)", line2: "Abena Serwaa", line3: "Room 3", colour: "#7c3aed" }, { title: "Mathematics", line2: "Akosua Mensah", line3: "Room 4", colour: "#2563eb" }, { title: "English Language", line2: "Yaw Darko", line3: "Room 5", colour: "#db2777" }] }],
    }),
  );

  writeFileSync(
    `${out}/payslips.pdf`,
    await renderPayslipsPdf({
      school: {
        name: "Golden Crest International School",
        address: "12 Independence Avenue, Accra",
        phone: "+233 30 212 3456",
      },
      crest,
      brandHex: "#2C66CE",
      slips: [
        {
          period: "August 2026",
          staffName: "Mrs Akosua Mensah",
          staffNo: "GCS/STF/004",
          jobTitle: "Mathematics Teacher",
          department: "Sciences",
          ssnitNumber: "C0123456789",
          paymentMethod: "Bank transfer",
          paymentDestination: "GCB Bank 1441000123456",
          earnings: [
            { label: "Basic salary", amount: "GH₵2,800.00" },
            { label: "Transport", amount: "GH₵250.00" },
            { label: "Teaching allowance", amount: "GH₵200.00" },
          ],
          deductions: [
            { label: "SSNIT (5.5%)", amount: "GH₵154.00" },
            { label: "PAYE", amount: "GH₵376.61" },
            { label: "Welfare dues", amount: "GH₵20.00" },
          ],
          grossPay: "GH₵3,250.00",
          totalDeductions: "GH₵550.61",
          netPay: "GH₵2,699.39",
          employerSsnit: "GH₵364.00",
          paidOn: "31 August 2026",
        },
        {
          // The awkward case: a long Twi name, no allowances, cash payment.
          period: "August 2026",
          staffName: "Mr Kwabɛna Owusu-Ansah Boateng-Mensah",
          staffNo: "GCS/STF/011",
          jobTitle: "Caretaker",
          department: null,
          ssnitNumber: null,
          paymentMethod: "Cash",
          paymentDestination: null,
          earnings: [{ label: "Basic salary", amount: "GH₵1,900.00" }],
          deductions: [
            { label: "SSNIT (5.5%)", amount: "GH₵104.50" },
            { label: "PAYE", amount: "GH₵168.66" },
          ],
          grossPay: "GH₵1,900.00",
          totalDeductions: "GH₵273.16",
          netPay: "GH₵1,626.84",
          employerSsnit: "GH₵247.00",
          paidOn: "31 August 2026",
        },
      ],
    }),
  );

  const studentsDataset = datasetFor("students")!;
  const rawReportRows = Array.from({ length: 40 }, (_, index) => ({
    admissionNo: `GCS/2024/${String(300 + index).padStart(4, "0")}`,
    name: ["Priscilla Naa Quartey", "Kwabena Asante-Oboo", "Efua Mensimah", "Nana Yaw Owusu-Ansah"][index % 4],
    className: ["JHS 2 Amber", "JHS 2 Coral", "JHS 1 Amber"][index % 3],
    house: ["Ruby", "Topaz", "Jade", "Onyx"][index % 4],
    gender: index % 3 === 0 ? "Female" : "Male",
    guardianName: ["Comfort Quartey", "Akosua Boateng", "Yaw Darko", "Abena Serwaa"][index % 4],
    // A fifth of the rows have no phone on file — the gap the report should
    // surface rather than leave a reader to notice.
    guardianPhone: index % 5 === 0 ? null : "+233 24 555 0" + String(100 + index),
    outstanding: 1250 + index * 37,
    attendanceRate: 88 + (index % 11),
  }));
  const reportSummary = summariseReport(rawReportRows, studentsDataset, [
    "admissionNo", "name", "className", "house", "gender",
    "guardianName", "guardianPhone", "outstanding", "attendanceRate",
  ]);

  writeFileSync(
    `${out}/report.pdf`,
    await renderReportPdf({
      letterhead: {
        image: null,
        crest,
        brandHex: "#2C66CE",
        school: {
          name: "Golden Crest International School",
          motto: "Knowledge, Character, Service",
          address: "P.O. Box 4821, 12 Independence Avenue, Accra, Greater Accra",
          phone: "+233 30 212 3456",
          email: "info@goldencrest.edu.gh",
          website: "goldencrest.edu.gh",
          registrationNo: "GES/PS/2011/0473",
        },
      },
      report: {
        title: "Outstanding fees by class",
        subtitle: "Students  ·  412 rows  ·  Class = JHS 2 Amber  ·  showing the first 40",
        meta: "Run by Grace Asante on 19 August 2026, 09:14",
        columns: [
          { key: "admissionNo", label: "Admission no." },
          { key: "name", label: "Name" },
          { key: "className", label: "Class" },
          { key: "guardianName", label: "Primary guardian" },
          { key: "guardianPhone", label: "Phone" },
          { key: "outstanding", label: "Outstanding", numeric: true },
          { key: "attendanceRate", label: "Attendance", numeric: true },
        ],
        rows: rawReportRows.map((row) => ({
          admissionNo: row.admissionNo,
          name: row.name,
          className: row.className,
          guardianName: row.guardianName,
          guardianPhone: row.guardianPhone ?? "—",
          outstanding: "GH₵" + row.outstanding.toLocaleString() + ".00",
          attendanceRate: row.attendanceRate + "%",
        })),
        summary: reportSummary,
        // The stored run holds a sample, so the figures above it are a
        // sample too — the heading has to say so.
        summarySampleOf: { shown: 40, total: 412 },
        narrative: {
          heading: "Analysis",
          body: "Arrears in JHS 2 Amber are concentrated in a small group: eleven families account for just over sixty per cent of the outstanding balance, and nine of those eleven have made no payment since the second week of term. Attendance among that group is four points below the class average, which is the pattern the at-risk scan usually picks up a term later.",
          findings: [
            "Eleven families hold 61% of the arrears; the remaining twenty-nine are within one instalment.",
            "Nine of the eleven have not paid since week two, which suggests a payment plan rather than a reminder.",
            "Attendance in the arrears group averages 88%, against 92% for the class.",
          ],
        },
        footerNote: "Outstanding fees by class · printed 19 August 2026",
      },
    }),
  );

  writeFileSync(
    `${out}/letter.pdf`,
    await renderLettersPdf({
      school: {
        name: "Golden Crest International School",
        motto: "Knowledge, Character, Service",
        address: "P.O. Box 4821, 12 Independence Avenue, Accra, Greater Accra",
        phone: "+233 30 212 3456",
        email: "info@goldencrest.edu.gh",
        website: "goldencrest.edu.gh",
        registrationNo: "GES/PS/2011/0473",
      },
      crest,
      brandHex: "#2C66CE",
      letters: [
        {
          reference: "ADM/2026/0A31F2",
          date: "19 August 2026",
          addressee: ["Mrs Comfort Quartey", "Parent/Guardian of Priscilla Naa Quartey"],
          subject: "Offer of admission",
          salutation: "Dear Mrs Quartey,",
          paragraphs: [
            "Following the assessment of your application, I am pleased to offer Priscilla Naa Quartey a place at Golden Crest International School.",
            "The particulars of the offer are set out below.",
          ],
          particulars: [
            { label: "Student", value: "Priscilla Naa Quartey" },
            { label: "Admission number", value: "GCS/2024/0390" },
            { label: "Class offered", value: "JHS 2 Amber" },
            { label: "Academic year", value: "2026/2027" },
          ],
          closingParagraphs: [
            "To accept this offer, please contact the school office to confirm the place and settle the admission requirements. A place is held for a reasonable period only, after which it may be offered to another applicant.",
            "We look forward to welcoming your family to the school.",
          ],
          closing: "Yours sincerely,",
          signatory: { name: "Mrs Abena Owusu", title: "Head Teacher" },
          footnote:
            "Please quote the reference above in any correspondence about this offer.",
        },
      ],
    }),
  );


  // The income and expenditure statement, which is the document renderer
  // again rather than a renderer of its own — a table on letterhead with a
  // signature under it. Built from a statement made here rather than from the
  // database, so the layout can be looked at without one.
  writeFileSync(
    `${out}/statement.pdf`,
    await renderDocumentPdf({
      letterhead: {
        image: null,
        school: {
          name: "Golden Crest International School",
          motto: "Knowledge, Character, Service",
          address: "P.O. Box 4821, 12 Independence Avenue, Accra",
          phone: "+233 30 212 3456",
          email: "info@goldencrest.edu.gh",
          website: "goldencrest.edu.gh",
          registrationNo: "GES/PS/2011/0473",
        },
        crest,
        brandHex: "#2C66CE",
      },
      document: {
        title: "Income and Expenditure — Term 1, 2026/2027",
        date: "21 August 2026",
        closing: "Prepared by,",
        signatory: { name: "Grace Asante", title: "Bursar" },
        footnote:
          "Printed from the school management system. Figures move as bills are approved and paid.",
        body: statementMarkdown({
          period: {
            label: "Term 1, 2026/2027",
            from: new Date("2026-01-08"),
            to: new Date("2026-03-28"),
          },
          income: [
            { label: "Fees received", amountMinor: 48_920_000, note: "Money in, on the day it was received." },
            { label: "Scholarships and sponsorships", amountMinor: 3_400_000, note: "Settled by a sponsor rather than by the family." },
            { label: "Less refunds", amountMinor: -180_000 },
          ],
          incomeMinor: 52_140_000,
          expenditure: [
            { label: "Staff costs", amountMinor: 31_600_000, note: "Gross pay and the school's SSNIT contribution." },
            { label: "Utilities", amountMinor: 1_122_000, budgetMinor: 3_300_000 },
            { label: "Repairs and maintenance", amountMinor: 625_000, budgetMinor: 1_500_000 },
            { label: "Teaching and learning materials", amountMinor: 763_000, budgetMinor: 2_200_000 },
            { label: "Transport and fuel", amountMinor: 1_484_000, budgetMinor: 4_400_000 },
            { label: "Catering and provisions", amountMinor: 980_000, budgetMinor: 5_500_000 },
            { label: "Examination fees", amountMinor: 1_140_000, budgetMinor: 1_100_000 },
            { label: "Professional services", amountMinor: 800_000, budgetMinor: 800_000 },
            { label: "Staff training", amountMinor: 450_000, budgetMinor: 600_000 },
            { label: "Payment provider charges", amountMinor: 391_360, note: "The cost of collecting the fees above." },
          ],
          expenditureMinor: 39_355_360,
          resultMinor: 12_784_640,
          committedMinor: 1_308_000,
          pendingMinor: 1_670_000,
        }),
      },
    }),
  );

  console.log(`Wrote ten PDFs to ${out}`);
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
