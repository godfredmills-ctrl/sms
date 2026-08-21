"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize, type AuthUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { markdownToText, writtenBody } from "@/lib/markdown";

import { DOCUMENT_KINDS } from "./kinds";

export type WritingState = {
  ok?: boolean;
  error?: string;
  message?: string;
  id?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * The status change itself, so saving-and-finalising is one act.
 *
 * Not exported: a "use server" module may only export server actions, and
 * this is called by two of them.
 */
async function applyStatus(
  user: AuthUser,
  id: string,
  status: "DRAFT" | "FINAL",
  title: string,
) {
  await db.writtenDocument.update({
    where: { id },
    data: { status, finalisedAt: status === "FINAL" ? new Date() : null },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: status === "FINAL" ? "letter.finalise" : "letter.reopen",
      entity: "WrittenDocument",
      entityId: id,
      summary: `${status === "FINAL" ? "Finalised" : "Reopened"}: ${title.slice(0, 60)}`,
    },
  });
}

/**
 * Saves a document, new or existing.
 *
 * The body arrives as Markdown from the editor and is stored as typed. It is
 * not converted to HTML on the way in and never will be: HTML is a thing that
 * has to be sanitised every time it is shown, and this text is shown on a web
 * page, in a PDF, and one day in an email. Markdown is text, and the one
 * parser in lib/markdown.ts is what gives it meaning — the same parser for
 * the preview and for the paper.
 *
 * "Mark final" arrives here as an intent on the same submission rather than as
 * a second button doing its own thing. Finalising on its own froze whatever
 * was last stored: somebody who edited the text and pressed Mark final —
 * which is the obvious order, the text being finished — issued the version
 * before their edits, and then could not correct it without reopening,
 * because a final document is read-only. The screen showed the new wording
 * and the file held the old one.
 */
export async function saveDocumentAction(
  _previous: WritingState,
  formData: FormData,
): Promise<WritingState> {
  let user;
  try {
    user = await authorize("letter.write");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id") || null;
  const title = text(formData, "title");
  const body = String(formData.get("body") ?? "");

  if (!title) return { error: "Give the document a title." };
  if (!body.trim()) return { error: "There is nothing written yet." };

  const kind = (DOCUMENT_KINDS as readonly { value: string }[]).some(
    (entry) => entry.value === text(formData, "kind"),
  )
    ? text(formData, "kind")
    : "LETTER";

  const reference = text(formData, "reference") || null;
  if (reference) {
    const clash = await db.writtenDocument.findFirst({
      where: { reference, ...(id ? { id: { not: id } } : {}) },
      select: { id: true, title: true },
    });
    if (clash) {
      return { error: `Reference ${reference} is already on "${clash.title}".` };
    }
  }

  const existing = id
    ? await db.writtenDocument.findUnique({
        where: { id },
        select: { status: true },
      })
    : null;

  if (id && !existing) return { error: "That document was not found." };

  // A finalised document is the version somebody signed and sent. Editing it
  // in place would change what the file says about what was agreed, with no
  // record that it ever said anything else — so it is reopened deliberately,
  // which is its own act and its own audit line.
  if (existing?.status === "FINAL") {
    return {
      error: "This document is final. Reopen it as a draft before editing.",
    };
  }

  const data = {
    kind,
    reference,
    title,
    // body and its searchable copy, written together — see writtenBody.
    ...writtenBody(body),
    recipient: text(formData, "recipient")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    salutation: text(formData, "salutation") || null,
    closing: text(formData, "closing") || null,
    signatoryName: text(formData, "signatoryName") || null,
    signatoryTitle: text(formData, "signatoryTitle") || null,
    footnote: text(formData, "footnote") || null,
    aboutStaffId: text(formData, "aboutStaffId") || null,
    aboutStudentId: text(formData, "aboutStudentId") || null,
  };

  // Everything finalising needs is checked before anything is written, so a
  // refusal leaves the writer where they were rather than with a saved draft
  // and an error about a different thing.
  const finalising = text(formData, "intent") === "final";
  if (finalising) {
    try {
      await authorize("letter.finalise");
    } catch (error) {
      return { error: (error as Error).message };
    }
    // A letter that goes out unsigned is a letter somebody has to chase.
    if (!data.signatoryName) {
      return { error: "Add who signs it before marking it final." };
    }
  }

  const saved = id
    ? await db.writtenDocument.update({ where: { id }, data, select: { id: true } })
    : await db.writtenDocument.create({
        data: { ...data, authorId: user.id },
        select: { id: true },
      });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: id ? "letter.update" : "letter.create",
      entity: "WrittenDocument",
      entityId: saved.id,
      summary: `${id ? "Edited" : "Wrote"} ${kind.toLowerCase()}: ${title.slice(0, 60)}`,
    },
  });

  if (finalising) await applyStatus(user, saved.id, "FINAL", title);

  revalidatePath("/letters");
  revalidatePath(`/letters/${saved.id}`);

  // A new document moves to its own page. The compose form has no id in it,
  // so it went on creating: pressing Save twice — or once after an error was
  // corrected — left two copies of the same letter in the register, both
  // claiming to be the original.
  if (!id) redirect(`/letters/${saved.id}`);

  return {
    ok: true,
    id: saved.id,
    message: finalising ? "Saved and marked final." : "Saved.",
  };
}

/**
 * Marks a document final, or reopens it.
 *
 * Final is what stops the watermark printing and what the register sorts on.
 * Reopening is allowed — a school corrects a letter — but it is a separate
 * decision with its own audit line, rather than something that happens
 * quietly because somebody typed in the box.
 */
export async function setDocumentStatusAction(
  formData: FormData,
): Promise<WritingState> {
  let user;
  try {
    user = await authorize("letter.finalise");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const status = text(formData, "status");
  if (!id) return { error: "Which document?" };
  if (!["DRAFT", "FINAL"].includes(status)) return { error: "Draft or final." };

  const document = await db.writtenDocument.findUnique({
    where: { id },
    select: { title: true, status: true, body: true, signatoryName: true },
  });
  if (!document) return { error: "That document was not found." };
  if (document.status === status) return { ok: true };

  // A letter that goes out unsigned is a letter somebody has to chase.
  if (status === "FINAL" && !document.signatoryName) {
    return { error: "Add who signs it before marking it final." };
  }

  await applyStatus(user, id, status as "DRAFT" | "FINAL", document.title);

  revalidatePath("/letters");
  revalidatePath(`/letters/${id}`);
  return { ok: true, message: status === "FINAL" ? "Marked final." : "Reopened as a draft." };
}

/** Removes a draft. A final document stays — it was sent. */
export async function deleteDocumentAction(formData: FormData): Promise<WritingState> {
  let user;
  try {
    user = await authorize("letter.write");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "Which document?" };

  const document = await db.writtenDocument.findUnique({
    where: { id },
    select: { title: true, status: true, body: true },
  });
  if (!document) return { error: "That document was not found." };
  if (document.status === "FINAL") {
    return {
      error: "A final document is a record of what was sent. Reopen it first if it must go.",
    };
  }

  await db.writtenDocument.delete({ where: { id } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "letter.delete",
      entity: "WrittenDocument",
      entityId: id,
      // The first line of what was deleted, so the log says what was lost.
      summary: `Deleted draft: ${document.title.slice(0, 60)} — ${markdownToText(
        document.body,
      ).slice(0, 80)}`,
    },
  });

  revalidatePath("/letters");
  return { ok: true, message: "Deleted." };
}
