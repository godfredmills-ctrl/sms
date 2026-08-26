import { NextResponse } from "next/server";

import { authorize, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadDocumentImage, type EmbeddedImage } from "@/lib/document-images";
import { renderIdCardsPdf, type IdCardPerson } from "@/lib/id-card-pdf";
import { listName } from "@/lib/utils";

/**
 * Identity cards as a printable PDF — a class of students, or the staff.
 *
 * Rendered on request rather than stored: a card changes when a child changes
 * class, house or photograph, and September reprints all of them anyway.
 * Photos load through loadDocumentImage, which only reads the school's own
 * file store — the same rule every generated document follows.
 *
 * The card shows what a lanyard shows: name, number, class, house, an
 * emergency phone on the back. The permission is the matching read
 * permission, because a card is a printout of what those screens already
 * show the same person.
 */
export const dynamic = "force-dynamic";

/**
 * The runaway-request stop, far above any real class and above most staff
 * rooms. When a batch would exceed it the request is refused with an
 * explanation rather than silently truncated — 200 cards handed out and 30
 * people quietly missing is the worse failure.
 */
const MAX_CARDS = 500;

/**
 * These links open in a new tab straight from the launcher page, so the
 * failure states a person can actually reach — an empty class, an expired
 * session — read as a sentence, not as raw JSON in a bare tab.
 */
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
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");

  let user;
  try {
    user = await authorize(kind === "staff" ? "staff.read" : "student.read");
  } catch (error) {
    return message(403, "Not signed in for this", (error as Error).message);
  }

  const school = await db.school.findFirst({
    select: {
      name: true,
      motto: true,
      phone: true,
      email: true,
      addressLine1: true,
      city: true,
      logoUrl: true,
      crestUrl: true,
      branding: true,
    },
  });
  if (!school) {
    return message(400, "No school profile", "Set up the school profile under Settings first.");
  }

  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { name: true },
  });

  const crest = await loadDocumentImage(school.crestUrl ?? school.logoUrl);
  const brandHex =
    (school.branding as { primary?: string } | null)?.primary ?? "#2C66CE";
  const address = [school.addressLine1, school.city].filter(Boolean).join(", ");

  let people: IdCardPerson[];
  let title: string;
  let roleLabel: string;
  let detailLabel: string;
  let filename: string;

  if (kind === "staff") {
    const staffId = url.searchParams.get("staffId");
    // Active only, single card included: a card asserts current employment.
    const staff = await db.staff.findMany({
      where: staffId ? { id: staffId, status: "ACTIVE" } : { status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: MAX_CARDS + 1,
      select: {
        firstName: true,
        lastName: true,
        otherNames: true,
        staffNo: true,
        jobTitle: true,
        department: true,
        photoUrl: true,
        phone: true,
      },
    });
    if (!staff.length) {
      return message(404, "No staff to print", "There are no active staff matching this request.");
    }
    if (staff.length > MAX_CARDS) {
      return message(
        400,
        "Too many cards for one batch",
        `This would be more than ${MAX_CARDS} cards. Print a department at a time instead.`,
      );
    }

    people = await Promise.all(
      staff.map(async (member) => ({
        name: listName(member),
        number: member.staffNo,
        role: member.jobTitle ?? "Staff",
        detail: member.department,
        photo: await loadDocumentImage(member.photoUrl),
      })),
    );
    title = "Staff Identity Card";
    roleLabel = "Job title";
    detailLabel = "Department";
    filename = staffId
      ? `id-card-${staff[0].staffNo.replace(/[^A-Za-z0-9._-]+/g, "-")}`
      : "id-cards-staff";
  } else {
    const sectionId = url.searchParams.get("sectionId");
    const studentId = url.searchParams.get("studentId");
    // A selection from the students table: several pupils who share no class.
    // Trimmed and de-duplicated, because a list built from tick boxes is a
    // list somebody could have got wrong.
    const studentIds = [
      ...new Set(
        (url.searchParams.get("studentIds") ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];

    if (!sectionId && !studentId && !studentIds.length) {
      return message(400, "Nothing chosen", "Choose a class or a student first.");
    }

    // The blood group is a medical record. The rest of the app keeps the
    // medical file behind its own permission, and a printout is not a way
    // around that: without student.medical.read the card back simply goes
    // without it.
    const includeMedical = userCan(user, "student.medical.read");

    // Enrolled only, single card included: an identity card asserts current
    // membership, which an applicant does not yet have and a graduate no
    // longer does.
    const students = await db.student.findMany({
      where: studentId
        ? { id: studentId, status: "ENROLLED" }
        : studentIds.length
          ? { id: { in: studentIds }, status: "ENROLLED" }
          : {
              status: "ENROLLED",
              enrollments: {
                some: { classSectionId: sectionId ?? "", status: "ACTIVE" },
              },
            },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: MAX_CARDS + 1,
      select: {
        firstName: true,
        lastName: true,
        otherNames: true,
        admissionNo: true,
        house: true,
        photoUrl: true,
        medical: includeMedical ? { select: { bloodGroup: true } } : undefined,
        guardians: {
          orderBy: [{ isEmergency: "desc" }, { isPrimary: "desc" }],
          take: 1,
          select: {
            guardian: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
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
    });
    if (!students.length) {
      return message(
        404,
        "No students to print",
        "No enrolled students match this request. An applicant or a graduate does not get a membership card.",
      );
    }
    if (students.length > MAX_CARDS) {
      return message(
        400,
        "Too many cards for one batch",
        `This would be more than ${MAX_CARDS} cards. Print a class at a time instead.`,
      );
    }

    people = await Promise.all(
      students.map(async (student) => {
        const section = student.enrollments[0]?.classSection;
        const contact = student.guardians[0]?.guardian;
        return {
          name: listName(student),
          number: student.admissionNo,
          role: section ? `${section.classLevel.name} ${section.name}` : "-",
          detail: student.house ? `${student.house} house` : null,
          photo: await loadDocumentImage(student.photoUrl),
          emergencyName: contact ? `${contact.firstName} ${contact.lastName}` : null,
          emergencyPhone: contact?.phone ?? null,
          bloodGroup: includeMedical ? (student.medical?.bloodGroup ?? null) : null,
        };
      }),
    );
    title = "Student Identity Card";
    roleLabel = "Class";
    detailLabel = "House";
    filename = studentId
      ? `id-card-${students[0].admissionNo.replace(/\//g, "-")}`
      : "id-cards-class";
  }

  const pdf = await renderIdCardsPdf({
    school: {
      name: school.name,
      motto: school.motto,
      address,
      phone: school.phone,
      email: school.email,
    },
    crest,
    brandHex,
    title,
    roleLabel,
    detailLabel,
    validity: year?.name ?? "",
    people,
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "idcard.generate",
      entity: kind === "staff" ? "Staff" : "Student",
      summary: `Generated ${people.length} ${kind === "staff" ? "staff" : "student"} ID card(s)`,
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
