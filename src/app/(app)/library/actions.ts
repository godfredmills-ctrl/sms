"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  MAX_RENEWALS,
  daysOverdue,
  dueDateFor,
  loanRefusal,
  type BorrowerKind,
} from "@/lib/library";
import { toMinor } from "@/lib/money";

export type LibraryState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalInt(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

// -----------------------------------------------------------------------------
// The catalogue
// -----------------------------------------------------------------------------

/**
 * Adds a title, and the copies of it the school actually holds.
 *
 * Accession numbers are entered rather than generated: they are already
 * written inside the covers of books the school bought years ago, and a
 * system that invents its own numbering makes every existing book wrong.
 * They come in as a list — one per line, or comma-separated — because a
 * librarian cataloguing a box of thirty readers should type the numbers once.
 */
export async function saveItemAction(
  _previous: LibraryState,
  formData: FormData,
): Promise<LibraryState> {
  let user;
  try {
    user = await authorize("library.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id") || null;
  const title = text(formData, "title");
  if (!title) return { error: "What is the title?" };

  const published = optionalInt(formData, "published");
  const thisYear = new Date().getFullYear();
  if (published !== null && (published < 1400 || published > thisYear + 1)) {
    return { error: "That publication year is not one a book has. Check it." };
  }

  const data = {
    title,
    author: text(formData, "author") || null,
    // Hyphens and spaces are how an ISBN is printed and not part of it.
    isbn: text(formData, "isbn").replace(/[\s-]/g, "").toUpperCase() || null,
    publisher: text(formData, "publisher") || null,
    published,
    edition: text(formData, "edition") || null,
    category: text(formData, "category") || "FICTION",
    shelfMark: text(formData, "shelfMark") || null,
    language: text(formData, "language") || "English",
    subjectId: text(formData, "subjectId") || null,
    minLevelSequence: optionalInt(formData, "minLevelSequence"),
    summary: text(formData, "summary") || null,
  };

  if (data.subjectId) {
    const subject = await db.subject.findUnique({
      where: { id: data.subjectId },
      select: { id: true },
    });
    if (!subject) return { error: "That subject was not found." };
  }

  const item = id
    ? await db.libraryItem.update({ where: { id }, data, select: { id: true } })
    : await db.libraryItem.create({ data, select: { id: true } });

  // Copies are only ever added here, never removed: withdrawing a copy is a
  // status, so the loan history that points at it survives.
  const accessions = text(formData, "accessionNos")
    .split(/[\n,]/)
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);

  let added = 0;
  const clashes: string[] = [];

  for (const accessionNo of [...new Set(accessions)]) {
    try {
      await db.libraryCopy.create({
        data: {
          itemId: item.id,
          accessionNo,
          condition: text(formData, "condition") || "GOOD",
          costMinor: text(formData, "cost") ? toMinor(text(formData, "cost")) : null,
          acquiredOn: text(formData, "acquiredOn")
            ? new Date(`${text(formData, "acquiredOn")}T00:00:00Z`)
            : null,
        },
      });
      added += 1;
    } catch (error) {
      // The unique index decides, not a look-up beforehand: checking first
      // and creating second leaves a window, and a collision landing in that
      // window threw out of the action — losing the twenty-nine copies
      // already catalogued along with any account of what happened.
      if ((error as { code?: string }).code === "P2002") {
        clashes.push(accessionNo);
        continue;
      }
      throw error;
    }
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: id ? "library.item.update" : "library.item.create",
      entity: "LibraryItem",
      entityId: item.id,
      summary: `${id ? "Edited" : "Catalogued"} "${title.slice(0, 60)}"${
        added ? ` — ${added} copy/copies added` : ""
      }`,
    },
  });

  revalidatePath("/library");

  // Every clash named, not just a count: the librarian has the books in front
  // of them and needs to know which number was already used.
  return {
    ok: true,
    message: clashes.length
      ? `Saved. ${added} copy/copies added. Already in use, so skipped: ${clashes.join(", ")}.`
      : added
        ? `Saved, with ${added} copy/copies.`
        : "Saved.",
  };
}

