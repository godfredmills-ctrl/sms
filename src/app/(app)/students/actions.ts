"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { parseAttachedDocuments } from "@/lib/person-documents";
import { normalisePhone, slugify } from "@/lib/utils";

export type AdmissionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  studentId?: string;
  admissionNo?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

/**
 * Next admission number, of the form ADM/2026/0417.
 *
 * Derived from the count rather than a sequence, then retried on collision:
 * two admissions clerks working at the same desk will occasionally land on the
 * same number, and a unique-constraint error is not something a receptionist
 * should have to interpret.
 */
async function nextAdmissionNo(year: number, attempt = 0): Promise<string> {
  const count = await db.student.count();
  const serial = String(count + 1 + attempt).padStart(4, "0");
  return `ADM/${year}/${serial}`;
}

export async function admitStudentAction(
  _previous: AdmissionState,
  formData: FormData,
): Promise<AdmissionState> {
  let user;
  try {
    user = await authorize("student.create");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  if (!firstName || !lastName) return { error: "First and last name are required." };

  const dateOfBirth = text(formData, "dateOfBirth");
  const classSectionId = text(formData, "classSectionId");

  // Guardian details, captured on the same form: a student record with no
  // contactable adult behind it is the single most common gap in a school
  // database, and it is only ever filled in later under pressure.
  const guardianFirst = text(formData, "guardianFirstName");
  const guardianLast = text(formData, "guardianLastName");
  const guardianPhone = normalisePhone(text(formData, "guardianPhone"));

  if (guardianFirst && !guardianPhone) {
    return { error: "A guardian needs a phone number the school can reach." };
  }

  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const admissionNo = text(formData, "admissionNo") || (await nextAdmissionNo(year, attempt));

    try {
      const student = await db.$transaction(async (tx) => {
        const created = await tx.student.create({
          data: {
            admissionNo,
            firstName,
            lastName,
            otherNames: optional(formData, "otherNames"),
            preferredName: optional(formData, "preferredName"),
            gender: (text(formData, "gender") || "UNDISCLOSED") as never,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            placeOfBirth: optional(formData, "placeOfBirth"),
            status: (text(formData, "status") || "ENROLLED") as never,

            nationality: text(formData, "nationality") || "Ghanaian",
            nationalId: optional(formData, "nationalId"),
            birthCertNo: optional(formData, "birthCertNo"),
            religion: optional(formData, "religion"),
            hometown: optional(formData, "hometown"),
            homeRegion: optional(formData, "homeRegion"),
            firstLanguage: text(formData, "firstLanguage") || "English",

            email: optional(formData, "email"),
            phone: normalisePhone(text(formData, "phone")),
            residentialAddress: optional(formData, "residentialAddress"),
            digitalAddr: optional(formData, "digitalAddr"),
            city: optional(formData, "city"),
            region: optional(formData, "region"),

            livingWith: optional(formData, "livingWith"),
            transportMode: optional(formData, "transportMode"),
            isBoarder: formData.get("isBoarder") === "on",
            house: optional(formData, "house"),

            hasSpecialNeeds: formData.get("hasSpecialNeeds") === "on",
            specialNeedsNotes: optional(formData, "specialNeedsNotes"),

            admissionDate: new Date(),
            admissionType: text(formData, "admissionType") || "NEW",
            referralSource: optional(formData, "referralSource"),
            createdById: user.id,
          },
        });

        // Medical record is created up front, even empty: an allergy noted on
        // day two has nowhere to go otherwise, and the emergency plan is the
        // one thing nobody wants to be creating in a hurry.
        await tx.studentMedical.create({
          data: {
            studentId: created.id,
            bloodGroup: optional(formData, "bloodGroup"),
            allergies: text(formData, "allergies")
              ? text(formData, "allergies")
                  .split(",")
                  .map((entry) => ({ name: entry.trim() }))
                  .filter((entry) => entry.name)
              : undefined,
            emergencyInstructions: optional(formData, "emergencyInstructions"),
          },
        });

        if (guardianFirst && guardianLast && guardianPhone) {
          const guardian = await tx.guardian.upsert({
            where: { id: text(formData, "existingGuardianId") || "___none___" },
            create: {
              firstName: guardianFirst,
              lastName: guardianLast,
              phone: guardianPhone,
              email: optional(formData, "guardianEmail"),
              occupation: optional(formData, "guardianOccupation"),
              preferredChannel: (text(formData, "guardianChannel") || "SMS") as never,
            },
            update: {},
          });

          await tx.studentGuardian.create({
            data: {
              studentId: created.id,
              guardianId: guardian.id,
              relation: (text(formData, "guardianRelation") || "GUARDIAN") as never,
              isPrimary: true,
              isEmergency: true,
              isBillPayer: true,
              billSharePercent: 100,
              receivesReports: true,
            },
          });
        }

        // Only an ENROLLED student joins a class roll. An applicant with a
        // class would appear on registers and class lists before the school
        // has decided anything — the stage exists precisely so they do not.
        if (classSectionId && created.status === "ENROLLED") {
          const currentYear = await tx.academicYear.findFirst({
            where: { isCurrent: true },
            select: { id: true },
          });
          if (currentYear) {
            await tx.enrollment.create({
              data: {
                studentId: created.id,
                classSectionId,
                academicYearId: currentYear.id,
                status: "ACTIVE",
              },
            });
          }
        }

        // The papers on the registrar's desk, filed as part of the admission
        // rather than promised to a Documents tab later.
        const attached = parseAttachedDocuments(formData);
        if (attached.length) {
          await tx.studentDocument.createMany({
            data: attached.map((entry) => ({
              studentId: created.id,
              fileId: entry.fileId,
              category: entry.category,
              title: entry.title,
              uploadedById: user.id,
            })),
          });
        }

        return created;
      });

      await db.auditLog.create({
        data: {
          userId: user.id,
          actorLabel: user.fullName,
          action: "student.create",
          entity: "Student",
          entityId: student.id,
          summary: `Admitted ${firstName} ${lastName} (${admissionNo})`,
        },
      });

      revalidatePath("/students");

      return {
        ok: true,
        studentId: student.id,
        admissionNo,
        message: `${firstName} ${lastName} admitted as ${admissionNo}.`,
      };
    } catch (error) {
      const message = (error as Error).message;
      // Only an admission-number collision is worth retrying; anything else is
      // a real problem and should surface rather than loop.
      if (!message.includes("admissionNo") || text(formData, "admissionNo")) {
        return { error: message };
      }
    }
  }

  return { error: "Could not allocate an admission number. Try again." };
}

