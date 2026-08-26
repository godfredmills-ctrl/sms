"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalisePhone } from "@/lib/utils";

import { normaliseCategory } from "./categories";

export type VisitorState = {
  ok?: boolean;
  error?: string;
  passNo?: string;
  /** The row just written, so the pass can be printed by id. */
  visitorId?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * The next pass number for today: V-0819-04, reset each morning.
 *
 * Dated rather than a running total, because the number is written on a
 * reusable pouch and handed back at the end of the day. A four-digit day
 * stamp keeps yesterday's pass visibly yesterday's if it turns up in a
 * pocket, and the sequence within the day is short enough to read aloud
 * over a radio.
 *
 * Two people signing in at the same instant could in principle both read
 * the same count. The number is a label, not a key — the unique id is the
 * row's — so a collision costs a duplicated sticker, not a lost record.
 */
async function nextPassNo(now: Date): Promise<string> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const todayCount = await db.visitor.count({ where: { signedInAt: { gte: startOfDay } } });

  const stamp = `${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `V-${stamp}-${String(todayCount + 1).padStart(2, "0")}`;
}

/**
 * Signs a visitor in and issues them a pass.
 *
 * Only the name and the reason are required. A front desk with a queue in
 * front of it will skip the phone number, and a form that refuses the entry
 * because of it produces an empty log book, which is the failure that
 * matters: the register has to be able to say who is in the building.
 *
 * The identification number is stored as sighted — schools note the last
 * digits of a Ghana Card, not a photocopy — so nothing here is a document
 * the school then has to protect.
 */
export async function signInVisitorAction(
  _previous: VisitorState,
  formData: FormData,
): Promise<VisitorState> {
  let user;
  try {
    user = await authorize("visitor.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const fullName = text(formData, "fullName");
  const purpose = text(formData, "purpose");
  if (!fullName) return { error: "Who is signing in?" };
  if (!purpose) return { error: "What have they come for?" };

  const category = normaliseCategory(text(formData, "category"));

  const hostStaffId = text(formData, "hostStaffId") || null;
  const aboutStudentId = text(formData, "aboutStudentId") || null;

  // A host or a child that does not exist is a typed id, not a typo — refuse
  // it rather than storing a dangling reference the log will render blank.
  if (hostStaffId) {
    const host = await db.staff.findUnique({ where: { id: hostStaffId }, select: { id: true } });
    if (!host) return { error: "That member of staff was not found." };
  }
  if (aboutStudentId) {
    const child = await db.student.findUnique({
      where: { id: aboutStudentId },
      select: { id: true },
    });
    if (!child) return { error: "That student was not found." };
  }

  const now = new Date();
  const passNo = await nextPassNo(now);

  const visitor = await db.visitor.create({
    data: {
      fullName,
      phone: normalisePhone(text(formData, "phone")),
      organisation: text(formData, "organisation") || null,
      category,
      purpose,
      hostStaffId,
      aboutStudentId,
      idType: text(formData, "idType") || null,
      idNumber: text(formData, "idNumber") || null,
      vehicleReg: text(formData, "vehicleReg").toUpperCase() || null,
      badgeNo: passNo,
      signedInAt: now,
      signedInById: user.id,
      notes: text(formData, "notes") || null,
    },
    select: { id: true, badgeNo: true },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "visitor.sign_in",
      entity: "Visitor",
      entityId: visitor.id,
      summary: `Signed in ${fullName} (${visitor.badgeNo}), ${purpose.slice(0, 60)}`,
    },
  });

  revalidatePath("/visitors");
  return { ok: true, passNo: visitor.badgeNo, visitorId: visitor.id };
}

/**
 * Signs a visitor out.
 *
 * Idempotent on purpose: two people at the desk both clicking Sign out is a
 * normal Tuesday, and the second click must not overwrite the first with a
 * later time. The already-signed-out case reports success rather than an
 * error, because from the desk's point of view it is one.
 */
export async function signOutVisitorAction(formData: FormData): Promise<VisitorState> {
  let user;
  try {
    user = await authorize("visitor.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "Which visitor?" };

  const visitor = await db.visitor.findUnique({
    where: { id },
    select: { id: true, fullName: true, badgeNo: true, signedOutAt: true },
  });
  if (!visitor) return { error: "Visitor not found." };
  if (visitor.signedOutAt) {
    revalidatePath("/visitors");
    return { ok: true };
  }

  await db.visitor.update({
    where: { id },
    data: { signedOutAt: new Date(), signedOutById: user.id },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "visitor.sign_out",
      entity: "Visitor",
      entityId: id,
      summary: `Signed out ${visitor.fullName} (${visitor.badgeNo})`,
    },
  });

  revalidatePath("/visitors");
  return { ok: true };
}

/**
 * Closes off everyone still shown as on site.
 *
 * The end-of-day tidy. Visitors leave through a side gate and forget the
 * desk; without this the register carries yesterday's names into today and
 * stops meaning anything in a drill. Each row is stamped with the time it
 * was closed and a note saying it was closed rather than observed, so the
 * two are never confused after the fact.
 */
export async function closeOpenVisitsAction(): Promise<VisitorState> {
  let user;
  try {
    user = await authorize("visitor.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const now = new Date();
  const open = await db.visitor.findMany({
    where: { signedOutAt: null },
    select: { id: true, notes: true },
  });

  for (const row of open) {
    await db.visitor.update({
      where: { id: row.id },
      data: {
        signedOutAt: now,
        signedOutById: user.id,
        notes: [row.notes, "Closed at the desk: departure not observed."]
          .filter(Boolean)
          .join(" · "),
      },
    });
  }

  if (open.length) {
    await db.auditLog.create({
      data: {
        userId: user.id,
        actorLabel: user.fullName,
        action: "visitor.close_open",
        entity: "Visitor",
        summary: `Closed ${open.length} open visitor record${open.length === 1 ? "" : "s"}`,
      },
    });
  }

  revalidatePath("/visitors");
  return { ok: true };
}
