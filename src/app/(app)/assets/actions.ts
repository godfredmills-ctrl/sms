"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth";
import { residualFromPercent } from "@/lib/asset-rules";
import { nextAssetTag } from "@/lib/assets";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";

export type AssetFormState = { ok?: boolean; error?: string; message?: string };

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

function integer(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function actor(permission: string) {
  const user = await authorize(permission);
  const label = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return { userId: user.id, label: label || user.email || null };
}

/**
 * Every change writes an event.
 *
 * The register's value is not the list — it is knowing where a thing has been
 * and who had it. A projector that moved from the hall to a classroom and then
 * could not be found is a different problem from one that was never in the
 * hall, and only the history tells them apart.
 */
async function recordEvent(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  input: {
    assetId: string;
    kind:
      | "ACQUIRED"
      | "MOVED"
      | "ASSIGNED"
      | "RETURNED"
      | "VERIFIED"
      | "CONDITION_CHANGED"
      | "STATUS_CHANGED"
      | "SERVICED"
      | "DISPOSED";
    occurredOn?: Date;
    fromLocationId?: string | null;
    toLocationId?: string | null;
    fromStaffId?: string | null;
    toStaffId?: string | null;
    note?: string | null;
    actor: { userId: string; label: string | null };
  },
) {
  await tx.assetEvent.create({
    data: {
      assetId: input.assetId,
      kind: input.kind,
      occurredOn: input.occurredOn ?? new Date(),
      fromLocationId: input.fromLocationId ?? null,
      toLocationId: input.toLocationId ?? null,
      fromStaffId: input.fromStaffId ?? null,
      toStaffId: input.toStaffId ?? null,
      note: input.note ?? null,
      recordedById: input.actor.userId,
      recordedByLabel: input.actor.label,
    },
  });
}

// -----------------------------------------------------------------------------
// Creating and editing
// -----------------------------------------------------------------------------

export async function saveAssetAction(
  _previous: AssetFormState,
  formData: FormData,
): Promise<AssetFormState> {
  let who;
  try {
    who = await actor("asset.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = optional(formData, "id");
  const name = text(formData, "name");
  const categoryId = text(formData, "categoryId");

  if (!name) return { error: "Give the asset a name." };
  if (!categoryId) return { error: "Choose a category." };

  const category = await db.assetCategory.findUnique({
    where: { id: categoryId },
    select: { residualPercent: true },
  });
  if (!category) return { error: "That category no longer exists." };

  const costMinor = toMinor(text(formData, "cost")) || 0;
  if (costMinor < 0) return { error: "A cost cannot be negative." };

  // Where no residual is given, the category's percentage decides it — and the
  // amount is stored rather than the percentage, so a later change to the
  // category cannot silently revalue everything already on the register.
  const residualRaw = text(formData, "residual");
  const residualMinor = residualRaw
    ? toMinor(residualRaw)
    : residualFromPercent(costMinor, category.residualPercent);

  if (residualMinor > costMinor) {
    return { error: "The residual value cannot be more than the cost." };
  }

  const life = integer(formData, "usefulLifeYears");
  if (life !== null && life < 0) return { error: "A useful life cannot be negative." };

  const purchasedOn = date(formData, "purchasedOn");
  const disposedOn = date(formData, "disposedOn");
  if (purchasedOn && disposedOn && disposedOn < purchasedOn) {
    return { error: "An asset cannot be disposed of before it was bought." };
  }

  const data = {
    name,
    description: optional(formData, "description"),
    categoryId,
    serialNumber: optional(formData, "serialNumber"),
    model: optional(formData, "model"),
    manufacturer: optional(formData, "manufacturer"),
    condition: (text(formData, "condition") || "GOOD") as never,
    locationId: optional(formData, "locationId"),
    custodianId: optional(formData, "custodianId"),
    purchasedOn,
    costMinor,
    residualMinor,
    usefulLifeYears: life,
    vendorId: optional(formData, "vendorId"),
    expenseId: optional(formData, "expenseId"),
    warrantyExpiresOn: date(formData, "warrantyExpiresOn"),
    serviceIntervalMonths: integer(formData, "serviceIntervalMonths"),
    lastServicedOn: date(formData, "lastServicedOn"),
    notes: optional(formData, "notes"),
  };

  if (id) {
    const before = await db.asset.findUnique({
      where: { id },
      select: { locationId: true, custodianId: true, condition: true },
    });
    if (!before) return { error: "That asset no longer exists." };

    await db.$transaction(async (tx) => {
      await tx.asset.update({ where: { id }, data });

      // An edit that moves a thing or changes who holds it is a move and a
      // handover, and the history has to say so — otherwise the only record of
      // a laptop changing hands is a field that quietly reads somebody else's
      // name.
      if (before.locationId !== data.locationId) {
        await recordEvent(tx, {
          assetId: id,
          kind: "MOVED",
          fromLocationId: before.locationId,
          toLocationId: data.locationId,
          note: "Changed while editing the asset.",
          actor: who,
        });
      }
      if (before.custodianId !== data.custodianId) {
        await recordEvent(tx, {
          assetId: id,
          kind: data.custodianId ? "ASSIGNED" : "RETURNED",
          fromStaffId: before.custodianId,
          toStaffId: data.custodianId,
          note: "Changed while editing the asset.",
          actor: who,
        });
      }
      if (before.condition !== data.condition) {
        await recordEvent(tx, {
          assetId: id,
          kind: "CONDITION_CHANGED",
          note: `${before.condition} → ${data.condition}`,
          actor: who,
        });
      }
    });

    revalidatePath("/assets");
    revalidatePath(`/assets/${id}`);
    return { ok: true, message: "Saved." };
  }

  const school = await db.school.findFirst({ select: { shortName: true, name: true } });
  const prefix = school?.shortName || school?.name || "SCH";

  let created;
  try {
    created = await db.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: { ...data, tag: await nextAssetTag(categoryId, prefix) },
      });
      await recordEvent(tx, {
        assetId: asset.id,
        kind: "ACQUIRED",
        occurredOn: purchasedOn ?? new Date(),
        toLocationId: data.locationId,
        toStaffId: data.custodianId,
        note: "Entered on the register.",
        actor: who,
      });
      return asset;
    });
  } catch (error) {
    // The tag is unique, and two people adding an asset at the same moment can
    // both compute the same next number. Say what happened rather than showing
    // a constraint name.
    if (String((error as { code?: string }).code) === "P2002") {
      return {
        error:
          "Somebody else added an asset to this category a moment ago and took the next tag. Try again — a fresh tag will be issued.",
      };
    }
    throw error;
  }

  revalidatePath("/assets");
  redirect(`/assets/${created.id}`);
}