export async function createGuardianLinkAction(formData: FormData) {
  const user = await authorize("student.guardian.manage");

  const studentId = text(formData, "studentId");
  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  const phone = normalisePhone(text(formData, "phone"));

  if (!studentId || !firstName || !lastName || !phone) return;

  // An existing guardian is reused by phone number rather than duplicated:
  // siblings share parents, and two records for one parent means two sets of
  // reminders and a split fee history.
  const existing = await db.guardian.findFirst({
    where: { phone },
    select: { id: true },
  });

  const guardian =
    existing ??
    (await db.guardian.create({
      data: {
        firstName,
        lastName,
        phone,
        email: optional(formData, "email"),
        occupation: optional(formData, "occupation"),
      },
    }));

  await db.studentGuardian.upsert({
    where: { studentId_guardianId: { studentId, guardianId: guardian.id } },
    create: {
      studentId,
      guardianId: guardian.id,
      relation: (text(formData, "relation") || "GUARDIAN") as never,
      isPrimary: formData.get("isPrimary") === "on",
      isBillPayer: formData.get("isBillPayer") === "on",
      isEmergency: formData.get("isEmergency") === "on",
      receivesReports: true,
    },
    update: {
      relation: (text(formData, "relation") || "GUARDIAN") as never,
      isPrimary: formData.get("isPrimary") === "on",
      isBillPayer: formData.get("isBillPayer") === "on",
      isEmergency: formData.get("isEmergency") === "on",
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "student.guardian.link",
      entity: "Student",
      entityId: studentId,
      summary: `Linked guardian ${firstName} ${lastName}`,
    },
  });

  revalidatePath(`/students/${studentId}`);
}

