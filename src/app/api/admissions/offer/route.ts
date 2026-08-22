import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { assessmentAverage } from "@/lib/admission-rules";
import { db } from "@/lib/db";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { loadLetterhead } from "@/lib/letterhead";
import { formatMoney } from "@/lib/money";
import { formatDate, listName } from "@/lib/utils";

/**
 * The offer of a place.
 *
 * The one document in this system a family keeps. It is read by people who
 * have never seen the school, shown to an employer arranging a relocation, and
 * produced two years later when somebody asks what was agreed — so it says the
 * year group, the date the place lapses and what is required to hold it, in
 * sentences rather than in fields.
 *
 * Rendered on request and never stored. An offer withdrawn on Monday must not
 * still be printable on Tuesday, and a lapse date corrected in the morning has
 * to be the one on the afternoon's letter.
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
  let user;
  try {
    user = await authorize(["admission.offer", "admission.manage"]);
  } catch (error) {
    return message(403, "Not signed in for this", (error as Error).message);
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return message(400, "Which application?", "No application was given.");

  const [application, letterhead] = await Promise.all([
    db.admissionApplication.findUnique({
      where: { id },
      select: {
        offeredOn: true,
        offerExpiresOn: true,
        offerNote: true,
        acceptedOn: true,
        declinedOn: true,
        applicationFeeMinor: true,
        applyingForLevel: { select: { name: true } },
        academicYear: { select: { name: true } },
        assessments: { select: { score: true, maxScore: true } },
        student: {
          select: {
            firstName: true,
            lastName: true,
            otherNames: true,
            admissionNo: true,
            guardians: {
              orderBy: [{ isPrimary: "desc" }, { sortKey: "asc" }],
              take: 1,
              select: {
                guardian: {
                  select: {
                    title: true,
                    firstName: true,
                    lastName: true,
                    address: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    loadLetterhead(),
  ]);

  if (!application) return message(404, "Not found", "No application has that id.");
  if (!letterhead) {
    return message(
      503,
      "The school is not set up yet",
      "Add the school's name and address under Settings before printing on letterhead.",
    );
  }

  // A letter for a place that was never offered would be a school promising
  // something nobody decided. Declined is allowed to print — a family often
  // asks for the letter afterwards, for a visa or an employer.
  if (!application.offeredOn) {
    return message(
      409,
      "No offer has been made",
      "Offer the place first. This letter is the record of that decision, not a way of making it.",
    );
  }

  const guardian = application.student.guardians[0]?.guardian ?? null;
  const child = listName(application.student);
  const average = assessmentAverage(
    application.assessments.map((entry) => ({
      score: entry.score === null ? null : Number(entry.score),
      maxScore: Number(entry.maxScore),
    })),
  );

  const body: string[] = [
    `We are pleased to offer ${child} a place at the school for the ${application.academicYear.name} academic year${
      application.applyingForLevel ? `, in ${application.applyingForLevel.name}` : ""
    }.`,
    "",
    "| The place | |",
    "| --- | --- |",
    `| Pupil | ${child} |`,
    `| Reference | ${application.student.admissionNo} |`,
    `| Year group | ${application.applyingForLevel?.name ?? "To be confirmed"} |`,
    `| Academic year | ${application.academicYear.name} |`,
    `| Offered on | ${formatDate(application.offeredOn, "long")} |`,
    `| **Place held until** | **${
      application.offerExpiresOn
        ? formatDate(application.offerExpiresOn, "long")
        : "Until withdrawn"
    }** |`,
  ];

  if (average !== null) {
    body.push(`| Entrance assessment | ${average}% |`);
  }

  body.push("");

  if (application.offerExpiresOn) {
    body.push(
      `This place is held until ${formatDate(application.offerExpiresOn, "long")}. If we have not heard from you by that date we shall assume you no longer require it and offer the place to another family.`,
      "",
    );
  }

  if (application.offerNote) {
    body.push(application.offerNote, "");
  }

  if (application.acceptedOn) {
    body.push(
      `> Accepted on ${formatDate(application.acceptedOn, "long")}. Thank you — we look forward to welcoming ${application.student.firstName}.`,
      "",
    );
  } else if (application.declinedOn) {
    body.push(
      `> This offer was declined on ${formatDate(application.declinedOn, "long")}. This copy is provided for your records.`,
      "",
    );
  } else {
    body.push(
      "To accept, please reply to this letter or telephone the school office. We are happy to arrange a visit before you decide.",
      "",
      "Accepted by: ________________________    Date: ______________",
      "",
    );
  }

  const pdf = await renderDocumentPdf({
    letterhead,
    document: {
      title: "Offer of a Place",
      reference: application.student.admissionNo,
      date: formatDate(application.offeredOn, "long"),
      addressee: guardian
        ? [
            [guardian.title, guardian.firstName, guardian.lastName].filter(Boolean).join(" "),
            ...(guardian.address ? [guardian.address] : []),
          ]
        : ["The Parent or Guardian"],
      salutation: guardian
        ? `Dear ${[guardian.title, guardian.lastName].filter(Boolean).join(" ")},`
        : "Dear Parent or Guardian,",
      body: body.join("\n"),
      closing: "Yours faithfully,",
      signatory: user.staffId
        ? await db.staff
            .findUnique({
              where: { id: user.staffId },
              select: { firstName: true, lastName: true, jobTitle: true },
            })
            .then((staff) =>
              staff
                ? {
                    name: `${staff.firstName} ${staff.lastName}`,
                    title: staff.jobTitle ?? "Registrar",
                  }
                : null,
            )
        : null,
      footnote: application.applicationFeeMinor
        ? `Assessment fee of ${formatMoney(application.applicationFeeMinor)} refers.`
        : null,
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="offer-${application.student.admissionNo.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
