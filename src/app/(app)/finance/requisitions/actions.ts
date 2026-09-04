"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize, userCan } from "@/lib/auth";
import { currentTerm } from "@/lib/current-term";
import { db } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/finance";
import {
  committed,
  editable,
  lineProblem,
  outstandingTotal,
  refusal,
  verdictFor,
  type Line,
  type Role,
  type Status,
} from "@/lib/requisition-rules";

export type RequisitionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  id?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Cedis as typed, in minor units. Blank is nothing, not a failure. */
function minor(formData: FormData, key: string): number {
  const raw = text(formData, key).replace(/,/g, "");
  if (!raw) return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value * 100) : Number.NaN;
}

function reference(attempt = 0) {
  return nextDocumentNumber("REQ", () => db.requisition.count(), attempt);
}

/**
 * The lines as typed into the form.
 *
 * The form posts parallel arrays, which is the shape a table of rows arrives
 * in. Rows the person cleared out are dropped rather than rejected: an empty
 * row at the bottom of a table is how somebody indicates they have finished.
 */
type FormLine = Line & { unit: string | null; stockItemId: string | null };

function linesFrom(formData: FormData): FormLine[] {
  const descriptions = formData.getAll("lineDescription").map(String);
  const quantities = formData.getAll("lineQuantity").map(String);
  const prices = formData.getAll("linePrice").map(String);
  const units = formData.getAll("lineUnit").map(String);
  const items = formData.getAll("lineStockItem").map(String);

  const lines: FormLine[] = [];

  for (let index = 0; index < descriptions.length; index += 1) {
    const description = (descriptions[index] ?? "").trim();
    const quantityRaw = (quantities[index] ?? "").trim();
    const priceRaw = (prices[index] ?? "").replace(/,/g, "").trim();

    if (!description && !quantityRaw && !priceRaw) continue;

    lines.push({
      description,
      quantity: Number(quantityRaw || 0),
      estimatedUnitMinor: priceRaw ? Math.round(Number(priceRaw) * 100) : 0,
      unit: (units[index] ?? "").trim() || null,
      stockItemId: (items[index] ?? "").trim() || null,
    });
  }

  return lines;
}

/**
 * What the category's budget line stands at, this year.
 *
 * The three figures, in one query each, and the middle one is the whole reason
 * the module exists. Committed counts only what is approved and not yet met:
 * a draft is a thought, and a request already met has become a bill, which
 * spent counts. Counting both would charge the budget twice for one order.
 */
async function positionFor(categoryId: string, academicYearId: string | null) {
  const [budget, expenses, approved] = await Promise.all([
    academicYearId
      ? db.budgetLine.findUnique({
          where: { academicYearId_categoryId: { academicYearId, categoryId } },
          select: { amountMinor: true },
        })
      : Promise.resolve(null),
    db.expense.findMany({
      where: {
        categoryId,
        status: { in: ["APPROVED", "PAID"] },
        ...(academicYearId ? { academicYearId } : {}),
      },
      select: { amountMinor: true },
    }),
    db.requisition.findMany({
      where: {
        categoryId,
        status: "APPROVED",
        ...(academicYearId ? { academicYearId } : {}),
      },
      select: {
        lines: { select: { quantity: true, estimatedUnitMinor: true, fulfilledQty: true } },
      },
    }),
  ]);

  return {
    budgetMinor: budget?.amountMinor ?? null,
    spentMinor: expenses.reduce((sum, expense) => sum + expense.amountMinor, 0),
    committedMinor: approved.reduce(
      (sum, requisition) => sum + outstandingTotal(requisition.lines),
      0,
    ),
  };
}

/** What this person may do to requisitions, in the rules module's words. */
function rolesFor(
  user: Parameters<typeof userCan>[0] & { staffId: string | null },
  requestedById: string,
): Role[] {
  const roles: Role[] = [];
  if (user.staffId && user.staffId === requestedById) roles.push("requester");
  if (userCan(user, "finance.requisition.approve")) roles.push("approver");
  if (userCan(user, "finance.requisition.fulfil")) roles.push("storekeeper");
  return roles;
}

/**
 * Raise one, or save the draft again.
 *
 * Created as a draft whatever button was pressed. Sending it for approval is a
 * separate step and a separate action, because a form that submits on save is
 * a form people are frightened of.
 */
