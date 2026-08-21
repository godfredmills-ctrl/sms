import { NextResponse } from "next/server";

import { authorize, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { hallListMarkdown, type HallListSeat } from "@/lib/exam-print";
import { invigilates } from "@/lib/exams";
import { loadLetterhead } from "@/lib/letterhead";
import { formatDate, fullName, listName } from "@/lib/utils";

/**
 * The invigilator's sheet for one paper.
 *
 * Not gated on exam.read: this is every candidate in the hall by name, class
 * and index number, which is a whole year group's identity on one page, and
 * exam.read is held by every teacher in the school. It goes to the people
 * invigilating this paper and to the exams office — which is the same rule the
 * screen applies, from the same function.
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
  { params }: { params: Promise<{ paperId: string }> },
) {
  let user;
  try {
    user = await authorize([
      "assessment.exam.read",
      "assessment.exam.manage",
      "assessment.exam.attendance",
    ]);
  } catch (error) {
    return message(403, "Not signed in for this", (error as Error).message);
  }

  const { paperId } = await params;

  // The invigilators of this paper, and the exams office. Not every holder of
  // exam.read — this sheet is a whole year group's names, classes and index
  // numbers, and exam.read is held by every teacher in the school. Gated on
  // read alone, any teacher with a paper id could print the identity of every
  // candidate in it. Same rule as the screen, from the same function.
  if (
    !userCan(user, "assessment.exam.manage") &&
    !(await invigilates(user.staffId, paperId))
  ) {
    return message(
      403,
      "Not your hall",
      "This sheet lists every candidate by name, class and index number, so it goes to the invigilators of this paper and to the exams office.",
    );
  }

  const [paper, letterhead] = await Promise.all([
    db.examPaper.findUnique({
      where: { id: paperId },
      select: {
        title: true,
        startsAt: true,
        durationMins: true,
        maxMarks: true,
        materials: true,
        subject: { select: { name: true } },
        classLevel: { select: { name: true } },
        session: { select: { name: true, status: true, instructions: true } },
        invigilators: {
          orderBy: { role: "asc" },
          select: {
            role: true,
            staff: { select: { firstName: true, lastName: true, title: true } },
          },
        },
        seats: {
          orderBy: { seatNo: "asc" },
          select: {
            seatNo: true,
            venue: { select: { name: true } },
            candidate: {
              select: {
                candidateNo: true,
                student: { select: { firstName: true, lastName: true, otherNames: true } },
                classSection: {
                  select: { name: true, classLevel: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    }),
    loadLetterhead(),
  ]);

  if (!paper) return message(404, "Not found", "No paper has that id.");
  if (!letterhead) {
    return message(
      503,
      "The school is not set up yet",
      "Add the school's name and address under Settings before printing on letterhead.",
    );
  }
  if (paper.seats.length === 0) {
    return message(
      409,
      "Nobody is seated yet",
      "Allocate the seating for this paper before printing the hall list — an empty sheet is worse than none, because it looks like an answer.",
    );
  }

  const seats: HallListSeat[] = paper.seats.map((seat) => ({
    seatNo: seat.seatNo,
    venue: seat.venue?.name ?? null,
    candidateNo: seat.candidate.candidateNo,
    name: listName(seat.candidate.student),
    className: seat.candidate.classSection
      ? `${seat.candidate.classSection.classLevel.name} ${seat.candidate.classSection.name}`
      : "—",
  }));

  const pdf = await renderDocumentPdf({
    letterhead,
    document: {
      title: `Hall list — ${paper.subject.name}${paper.title ? ` ${paper.title}` : ""}`,
      reference: paper.session.name,
      date: formatDate(paper.startsAt, "long"),
      body: hallListMarkdown({
        instructions: paper.session.instructions,
        paper: {
          subject: paper.subject.name,
          title: paper.title,
          classLevel: paper.classLevel.name,
          startsAt: paper.startsAt,
          durationMins: paper.durationMins,
          maxMarks: paper.maxMarks,
          materials: paper.materials,
        },
        invigilators: paper.invigilators.map((one) => ({
          name: fullName(one.staff),
          role: one.role,
        })),
        seats,
      }),
      watermark: paper.session.status === "DRAFT" ? "Draft" : null,
      closing: "Signed,",
      signatory: null,
      footnote:
        "Signed by the chief invigilator and returned to the office with the scripts.",
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="hall-list-${slug(paper.subject.name)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "paper";
}