/** Creates a portal login for a student who does not have one. */
export async function createStudentLoginAction(formData: FormData) {
  const user = await authorize("user.manage");

  const studentId = text(formData, "studentId");
  if (!studentId) return;

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      otherNames: true,
      admissionNo: true,
      email: true,
    },
  });
  if (!student || student.userId) return;

  const role = await db.role.findUnique({ where: { key: "student" } });

  const username = slugify(
    `${student.firstName}.${student.lastName}.${student.admissionNo.slice(-4)}`,
  );
  const temporary = student.admissionNo.replace(/\W/g, "");

  const account = await db.user.create({
    data: {
      firstName: student.firstName,
      lastName: student.lastName,
      otherNames: student.otherNames,
      username,
      email: student.email,
      portal: "STUDENT",
      status: "ACTIVE",
      passwordHash: await hashPassword(temporary),
      mustChangePassword: true,
      ...(role ? { roles: { create: { roleId: role.id, assignedBy: user.id } } } : {}),
    },
  });

  await db.student.update({
    where: { id: studentId },
    data: { userId: account.id },
  });

  revalidatePath(`/students/${studentId}`);
}

// -----------------------------------------------------------------------------
// The admission pipeline
// -----------------------------------------------------------------------------

export type StageState = { ok?: boolean; error?: string; message?: string };

/**
 * Moves a student through the admission stages.
 *
 * Applied (a website form) → Applicant (a record, not on any roll) → Offered
 * (a place held) → Enrolled (on the roll, in a class). Each step is a
 * decision somebody takes, which is why filling a form on the website makes
 * nobody a student: the school does that here, on purpose, one stage at a
 * time.
 */
export async function setStudentStageAction(
  _previous: StageState,
  formData: FormData,
): Promise<StageState> {
  let user;
  try {
    user = await authorize("student.update");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const stage = text(formData, "stage");
  if (!id) return { error: "No student given." };
  if (!["OFFERED", "ENROLLED"].includes(stage)) return { error: "Choose a stage." };

  const student = await db.student.findUnique({
    where: { id },
    select: { firstName: true, lastName: true, status: true },
  });
  if (!student) return { error: "Student not found." };
  if (!["APPLICANT", "OFFERED"].includes(student.status)) {
    return { error: "Only applicants move through admission stages." };
  }

  if (stage === "ENROLLED") {
    const classSectionId = text(formData, "classSectionId");
    if (!classSectionId) {
      return { error: "Enrolling places the student in a class — choose one." };
    }

    const currentYear = await db.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    if (!currentYear) {
      return { error: "No academic year is marked current, so there is no roll to join." };
    }

    await db.$transaction([
      db.student.update({
        where: { id },
        data: { status: "ENROLLED", admissionDate: new Date() },
      }),
      db.enrollment.upsert({
        where: {
          studentId_academicYearId: { studentId: id, academicYearId: currentYear.id },
        },
        create: {
          studentId: id,
          classSectionId,
          academicYearId: currentYear.id,
          status: "ACTIVE",
        },
        update: { classSectionId, status: "ACTIVE" },
      }),
    ]);
  } else {
    await db.student.update({ where: { id }, data: { status: "OFFERED" } });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "student.stage",
      entity: "Student",
      entityId: id,
      summary: `${student.firstName} ${student.lastName} moved to ${stage.toLowerCase()}`,
    },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  return {
    ok: true,
    message:
      stage === "ENROLLED"
        ? `${student.firstName} is enrolled and on the class roll.`
        : `A place has been offered to ${student.firstName}.`,
  };
}