// -----------------------------------------------------------------------------
// Moving, assigning, verifying
// -----------------------------------------------------------------------------

export async function moveAssetAction(
  _previous: AssetFormState,
  formData: FormData,
): Promise<AssetFormState> {
  let who;
  try {
    who = await actor("asset.move");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const toLocationId = optional(formData, "toLocationId");
  const toStaffId = optional(formData, "toStaffId");
  const note = optional(formData, "note");

  const asset = await db.asset.findUnique({
    where: { id },
    select: { locationId: true, custodianId: true, status: true },
  });
  if (!asset) return { error: "That asset no longer exists." };

  if (asset.status === "DISPOSED") {
    return { error: "This asset has been disposed of. It cannot be moved or signed out." };
  }

  if (asset.locationId === toLocationId && asset.custodianId === toStaffId) {
    return { error: "Nothing changed — pick a different location or a different holder." };
  }

  await db.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id },
      data: { locationId: toLocationId, custodianId: toStaffId },
    });

    if (asset.locationId !== toLocationId) {
      await recordEvent(tx, {
        assetId: id,
        kind: "MOVED",
        fromLocationId: asset.locationId,
        toLocationId,
        note,
        actor: who,
      });
    }

    if (asset.custodianId !== toStaffId) {
      await recordEvent(tx, {
        assetId: id,
        kind: toStaffId ? "ASSIGNED" : "RETURNED",
        fromStaffId: asset.custodianId,
        toStaffId,
        note,
        actor: who,
      });
    }
  });

  revalidatePath(`/assets/${id}`);
  revalidatePath("/assets");
  return { ok: true, message: "Recorded." };
}

