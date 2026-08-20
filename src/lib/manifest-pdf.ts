import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { sanitisePdfText } from "@/lib/pdf-text";

/**
 * The bus manifest.
 *
 * This is the one piece of the transport module that leaves the building. It
 * is carried by the assistant, read on a moving bus, and used at a roadside
 * checkpoint — so it is set large, grouped by stop in the order the bus
 * reaches them, and gives every child a tick box. A screen answers "who is on
 * route 3"; only paper answers it when the bus has broken down at Tema
 * roundabout and nobody's phone has charge.
 *
 * The emergency numbers sit at the top rather than the foot, because that is
 * where someone looks when they are not reading.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const USABLE = PAGE_W - MARGIN * 2;

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.42, 0.47, 0.56);
const FAINT = rgb(0.82, 0.85, 0.89);
const RULE = rgb(0.9, 0.92, 0.94);
const ALERT = rgb(0.85, 0.36, 0.05);

export type ManifestChild = {
  name: string;
  admissionNo: string;
  className: string;
  /** Who may take the child at the stop, when it is not the usual guardian. */
  collectedBy?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  notes?: string | null;
};

export type ManifestStop = {
  name: string;
  landmark?: string | null;
  time?: string | null;
  children: ManifestChild[];
};

export type Manifest = {
  school: { name: string; phone?: string | null };
  route: { code: string; name: string };
  vehicles: Array<{
    registration: string;
    driver?: string | null;
    driverPhone?: string | null;
    assistant?: string | null;
    assistantPhone?: string | null;
  }>;
  run: "MORNING" | "AFTERNOON";
  /** Printed on the sheet so an old one in the cab is visibly old. */
  printedOn: Date;
  stops: ManifestStop[];
  /** Children on the route with no stop recorded. Never silently dropped. */
  unplaced: ManifestChild[];
};

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}...`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}...`;
}

