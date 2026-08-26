import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { loadLetterhead } from "@/lib/letterhead";
import { formatDate, formatDateTime, listName } from "@/lib/utils";

/**
 * The leave-out pass.
 *
 * `?id=…` for one, or nothing for every leave-out currently approved and not
 * yet gone — which is how a boarding office prints them: a stack on Friday
 * afternoon for everybody going out at the weekend.
 *
 * A child off the compound is asked, by a gateman or by a policeman at a
 * checkpoint, what they are doing outside school on a Tuesday. This is the
 * answer: on the school's letterhead, with the name of the adult they were
 * released to and the hour they are due back, and a line for the gate to sign
 * when they return.
 *
 * Rendered on request and never stored — an approval withdrawn at four o'clock
 * must not still be printable at five.
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

export async function GET(request: Request) {
  // The gate, or the boarding office. Not boarding.read alone — a pass is the
  // document that gets a child past a checkpoint, and printing one for a child
  // who has not been approved is the whole risk.
  try {
    await authorize(["boarding.gate", "boarding.manage", "boarding.exeat.approve"]);
  } catch (error) {
    return message(403, "Not signed in for this", (error as Error).message);
  }

  const id = new URL(request.url).searchParams.get("id");

  const [exeats, letterhead] = await Promise.all([
    db.boardingExeat.findMany({
      where: id
        ? { id }
        : // Approved and still here. An OUT pass is already in somebody's
          // pocket, and a REQUESTED one has not been agreed to.
          { status: "APPROVED" },
      orderBy: { departsAt: "asc" },
      take: 200,
      select: {
        id: true,
        status: true,
        reason: true,
        destination: true,
        departsAt: true,
        dueBackAt: true,
        releasedToName: true,
        releasedToPhone: true,
        relationship: true,
        house: { select: { name: true } },
        approvedBy: { select: { title: true, firstName: true, lastName: true } },
        student: {
          select: {
            firstName: true,
            lastName: true,
            otherNames: true,
            admissionNo: true,
            enrollments: {
              where: { status: "ACTIVE" },
              take: 1,
              select: {
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

  if (exeats.length === 0) {
    return message(
      404,
      id ? "Not found" : "Nothing to print",
      id
        ? "No leave-out has that id."
        : "No leave-out is approved and waiting. A pass is printed once it has been approved and before the child has gone.",
    );
  }
  if (!letterhead) {
    return message(
      503,
      "The school is not set up yet",
      "Add the school's name and address under Settings before printing on letterhead.",
    );
  }

  // A pass for a child who has not been approved is the thing this must never
  // produce. Asking for one by id is the only way to reach that state, and it
  // is refused rather than watermarked — a "draft" pass in a pocket at a
  // checkpoint is read as a pass.
  const notApproved = exeats.filter(
    (exeat) => exeat.status !== "APPROVED" && exeat.status !== "OUT",
  );
  if (notApproved.length) {
    return message(
      409,
      "Not approved",
      "A pass can only be printed for a leave-out that has been approved. This one has not, or it has been cancelled.",
    );
  }

  const sections = exeats.map((exeat) => {
    const section = exeat.student.enrollments[0]?.classSection;
    return [
      `# ${listName(exeat.student)}`,
      "",
      `**${exeat.student.admissionNo}**${
        section ? ` · ${section.classLevel.name} ${section.name}` : ""
      }${exeat.house ? ` · ${exeat.house.name}` : ""}`,
      "",
      "| Leave-out | Details |",
      "| --- | --- |",
      `| Going to | ${exeat.destination} |`,
      `| Why | ${exeat.reason} |`,
      `| Leaves | ${formatDateTime(exeat.departsAt)} |`,
      `| **Due back** | **${formatDateTime(exeat.dueBackAt)}** |`,
      `| Released to | ${exeat.releasedToName}${
        exeat.relationship ? ` (${exeat.relationship})` : ""
      } |`,
      `| Their phone | ${exeat.releasedToPhone ?? "-"} |`,
      `| Approved by | ${
        exeat.approvedBy
          ? [exeat.approvedBy.title, exeat.approvedBy.firstName, exeat.approvedBy.lastName]
              .filter(Boolean)
              .join(" ")
          : "-"
      } |`,
      "",
      "> This pupil is a boarder of this school and is off the compound with the school's permission until the hour above. If they are found elsewhere, or after that hour, please telephone the school.",
      "",
      "---",
      "",
      "Signed out at ________________    by ________________",
      "",
      "Signed back in at ________________    by ________________",
    ].join("\n");
  });

  const pdf = await renderDocumentPdf({
    letterhead,
    document: {
      title: exeats.length === 1 ? "Leave-out pass" : "Leave-out passes",
      date: formatDate(new Date(), "long"),
      body: "",
      sections,
      footnote:
        "Carried by the pupil and shown on request. Returned to the gate on the way back in.",
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="leave-out-pass.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
