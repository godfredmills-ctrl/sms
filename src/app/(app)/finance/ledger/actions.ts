"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { nextJournalReference } from "@/lib/ledger";
import { checkEntry, codeMatchesType, reverseLines, type Line } from "@/lib/ledger-rules";
import { toMinor } from "@/lib/money";

export type LedgerState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

function dateOf(formData: FormData, key: string): Date | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function actor(permission: string) {
  const user = await authorize(permission);
  const label = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return { userId: user.id, label: label || user.email || null };
}

/**
 * Reads the lines off the form.
 *
 * The form posts parallel arrays: accountId[], debit[], credit[]. Rows the
 * person left blank come through as empty strings and are simply nothing,
 * which is what an eight row form with two lines filled in should mean.
 */
function linesFrom(formData: FormData): Array<Line & { memo: string | null }> {
  const accounts = formData.getAll("accountId").map((value) => String(value).trim());
  const debits = formData.getAll("debit").map((value) => String(value).trim());
  const credits = formData.getAll("credit").map((value) => String(value).trim());
  const memos = formData.getAll("memo").map((value) => String(value).trim());

  return accounts.map((accountId, index) => ({
    accountId,
    debitMinor: debits[index] ? toMinor(debits[index]) : 0,
    creditMinor: credits[index] ? toMinor(credits[index]) : 0,
    memo: memos[index] || null,
  }));
}

// -----------------------------------------------------------------------------
// Entries
// -----------------------------------------------------------------------------

/**
 * Writes a journal entry, and posts it if asked.
 *
 * Posting is a separate decision from writing, so a bursar can leave something
 * half finished without it reaching the accounts. Nothing unbalanced is ever
 * posted; an unbalanced draft is allowed, because a draft is somebody's working
 * and refusing to save it would mean retyping the whole thing.
 */