export async function renderManifestPdf(input: Manifest): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setProducer("School Management System");
  pdf.setCreationDate(new Date());

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Cleaned once, on the way in — pdf-lib throws from widthOfTextAtSize as
  // well as drawText, and this file measures before it truncates.
  const clean = (value: string | null | undefined) =>
    value ? sanitisePdfText(value, regular) : "";

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const totalChildren =
    input.stops.reduce((sum, stop) => sum + stop.children.length, 0) +
    input.unplaced.length;

  const runLabel = input.run === "MORNING" ? "Morning run" : "Afternoon run";

  function newPage() {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    page.drawText(
      clean(`${input.route.code} — ${runLabel} (continued)`),
      { x: MARGIN, y, size: 9, font: bold, color: MUTED },
    );
    y -= 18;
  }

  function room(needed: number) {
    if (y - needed < MARGIN + 30) newPage();
  }

  // --- Masthead --------------------------------------------------------------
  page.drawText(clean(input.school.name), {
    x: MARGIN,
    y: y - 12,
    size: 11,
    font: bold,
    color: MUTED,
  });
  y -= 34;

  page.drawText(clean(`Route ${input.route.code} — ${input.route.name}`), {
    x: MARGIN,
    y,
    size: 20,
    font: bold,
    color: INK,
  });
  y -= 20;

  const printed = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Accra",
  }).format(input.printedOn);

  page.drawText(clean(`${runLabel}  ·  ${printed}  ·  ${totalChildren} children`), {
    x: MARGIN,
    y,
    size: 10,
    font: regular,
    color: MUTED,
  });
  y -= 22;

  // --- Who is driving, and how to reach them ---------------------------------
  const contactLines: string[] = [];
  for (const vehicle of input.vehicles) {
    const driver = [vehicle.driver, vehicle.driverPhone].filter(Boolean).join("  ");
    const assistant = [vehicle.assistant, vehicle.assistantPhone]
      .filter(Boolean)
      .join("  ");
    contactLines.push(
      [
        vehicle.registration,
        driver ? `Driver: ${driver}` : null,
        assistant ? `Assistant: ${assistant}` : null,
      ]
        .filter(Boolean)
        .join("   ·   "),
    );
  }
  if (input.school.phone) contactLines.push(`School office: ${input.school.phone}`);

  if (contactLines.length) {
    const boxHeight = 14 + contactLines.length * 13;
    page.drawRectangle({
      x: MARGIN,
      y: y - boxHeight,
      width: USABLE,
      height: boxHeight,
      color: rgb(0.99, 0.95, 0.9),
      borderColor: ALERT,
      borderWidth: 0.75,
    });
    let line = y - 15;
    for (const contact of contactLines) {
      page.drawText(truncate(clean(contact), bold, 9, USABLE - 20), {
        x: MARGIN + 10,
        y: line,
        size: 9,
        font: bold,
        color: INK,
      });
      line -= 13;
    }
    y -= boxHeight + 16;
  }

  // --- The list --------------------------------------------------------------
  const drawStop = (stop: ManifestStop, heading: string, urgent = false) => {
    room(46);

    page.drawRectangle({
      x: MARGIN,
      y: y - 18,
      width: USABLE,
      height: 18,
      color: urgent ? rgb(0.99, 0.93, 0.86) : rgb(0.95, 0.96, 0.97),
      ...(urgent ? { borderColor: ALERT, borderWidth: 0.75 } : {}),
    });
    page.drawText(truncate(clean(heading), bold, 10, USABLE - 90), {
      x: MARGIN + 8,
      y: y - 13,
      size: 10,
      font: bold,
      color: urgent ? ALERT : INK,
    });
    const count = `${stop.children.length}`;
    page.drawText(count, {
      x: MARGIN + USABLE - 8 - bold.widthOfTextAtSize(count, 10),
      y: y - 13,
      size: 10,
      font: bold,
      color: MUTED,
    });
    y -= 26;

    if (stop.children.length === 0) {
      page.drawText("Nobody at this stop today.", {
        x: MARGIN + 22,
        y,
        size: 8.5,
        font: regular,
        color: MUTED,
      });
      y -= 18;
      return;
    }

    for (const child of stop.children) {
      room(24);

      // The tick box: this sheet gets marked with a biro, twice a day.
      page.drawRectangle({
        x: MARGIN + 6,
        y: y - 2,
        width: 10,
        height: 10,
        borderColor: FAINT,
        borderWidth: 0.75,
      });

      page.drawText(truncate(clean(child.name), bold, 10, 210), {
        x: MARGIN + 24,
        y,
        size: 10,
        font: bold,
        color: INK,
      });

      page.drawText(truncate(clean(child.className), regular, 9, 84), {
        x: MARGIN + 230,
        y,
        size: 9,
        font: regular,
        color: MUTED,
      });

      // The number is drawn first, from the right edge, and the name gets
      // whatever is left — so a long name is shortened and the phone survives
      // whole. The other way round loses the digits, which is the one thing
      // on this sheet somebody needs at the roadside.
      const contactLeft = MARGIN + 322;
      let nameWidth = MARGIN + USABLE - contactLeft;
      if (child.guardianPhone) {
        const phone = clean(child.guardianPhone);
        const phoneWidth = regular.widthOfTextAtSize(phone, 9);
        page.drawText(phone, {
          x: MARGIN + USABLE - phoneWidth,
          y,
          size: 9,
          font: regular,
          color: MUTED,
        });
        nameWidth -= phoneWidth + 6;
      }
      if (child.guardianName && nameWidth > 24) {
        page.drawText(truncate(clean(child.guardianName), regular, 9, nameWidth), {
          x: contactLeft,
          y,
          size: 9,
          font: regular,
          color: MUTED,
        });
      }

      y -= 12;

      // Only what changes the handover gets a second line.
      const extra = [
        child.collectedBy ? `Hand to: ${child.collectedBy}` : null,
        child.notes,
      ]
        .filter(Boolean)
        .join("  ·  ");
      if (extra) {
        page.drawText(truncate(clean(extra), regular, 8, USABLE - 30), {
          x: MARGIN + 24,
          y,
          size: 8,
          font: regular,
          color: ALERT,
        });
        y -= 11;
      }

      page.drawLine({
        start: { x: MARGIN + 6, y: y - 2 },
        end: { x: MARGIN + USABLE, y: y - 2 },
        thickness: 0.4,
        color: RULE,
      });
      y -= 8;
    }

    y -= 6;
  };

  for (const stop of input.stops) {
    const heading = [
      stop.time ? `${stop.time}` : null,
      stop.name,
      stop.landmark ? `(${stop.landmark})` : null,
    ]
      .filter(Boolean)
      .join("  ");
    drawStop(stop, heading);
  }

  if (input.unplaced.length) {
    // Never quietly omitted: a child on the route with no stop recorded is
    // precisely the child who gets left behind, and the sheet has to show it.
    drawStop(
      { name: "No stop recorded", children: input.unplaced },
      "NO STOP RECORDED — check before the bus leaves",
      true,
    );
  }

  if (input.stops.length === 0 && input.unplaced.length === 0) {
    page.drawText("Nobody is assigned to this route.", {
      x: MARGIN,
      y,
      size: 11,
      font: regular,
      color: MUTED,
    });
  }

  // --- Footer on every page --------------------------------------------------
  const pages = pdf.getPages();
  for (let index = 0; index < pages.length; index += 1) {
    const sheet: PDFPage = pages[index];
    sheet.drawText(
      clean(
        `${input.route.code} ${runLabel} · printed ${printed} · page ${index + 1} of ${pages.length}`,
      ),
      { x: MARGIN, y: MARGIN - 14, size: 7.5, font: regular, color: FAINT },
    );
  }

  return Buffer.from(await pdf.save());
}
