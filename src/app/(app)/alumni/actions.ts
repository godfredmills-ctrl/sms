"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import {
  ENGAGEMENT_VALUES,
  carriesMoney,
  graduationYearFor,
  leaversToRegister,
} from "@/lib/alumni-rules";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { normalisePhone } from "@/lib/utils";

export type AlumniState = {
  ok?: boolean;
  error?: string;
  message?: string;
  alumnusId?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

function dateOnly(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

// ---------------------------------------------------------------------------

export async function saveAlumnusAction(
  _previous: AlumniState,
  formData: FormData,
): Promise<AlumniState> {
  let user;
  try {
    user = await authorize("alumni.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  if (!firstName || !lastName) return { error: "A first and last name are needed." };

  const graduationYear = Number(text(formData, "graduationYear"));
  if (!Number.isInteger(graduationYear) || graduationYear < 1900 || graduationYear > 2200) {
    return { error: "That leaving year is not a year." };
  }

  // Consent and its date move together. The database refuses the pair that
  // disagrees, so this is where the refusal gets a sentence somebody can read.
  const consentToContact = formData.get("consentToContact") === "on";
  const consentSource = optional(formData, "consentSource");
  if (consentToContact && !consentSource) {
    return {
      error:
        "Say how they agreed. Consent that cannot be evidenced is the same as no consent, and a date on its own does not say what they were told.",
    };
  }

  const existingConsent = id
    ? await db.alumnus.findUnique({ where: { id }, select: { consentToContact: true, consentAt: true } })
    : null;

  const data = {
    title: optional(formData, "title"),
    firstName,
    lastName,
    otherNames: optional(formData, "otherNames"),
    nameAtSchool: optional(formData, "nameAtSchool"),
    gender: (text(formData, "gender") || "UNDISCLOSED") as never,
    graduationYear,
    finalClass: optional(formData, "finalClass"),
    completed: formData.get("completed") !== "off",

    email: optional(formData, "email"),
    phone: normalisePhone(text(formData, "phone")),
    whatsapp: normalisePhone(text(formData, "whatsapp")),
    address: optional(formData, "address"),
    city: optional(formData, "city"),
    country: text(formData, "country") || "Ghana",

    university: optional(formData, "university"),
    course: optional(formData, "course"),
    occupation: optional(formData, "occupation"),
    employer: optional(formData, "employer"),
    jobTitle: optional(formData, "jobTitle"),
    linkedinUrl: optional(formData, "linkedinUrl"),
    achievements: optional(formData, "achievements"),

    consentToContact,
    consentSource: consentToContact ? consentSource : null,
    // Kept from the original grant rather than restamped on every edit: the
    // date consent was given is a fact about a conversation, and moving it
    // forward each time somebody corrects a phone number destroys the evidence
    // it exists to be.
    consentAt: consentToContact
      ? (existingConsent?.consentToContact ? existingConsent.consentAt : new Date())
      : null,

    deceasedOn: dateOnly(text(formData, "deceasedOn")),
    notes: optional(formData, "notes"),
  };

  const alumnus = id
    ? await db.alumnus.update({ where: { id }, data, select: { id: true } })
    : await db.alumnus.create({ data, select: { id: true } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: id ? "alumni.update" : "alumni.create",
      entity: "Alumnus",
      entityId: alumnus.id,
      summary: `${firstName} ${lastName}, class of ${graduationYear}`,
    },
  });

  revalidatePath("/alumni");
  revalidatePath(`/alumni/${alumnus.id}`);
  return { ok: true, alumnusId: alumnus.id, message: id ? "Saved." : "Added to the register." };
}

/**
 * Records that somebody has checked the contact details still work.
 *
 * The whole point of the register is knowing which of nine hundred rows can
 * actually be reached, and that is a fact with a date on it. Confirming is a
 * separate act from editing, because "I rang and it is the same number" is
 * information and editing nothing would record none of it.
 */
export async function verifyContactAction(
  _previous: AlumniState,
  formData: FormData,
): Promise<AlumniState> {
  let user;
  try {
    user = await authorize("alumni.contact");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "No record given." };

  const alumnus = await db.alumnus.findUnique({
    where: { id },
    select: { firstName: true, lastName: true, email: true, phone: true, whatsapp: true },
  });
  if (!alumnus) return { error: "Record not found." };

  if (!alumnus.email && !alumnus.phone && !alumnus.whatsapp) {
    return {
      error:
        "There is nothing on file to confirm. Add an email, phone or WhatsApp number first.",
    };
  }

  await db.alumnus.update({
    where: { id },
    data: { verifiedAt: new Date(), verifiedBy: user.fullName },
  });

  revalidatePath("/alumni");
  revalidatePath(`/alumni/${id}`);
  return { ok: true, message: "Confirmed as current." };
}

export async function recordEngagementAction(
  _previous: AlumniState,
  formData: FormData,
): Promise<AlumniState> {
  let user;
  try {
    user = await authorize("alumni.engagement.record");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const alumnusId = text(formData, "alumnusId");
  const kind = text(formData, "kind");
  const summary = text(formData, "summary");

  if (!alumnusId) return { error: "No record given." };
  if (!ENGAGEMENT_VALUES.includes(kind)) return { error: "Choose what it was." };
  if (!summary) return { error: "Say what happened, in a line." };

  const happenedOn = dateOnly(text(formData, "happenedOn")) ?? new Date();
  if (happenedOn.getTime() > Date.now() + 86_400_000) {
    return { error: "That date is in the future." };
  }

  // Only a donation carries money, and the database enforces it. Silently
  // zeroing an amount typed against a mentoring record would be worse than
  // refusing it: the person typing meant something by it.
  let amountMinor = 0;
  const rawAmount = text(formData, "amount");
  if (rawAmount) {
    if (!carriesMoney(kind)) {
      return {
        error:
          "An amount belongs on a donation. Record the money as a donation and the visit as a separate entry, or the two get added together in the totals.",
      };
    }
    const value = Number(rawAmount);
    if (!Number.isFinite(value) || value < 0) return { error: "That is not an amount." };
    amountMinor = Math.round(value * 100);
  }

  const alumnus = await db.alumnus.findUnique({
    where: { id: alumnusId },
    select: { firstName: true, lastName: true },
  });
  if (!alumnus) return { error: "Record not found." };

  await db.alumniEngagementRecord.create({
    data: {
      alumnusId,
      kind: kind as never,
      happenedOn,
      summary,
      detail: optional(formData, "detail"),
      amountMinor,
      recordedBy: user.fullName,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "alumni.engagement",
      entity: "Alumnus",
      entityId: alumnusId,
      summary: `${alumnus.firstName} ${alumnus.lastName}: ${summary}${amountMinor ? `, ${formatMoney(amountMinor)}` : ""}`,
    },
  });

  revalidatePath("/alumni");
  revalidatePath(`/alumni/${alumnusId}`);
  return { ok: true, message: "Recorded." };
}

/**
 * Brings this year's leavers onto the register.
 *
 * Graduates and pupils already marked alumni, and nobody else: a child who
 * left in Primary 4 because the family moved to Kumasi is not an old boy of
 * this school. The consent box is not ticked by any of these, on purpose. A
 * pupil leaving school has not agreed to a lifetime of newsletters by leaving,
 * and a bring-forward that quietly ticked it would create nine hundred
 * consents nobody ever gave.
 */
export async function bringLeaversForwardAction(
  _previous: AlumniState,
  formData: FormData,
): Promise<AlumniState> {
  let user;
  try {
    user = await authorize("alumni.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const yearRaw = text(formData, "graduationYear");
  const year = yearRaw ? Number(yearRaw) : graduationYearFor(new Date());
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    return { error: "That leaving year is not a year." };
  }

  const leavers = await db.student.findMany({
    where: { status: { in: ["GRADUATED", "ALUMNI"] } },
    select: {
      id: true,
      status: true,
      firstName: true,
      lastName: true,
      otherNames: true,
      gender: true,
      photoUrl: true,
      email: true,
      phone: true,
      residentialAddress: true,
      city: true,
      alumnus: { select: { id: true } },
      // The last class they were in, which is the one that goes on the
      // register. Ordered by when it started rather than by status: a leaver
      // has no active enrolment, so filtering on ACTIVE would find nothing and
      // put every graduate on the register with no class against their name.
      enrollments: {
        orderBy: { enrolledOn: "desc" },
        take: 1,
        select: {
          classSection: {
            select: { name: true, classLevel: { select: { name: true } } },
          },
        },
      },
    },
  });

  const pending = leaversToRegister(
    leavers.map((leaver) => ({
      ...leaver,
      hasAlumnusRecord: Boolean(leaver.alumnus),
    })),
  );

  if (!pending.length) {
    return { error: "Every graduate is already on the register." };
  }

  await db.alumnus.createMany({
    data: pending.map((leaver) => ({
      studentId: leaver.id,
      firstName: leaver.firstName,
      lastName: leaver.lastName,
      otherNames: leaver.otherNames,
      gender: leaver.gender,
      photoUrl: leaver.photoUrl,
      graduationYear: year,
      finalClass: leaver.enrollments[0]
        ? `${leaver.enrollments[0].classSection.classLevel.name} ${leaver.enrollments[0].classSection.name}`
        : null,
      // The school's own contact details for them, carried across as a
      // starting point and immediately stale: a school email is switched off
      // at graduation. Nothing is marked verified, so the register counts
      // every one of these as unconfirmed until somebody rings.
      email: leaver.email,
      phone: leaver.phone,
      address: leaver.residentialAddress,
      city: leaver.city,
      consentToContact: false,
    })),
    skipDuplicates: true,
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "alumni.bring-forward",
      entity: "Alumnus",
      entityId: String(year),
      summary: `${pending.length} leavers added to the class of ${year}`,
    },
  });

  revalidatePath("/alumni");
  return {
    ok: true,
    message: `${pending.length} added to the class of ${year}. None of them has agreed to be contacted yet, and none of their details has been confirmed: the school email on each was switched off the day they left.`,
  };
}
