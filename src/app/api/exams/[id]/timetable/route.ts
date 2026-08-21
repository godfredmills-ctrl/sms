import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { timetableMarkdown, type TimetablePaper } from "@/lib/exam-print";
import { loadLetterhead } from "@/lib/letterhead";
import { formatDate } from "@/lib/utils";

/**
 * The examination timetable, on the school letterhead.
 *
 * Rendered on request. A timetable printed on Monday and changed on Tuesday is
 * the reason a candidate sits in the wrong hall, so this is never stored — the
 * sheet in somebody's hand is always the one the school currently means.
 */
export const dynamic = "force-dynamic";

function message(status: number, title: string, body: string) {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#111">
<h1 style="font-size:1.1rem">${escape(title)}</h1><p style="color:#555;line-height:1.5">${escape(body)}</p>
</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await authorize([
      "assessment.exam.read",
      "assessment.exam.manage",
      "assessment.exam.attendance",
    ]);
  } catch (error) {
    return message(403, "Not signed in for this", (error as Error).message);
  }

  const { id } = await params;

  const [session, letterhead] = await Promise.all([
    db.examSession.findUnique({
      where: { id },
      select: {
        name: true,
        status: true,
        startsOn: true,
        endsOn: true,
        instructions: true,
        term: { select: { name: true, academicYear: { select: { name: true } } } },
        papers: {
          orderBy: { startsAt: "asc" },
          select: {
            title: true,
            startsAt: true,
            durationMins: true,
            materials: true,
            subject: { select: { name: true } },
            classLevel: { select: { name: true } },
            seats: {
              distinct: ["venueId"],
              select: { venue: { select: { name: true } } },
            },
          },
        },
      },
    }),
    loadLetterhead(),
  ]);

  if (!session) return message(404, "Not found", "No examinations have that id.");
  if (!letterhead) {
    return message(
      503,
      "The school is not set up yet",
      "Add the school's name and address under Settings before printing on letterhead.",
    );
  }

  const papers: TimetablePaper[] = session.papers.map((paper) => ({
    startsAt: paper.startsAt,
    durationMins: paper.durationMins,
    subject: paper.subject.name,
    title: paper.title,
    classLevel: paper.classLevel.name,
    materials: paper.materials,
    halls: paper.seats
      .map((seat) => seat.venue?.name)
      .filter((name): name is string => Boolean(name)),
  }));

  const pdf = await renderDocumentPdf({
    letterhead,
    document: {
      title: session.name,
      reference: session.term
        ? `${session.term.name}, ${session.term.academicYear.name}`
        : null,
      date: `${formatDate(session.startsOn, "long")} – ${formatDate(session.endsOn, "long")}`,
      body: timetableMarkdown({ instructions: session.instructions, papers }),
      // A timetable that is still being built must not be mistaken for the one
      // that is out. The watermark is the only part of that which survives a
      // photocopy pinned to a notice board.
      watermark: session.status === "DRAFT" ? "Draft" : null,
      footnote:
        "Printed from the school management system. Check the notice board for any change.",
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="timetable-${slug(session.name)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "exams";
}