export async function verifyAssetAction(
  _previous: AssetFormState,
  formData: FormData,
): Promise<AssetFormState> {
  let who;
  try {
    who = await actor("asset.verify");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const condition = text(formData, "condition");
  const seen = text(formData, "seen") === "yes";
  const note = optional(formData, "note");

  const asset = await db.asset.findUnique({
    where: { id },
    select: { condition: true, status: true },
  });
  if (!asset) return { error: "That asset no longer exists." };

  await db.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id },
      data: {
        // Only a sighting updates the date. Recording that something could not
        // be found and then stamping it as verified today would make the thing
        // look freshly checked precisely when it has gone missing.
        ...(seen ? { lastVerifiedOn: new Date() } : {}),
        ...(seen && condition ? { condition: condition as never } : {}),
        ...(seen
          ? asset.status === "MISSING"
            ? { status: "IN_USE" as never }
            : {}
          : { status: "MISSING" as never }),
      },
    });

    await recordEvent(tx, {
      assetId: id,
      kind: "VERIFIED",
      note: seen
        ? [`Seen and confirmed${condition ? ` in ${condition.toLowerCase()} condition` : ""}.`, note]
            .filter(Boolean)
            .join(" ")
        : [`Could not be found.`, note].filter(Boolean).join(" "),
      actor: who,
    });

    if (!seen && asset.status !== "MISSING") {
      await recordEvent(tx, {
        assetId: id,
        kind: "STATUS_CHANGED",
        note: `${asset.status} → MISSING after a physical check.`,
        actor: who,
      });
    }
  });

  revalidatePath(`/assets/${id}`);
  revalidatePath("/assets");
  return {
    ok: true,
    message: seen ? "Verified." : "Recorded as missing — it stays on the register at full value.",
  };
}

// -----------------------------------------------------------------------------
// Servicing
// -----------------------------------------------------------------------------

export async function recordMaintenanceAction(
  _previous: AssetFormState,
  formData: FormData,
): Promise<AssetFormState> {
  let who;
  try {
    who = await actor("asset.maintain");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const description = text(formData, "description");
  const performedOn = date(formData, "performedOn") ?? new Date();
  const kind = text(formData, "kind") || "SERVICE";

  if (!description) return { error: "Say what was done." };

  const asset = await db.asset.findUnique({ where: { id }, select: { status: true } });
  if (!asset) return { error: "That asset no longer exists." };

  await db.$transaction(async (tx) => {
    await tx.assetMaintenance.create({
      data: {
        assetId: id,
        kind,
        performedOn,
        nextDueOn: date(formData, "nextDueOn"),
        description,
        costMinor: toMinor(text(formData, "cost")) || 0,
        vendorId: optional(formData, "vendorId"),
        expenseId: optional(formData, "expenseId"),
        recordedById: who.userId,
        recordedByLabel: who.label,
      },
    });

    await tx.asset.update({
      where: { id },
      data: {
        lastServicedOn: performedOn,
        // A repair finished is a thing back in use. Leaving it UNDER_REPAIR
        // after the log says it was fixed is how the availability figures stop
        // meaning anything.
        ...(asset.status === "UNDER_REPAIR" ? { status: "IN_USE" as never } : {}),
      },
    });

    await recordEvent(tx, {
      assetId: id,
      kind: "SERVICED",
      occurredOn: performedOn,
      note: description,
      actor: who,
    });
  });

  revalidatePath(`/assets/${id}`);
  revalidatePath("/assets");
  return { ok: true, message: "Recorded." };
}

// -----------------------------------------------------------------------------
// Status and disposal
// -----------------------------------------------------------------------------

export async function setAssetStatusAction(
  _previous: AssetFormState,
  formData: FormData,
): Promise<AssetFormState> {
  const status = text(formData, "status");
  const id = text(formData, "id");

  // Disposal is a separate permission from moving a thing between rooms,
  // because it is the one that takes something off the school's books.
  const terminal = status === "DISPOSED" || status === "WRITTEN_OFF";

  let who;
  try {
    who = await actor(terminal ? "asset.dispose" : "asset.move");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const asset = await db.asset.findUnique({
    where: { id },
    select: { status: true, purchasedOn: true },
  });
  if (!asset) return { error: "That asset no longer exists." };
  if (asset.status === status) return { error: "It is already in that state." };

  const disposedOn = terminal ? (date(formData, "disposedOn") ?? new Date()) : null;
  if (disposedOn && asset.purchasedOn && disposedOn < asset.purchasedOn) {
    return { error: "An asset cannot be disposed of before it was bought." };
  }

  const proceeds = toMinor(text(formData, "proceeds")) || 0;
  if (proceeds < 0) return { error: "Proceeds cannot be negative." };

  await db.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id },
      data: {
        status: status as never,
        ...(status === "DISPOSED"
          ? {
              disposedOn,
              disposalProceedsMinor: proceeds,
              disposalNote: optional(formData, "note"),
              // A thing the school no longer owns is in nobody's room and in
              // nobody's hands. Leaving a custodian on it means a departing
              // teacher still appears to be holding a bus.
              locationId: null,
              custodianId: null,
            }
          : {}),
      },
    });

    await recordEvent(tx, {
      assetId: id,
      kind: status === "DISPOSED" ? "DISPOSED" : "STATUS_CHANGED",
      occurredOn: disposedOn ?? new Date(),
      note:
        optional(formData, "note") ??
        `${asset.status} → ${status}`,
      actor: who,
    });
  });

  revalidatePath(`/assets/${id}`);
  revalidatePath("/assets");
  return { ok: true, message: "Recorded." };
}

