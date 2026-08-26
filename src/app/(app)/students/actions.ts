"use server";

import { revalidatePath } from "next/cache";


import { authorize } from "@/lib/auth";
import { houseRefusal } from "@/lib/boarding-rules";
import { db } from "@/lib/db";

import { LIFECYCLE_TRANSITIONS } from "./lifecycle";
import { generateCode, hashPassword } from "@/lib/crypto";
import { parseAttachedDocuments } from "@/lib/person-documents";
import { studentOutOfScope } from "@/lib/scope";
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

            // Emptied means unknown, not Ghanaian: nationality selects the fee
        // structure (local or international), so a default here re-prices a
        // child's next invoice.
        nationality: optional(formData, "nationality"),
            nationalId: optional(formData, "nationalId"),
            birthCertNo: optional(formData, "birthCertNo"),
            religion: optional(formData, "religion"),
            hometown: optional(formData, "hometown"),
            homeRegion: optional(formData, "homeRegion"),
            firstLanguage: optional(formData, "firstLanguage"),

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

        // A guardian with a phone number is a guardian; a blank surname —
        // common when the website application carried a single name — must
        // not silently discard the one contactable adult on the file.
        if (guardianFirst && guardianPhone) {
          const guardian = await tx.guardian.upsert({
            where: { id: text(formData, "existingGuardianId") || "___none___" },
            create: {
              firstName: guardianFirst,
              lastName: guardianLast || guardianFirst,
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
export type LoginState = {
  ok?: boolean;
  error?: string;
  username?: string;
  /** Shown once, on the screen that created it. Never stored in the clear. */
  temporaryPassword?: string;
};

/**
 * Gives a pupil a way to sign in.
 *
 * This is the only code in the system that creates a STUDENT-portal account —
 * inviteUserAction makes a User and cannot attach it to a Student record, so
 * every portal page would answer "not linked". It had no caller. Outside the
 * demo seed, that meant no child at any real school could sign in at all, and
 * the entire student portal — results, timetable, assignments, fees, their
 * library books, their bus — was unreachable.
 */
export async function createStudentLoginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  let user;
  try {
    user = await authorize("user.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const studentId = text(formData, "studentId");
  if (!studentId) return { error: "No pupil given." };

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
  if (!student) return { error: "That pupil was not found." };
  if (student.userId) return { error: "They already have a login." };

  const role = await db.role.findUnique({ where: { key: "student" } });
  if (!role) {
    return { error: "There is no Student role to assign. Create one first." };
  }

  const base = slugify(
    `${student.firstName}.${student.lastName}.${student.admissionNo.slice(-4)}`,
  );

  // Two children can share a name and the last four of an admission number is
  // not much of a discriminator, so the username is checked rather than
  // assumed. A collision would otherwise throw a unique-constraint error at
  // the person creating the account, naming a database column.
  let username = base;
  for (let attempt = 2; attempt < 50; attempt += 1) {
    const taken = await db.user.findUnique({ where: { username }, select: { id: true } });
    if (!taken) break;
    username = `${base}${attempt}`;
  }

  // Random, not the admission number.
  //
  // The admission number was on every class list, every report card and every
  // invoice in the school. As a first password it meant anyone holding one of
  // those could sign in as that child up until the child first signed in
  // themselves — and children do not sign in promptly. mustChangePassword is
  // set either way, so this costs nothing but a line the office reads out.
  const temporary = `${generateCode(4)}-${generateCode(4)}`;

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

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "user.create",
      entity: "Student",
      entityId: studentId,
      summary: `Created a portal login for ${student.firstName} ${student.lastName}`,
    },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/users");

  return { ok: true, username, temporaryPassword: temporary };
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
      return { error: "Enrolling places the student in a class: choose one." };
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
      // An enrolled child is out of the pipeline — stageOf reads
      // Student.status first and returns ENROLLED whatever else is on the
      // record — but an application still marked declined would be a
      // contradiction sitting in the row for anybody who read it.
      db.admissionApplication.updateMany({
        where: { studentId: id },
        data: { declinedOn: null, declineReason: null, waitlistRank: null },
      }),
    ]);
  } else {
    // The admissions board derives its stage from the application, not from
    // Student.status, so moving the pupil here alone made the two screens
    // disagree: the profile said a place had been offered and the board went
    // on showing them as applied, with an Offer button still on the row.
    //
    // Stamped rather than left null, and with no lapse date, because this
    // path has nowhere to ask for one — the board's own offer control is where
    // a date is set, and an offer with no date is the honest record of one
    // made without a deadline.
    await db.$transaction([
      db.student.update({ where: { id }, data: { status: "OFFERED" } }),
      db.admissionApplication.updateMany({
        where: { studentId: id, offeredOn: null },
        data: { offeredOn: new Date(), acceptedOn: null, declinedOn: null, waitlistRank: null },
      }),
    ]);
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


// ---------------------------------------------------------------------------
// The record after admission
// ---------------------------------------------------------------------------

export type StudentState = { ok?: boolean; error?: string; message?: string };

/**
 * Edits a student's record.
 *
 * Everything a school corrects in the ordinary course of a year: a misspelt
 * surname, a date of birth that has to match a birth certificate before WAEC
 * registration, a new phone number, a house reassignment, an index number
 * issued months after admission. Until this existed the record was frozen at
 * the moment of admission and a typo could only be fixed in the database.
 *
 * Status is deliberately NOT editable here — moving a child out of the school
 * is its own decision with its own reasons and dates, and it belongs to
 * setStudentLifecycleAction below rather than to a field on a long form.
 */
export async function updateStudentAction(
  _previous: StudentState,
  formData: FormData,
): Promise<StudentState> {
  let user;
  try {
    user = await authorize("student.update");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "No student given." };

  // A form teacher holds student.update for their own class, not for the
  // school. Without this they could rewrite any child's name, date of birth
  // or admission number — the fields that go to WAEC.
  const refusal = await studentOutOfScope(user, id);
  if (refusal) return { error: refusal };

  // The background fields carry the family's circumstances, and the profile
  // hides them behind their own permission. A form that cannot show them
  // must not write them either — silence here would blank them.
  const mayEditBackground = user.permissions.has("student.background.read");

  // Boarding is two records that have to agree: the four fields on this row,
  // and the BoardingAllocation that owns a bed in a room. This form used to
  // write the fields alone, so unticking "Boarder" here left the allocation
  // open — the bed stayed counted as taken, the child did not appear on the
  // list of boarders without one, and only their name under the room in
  // Houses & rooms said anything was wrong.
  const wantsBoarding = formData.get("isBoarder") === "on";
  const boardingYear = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  const openBed = boardingYear
    ? await db.boardingAllocation.findFirst({
        where: { studentId: id, academicYearId: boardingYear.id, endedOn: null },
        select: {
          id: true,
          room: { select: { house: { select: { name: true, gender: true } } } },
        },
      })
    : null;

  // The same rule the boarding module applies when a house's sex is changed
  // under its boarders, applied from the other direction. Correcting a
  // pupil's recorded sex is ordinary and often overdue; doing it while they
  // hold a bed in a house that now forbids them is a thing somebody has to
  // act on, and it would have happened here in silence.
  const newGender = text(formData, "gender");
  if (openBed && newGender) {
    const clash = houseRefusal(newGender, openBed.room.house.gender);
    if (clash) {
      return {
        error: `They are in ${openBed.room.house.name}, and ${clash.toLowerCase().replace(/.$/, "")}: move them to another house first.`,
      };
    }
  }

  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  if (!firstName || !lastName) return { error: "First and last name are required." };

  const dateOfBirth = text(formData, "dateOfBirth");
  if (dateOfBirth) {
    // Date-only inputs parse as UTC midnight; anchoring to local midnight keeps
    // the stored day the day that was typed, wherever the server sits.
    const parsed = new Date(dateOfBirth + "T00:00:00");
    if (Number.isNaN(parsed.getTime())) return { error: "That date of birth is not valid." };
    if (parsed.getTime() > Date.now()) return { error: "That date of birth is in the future." };
  }

  const admissionNo = text(formData, "admissionNo");
  if (!admissionNo) return { error: "A student needs an admission number." };

  // The admission number is on every document the school has ever issued for
  // this child, so a clash is refused with the name of whoever holds it.
  const clash = await db.student.findFirst({
    where: { admissionNo, id: { not: id } },
    select: { firstName: true, lastName: true },
  });
  if (clash) {
    return {
      error: `${clash.firstName} ${clash.lastName} already has admission number ${admissionNo}.`,
    };
  }

  try {
    await db.student.update({
      where: { id },
      data: {
        admissionNo,
        indexNumber: optional(formData, "indexNumber"),
        firstName,
        lastName,
        otherNames: optional(formData, "otherNames"),
        preferredName: optional(formData, "preferredName"),
        gender: (text(formData, "gender") || "UNDISCLOSED") as never,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth + "T00:00:00") : null,
        placeOfBirth: optional(formData, "placeOfBirth"),
        photoUrl: optional(formData, "photoUrl"),

        // Emptied means unknown, not Ghanaian: nationality selects the fee
        // structure (local or international), so a default here re-prices a
        // child's next invoice.
        nationality: optional(formData, "nationality"),
        nationalId: optional(formData, "nationalId"),
        birthCertNo: optional(formData, "birthCertNo"),
        nhisNumber: optional(formData, "nhisNumber"),
        religion: optional(formData, "religion"),
        hometown: optional(formData, "hometown"),
        homeRegion: optional(formData, "homeRegion"),
        firstLanguage: optional(formData, "firstLanguage"),

        email: optional(formData, "email"),
        phone: normalisePhone(text(formData, "phone")),
        residentialAddress: optional(formData, "residentialAddress"),
        digitalAddr: optional(formData, "digitalAddr"),
        city: optional(formData, "city"),
        region: optional(formData, "region"),

        transportMode: optional(formData, "transportMode"),
        busRoute: optional(formData, "busRoute"),

        // The boarding fields are the allocation's, whenever there is one.
        // See the reconciliation below: writing them from this form while a
        // bed is open let somebody untick "Boarder" here and leave the bed
        // occupied by a child the boarding module still believes is in it.
        ...(openBed
          ? {}
          : {
              house: optional(formData, "house"),
              dormitory: optional(formData, "dormitory"),
              roomNumber: optional(formData, "roomNumber"),
            }),
        isBoarder: wantsBoarding,

        ...(mayEditBackground
          ? {
              livingWith: optional(formData, "livingWith"),
              hasSpecialNeeds: formData.get("hasSpecialNeeds") === "on",
              specialNeedsNotes: optional(formData, "specialNeedsNotes"),
              // One per line in a textarea: a school types a list, and a
              // list of needs is not worth a row-management widget.
              learningSupport: text(formData, "learningSupport")
                .split(/\r?\n/)
                .map((value) => value.trim())
                .filter(Boolean),
              onScholarship: formData.get("onScholarship") === "on",
              scholarshipDetails: optional(formData, "scholarshipDetails"),
              notes: optional(formData, "notes"),
            }
          : {}),
      },
    });
  } catch (error) {
    return { error: (error as Error).message };
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "student.update",
      entity: "Student",
      entityId: id,
      summary: `Updated ${firstName} ${lastName} (${admissionNo})`,
    },
  });

  // Boarding switched off with a bed still open: close it, and clear the four
  // fields the allocation owned. Done after the update rather than inside it
  // because the bed is a different table with its own rules, and leaving it
  // open would keep it counted as taken by a child the school no longer
  // believes is boarding.
  if (openBed && !wantsBoarding) {
    await db.boardingAllocation.update({
      where: { id: openBed.id },
      data: { endedOn: new Date() },
    });
    await db.student.update({
      where: { id },
      data: { house: null, dormitory: null, roomNumber: null },
    });
    await db.auditLog.create({
      data: {
        userId: user.id,
        actorLabel: user.fullName,
        action: "boarding.deallocate",
        entity: "Student",
        entityId: id,
        summary: "Bed released: no longer a boarder",
      },
    });
    revalidatePath("/boarding");
    revalidatePath("/boarding/houses");
  }

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  return { ok: true, message: "Saved." };
}


