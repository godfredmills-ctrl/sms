import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { boardReport, periodsFor } from "@/lib/board-report";
import { renderBoardReportPdf } from "@/lib/board-report-pdf";
import { db } from "@/lib/db";
import { loadLetterhead } from "@/lib/letterhead";

/**
 * The report to the board, on the school's letterhead.
 *
 * Assembled fresh rather than from a stored run, unlike the report builder's
 * PDF. A board paper is generated the week of the meeting and is about the
 * school as it stands; a stored copy would be a different document with the
 * same name, and somebody would print the wrong one.
 */
export const dynamic = "force-dynamic";

function message(status: number, title: string, body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#111">
<h1 style="font-size:1.1rem">${title}</h1><p style="color:#555;line-height:1.5">${body}</p>
</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const user = await authorize(["report.read", "report.build"]);

  const url = new URL(request.url);
  const requested = url.searchParams.get("term");

  const term = requested
    ? await db.term.findUnique({ where: { id: requested }, select: { id: true } })
    : await db.term.findFirst({ where: { isCurrent: true }, select: { id: true } });

  if (!term) {
    return message(
      404,
      "No term to report on",
      "A report to the board is a report on a term, and there is not one to use. Set the academic year and its terms up first.",
    );
  }

  const [{ period, previous }, letterhead] = await Promise.all([
    periodsFor(term.id),
    loadLetterhead(),
  ]);

  if (!period) {
    return message(404, "That term was not found", "It may have been deleted since this link was made.");
  }

  if (!letterhead) {
    return message(
      500,
      "No school record",
      "The letterhead is drawn from the school profile, and there is not one. Settings, then School profile.",
    );
  }

  const report = await boardReport(period, previous);

  const pdf = await renderBoardReportPdf({
    letterhead,
    report,
    preparedBy: user.fullName,
  });

  const name = `Report to the board - ${period.label}.pdf`.replace(/[\\/:*?"<>|]/g, "-");

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
