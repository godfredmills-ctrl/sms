import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
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

/** Batches are printed a class at a time; this is a hard stop, not a page size. */
const MAX_CARDS = 200;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");

  let user;
  try {
    user = await authorize(kind === "staff" ? "staff.read" : "student.read");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const school = await db.school.findFirst({
    select: {
      name: true,
      phone: true,
      addressLine1: true,
      city: true,
      logoUrl: true,
      crestUrl: true,
      branding: true,
    },
  });
  if (!school) {
    return NextResponse.json({ error: "Set up the school profile first." }, { status: 400 });
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
    const staff = await db.staff.findMany({
      where: staffId ? { id: staffId } : { status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: MAX_CARDS,
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
      return NextResponse.json({ error: "No staff to print." }, { status: 404 });
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
    filename = staffId ? `id-card-${staff[0].staffNo}` : "id-cards-staff";
  } else {
    const sectionId = url.searchParams.get("sectionId");
    const studentId = url.searchParams.get("studentId");
    if (!sectionId && !studentId) {
      return NextResponse.json(
        { error: "Choose a class (sectionId) or a student (studentId)." },
        { status: 400 },
      );
    }

    const students = await db.student.findMany({
      where: studentId
        ? { id: studentId }
        : {
            status: "ENROLLED",
            enrollments: {
              some: { classSectionId: sectionId ?? "", status: "ACTIVE" },
            },
          },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: MAX_CARDS,
      select: {
        firstName: true,
        lastName: true,
        otherNames: true,
        admissionNo: true,
        house: true,
        photoUrl: true,
        medical: { select: { bloodGroup: true } },
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
      return NextResponse.json({ error: "No students to print." }, { status: 404 });
    }

    people = await Promise.all(
      students.map(async (student) => {
        const section = student.enrollments[0]?.classSection;
        const contact = student.guardians[0]?.guardian;
        return {
          name: listName(student),
          number: student.admissionNo,
          role: section ? `${section.classLevel.name} ${section.name}` : "—",
          detail: student.house ? `${student.house} house` : null,
          photo: await loadDocumentImage(student.photoUrl),
          emergencyName: contact ? `${contact.firstName} ${contact.lastName}` : null,
          emergencyPhone: contact?.phone ?? null,
          bloodGroup: student.medical?.bloodGroup ?? null,
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
    school: { name: school.name, address, phone: school.phone },
    crest,
    brandHex,
    title,
    roleLabel,
    detailLabel,
    validity: year ? `Valid: ${year.name} academic year` : "",
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