/** Marks a copy lost, withdrawn, repaired or back on the shelf. */
export async function setCopyStatusAction(formData: FormData): Promise<LibraryState> {
  let user;
  try {
    user = await authorize("library.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const copyId = text(formData, "copyId");
  const status = text(formData, "status");
  if (!copyId || !status) return { error: "Which copy, and to what?" };

  const copy = await db.libraryCopy.findUnique({
    where: { id: copyId },
    select: {
      accessionNo: true,
      loans: { where: { returnedAt: null }, select: { id: true } },
    },
  });
  if (!copy) return { error: "That copy was not found." };

  // ON_LOAN is set by the desk, not by hand — the loan is what makes it true,
  // and a copy marked on loan with nobody holding it can never be issued again.
  if (status === "ON_LOAN") {
    return { error: "Issue the book to someone instead — that sets it on loan." };
  }
  if (copy.loans.length && status === "AVAILABLE") {
    return { error: "Someone still has this copy. Take it back in first." };
  }

  await db.libraryCopy.update({ where: { id: copyId }, data: { status } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "library.copy.status",
      entity: "LibraryCopy",
      entityId: copyId,
      summary: `Copy ${copy.accessionNo} marked ${status.toLowerCase()}`,
    },
  });

  revalidatePath("/library");
  return { ok: true, message: "Updated." };
}

// -----------------------------------------------------------------------------
// The desk
// -----------------------------------------------------------------------------

/**
 * Issues a copy to a pupil or a member of staff.
 *
 * The refusals all come from lib/library.ts rather than being decided here,
 * so the desk, the catalogue and the pupil's own portal agree about what is
 * allowed. What this function adds is the part only a write can do: checking
 * the state at the moment of writing, inside the same request that writes.
 */
export async function issueLoanAction(
  _previous: LibraryState,
  formData: FormData,
): Promise<LibraryState> {
  let user;
  try {
    user = await authorize("library.circulate");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const accessionNo = text(formData, "accessionNo").toUpperCase();
  const studentId = text(formData, "studentId") || null;
  const staffId = text(formData, "staffId") || null;

  if (!accessionNo) return { error: "Which book? Type the accession number." };
  if (!studentId && !staffId) return { error: "Who is borrowing it?" };
  if (studentId && staffId) {
    return { error: "One borrower at a time — a pupil or a member of staff." };
  }

  const copy = await db.libraryCopy.findUnique({
    where: { accessionNo },
    select: {
      id: true,
      status: true,
      item: { select: { title: true, category: true } },
    },
  });
  if (!copy) return { error: `No copy has accession number ${accessionNo}.` };

  const borrower: BorrowerKind = studentId ? "STUDENT" : "STAFF";

  const [openLoans, borrowerExists] = await Promise.all([
    db.libraryLoan.findMany({
      where: { returnedAt: null, ...(studentId ? { studentId } : { staffId }) },
      select: { dueAt: true },
    }),
    studentId
      ? db.student.findUnique({ where: { id: studentId }, select: { id: true } })
      : db.staff.findUnique({ where: { id: staffId as string }, select: { id: true } }),
  ]);

  if (!borrowerExists) return { error: "That borrower was not found." };

  const now = new Date();
  const refusal = loanRefusal({
    borrower,
    openLoans: openLoans.length,
    overdueLoans: openLoans.filter((loan) => loan.dueAt < now).length,
    category: copy.item.category,
    copyStatus: copy.status,
  });
  if (refusal) return { error: refusal };

  try {
    await db.$transaction([
      db.libraryLoan.create({
        data: {
          copyId: copy.id,
          studentId,
          staffId,
          issuedById: user.id,
          dueAt: dueDateFor(borrower, now),
        },
      }),
      db.libraryCopy.update({ where: { id: copy.id }, data: { status: "ON_LOAN" } }),
    ]);
  } catch (error) {
    // The partial unique index on live loans is what actually prevents a
    // double-issue: two people at the desk can pass the status check in the
    // same instant, and only the database can settle it.
    //
    // Only that collision gets the friendly message. A bare catch here told
    // the desk "issued to someone else" for a dropped connection or a
    // constraint nobody had thought about, sending a librarian to look for a
    // book that was on the shelf the whole time, and swallowing the real
    // fault where nobody would see it.
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      return { error: "That copy has just been issued to someone else." };
    }
    throw error;
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "library.loan.issue",
      entity: "LibraryCopy",
      entityId: copy.id,
      summary: `Issued ${accessionNo} — ${copy.item.title.slice(0, 50)}`,
    },
  });

  revalidatePath("/library");
  revalidatePath("/library/loans");
  if (studentId) revalidatePath(`/students/${studentId}`);

  return {
    ok: true,
    message: `"${copy.item.title}" is out, due ${dueDateFor(borrower, now).toLocaleDateString(
      "en-GB",
      { day: "numeric", month: "short" },
    )}.`,
  };
}

/**
 * Takes a book back.
 *
 * Keyed on the accession number rather than a loan id, because that is what
 * the desk has: a book, with a number in it, and no idea which of four
 * hundred loans it belongs to.
 */