export async function saveJournalEntryAction(
  _previous: LedgerState,
  formData: FormData,
): Promise<LedgerState> {
  let who;
  try {
    who = await actor("finance.ledger.record");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = optional(formData, "id");
  const narration = text(formData, "narration");
  const entryDate = dateOf(formData, "entryDate") ?? new Date();
  const post = formData.get("post") !== null;

  if (!narration) return { error: "Say what this entry is for." };

  const lines = linesFrom(formData).filter(
    (line) => line.accountId || line.debitMinor || line.creditMinor,
  );

  const verdict = checkEntry(lines);

  if (post && !verdict.balanced) {
    // Posting is the moment it becomes real, so this is where the rules are
    // not negotiable. Every reason is returned at once rather than one at a
    // time, so a bursar fixes the entry in a single pass.
    return { error: verdict.problems.join(" ") };
  }

  if (post) {
    try {
      await actor("finance.ledger.post");
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  if (id) {
    const existing = await db.journalEntry.findUnique({
      where: { id },
      select: { status: true, reference: true },
    });
    if (!existing) return { error: "That entry no longer exists." };

    // The rule the whole module rests on. A posted entry is the record of
    // what the accounts were told; editing it would change history and leave
    // every statement printed since then unexplained.
    if (existing.status !== "DRAFT") {
      return {
        error: `${existing.reference} has been posted. Reverse it and write a new entry rather than editing it.`,
      };
    }

    await db.$transaction(async (tx) => {
      await tx.journalLine.deleteMany({ where: { entryId: id } });
      await tx.journalEntry.update({
        where: { id },
        data: {
          narration,
          entryDate,
          termId: optional(formData, "termId"),
          academicYearId: optional(formData, "academicYearId"),
          status: post ? "POSTED" : "DRAFT",
          postedAt: post ? new Date() : null,
          postedById: post ? who.userId : null,
          postedByLabel: post ? who.label : null,
          lines: {
            create: lines.map((line, index) => ({
              accountId: line.accountId,
              debitMinor: line.debitMinor,
              creditMinor: line.creditMinor,
              memo: line.memo,
              sortOrder: index,
            })),
          },
        },
      });
    });

    revalidatePath("/finance/ledger");
    revalidatePath(`/finance/ledger/${id}`);
    return { ok: true, message: post ? "Posted." : "Saved as a draft." };
  }

  const created = await db.journalEntry.create({
    data: {
      reference: await nextJournalReference(entryDate),
      narration,
      entryDate,
      source: "manual",
      termId: optional(formData, "termId"),
      academicYearId: optional(formData, "academicYearId"),
      status: post ? "POSTED" : "DRAFT",
      postedAt: post ? new Date() : null,
      postedById: post ? who.userId : null,
      postedByLabel: post ? who.label : null,
      createdById: who.userId,
      createdByLabel: who.label,
      lines: {
        create: lines.map((line, index) => ({
          accountId: line.accountId,
          debitMinor: line.debitMinor,
          creditMinor: line.creditMinor,
          memo: line.memo,
          sortOrder: index,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath("/finance/ledger");
  redirect(`/finance/ledger/${created.id}`);
}

export async function postJournalEntryAction(
  _previous: LedgerState,
  formData: FormData,
): Promise<LedgerState> {
  let who;
  try {
    who = await actor("finance.ledger.post");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const entry = await db.journalEntry.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!entry) return { error: "That entry no longer exists." };
  if (entry.status !== "DRAFT") return { error: `${entry.reference} is not a draft.` };

  const verdict = checkEntry(entry.lines);
  if (!verdict.balanced) return { error: verdict.problems.join(" ") };

  await db.journalEntry.update({
    where: { id },
    data: {
      status: "POSTED",
      postedAt: new Date(),
      postedById: who.userId,
      postedByLabel: who.label,
    },
  });

  revalidatePath("/finance/ledger");
  revalidatePath(`/finance/ledger/${id}`);
  return { ok: true, message: `${entry.reference} posted.` };
}

/**
 * Reverses a posted entry.
 *
 * A mirror of it, posted on its own date, so the mistake and the correction
 * are both on the record. This is the only way a posted entry ever changes,
 * and it is why the reversal itself is posted immediately: a draft correction
 * leaves the accounts wrong for as long as nobody notices.
 */
export async function reverseJournalEntryAction(
  _previous: LedgerState,
  formData: FormData,
): Promise<LedgerState> {
  let who;
  try {
    who = await actor("finance.ledger.post");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const on = dateOf(formData, "reversedOn") ?? new Date();
  const reason = optional(formData, "reason");

  const entry = await db.journalEntry.findUnique({
    where: { id },
    include: { lines: true, reversedBy: { select: { reference: true } } },
  });
  if (!entry) return { error: "That entry no longer exists." };
  if (entry.status !== "POSTED") {
    return { error: "Only a posted entry can be reversed." };
  }
  if (entry.reversedBy) {
    // Reversing twice would take the accounts past where they started and
    // leave nothing to say which correction was the real one. The database
    // refuses it too; this is the message rather than the constraint.
    return {
      error: `${entry.reference} was already reversed by ${entry.reversedBy.reference}.`,
    };
  }

  const mirrored = reverseLines(entry.lines);

  const created = await db.$transaction(async (tx) => {
    const reversal = await tx.journalEntry.create({
      data: {
        reference: await nextJournalReference(on),
        narration: reason
          ? `Reversal of ${entry.reference}: ${reason}`
          : `Reversal of ${entry.reference}`,
        entryDate: on,
        source: "reversal",
        sourceId: entry.id,
        reversesId: entry.id,
        termId: entry.termId,
        academicYearId: entry.academicYearId,
        status: "POSTED",
        postedAt: new Date(),
        postedById: who.userId,
        postedByLabel: who.label,
        createdById: who.userId,
        createdByLabel: who.label,
        lines: {
          create: mirrored.map((line, index) => ({
            accountId: line.accountId,
            debitMinor: line.debitMinor,
            creditMinor: line.creditMinor,
            memo: entry.lines[index]?.memo ?? null,
            sortOrder: index,
          })),
        },
      },
      select: { id: true, reference: true },
    });

    // The original stays POSTED rather than becoming VOID: it happened, and
    // the statements printed while it stood were correct at the time. VOID is
    // for an entry that should never have reached the accounts at all.
    return reversal;
  });

  revalidatePath("/finance/ledger");
  revalidatePath(`/finance/ledger/${id}`);
  return { ok: true, message: `Reversed by ${created.reference}.` };
}

export async function deleteJournalDraftAction(
  _previous: LedgerState,
  formData: FormData,
): Promise<LedgerState> {
  try {
    await authorize("finance.ledger.record");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const entry = await db.journalEntry.findUnique({
    where: { id },
    select: { status: true, reference: true },
  });
  if (!entry) return { error: "That entry no longer exists." };
  if (entry.status !== "DRAFT") {
    return { error: "A posted entry is reversed, never deleted." };
  }

  await db.journalEntry.delete({ where: { id } });
  revalidatePath("/finance/ledger");
  redirect("/finance/ledger");
}

// -----------------------------------------------------------------------------
// The chart of accounts
// -----------------------------------------------------------------------------

export async function saveLedgerAccountAction(
  _previous: LedgerState,
  formData: FormData,
): Promise<LedgerState> {
  try {
    await authorize("finance.ledger.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = optional(formData, "id");
  const code = text(formData, "code");
  const name = text(formData, "name");
  const type = text(formData, "type");

  if (!code) return { error: "Give the account a code." };
  if (!name) return { error: "Give the account a name." };
  if (!type) return { error: "Choose what kind of account it is." };

  const data = {
    code,
    name,
    type: type as never,
    parentId: optional(formData, "parentId"),
    description: optional(formData, "description"),
    sortOrder: Number.parseInt(text(formData, "sortOrder"), 10) || 0,
    isActive: formData.get("isActive") !== null,
  };

  // A school that already numbers its accounts some other way keeps its
  // numbering, so this is said rather than refused.
  const note = codeMatchesType(code, type as never)
    ? ""
    : ` Note: ${code} is outside the usual range for ${type.toLowerCase()} accounts, which is fine if that is your school's numbering.`;

  try {
    if (id) {
      const existing = await db.ledgerAccount.findUnique({
        where: { id },
        select: { isSystem: true, type: true },
      });
      if (!existing) return { error: "That account no longer exists." };

      // Changing the type of an account with history would silently move
      // every figure ever posted to it from one side of the statements to the
      // other, and the trial balance would still balance while being wrong.
      if (existing.type !== data.type) {
        const posted = await db.journalLine.count({ where: { accountId: id } });
        if (posted > 0) {
          return {
            error: `${name} already has ${posted} posting${posted === 1 ? "" : "s"} against it. Changing its type would move every one of them to the other side of the statements. Make a new account instead.`,
          };
        }
      }

      await db.ledgerAccount.update({ where: { id }, data });
    } else {
      await db.ledgerAccount.create({ data });
    }
  } catch (error) {
    if (String((error as { code?: string }).code) === "P2002") {
      return { error: `There is already an account with the code ${code}.` };
    }
    throw error;
  }

  revalidatePath("/finance/ledger/accounts");
  revalidatePath("/finance/ledger");
  return { ok: true, message: `Saved.${note}` };
}
