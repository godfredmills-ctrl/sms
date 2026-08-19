import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadLetterhead } from "@/lib/letterhead";
import { renderLettersPdf, type LetterDocument } from "@/lib/letter-pdf";
import { formatMoney } from "@/lib/money";
import { studentOutOfScope } from "@/lib/scope";
import { formatDate, fullName } from "@/lib/utils";

/**
 * The letters a school hands people on paper.
 *
 *   ?kind=offer&studentId=…        an offer of a place, for an OFFERED applicant
 *   ?kind=attestation&studentId=…  proof that a child is enrolled here
 *   ?kind=transfer&studentId=…     a transfer certificate, for one who has left
 *   ?kind=employment&staffId=…     confirmation of employment, for a bank
 *
 * All four are the same object — a formal letter on the school's letterhead
 * — so they share a renderer and differ only in what they say. The pipeline
 * could move an applicant to OFFERED and produce nothing to send them, which
 * is where this started.
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

/** A stable reference a reply can quote. */
function reference(prefix: string, id: string): string {
  return `${prefix}/${new Date().getFullYear()}/${id.slice(-6).toUpperCase()}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";

  const isStaffLetter = kind === "employment";

  let user;
  try {
    user = await authorize(isStaffLetter ? "staff.read" : "student.read");
  } catch (error) {
    return message(403, "Not allowed", (error as Error).message);
  }

  const letterhead = await loadLetterhead();
  if (!letterhead) {
    return message(400, "No school profile", "Set up the school profile under Settings first.");
  }

  const head = await db.staff.findFirst({
    where: { jobTitle: { contains: "Head", mode: "insensitive" }, status: "ACTIVE" },
    select: { title: true, firstName: true, lastName: true, jobTitle: true },
  });
  const signatory = head
    ? { name: fullName(head), title: head.jobTitle ?? "Head Teacher" }
    : { name: user.fullName, title: "For the school" };

  const today = formatDate(new Date(), "long");
  let letter: LetterDocument;
  let filename: string;

  if (isStaffLetter) {
    const staffId = url.searchParams.get("staffId") ?? "";
    const staff = await db.staff.findUnique({
      where: { id: staffId },
      select: {
        title: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        staffNo: true,
        jobTitle: true,
        department: true,
        employmentType: true,
        hireDate: true,
        status: true,
        basicSalaryMinor: true,
      },
    });
    if (!staff) return message(404, "Not found", "That staff member does not exist.");
    if (staff.status !== "ACTIVE") {
      return message(
        400,
        "Not currently employed",
        "A letter of employment states current employment, and this record is not active.",
      );
    }

    // Salary appears only for someone who may see payroll. A bank letter
    // usually needs it; a colleague printing one does not get to learn it.
    const showSalary = user.permissions.has("payroll.read");

    letter = {
      reference: reference("HR", staffId),
      date: today,
      addressee: ["TO WHOM IT MAY CONCERN"],
      subject: `Confirmation of employment — ${fullName(staff)}`,
      salutation: "Dear Sir or Madam,",
      paragraphs: [
        `This is to confirm that ${fullName(staff)} is employed by ${letterhead.school.name} and remains in our service as at the date of this letter.`,
      ],
      particulars: [
        { label: "Name", value: fullName(staff) },
        { label: "Staff number", value: staff.staffNo },
        { label: "Position", value: staff.jobTitle ?? "Member of staff" },
        ...(staff.department ? [{ label: "Department", value: staff.department }] : []),
        {
          label: "Employment type",
          value: staff.employmentType.replace(/_/g, " ").toLowerCase(),
        },
        ...(staff.hireDate
          ? [{ label: "Employed since", value: formatDate(staff.hireDate, "long") }]
          : []),
        ...(showSalary && staff.basicSalaryMinor !== null
          ? [
              {
                label: "Basic salary",
                value: `${formatMoney(staff.basicSalaryMinor, "GHS")} per month`,
              },
            ]
          : []),
      ],
      closingParagraphs: [
        "This letter is issued at the request of the above-named member of staff, for whatever purpose it may lawfully serve.",
      ],
      closing: "Yours faithfully,",
      signatory,
      footnote: `Issued by ${letterhead.school.name}. Any query about this letter may be directed to the school office quoting the reference above.`,
    };
    filename = `employment-letter-${staff.staffNo.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
  } else {
    const studentId = url.searchParams.get("studentId") ?? "";
    const student = await db.student.findUnique({
      where: { id: studentId },
      select: {
        firstName: true,
        lastName: true,
        otherNames: true,
        admissionNo: true,
        status: true,
        dateOfBirth: true,
        admissionDate: true,
        exitDate: true,
        exitReason: true,
        transferredTo: true,
        enrollments: {
          orderBy: { enrolledOn: "desc" },
          take: 1,
          select: {
            status: true,
            classSection: {
              select: { name: true, classLevel: { select: { name: true } } },
            },
            academicYear: { select: { name: true } },
          },
        },
        guardians: {
          orderBy: [{ isPrimary: "desc" }],
          take: 1,
          select: {
            guardian: { select: { title: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!student) return message(404, "Not found", "That student does not exist.");

    // The same boundary every other student surface enforces.
    const refusal = await studentOutOfScope(user, studentId);
    if (refusal) return message(403, "Not allowed", refusal);

    const guardian = student.guardians[0]?.guardian;
    const addressee = guardian
      ? [
          `${guardian.title ? `${guardian.title} ` : ""}${guardian.firstName} ${guardian.lastName}`,
          `Parent/Guardian of ${fullName(student)}`,
        ]
      : ["The Parent/Guardian", `of ${fullName(student)}`];

    const placement = student.enrollments[0];
    const className = placement
      ? `${placement.classSection.classLevel.name} ${placement.classSection.name}`
      : null;

    if (kind === "offer") {
      if (student.status !== "OFFERED") {
        return message(
          400,
          "Not at the offer stage",
          "An offer letter is written for an applicant who has been offered a place. Move them to Offered first.",
        );
      }

      letter = {
        reference: reference("ADM", studentId),
        date: today,
        addressee,
        subject: "Offer of admission",
        salutation: guardian ? `Dear ${guardian.title ?? "Parent"} ${guardian.lastName},` : "Dear Parent/Guardian,",
        paragraphs: [
          `Following the assessment of your application, I am pleased to offer ${fullName(student)} a place at ${letterhead.school.name}.`,
          "The particulars of the offer are set out below.",
        ],
        particulars: [
          { label: "Student", value: fullName(student) },
          { label: "Admission number", value: student.admissionNo },
          ...(className ? [{ label: "Class offered", value: className }] : []),
          ...(placement?.academicYear
            ? [{ label: "Academic year", value: placement.academicYear.name }]
            : []),
        ],
        closingParagraphs: [
          "To accept this offer, please contact the school office to confirm the place and settle the admission requirements. A place is held for a reasonable period only, after which it may be offered to another applicant.",
          "We look forward to welcoming your family to the school.",
        ],
        closing: "Yours sincerely,",
        signatory,
        footnote: `Please quote the reference above in any correspondence about this offer.`,
      };
      filename = `offer-letter-${student.admissionNo.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
    } else if (kind === "attestation") {
      if (student.status !== "ENROLLED") {
        return message(
          400,
          "Not currently enrolled",
          "Proof of enrolment states that a child is a current student, and this record is not enrolled.",
        );
      }

      letter = {
        reference: reference("ATT", studentId),
        date: today,
        addressee: ["TO WHOM IT MAY CONCERN"],
        subject: "Confirmation of enrolment",
        salutation: "Dear Sir or Madam,",
        paragraphs: [
          `This is to confirm that ${fullName(student)} is a registered student of ${letterhead.school.name} and is in regular attendance at the date of this letter.`,
        ],
        particulars: [
          { label: "Student", value: fullName(student) },
          { label: "Admission number", value: student.admissionNo },
          ...(student.dateOfBirth
            ? [{ label: "Date of birth", value: formatDate(student.dateOfBirth, "long") }]
            : []),
          ...(className ? [{ label: "Class", value: className }] : []),
          ...(placement?.academicYear
            ? [{ label: "Academic year", value: placement.academicYear.name }]
            : []),
          ...(student.admissionDate
            ? [{ label: "Enrolled since", value: formatDate(student.admissionDate, "long") }]
            : []),
        ],
        closingParagraphs: [
          "This letter is issued at the request of the family, for whatever purpose it may lawfully serve.",
        ],
        closing: "Yours faithfully,",
        signatory,
        footnote: `Issued by ${letterhead.school.name}. Any query may be directed to the school office quoting the reference above.`,
      };
      filename = `enrolment-letter-${student.admissionNo.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
    } else if (kind === "transfer") {
      if (!["TRANSFERRED_OUT", "WITHDRAWN", "GRADUATED"].includes(student.status)) {
        return message(
          400,
          "Still on the roll",
          "A transfer certificate is issued for a student who has left. Record their departure on the profile first.",
        );
      }

      letter = {
        reference: reference("TC", studentId),
        date: today,
        addressee: ["TO WHOM IT MAY CONCERN"],
        subject: "Transfer certificate",
        salutation: "Dear Sir or Madam,",
        paragraphs: [
          `This is to certify that ${fullName(student)} was a student of ${letterhead.school.name} and has left the school in good standing.`,
        ],
        particulars: [
          { label: "Student", value: fullName(student) },
          { label: "Admission number", value: student.admissionNo },
          ...(student.dateOfBirth
            ? [{ label: "Date of birth", value: formatDate(student.dateOfBirth, "long") }]
            : []),
          ...(student.admissionDate
            ? [{ label: "Admitted", value: formatDate(student.admissionDate, "long") }]
            : []),
          ...(student.exitDate
            ? [{ label: "Left", value: formatDate(student.exitDate, "long") }]
            : []),
          ...(className ? [{ label: "Last class attended", value: className }] : []),
          {
            label: "Reason for leaving",
            value:
              student.status === "GRADUATED"
                ? "Completed the course of study"
                : (student.exitReason ?? "Withdrawn by the family"),
          },
          ...(student.transferredTo
            ? [{ label: "Transferred to", value: student.transferredTo }]
            : []),
        ],
        closingParagraphs: [
          "The school raises no objection to this student being admitted elsewhere. Academic records are available to a receiving school on request.",
        ],
        closing: "Yours faithfully,",
        signatory,
        footnote: `Issued by ${letterhead.school.name}. A receiving school may verify this certificate by contacting the office and quoting the reference above.`,
      };
      filename = `transfer-certificate-${student.admissionNo.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
    } else {
      return message(400, "Unknown letter", "Choose an offer, attestation or transfer letter.");
    }
  }

  const pdf = await renderLettersPdf({
    school: {
      name: letterhead.school.name,
      motto: letterhead.school.motto,
      address: letterhead.school.address,
      phone: letterhead.school.phone,
      email: letterhead.school.email,
      website: letterhead.school.website,
      registrationNo: letterhead.school.registrationNo,
    },
    crest: letterhead.crest,
    brandHex: letterhead.brandHex,
    letters: [letter],
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "letter.issue",
      entity: isStaffLetter ? "Staff" : "Student",
      entityId: url.searchParams.get(isStaffLetter ? "staffId" : "studentId") ?? undefined,
      summary: `Issued a ${kind} letter (${letter.reference})`,
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
