"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  MAX_RENEWALS,
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
    const existing = await db.libraryCopy.findUnique({
      where: { accessionNo },
      select: { id: true },
    });
    if (existing) {
      clashes.push(accessionNo);
      continue;
    }
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
  } catch {
    // The partial unique index on live loans is what actually prevents a
    // double-issue: two people at the desk can pass the status check in the
    // same instant, and only the database can settle it. Reported as the
    // ordinary situation it is rather than as a failure.
    return { error: "That copy has just been issued to someone else." };
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
    // Not an error: a book handed back that the system already has down as
    // returned is a shelf to put it on, not a problem to solve.
    if (copy.item) {
      await db.libraryCopy.update({
        where: { id: copy.id },
        data: { status: "AVAILABLE" },
      });
    }
    revalidatePath("/library");
    return { ok: true, message: "That copy was not out. It is on the shelf now." };
  }

  const condition = text(formData, "returnCondition") || null;
  const fine = text(formData, "fine");

  await db.$transaction([
    db.libraryLoan.update({
      where: { id: loan.id },
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