/**
 * Moves a student through the rest of their life at the school.
 *
 * Nine statuses were declared and only three reachable, so a child who
 * relocated in November stayed ENROLLED forever: on every register, in the
 * headcount, and invoiced again next term. This is the way out — and the way
 * back, because a suspension ends and a family that leaves sometimes returns.
 *
 * Leaving closes the active enrolment too. That single write is what takes
 * them off the register and out of the billing run, both of which already
 * filter on an ACTIVE enrolment.
 */
export async function setStudentLifecycleAction(
  _previous: StudentState,
  formData: FormData,
): Promise<StudentState> {
  let user;
  try {
    user = await authorize("student.update");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const status = text(formData, "status");
  const transition = LIFECYCLE_TRANSITIONS.find((entry) => entry.value === status);
  if (!id || !transition) return { error: "Choose what is happening to this student." };

  // Same scope as editing, and more important here: this write takes a child
  // off the register and out of the billing run.
  const refusal = await studentOutOfScope(user, id);
  if (refusal) return { error: refusal };

  const reason = text(formData, "reason");
  if (transition.endsEnrolment && !reason) {
    return { error: "Say why they are leaving: this is the record of it." };
  }

  const student = await db.student.findUnique({
    where: { id },
    select: { firstName: true, lastName: true, status: true, admissionNo: true },
  });
  if (!student) return { error: "Student not found." };
  if (student.status === status) {
    return { error: `They are already ${transition.label.toLowerCase()}.` };
  }
  if (["GRADUATED", "ALUMNI"].includes(student.status)) {
    return { error: "A graduate's record is closed. Admit them again to bring them back." };
  }
  if (status === "ENROLLED" && student.status === "APPLICANT") {
    return { error: "Use the admission stages to enrol an applicant." };
  }

  const effectiveRaw = text(formData, "effectiveOn");
  const effectiveOn = effectiveRaw ? new Date(effectiveRaw + "T00:00:00") : new Date();
  if (Number.isNaN(effectiveOn.getTime())) return { error: "That date is not valid." };
  // The change takes effect the moment it is saved, so a future date would
  // promise something the record does not do — the child would be off the
  // register today under a date that has not arrived.
  if (effectiveOn.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return { error: "That date is in the future. Record it on the day it happens." };
  }

  // Coming back needs somewhere to come back to. Reinstating reopens the
  // enrolment that was closed on the way out, or places them in a class
  // chosen on the form — because ENROLLED with no active enrolment is a
  // child on the roll, off every register, and invisible to billing.
  let reopened: string | null = null;
  if (status === "ENROLLED") {
    const year = await db.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    if (!year) return { error: "No academic year is current, so there is nothing to enrol into." };

    const existing = await db.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: id, academicYearId: year.id } },
      select: { id: true, status: true, classSectionId: true },
    });
    const chosenSection = text(formData, "classSectionId");

    if (!existing && !chosenSection) {
      return { error: "Choose the class they are coming back into." };
    }
    if (existing && existing.status !== "ACTIVE" && !chosenSection) {
      reopened = existing.classSectionId;
    }
  }

  await db.$transaction(async (tx) => {
    await tx.student.update({
      where: { id },
      data: {
        status: status as never,
        // The departure record is cleared only when they are actually back.
        // Suspending someone who has left must not erase why they left.
        ...(status === "ENROLLED"
          ? { exitDate: null, exitReason: null, transferredTo: null }
          : transition.endsEnrolment
            ? {
                exitDate: effectiveOn,
                exitReason: reason,
                transferredTo:
                  status === "TRANSFERRED_OUT" ? optional(formData, "transferredTo") : null,
              }
            : {}),
      },
    });

    if (transition.endsEnrolment) {
      // The enrolment is what registers and billing actually read.
      await tx.enrollment.updateMany({
        where: { studentId: id, status: "ACTIVE" },
        data: {
          status: status === "TRANSFERRED_OUT" ? "TRANSFERRED" : "WITHDRAWN",
          endedOn: effectiveOn,
        },
      });
    }

    if (status === "ENROLLED") {
      const year = await tx.academicYear.findFirst({
        where: { isCurrent: true },
        select: { id: true },
      });
      if (year) {
        const chosenSection = text(formData, "classSectionId");
        await tx.enrollment.upsert({
          where: {
            studentId_academicYearId: { studentId: id, academicYearId: year.id },
          },
          create: {
            studentId: id,
            academicYearId: year.id,
            classSectionId: chosenSection,
            status: "ACTIVE",
          },
          update: {
            status: "ACTIVE",
            endedOn: null,
            ...(chosenSection ? { classSectionId: chosenSection } : {}),
          },
        });
      }
    }
  });
  void reopened;

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "student.lifecycle",
      entity: "Student",
      entityId: id,
      summary: `${student.firstName} ${student.lastName} (${student.admissionNo}): ${student.status} → ${status}${reason ? `, ${reason}` : ""}`,
    },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  return {
    ok: true,
    message: transition.endsEnrolment
      ? "Recorded. They are off the roll, the registers and the billing run."
      : status === "ENROLLED"
        ? "Back on the roll, the register and the billing run."
        : "Recorded. They keep their place, and are out of billing and the headcount until they return.",
  };
}

