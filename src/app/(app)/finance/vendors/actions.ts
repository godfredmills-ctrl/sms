"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { CATEGORY_KINDS } from "@/lib/expense-labels";

export type VendorState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Saves a vendor — somebody the school pays. */
export async function saveVendorAction(
  _previous: VendorState,
  formData: FormData,
): Promise<VendorState> {
  let user;
  try {
    user = await authorize("finance.vendor.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id") || null;
  const name = text(formData, "name");
  if (!name) return { error: "Give the vendor a name." };

  const clash = await db.vendor.findFirst({
    where: { name, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (clash) return { error: `There is already a vendor called ${name}.` };

  const data = {
    name,
    supplies: text(formData, "supplies") || null,
    contactName: text(formData, "contactName") || null,
    phone: text(formData, "phone") || null,
    email: text(formData, "email") || null,
    address: text(formData, "address") || null,
    tin: text(formData, "tin") || null,
    bankName: text(formData, "bankName") || null,
    bankAccount: text(formData, "bankAccount") || null,
    momoNumber: text(formData, "momoNumber") || null,
    active: formData.get("active") !== null,
    notes: text(formData, "notes") || null,
  };

  const saved = id
    ? await db.vendor.update({ where: { id }, data, select: { id: true } })
    : await db.vendor.create({ data, select: { id: true } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: id ? "vendor.update" : "vendor.create",
      entity: "Vendor",
      entityId: saved.id,
      summary: `${id ? "Edited" : "Added"} vendor: ${name}`,
    },
  });

  revalidatePath("/finance/vendors");
  return { ok: true, message: id ? "Saved." : "Vendor added." };
}

/**
 * Saves an expense category — a line on the income and expenditure statement.
 *
 * There is no delete. A category with bills against it is what those bills
 * are called, and removing it would leave last year's statement unable to
 * name its own largest line. It is deactivated instead, which keeps it out of
 * the picker and leaves the history intact.
 */
export async function saveCategoryAction(
  _previous: VendorState,
  formData: FormData,
): Promise<VendorState> {
  let user;
  try {
    user = await authorize("finance.vendor.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id") || null;
  const name = text(formData, "name");
  if (!name) return { error: "Give the category a name." };

  const kind = CATEGORY_KINDS.some((entry) => entry.value === text(formData, "kind"))
    ? text(formData, "kind")
    : "OPERATING";

  const clash = await db.expenseCategory.findFirst({
    where: { name, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (clash) return { error: `There is already a category called ${name}.` };

  const order = Number.parseInt(text(formData, "sortOrder"), 10);

  const data = {
    name,
    kind,
    code: text(formData, "code") || null,
    sortOrder: Number.isFinite(order) ? order : 0,
    active: formData.get("active") !== null,
    notes: text(formData, "notes") || null,
  };

  const saved = id
    ? await db.expenseCategory.update({ where: { id }, data, select: { id: true } })
    : await db.expenseCategory.create({ data, select: { id: true } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: id ? "expense.category.update" : "expense.category.create",
      entity: "ExpenseCategory",
      entityId: saved.id,
      summary: `${id ? "Edited" : "Added"} expense category: ${name}`,
    },
  });

  revalidatePath("/finance/vendors");
  revalidatePath("/finance/expenses");
  return { ok: true, message: id ? "Saved." : "Category added." };
}
