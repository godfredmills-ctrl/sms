"use server";

import { headers } from "next/headers";

import { db } from "@/lib/db";
import { notifyUsers } from "@/lib/messaging";
import { normalisePhone } from "@/lib/utils";

export type EnquiryState = { ok?: boolean; error?: string };

/**
 * The footer's newsletter signup.
 *
 * Same defences as the enquiry form, scaled to the stakes: a honeypot and a
 * uniqueness check. Addresses land in SiteFormSubmission under their own
 * formKey, so a school can export them without them mixing into admissions.
 */
export async function subscribeNewsletterAction(
  _previous: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) return { error: "That address is not valid." };

  const honeypot = String(formData.get("website") ?? "");
  const site = await db.site.findFirst({ select: { id: true } });
  if (!site) return { ok: true };

  // Same address ceiling as the enquiry form: an unauthenticated write with
  // no limit is an invitation to fill the table.
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",")[0]?.trim() || null;

  if (ipAddress) {
    const recent = await db.siteFormSubmission.count({
      where: {
        ipAddress,
        formKey: "newsletter",
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recent >= 10) return { ok: true };
  }

  // One row per address. equals on a JSON path keeps this a query rather than
  // a table scan through parsed JSON in application code.
  const existing = await db.siteFormSubmission.findFirst({
    where: {
      siteId: site.id,
      formKey: "newsletter",
      data: { path: ["email"], equals: email },
    },
    select: { id: true },
  });
  if (existing) return { ok: true };

  await db.siteFormSubmission.create({
    data: {
      siteId: site.id,
      formKey: "newsletter",
      isSpam: honeypot.length > 0,
      ipAddress,
      data: { email },
    },
  });

  return { ok: true };
}

/**
 * Receives an admission enquiry from the public website.
 *
 * Deliberately does NOT create a Student. An enquiry is a lead, not an
 * admission: half of them never visit, names arrive misspelt, and the
 * admission form is where a registrar checks documents and assigns a class.
 * Creating student records from an unauthenticated form hands the roll book
 * to the internet. The enquiry lands in Website → Enquiries, and admission
 * stays a deliberate act by someone with student.create.
 *
 * Spam is marked rather than dropped. A false positive here is a real family
 * silently ignored — the worst outcome an admissions form can produce — so
 * suspect submissions are kept, flagged, and reviewable.
 */
export async function submitEnquiryAction(
  _previous: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  const childName = String(formData.get("childName") ?? "").trim();
  const parentName = String(formData.get("parentName") ?? "").trim();
  const phone = normalisePhone(String(formData.get("phone") ?? ""));
  const level = String(formData.get("level") ?? "").trim();

  if (!childName || !parentName || !level) {
    return { error: "The child's name, your name and a level are all needed." };
  }
  if (!phone) {
    return { error: "A phone number the school can call is needed." };
  }

  // The honeypot and the stopwatch. Bots fill every field and submit
  // instantly; people leave hidden fields alone and take longer than five
  // seconds to describe their child.
  const honeypot = String(formData.get("website") ?? "");
  const loadedAt = Number.parseInt(String(formData.get("loadedAt") ?? "0"), 10);
  const tooFast = Number.isFinite(loadedAt) && loadedAt > 0 && Date.now() - loadedAt < 5_000;
  const isSpam = honeypot.length > 0 || tooFast;

  const site = await db.site.findFirst({ select: { id: true } });
  if (!site) return { error: "The school is not accepting enquiries right now." };

  // Rate limit by address: nobody enquires about forty children in an hour.
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",")[0]?.trim() || null;

  if (ipAddress) {
    const recent = await db.siteFormSubmission.count({
      where: {
        ipAddress,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recent >= 5) {
      // Accepted, flagged, not announced. Telling a flooder they were
      // rate-limited is a debugging aid for them.
      await db.siteFormSubmission.create({
        data: {
          siteId: site.id,
          formKey: "admissions-enquiry",
          isSpam: true,
          ipAddress,
          data: { childName, parentName, phone, level, note: "rate-limited" },
        },
      });
      return { ok: true };
    }
  }

  await db.siteFormSubmission.create({
    data: {
      siteId: site.id,
      formKey: "admissions-enquiry",
      isSpam,
      ipAddress,
      data: {
        childName,
        childDateOfBirth: String(formData.get("childDateOfBirth") ?? "") || null,
        childGender: String(formData.get("childGender") ?? "") || null,
        level,
        intake: String(formData.get("intake") ?? "") || null,
        previousSchool:
          String(formData.get("previousSchool") ?? "").trim().slice(0, 200) || null,
        parentName,
        relationship: String(formData.get("relationship") ?? "") || null,
        phone,
        email: String(formData.get("email") ?? "").trim() || null,
        city: String(formData.get("city") ?? "").trim().slice(0, 120) || null,
        heardFrom: String(formData.get("heardFrom") ?? "") || null,
        message: String(formData.get("message") ?? "").trim().slice(0, 2000) || null,
      },
    },
  });

  // Tell the people who can act on it. Straight to the users holding
  // student.create rather than a hardcoded role, so schools that renamed
  // their roles still hear about applicants.
  if (!isSpam) {
    const admissionsUsers = await db.user.findMany({
      where: {
        status: "ACTIVE",
        roles: {
          some: {
            role: { permissions: { some: { permission: { key: "student.create" } } } },
          },
        },
      },
      select: { id: true },
      take: 10,
    });

    if (admissionsUsers.length) {
      await notifyUsers(
        admissionsUsers.map((entry) => entry.id),
        {
          title: "New admission enquiry",
          body: `${parentName} is enquiring about ${level} for ${childName}.`,
          category: "GENERAL",
          url: "/website/enquiries",
        },
      ).catch(() => undefined);
    }
  }

  return { ok: true };
}
