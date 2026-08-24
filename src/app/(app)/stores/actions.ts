"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";
import {
  currentStock,
  nextItemCode,
  nextVoucherNumber,
} from "@/lib/stock";
import {
  formatQuantity,
  isInward,
  MOVEMENT_KINDS,
  toMilli,
  type MovementKind,
} from "@/lib/stock-rules";

export type StoreFormState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

function date(formData: FormData, key: string): Date | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A typed quantity, in thousandths. Null when blank or not a number. */
function quantityMilli(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const parsed = Number(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return toMilli(parsed);
}

async function actor(permission: string) {
  const user = await authorize(permission);
  const label = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return { userId: user.id, label: label || user.email || null };
}

// -----------------------------------------------------------------------------
// Items
// -----------------------------------------------------------------------------

export async function saveStockItemAction(
  _previous: StoreFormState,
  formData: FormData,
): Promise<StoreFormState> {
  try {
    await authorize("stock.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = optional(formData, "id");
  const name = text(formData, "name");
  const categoryId = text(formData, "categoryId");

  if (!name) return { error: "Give the item a name." };
  if (!categoryId) return { error: "Choose a category." };

  const reorderLevel = quantityMilli(formData, "reorderLevel");
  const reorderQuantity = quantityMilli(formData, "reorderQuantity");

  if (reorderLevel !== null && reorderQuantity !== null && reorderQuantity < reorderLevel) {
    return {
      error:
        "Ordering back up to less than the reorder level would leave the item low the moment it arrived.",
    };
  }

  const data = {
    name,
    description: optional(formData, "description"),
    categoryId,
    unit: text(formData, "unit") || "each",
    reorderLevel: reorderLevel === null ? null : reorderLevel / 1000,
    reorderQuantity: reorderQuantity === null ? null : reorderQuantity / 1000,
    locationId: optional(formData, "locationId"),
    perishable: formData.get("perishable") !== null,
    expiresOn: date(formData, "expiresOn"),
    active: formData.get("active") !== null,
    notes: optional(formData, "notes"),
  };

  if (id) {
    await db.stockItem.update({ where: { id }, data });
    revalidatePath("/stores");
    revalidatePath(`/stores/${id}`);
    return { ok: true, message: "Saved." };
  }

  const school = await db.school.findFirst({ select: { shortName: true, name: true } });

  let created;
  try {
    created = await db.stockItem.create({
      data: { ...data, code: await nextItemCode(categoryId, school?.shortName || school?.name || "SCH") },
      select: { id: true },
    });
  } catch (error) {
    if (String((error as { code?: string }).code) === "P2002") {
      return {
        error:
          "Somebody else added an item to this category a moment ago and took the next code. Try again — a fresh code will be issued.",
      };
    }
    throw error;
  }

  revalidatePath("/stores");
  redirect(`/stores/${created.id}`);
}

// -----------------------------------------------------------------------------
// Movements
// -----------------------------------------------------------------------------

/**
 * Records one movement.
 *
 * The whole module's honesty rests here. A movement is never edited and never
 * deleted — a correction is another movement — because the balance is the sum
 * of the history, and a history that can be rewritten is not a record of
 * anything.
 */
export async function recordMovementAction(
  _previous: StoreFormState,
  formData: FormData,
): Promise<StoreFormState> {
  const kind = text(formData, "kind") as MovementKind;
  const known = MOVEMENT_KINDS.find((entry) => entry.value === kind);
  if (!known) return { error: "That is not a kind of movement this store records." };

  // Taking goods out and putting them in are different jobs. A storekeeper
  // issues; correcting the book after a count is the person who counted.
  const permission =
    kind === "ADJUSTMENT_UP" || kind === "ADJUSTMENT_DOWN"
      ? "stock.adjust"
      : isInward(kind)
        ? "stock.receive"
        : "stock.issue";

  let who;
  try {
    who = await actor(permission);
  } catch (error) {
    return { error: (error as Error).message };
  }

  const itemId = text(formData, "itemId");
  const item = await db.stockItem.findUnique({
    where: { id: itemId },
    select: { unit: true, name: true, active: true },
  });
  if (!item) return { error: "That item no longer exists." };
  if (!item.active && isInward(kind)) {
    return { error: `${item.name} has been retired. Put it back in use before receiving more.` };
  }

  const milli = quantityMilli(formData, "quantity");
  if (milli === null || milli <= 0) {
    return { error: "Enter how much, as a number greater than zero." };
  }

  const occurredOn = date(formData, "occurredOn") ?? new Date();

  // Nothing can leave a shelf that has not got it. The rules module would cap
  // the balance at zero rather than go negative, but silently issuing eight
  // sacks when six are there records a fiction; refusing says what is true.
  if (!isInward(kind)) {
    const state = await currentStock(itemId);
    if (milli > state.quantityMilli) {
      return {
        error: `There ${state.quantityMilli === 1000 ? "is" : "are"} only ${formatQuantity(state.quantityMilli)} ${item.unit} of ${item.name} on the shelf. Record a count adjustment first if the book is wrong.`,
      };
    }
  }

  const unitCost = isInward(kind) ? toMinor(text(formData, "unitCost")) || null : null;

  // One voucher number covers everything issued in a single trip to the store,
  // so the slip somebody signs matches the goods they carried away.
  const reference =
    kind === "ISSUE"
      ? optional(formData, "reference") ?? (await nextVoucherNumber(occurredOn))
      : optional(formData, "reference");

  await db.stockMovement.create({
    data: {
      itemId,
      kind,
      quantity: milli / 1000,
      unitCostMinor: unitCost,
      occurredOn,
      reference,
      issuedToId: kind === "ISSUE" ? optional(formData, "issuedToId") : null,
      issuedToDept: kind === "ISSUE" ? optional(formData, "issuedToDept") : null,
      vendorId: isInward(kind) ? optional(formData, "vendorId") : null,
      expenseId: isInward(kind) ? optional(formData, "expenseId") : null,
      note: optional(formData, "note"),
      recordedById: who.userId,
      recordedByLabel: who.label,
    },
  });

  // A delivery of something perishable brings a new date with it.
  const expiresOn = date(formData, "expiresOn");
  if (expiresOn && isInward(kind)) {
    await db.stockItem.update({ where: { id: itemId }, data: { expiresOn } });
  }

  revalidatePath("/stores");
  revalidatePath(`/stores/${itemId}`);

  return {
    ok: true,
    message: reference
      ? `Recorded against ${reference}.`
      : `${known.label} recorded.`,
  };
}

/**
 * Records a physical count as an adjustment.
 *
 * The count is what somebody saw; the adjustment is the difference. Storing
 * the difference rather than the count is what keeps the balance the sum of
 * the history — and a count that agrees writes nothing at all, because a
 * movement of zero is not a movement.
 */
export async function recordCountAction(
  _previous: StoreFormState,
  formData: FormData,
): Promise<StoreFormState> {
  let who;
  try {
    who = await actor("stock.adjust");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const itemId = text(formData, "itemId");
  const item = await db.stockItem.findUnique({
    where: { id: itemId },
    select: { unit: true, name: true },
  });
  if (!item) return { error: "That item no longer exists." };

  const counted = quantityMilli(formData, "counted");
  if (counted === null || counted < 0) {
    return { error: "Enter what was actually counted." };
  }

  const state = await currentStock(itemId);
  const difference = counted - state.quantityMilli;

  if (difference === 0) {
    return {
      ok: true,
      message: `The count agrees with the book — ${formatQuantity(counted)} ${item.unit}. Nothing to record.`,
    };
  }

  await db.stockMovement.create({
    data: {
      itemId,
      kind: difference > 0 ? "ADJUSTMENT_UP" : "ADJUSTMENT_DOWN",
      quantity: Math.abs(difference) / 1000,
      occurredOn: date(formData, "occurredOn") ?? new Date(),
      note: [
        `Counted ${formatQuantity(counted)} ${item.unit} against ${formatQuantity(state.quantityMilli)} on the book.`,
        optional(formData, "note"),
      ]
        .filter(Boolean)
        .join(" "),
      recordedById: who.userId,
      recordedByLabel: who.label,
    },
  });

  revalidatePath("/stores");
  revalidatePath(`/stores/${itemId}`);

  return {
    ok: true,
    message:
      difference > 0
        ? `${formatQuantity(difference)} ${item.unit} more than the book said. Recorded.`
        : `${formatQuantity(-difference)} ${item.unit} short. Recorded.`,
  };
}

// -----------------------------------------------------------------------------
// Categories
// -----------------------------------------------------------------------------

export async function saveStockCategoryAction(
  _previous: StoreFormState,
  formData: FormData,
): Promise<StoreFormState> {
  try {
    await authorize("stock.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = optional(formData, "id");
  const name = text(formData, "name");
  if (!name) return { error: "Give the category a name." };

  const data = {
    name,
    code: optional(formData, "code")?.toUpperCase() ?? null,
    sortOrder: Number.parseInt(text(formData, "sortOrder"), 10) || 0,
    active: formData.get("active") !== null,
    notes: optional(formData, "notes"),
  };

  try {
    if (id) await db.stockCategory.update({ where: { id }, data });
    else await db.stockCategory.create({ data });
  } catch (error) {
    if (String((error as { code?: string }).code) === "P2002") {
      return { error: `There is already a category called "${name}".` };
    }
    throw error;
  }

  revalidatePath("/stores/categories");
  revalidatePath("/stores");
  return { ok: true, message: "Saved." };
}