export async function saveRequisitionAction(
  _previous: RequisitionState,
  formData: FormData,
): Promise<RequisitionState> {
  const user = await authorize("finance.requisition.request");
  if (!user.staffId) {
    return { error: "Only staff with a linked staff record can raise a requisition." };
  }

  const id = text(formData, "id") || null;
  const title = text(formData, "title");
  const categoryId = text(formData, "categoryId");

  if (!title) return { error: "Say what it is for." };
  if (!categoryId) return { error: "Choose which budget it comes from." };

  const lines = linesFrom(formData);
  for (const line of lines) {
    const problem = lineProblem(line);
    if (problem) return { error: problem };
  }

  const neededByRaw = text(formData, "neededBy");
  // Local midnight from the parts, for the same reason the cover board does
  // it: a date-only string through the Date constructor is UTC midnight, and
  // west of Greenwich that is the day before.
  const neededBy = neededByRaw ? new Date(`${neededByRaw}T00:00:00`) : null;
  if (neededBy && Number.isNaN(neededBy.getTime())) {
    return { error: "That date is not valid." };
  }

  const term = await currentTerm();

  if (id) {
    const existing = await db.requisition.findUnique({
      where: { id },
      select: { status: true, requestedById: true },
    });
    if (!existing) return { error: "That requisition was not found." };
    if (existing.requestedById !== user.staffId) {
      return { error: "That requisition is somebody else's." };
    }
    if (!editable(existing.status)) {
      return {
        error:
          "It has been sent for approval and cannot be edited. Withdraw it first, or wait for it to come back.",
      };
    }

    await db.requisition.update({
      where: { id },
      data: {
        title,
        categoryId,
        justification: text(formData, "justification") || null,
        department: text(formData, "department") || null,
        neededBy,
        lines: {
          // Replaced wholesale, which is what a table of rows edited in place
          // actually means. Matching rows up by index would silently move a
          // received quantity onto a different item the moment somebody
          // deleted a row, and a draft has no received quantities anyway.
          deleteMany: {},
          create: lines.map((line, index) => ({
            description: line.description,
            quantity: line.quantity,
            estimatedUnitMinor: line.estimatedUnitMinor,
            unit: line.unit,
            stockItemId: line.stockItemId,
            sortKey: index,
          })),
        },
      },
    });

    revalidatePath("/finance/requisitions");
    revalidatePath(`/finance/requisitions/${id}`);
    return { ok: true, id, message: "Saved." };
  }

  let created: { id: string } | null = null;
  for (let attempt = 0; attempt < 4 && !created; attempt += 1) {
    try {
      created = await db.requisition.create({
        data: {
          reference: await reference(attempt),
          title,
          categoryId,
          justification: text(formData, "justification") || null,
          department: text(formData, "department") || null,
          neededBy,
          requestedById: user.staffId,
          academicYearId: term.academicYearId,
          termId: term.termId,
          lines: {
            create: lines.map((line, index) => ({
              description: line.description,
              quantity: line.quantity,
              estimatedUnitMinor: line.estimatedUnitMinor,
              unit: line.unit,
              stockItemId: line.stockItemId,
              sortKey: index,
            })),
          },
        },
        select: { id: true },
      });
    } catch (error) {
      // Two people raising one at the same moment take the same number. Only
      // that: a dropped connection must not be retried as a duplicate.
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
  }

  if (!created) return { error: "Could not allocate a reference. Try again." };

  revalidatePath("/finance/requisitions");
  redirect(`/finance/requisitions/${created.id}`);
}

/**
 * Send it, approve it, turn it down, withdraw it, mark it met.
 *
 * One action, because they are one sequence over one table of what may follow
 * what. Every refusal comes from the rules module, which the screen also reads
 * to decide which buttons to draw.
 */
export async function moveRequisitionAction(
  _previous: RequisitionState,
  formData: FormData,
): Promise<RequisitionState> {
  const user = await authorize([
    "finance.requisition.request",
    "finance.requisition.approve",
    "finance.requisition.fulfil",
  ]);

  const id = text(formData, "id");
  const to = text(formData, "to") as Status;
  const note = text(formData, "note");
  if (!id || !to) return { error: "Which requisition, and to what?" };

  const requisition = await db.requisition.findUnique({
    where: { id },
    select: {
      status: true,
      requestedById: true,
      categoryId: true,
      academicYearId: true,
      lines: { select: { quantity: true, estimatedUnitMinor: true, fulfilledQty: true, description: true } },
    },
  });
  if (!requisition) return { error: "That requisition was not found." };

  const roles = rolesFor(user, requisition.requestedById);
  const position = await positionFor(requisition.categoryId, requisition.academicYearId);

  // What approving it would do to the line. The screen shows this figure
  // before the button is pressed, from the same function, so the warning and
  // the refusal cannot come to differ.
  const verdict = verdictFor(position, outstandingTotal(requisition.lines));

  const refused = refusal({
    from: requisition.status,
    to,
    roles,
    own: user.staffId === requisition.requestedById,
    note,
    lines: requisition.lines,
    verdict,
  });
  if (refused) return { error: refused };

  const now = new Date();
  const data: Record<string, unknown> = { status: to };

  if (to === "SUBMITTED") data.submittedAt = now;

  if (to === "APPROVED" || to === "REJECTED") {
    data.decidedById = user.staffId ?? null;
    data.decidedAt = now;
    data.decisionNote = note || null;
    // What the line stood at when somebody signed it. Budgets are revised, and
    // the question in April is what the person approving could see at the time.
    data.budgetAtDecisionMinor = position.budgetMinor;
    data.committedAtDecisionMinor = position.committedMinor;
  }

  if (to === "DRAFT") {
    // Reopened after a refusal. The remarks stay: they are what the person is
    // editing in response to, and clearing them loses the reason.
    data.submittedAt = null;
  }

  if (to === "FULFILLED") data.fulfilledAt = now;

  await db.requisition.update({ where: { id }, data });

  revalidatePath("/finance/requisitions");
  revalidatePath(`/finance/requisitions/${id}`);
  revalidatePath("/finance/budget");

  const said =
    to === "APPROVED"
      ? verdict.overBudget
        ? "Approved, over budget, with your reason on the record."
        : "Approved. It is committed against the budget until it is met."
      : to === "SUBMITTED"
        ? "Sent. Whoever approves will see it."
        : to === "REJECTED"
          ? "Turned down. The person who asked can edit it and send it again."
          : to === "FULFILLED"
            ? "Marked as met. It is no longer committed against the budget."
            : "Done.";

  return { ok: true, id, message: said };
}

/**
 * Record what actually arrived, line by line.
 *
 * Per line rather than a tick on the request, because half a delivery is the
 * normal case and it has to release half the commitment. A budget that only
 * moves when an order is complete is a budget that is wrong for the fortnight
 * between the first box and the last.
 */
export async function receiveRequisitionAction(
  _previous: RequisitionState,
  formData: FormData,
): Promise<RequisitionState> {
  await authorize("finance.requisition.fulfil");

  const id = text(formData, "id");
  if (!id) return { error: "Which requisition?" };

  const requisition = await db.requisition.findUnique({
    where: { id },
    select: {
      status: true,
      lines: { select: { id: true, quantity: true, description: true }, orderBy: { sortKey: "asc" } },
    },
  });
  if (!requisition) return { error: "That requisition was not found." };

  if (!committed(requisition.status)) {
    return {
      error: "Only an approved requisition can be received against. This one is not approved.",
    };
  }

  const ids = formData.getAll("lineId").map(String);
  const received = formData.getAll("lineReceived").map(String);

  const updates: Array<{ id: string; fulfilledQty: number }> = [];

  for (let index = 0; index < ids.length; index += 1) {
    const line = requisition.lines.find((row) => row.id === ids[index]);
    if (!line) continue;

    const raw = (received[index] ?? "").trim();
    const value = raw === "" ? 0 : Number(raw);

    if (!Number.isInteger(value) || value < 0) {
      return { error: `${line.description}: whole units, none or more.` };
    }
    if (value > line.quantity) {
      return {
        error: `${line.description}: more received than were asked for. Raise the quantity first, or record the rest as a separate requisition.`,
      };
    }

    updates.push({ id: line.id, fulfilledQty: value });
  }

  await db.$transaction(
    updates.map((update) =>
      db.requisitionLine.update({
        where: { id: update.id },
        data: { fulfilledQty: update.fulfilledQty },
      }),
    ),
  );

  revalidatePath(`/finance/requisitions/${id}`);
  revalidatePath("/finance/requisitions");
  revalidatePath("/finance/budget");

  const outstanding = updates.some((update) => {
    const line = requisition.lines.find((row) => row.id === update.id);
    return line ? update.fulfilledQty < line.quantity : false;
  });

  return {
    ok: true,
    id,
    message: outstanding
      ? "Recorded. What is still outstanding stays committed against the budget."
      : "Recorded. Everything asked for has arrived: mark it met to release the commitment.",
  };
}