// -----------------------------------------------------------------------------
// Categories and locations
// -----------------------------------------------------------------------------

export async function saveAssetCategoryAction(
  _previous: AssetFormState,
  formData: FormData,
): Promise<AssetFormState> {
  try {
    await authorize("asset.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = optional(formData, "id");
  const name = text(formData, "name");
  if (!name) return { error: "Give the category a name." };

  const life = integer(formData, "usefulLifeYears");
  if (life !== null && life < 0) return { error: "A useful life cannot be negative." };

  const residual = integer(formData, "residualPercent") ?? 0;
  if (residual < 0 || residual > 100) {
    return { error: "The residual percentage must be between 0 and 100." };
  }

  const data = {
    name,
    code: optional(formData, "code")?.toUpperCase() ?? null,
    usefulLifeYears: life,
    residualPercent: residual,
    sortOrder: integer(formData, "sortOrder") ?? 0,
    active: formData.get("active") !== null,
    notes: optional(formData, "notes"),
  };

  try {
    if (id) await db.assetCategory.update({ where: { id }, data });
    else await db.assetCategory.create({ data });
  } catch (error) {
    if (String((error as { code?: string }).code) === "P2002") {
      return { error: `There is already a category called "${name}".` };
    }
    throw error;
  }

  revalidatePath("/assets/categories");
  revalidatePath("/assets");
  return { ok: true, message: "Saved." };
}

export async function saveAssetLocationAction(
  _previous: AssetFormState,
  formData: FormData,
): Promise<AssetFormState> {
  try {
    await authorize("asset.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = optional(formData, "id");
  const name = text(formData, "name");
  if (!name) return { error: "Give the location a name." };

  const data = {
    name,
    building: optional(formData, "building"),
    room: optional(formData, "room"),
    campusId: optional(formData, "campusId"),
    sortOrder: integer(formData, "sortOrder") ?? 0,
    active: formData.get("active") !== null,
    notes: optional(formData, "notes"),
  };

  try {
    if (id) await db.assetLocation.update({ where: { id }, data });
    else await db.assetLocation.create({ data });
  } catch (error) {
    if (String((error as { code?: string }).code) === "P2002") {
      return {
        error: `There is already a location called "${name}"${data.building ? ` in ${data.building}` : ""}. Two places with the same name is what a stock-take cannot resolve.`,
      };
    }
    throw error;
  }

  revalidatePath("/assets/locations");
  revalidatePath("/assets");
  return { ok: true, message: "Saved." };
}
