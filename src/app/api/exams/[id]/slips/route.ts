import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { candidateSlipMarkdown, type SlipPaper } from "@/lib/exam-print";
import { loadLetterhead } from "@/lib/letterhead";
import { formatDate, listName } from "@/lib/utils";

/**
 * Candidate slips: one page each, cut and handed out.
 *
 * `?level=<classLevelId>` narrows it to a year group, which is how they are
 * actually printed — the office does JHS 3 on Monday and the rest on Tuesday.
 * Without it the whole session prints, which for a large school is a long job
 * and is capped rather than left to run.
 *
 * Rendered as one document with a page break between slips rather than as one
 * PDF per candidate merged together: the second embeds the crest and six fonts
 * once per pupil, which for a year group is the same picture stored sixty
 * times.
 */
export const dynamic = "force-dynamic";

const MAX_SLIPS = 400;

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
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await authorize(["assessment.exam.read", "assessment.exam.manage"]);
  } catch (error) {
    return message(403, "Not signed in for this", (error as Error).message);
  }

  const { id } = await params;
  const levelId = new URL(request.url).searchParams.get("level");

  const [session, letterhead] = await Promise.all([
    db.examSession.findUnique({
      where: { id },
      select: { name: true, status: true, instructions: true, startsOn: true },
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

  const candidates = await db.examCandidate.findMany({
    where: {
      sessionId: id,
      ...(levelId ? { classSection: { classLevelId: levelId } } : {}),
    },
    orderBy: { candidateNo: "asc" },
    take: MAX_SLIPS + 1,
    select: {
      candidateNo: true,
      student: { select: { firstName: true, lastName: true, otherNames: true } },
      classSection: {
        select: { name: true, classLevel: { select: { name: true } } },
      },
      seats: {
        select: {
          seatNo: true,
          venue: { select: { name: true } },
          paper: {
            select: {
              startsAt: true,
              durationMins: true,
              title: true,
              materials: true,
              subject: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (candidates.length === 0) {
    return message(
      409,
      "Nobody is entered",
      "Enter a year group for these examinations before printing slips.",
    );
  }

  // Said rather than silently truncated: a print job that quietly stops at 400
  // leaves the last classes wondering why they were never given a slip.
  const capped = candidates.length > MAX_SLIPS;
  const printing = capped ? candidates.slice(0, MAX_SLIPS) : candidates;

  const sections = printing.map((candidate) => {
    const papers: SlipPaper[] = candidate.seats.map((seat) => ({
      startsAt: seat.paper.startsAt,
      durationMins: seat.paper.durationMins,
      subject: seat.paper.subject.name,
      title: seat.paper.title,
      seatNo: seat.seatNo,
      venue: seat.venue?.name ?? null,
      materials: seat.paper.materials,
    }));

    return candidateSlipMarkdown({
      instructions: session.instructions,
      candidateNo: candidate.candidateNo,
      name: listName(candidate.student),
      className: candidate.classSection
        ? `${candidate.classSection.classLevel.name} ${candidate.classSection.name}`
        : "No class recorded",
      papers,
    });
  });

  const pdf = await renderDocumentPdf({
    letterhead,
    document: {
      title: `Candidate slips, ${session.name}`,
      date: formatDate(session.startsOn, "long"),
      body: "",
      sections,
      watermark: session.status === "DRAFT" ? "Draft" : null,
      footnote: capped
        ? `The first ${MAX_SLIPS} candidates. Print a year group at a time for the rest.`
        : "One slip per candidate. Cut along the page and hand out.",
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="candidate-slips.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