/**
 * Moves a student to a different class in the current year.
 *
 * Streaming after a placement test, balancing two arms, or settling a
 * mid-term arrival. academic.enrollment.manage has existed since the
 * permission catalogue was written and this is its first consumer.
 *
 * The enrolment row is updated rather than replaced: one enrolment per
 * student per year is a database constraint, and it is also the truth — a
 * child moving from 5A to 5B has not enrolled twice.
 */
export async function transferStudentClassAction(
  _previous: StudentState,
  formData: FormData,
): Promise<StudentState> {
  let user;
  try {
    user = await authorize("academic.enrollment.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const classSectionId = text(formData, "classSectionId");
  if (!id || !classSectionId) return { error: "Choose the class they are moving into." };

  const refusal = await studentOutOfScope(user, id);
  if (refusal) return { error: refusal };

  const [student, section] = await Promise.all([
    db.student.findUnique({
      where: { id },
      select: {
        firstName: true,
        lastName: true,
        status: true,
        enrollments: {
          where: { status: "ACTIVE" },
          take: 1,
          select: {
            id: true,
            classSectionId: true,
            classSection: {
              select: { name: true, classLevel: { select: { name: true } } },
            },
          },
        },
      },
    }),
    db.classSection.findUnique({
      where: { id: classSectionId },
      select: {
        name: true,
        isActive: true,
        capacity: true,
        classLevel: { select: { name: true } },
        _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
      },
    }),
  ]);

  if (!student) return { error: "Student not found." };
  if (!section) return { error: "That class does not exist." };
  if (!section.isActive) return { error: "That class is not active." };
  if (student.status !== "ENROLLED") {
    return { error: "Only an enrolled student can be moved between classes." };
  }

  const current = student.enrollments[0];
  if (!current) return { error: "They have no active enrolment to move." };
  if (current.classSectionId === classSectionId) {
    return { error: "They are already in that class." };
  }
  if (section._count.enrollments >= section.capacity) {
    return {
      error: `${section.classLevel.name} ${section.name} is full (${section._count.enrollments} of ${section.capacity}).`,
    };
  }

  await db.enrollment.update({
    where: { id: current.id },
    data: { classSectionId },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "student.transfer.class",
      entity: "Student",
      entityId: id,
      summary: `Moved ${student.firstName} ${student.lastName} from ${current.classSection.classLevel.name} ${current.classSection.name} to ${section.classLevel.name} ${section.name}`,
    },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  revalidatePath("/attendance");
  return {
    ok: true,
    message: `Moved to ${section.classLevel.name} ${section.name}.`,
  };
}

/**
 * Records or corrects a student's medical details.
 *
 * The clinic could log a visit but never write down the allergy that made it
 * urgent. Allergies and conditions are lists rather than free text because
 * the profile's emergency banner, the clinic list and the ID card all read
 * the severity to decide what to show.
 */
export async function updateStudentMedicalAction(
  _previous: StudentState,
  formData: FormData,
): Promise<StudentState> {
  let user;
  try {
    user = await authorize("student.medical.update");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const studentId = text(formData, "studentId");
  if (!studentId) return { error: "No student given." };

  const refusal = await studentOutOfScope(user, studentId);
  if (refusal) return { error: refusal };

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { firstName: true, lastName: true },
  });
  if (!student) return { error: "Student not found." };

  // The form shows three of the keys each entry can carry. The rest — an
  // allergy's treatment, a condition's diagnosis date, a medication's
  // frequency — are carried over from the stored entry with the same name,
  // because a form that cannot show a field must not be able to delete it.
  const before = await db.studentMedical.findUnique({
    where: { studentId },
    select: { allergies: true, conditions: true, medications: true },
  });
  const priorOf = (value: unknown, key: string) => {
    const rows = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
    return (name: string) =>
      rows.find(
        (row) =>
          typeof row?.[key] === "string" &&
          (row[key] as string).trim().toLowerCase() === name.trim().toLowerCase(),
      ) ?? {};
  };
  const priorAllergy = priorOf(before?.allergies, "name");
  const priorCondition = priorOf(before?.conditions, "condition");
  const priorMedication = priorOf(before?.medications, "name");

  const names = formData.getAll("allergyName").map(String);
  const severities = formData.getAll("allergySeverity").map(String);
  const reactions = formData.getAll("allergyReaction").map(String);
  const allergies: Array<{ name: string; severity: string; reaction?: string }> = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]?.trim();
    if (!name) continue;
    const severity = (severities[index] ?? "MILD").trim() || "MILD";
    if (!["MILD", "MODERATE", "SEVERE", "ANAPHYLAXIS"].includes(severity)) {
      return { error: `"${name}" needs a severity the emergency banner understands.` };
    }
    allergies.push({
      ...priorAllergy(name),
      name,
      severity,
      ...(reactions[index]?.trim() ? { reaction: reactions[index].trim() } : {}),
    });
  }

  const medicationNames = formData.getAll("medicationName").map(String);
  const medicationDosages = formData.getAll("medicationDosage").map(String);
  const medications: Array<{ name: string; dosage?: string; administerAtSchool: boolean }> = [];
  for (let index = 0; index < medicationNames.length; index += 1) {
    const name = medicationNames[index]?.trim();
    if (!name) continue;
    medications.push({
      ...priorMedication(name),
      name,
      ...(medicationDosages[index]?.trim() ? { dosage: medicationDosages[index].trim() } : {}),
      // The nurse needs to know whether a dose is kept and given at school;
      // an inhaler in a locked office is the reason this list exists.
      administerAtSchool: true,
    });
  }

  const conditionNames = formData.getAll("conditionName").map(String);
  const conditionNotes = formData.getAll("conditionNote").map(String);
  const conditions: Array<{ condition: string; notes?: string }> = [];
  for (let index = 0; index < conditionNames.length; index += 1) {
    const condition = conditionNames[index]?.trim();
    if (!condition) continue;
    conditions.push({
      ...priorCondition(condition),
      condition,
      ...(conditionNotes[index]?.trim() ? { notes: conditionNotes[index].trim() } : {}),
    });
  }

  const data = {
    bloodGroup: optional(formData, "bloodGroup"),
    genotype: optional(formData, "genotype"),
    nhisNumber: optional(formData, "medicalNhisNumber"),
    allergies,
    conditions,
    medications,
    emergencyInstructions: optional(formData, "emergencyInstructions"),
    doctorName: optional(formData, "doctorName"),
    doctorPhone: normalisePhone(text(formData, "doctorPhone")),
    dietaryRestrictions: optional(formData, "dietaryRestrictions"),
    consentToTreat: formData.get("consentToTreat") === "on",
  };

  await db.studentMedical.upsert({
    where: { studentId },
    create: { studentId, ...data },
    update: data,
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "student.medical.update",
      entity: "Student",
      entityId: studentId,
      summary: `Updated the medical record for ${student.firstName} ${student.lastName}${
        allergies.length ? `: ${allergies.length} allergy(ies) on file` : ""
      }`,
    },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/clinic");
  return { ok: true, message: "Medical record saved." };
}