export async function returnLoanAction(
  _previous: LibraryState,
  formData: FormData,
): Promise<LibraryState> {
  let user;
  try {
    user = await authorize("library.circulate");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const accessionNo = text(formData, "accessionNo").toUpperCase();
  if (!accessionNo) return { error: "Type the accession number in the book." };

  const copy = await db.libraryCopy.findUnique({
    where: { accessionNo },
    select: {
      id: true,
      status: true,
      item: { select: { title: true } },
      loans: {
        where: { returnedAt: null },
        select: {
          id: true,
          studentId: true,
          student: { select: { firstName: true, lastName: true } },
          staff: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!copy) return { error: `No copy has accession number ${accessionNo}.` };

  const loan = copy.loans[0];
  if (!loan) {
    // A book handed back that the system already has down as returned is a
    // shelf to put it on, not a problem to solve — but only if it was out.
    //
    // This branch used to be guarded by `if (copy.item)`, which is a required
    // relation and therefore always true: it guarded nothing. So mistyping one
    // digit onto a copy recorded LOST, WITHDRAWN or at the binder answered
    // "it is on the shelf now" and made that true in the database, putting a
    // missing book back into circulation for the next child who asked. The
    // status is what the guard should always have been.
    if (copy.status === "ON_LOAN") {
      // Recorded out with nobody holding it — the state this branch exists
      // to clear. Audited, because a status changing with no loan behind it
      // is exactly the kind of thing someone later needs explained.
      await db.libraryCopy.update({
        where: { id: copy.id },
        data: { status: "AVAILABLE" },
      });
      await db.auditLog.create({
        data: {
          userId: user.id,
          actorLabel: user.fullName,
          action: "library.copy.unstick",
          entity: "LibraryCopy",
          entityId: copy.id,
          summary: `${accessionNo} was marked on loan with no loan open; set available`,
        },
      });
      revalidatePath("/library");
      revalidatePath("/library/loans");
      return { ok: true, message: "That copy was not out. It is on the shelf now." };
    }

    if (copy.status === "AVAILABLE") {
      return { ok: true, message: "That copy was already on the shelf." };
    }

    return {
      error: `${accessionNo} is not out — it is recorded as ${copy.status
        .toLowerCase()
        .replace(/_/g, " ")}. Change that from the catalogue if it is wrong.`,
    };
  }

  const condition = text(formData, "returnCondition") || null;
  const fine = text(formData, "fine");

  await db.$transaction([
    // updateMany with returnedAt: null, not update by id: the loan was read a
    // moment ago and outside this write, so a return racing another return
    // would otherwise stamp the second time over the first.
    db.libraryLoan.updateMany({
      where: { id: loan.id, returnedAt: null },
      data: {
        returnedAt: new Date(),
        returnedById: user.id,
        returnCondition: condition,
        fineMinor: fine ? toMinor(fine) : null,
        notes: text(formData, "notes") || null,
      },
    }),
    db.libraryCopy.update({
      where: { id: copy.id },
      data: {
        // A book back in poor condition goes for repair rather than straight
        // out again to the next child.
        status: condition === "POOR" ? "REPAIR" : "AVAILABLE",
        ...(condition ? { condition } : {}),
      },
    }),
  ]);

  const who = loan.student
    ? `${loan.student.firstName} ${loan.student.lastName}`
    : loan.staff
      ? `${loan.staff.firstName} ${loan.staff.lastName}`
      : "someone";

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "library.loan.return",
      entity: "LibraryCopy",
      entityId: copy.id,
      summary: `Returned ${accessionNo} from ${who}`,
    },
  });

  revalidatePath("/library");
  revalidatePath("/library/loans");
  if (loan.studentId) revalidatePath(`/students/${loan.studentId}`);

  return {
    ok: true,
    message:
      condition === "POOR"
        ? `Back from ${who}, and set aside for repair.`
        : `Back from ${who}.`,
  };
}

/** Extends a loan that is not overdue and has renewals left. */
export async function renewLoanAction(formData: FormData): Promise<LibraryState> {
  let user;
  try {
    user = await authorize("library.circulate");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const loanId = text(formData, "loanId");
  if (!loanId) return { error: "Which loan?" };

  const loan = await db.libraryLoan.findUnique({
    where: { id: loanId },
    select: {
      id: true,
      renewals: true,
      returnedAt: true,
      dueAt: true,
      studentId: true,
      copy: { select: { accessionNo: true } },
    },
  });
  if (!loan) return { error: "That loan was not found." };
  if (loan.returnedAt) return { error: "That book is already back." };

  // The desk's only overdue guard used to be `&& !late` on the button, and a
  // page left open all day renders yesterday's state: one click the next
  // morning renewed an overdue loan and, because the new date is measured
  // from today, erased the lateness entirely — the loan left the Overdue
  // view, the pupil's portal stopped warning them, and loanRefusal's overdue
  // count dropped to zero so the desk would lend them another book while the
  // late one was still out.
  if (daysOverdue(loan.dueAt) > 0) {
    return {
      error: "That one is already overdue. It has to come back before it can go out again.",
    };
  }

  if (loan.renewals >= MAX_RENEWALS) {
    return {
      error: `Renewed ${loan.renewals} times already. It needs to come back so someone else can have it.`,
    };
  }

  const borrower: BorrowerKind = loan.studentId ? "STUDENT" : "STAFF";

  await db.libraryLoan.update({
    where: { id: loanId },
    data: { dueAt: dueDateFor(borrower), renewals: loan.renewals + 1 },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "library.loan.renew",
      entity: "LibraryLoan",
      entityId: loanId,
      summary: `Renewed ${loan.copy.accessionNo}`,
    },
  });

  revalidatePath("/library/loans");
  return { ok: true, message: "Renewed." };
}
