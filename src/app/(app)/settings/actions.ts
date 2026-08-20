"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { setSettings } from "@/lib/settings";
import { slugify } from "@/lib/utils";

export type FormState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

async function record(
  userId: string,
  action: string,
  entity: string,
  entityId: string | null,
  summary: string,
) {
  await db.auditLog.create({
    data: { userId, action, entity, entityId, summary },
  });
}

// -----------------------------------------------------------------------------
// School profile
// -----------------------------------------------------------------------------

export async function updateSchoolAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let user;
  try {
    user = await authorize("settings.school.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "Missing school." };

  const name = text(formData, "name");
  if (!name) return { error: "The school needs a name." };

  await db.school.update({
    where: { id },
    data: {
      name,
      shortName: optional(formData, "shortName"),
      motto: optional(formData, "motto"),
      email: optional(formData, "email"),
      phone: optional(formData, "phone"),
      altPhone: optional(formData, "altPhone"),
      website: optional(formData, "website"),
      addressLine1: optional(formData, "addressLine1"),
      addressLine2: optional(formData, "addressLine2"),
      city: optional(formData, "city"),
      region: optional(formData, "region"),
      digitalAddr: optional(formData, "digitalAddr"),
      postalBox: optional(formData, "postalBox"),
      registrationNo: optional(formData, "registrationNo"),
      logoUrl: optional(formData, "logoUrl"),
      crestUrl: optional(formData, "crestUrl"),
      letterheadUrl: optional(formData, "letterheadUrl"),
      curricula: formData.getAll("curricula").map(String).filter(Boolean),
      branding: {
        primary: text(formData, "brandPrimary") || "#2C66CE",
        accent: text(formData, "brandAccent") || "#0E9F6E",
        reportHeader: text(formData, "reportHeader") || name,
      },
    },
  });

  await record(user.id, "settings.school.update", "School", id, "Updated school profile");
  revalidatePath("/settings/school");
  return { ok: true, message: "School profile saved." };
}

// -----------------------------------------------------------------------------
// Dropdown options
// -----------------------------------------------------------------------------

export async function createOptionSetAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await authorize("settings.option.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const label = text(formData, "label");
  if (!label) return { error: "Give the list a name." };

  const key = text(formData, "key") || slugify(label).replace(/-/g, ".");
  const existing = await db.optionSet.findUnique({ where: { key } });
  if (existing) return { error: `A list with the key "${key}" already exists.` };

  await db.optionSet.create({
    data: {
      key,
      label,
      description: optional(formData, "description"),
      entity: (optional(formData, "entity") as never) ?? null,
      isSystem: false,
      allowCustom: true,
    },
  });

  revalidatePath("/settings/options");
  return { ok: true, message: `Created "${label}".` };
}

export async function addOptionItemAction(formData: FormData) {
  await authorize("settings.option.manage");

  const setId = text(formData, "setId");
  const label = text(formData, "label");
  if (!setId || !label) return;

  const value = text(formData, "value") || slugify(label).toUpperCase().replace(/-/g, "_");
  const last = await db.optionItem.findFirst({
    where: { setId },
    orderBy: { sortKey: "desc" },
    select: { sortKey: true },
  });

  // Upsert rather than create: re-adding a value someone deactivated should
  // bring it back, not fail on the unique constraint with a Prisma error page.
  await db.optionItem.upsert({
    where: { setId_value: { setId, value } },
    create: {
      setId,
      value,
      label,
      colour: optional(formData, "colour"),
      sortKey: (last?.sortKey ?? 0) + 10,
    },
    update: { label, isActive: true, colour: optional(formData, "colour") },
  });

  revalidatePath("/settings/options");
}

export async function toggleOptionItemAction(formData: FormData) {
  await authorize("settings.option.manage");

  const id = text(formData, "id");
  if (!id) return;

  const item = await db.optionItem.findUnique({
    where: { id },
    select: { isActive: true },
  });
  if (!item) return;

  // Deactivated rather than deleted: rows already pointing at this value must
  // keep rendering their label instead of showing a bare code.
  await db.optionItem.update({
    where: { id },
    data: { isActive: !item.isActive },
  });

  revalidatePath("/settings/options");
}

export async function setDefaultOptionAction(formData: FormData) {
  await authorize("settings.option.manage");

  const id = text(formData, "id");
  const setId = text(formData, "setId");
  if (!id || !setId) return;

  await db.$transaction([
    db.optionItem.updateMany({ where: { setId }, data: { isDefault: false } }),
    db.optionItem.update({ where: { id }, data: { isDefault: true, isActive: true } }),
  ]);

  revalidatePath("/settings/options");
}

// -----------------------------------------------------------------------------
// Custom fields
// -----------------------------------------------------------------------------

export async function createCustomFieldAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let user;
  try {
    user = await authorize("settings.customfield.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const label = text(formData, "label");
  const entity = text(formData, "entity");
  const type = text(formData, "type");
  if (!label || !entity || !type) return { error: "Name, entity and type are required." };

  const key = text(formData, "key") || slugify(label).replace(/-/g, "_");
  const clash = await db.customFieldDef.findUnique({
    where: { entity_key: { entity: entity as never, key } },
  });
  if (clash) return { error: `"${key}" already exists on ${entity.toLowerCase()}s.` };

  if ((type === "SELECT" || type === "MULTISELECT") && !text(formData, "optionSetId")) {
    return { error: "Choose the list of options this field draws from." };
  }

  const last = await db.customFieldDef.findFirst({
    where: { entity: entity as never },
    orderBy: { sortKey: "desc" },
    select: { sortKey: true },
  });

  await db.customFieldDef.create({
    data: {
      entity: entity as never,
      key,
      label,
      type: type as never,
      helpText: optional(formData, "helpText"),
      placeholder: optional(formData, "placeholder"),
      section: text(formData, "section") || "Additional Information",
      optionSetId: optional(formData, "optionSetId"),
      isRequired: formData.get("isRequired") === "on",
      showInList: formData.get("showInList") === "on",
      showInPortal: formData.get("showInPortal") === "on",
      sortKey: (last?.sortKey ?? 0) + 10,
    },
  });

  await record(
    user.id,
    "settings.customfield.create",
    "CustomFieldDef",
    null,
    `Added "${label}" to ${entity}`,
  );
  revalidatePath("/settings/custom-fields");
  return { ok: true, message: `Added "${label}".` };
}

export async function toggleCustomFieldAction(formData: FormData) {
  await authorize("settings.customfield.manage");

  const id = text(formData, "id");
  if (!id) return;

  const field = await db.customFieldDef.findUnique({
    where: { id },
    select: { isActive: true },
  });
  if (!field) return;

  await db.customFieldDef.update({ where: { id }, data: { isActive: !field.isActive } });
  revalidatePath("/settings/custom-fields");
}

/**
 * Deletes a field *and* every value captured under it. Only offered when no
 * values exist — the page hides the button otherwise, and this re-checks,
 * because losing captured data to a mis-click is not recoverable.
 */
export async function deleteCustomFieldAction(formData: FormData) {
  await authorize("settings.customfield.manage");

  const id = text(formData, "id");
  if (!id) return;

  const used = await db.customFieldValue.count({ where: { fieldId: id } });
  if (used > 0) return;

  await db.customFieldDef.delete({ where: { id } });
  revalidatePath("/settings/custom-fields");
}

// -----------------------------------------------------------------------------
// Grading scales
// -----------------------------------------------------------------------------

export async function createGradeScaleAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await authorize("assessment.scale.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const name = text(formData, "name");
  if (!name) return { error: "Name the scale." };

  const code = (text(formData, "code") || slugify(name)).toUpperCase().replace(/-/g, "_");
  const clash = await db.gradeScale.findUnique({ where: { code } });
  if (clash) return { error: `A scale with code "${code}" already exists.` };

  const maxPoint = Number(text(formData, "maxPoint"));

  await db.gradeScale.create({
    data: {
      name,
      code,
      description: optional(formData, "description"),
      maxPoint: Number.isFinite(maxPoint) && maxPoint > 0 ? maxPoint : null,
    },
  });

  revalidatePath("/settings/grading");
  return { ok: true, message: `Created "${name}". Add its bands next.` };
}

export async function addGradeBandAction(formData: FormData) {
  await authorize("assessment.scale.manage");

  const scaleId = text(formData, "scaleId");
  const grade = text(formData, "grade");
  if (!scaleId || !grade) return;

  const minScore = Number(text(formData, "minScore"));
  const maxScore = Number(text(formData, "maxScore"));
  if (!Number.isFinite(minScore) || !Number.isFinite(maxScore)) return;
  if (minScore > maxScore) return;

  // Number("") is 0, not NaN — so leaving the optional Point box empty
  // stored a real zero, and every report card computed a GPA of 0.00 and an
  // aggregate of 0 from bands that were meant to carry no point value.
  const pointRaw = text(formData, "point");
  const point = pointRaw === "" ? Number.NaN : Number(pointRaw);

  await db.gradeBand.upsert({
    where: { scaleId_grade: { scaleId, grade } },
    create: {
      scaleId,
      grade,
      minScore,
      maxScore,
      point: Number.isFinite(point) ? point : null,
      remark: optional(formData, "remark"),
      isPass: formData.get("isPass") !== null,
      // Sorted by the score the band starts at, descending, so the highest
      // grade is always first however they were entered.
      sortKey: 100 - Math.round(minScore),
    },
    update: {
      minScore,
      maxScore,
      point: Number.isFinite(point) ? point : null,
      remark: optional(formData, "remark"),
      isPass: formData.get("isPass") !== null,
      sortKey: 100 - Math.round(minScore),
    },
  });

  revalidatePath("/settings/grading");
}

export async function deleteGradeBandAction(formData: FormData) {
  await authorize("assessment.scale.manage");
  const id = text(formData, "id");
  if (!id) return;
  await db.gradeBand.delete({ where: { id } });
  revalidatePath("/settings/grading");
}

export async function setDefaultScaleAction(formData: FormData) {
  const user = await authorize("assessment.scale.manage");
  const id = text(formData, "id");
  if (!id) return;

  await db.$transaction([
    db.gradeScale.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    db.gradeScale.update({ where: { id }, data: { isDefault: true, isActive: true } }),
  ]);

  await record(user.id, "assessment.scale.default", "GradeScale", id, "Set default scale");
  revalidatePath("/settings/grading");
}

// -----------------------------------------------------------------------------
// Operational preferences
// -----------------------------------------------------------------------------

export async function updateMessagingSettingsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await authorize("settings.integration.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const senderId = text(formData, "senderId");
  // Aggregators reject anything longer; catching it here saves a whole failed
  // broadcast that only reports itself one delivery record at a time.
  if (senderId && senderId.length > 11) {
    return { error: "An SMS sender ID can be at most 11 characters." };
  }

  await setSettings("messaging", {
    senderId,
    emailFrom: text(formData, "emailFrom"),
    replyTo: text(formData, "replyTo"),
    signature: text(formData, "signature"),
    quietHoursStart: text(formData, "quietHoursStart"),
    quietHoursEnd: text(formData, "quietHoursEnd"),
  });

  revalidatePath("/settings/integrations");
  return { ok: true, message: "Messaging preferences saved." };
}

export async function updateFinanceSettingsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await authorize("settings.integration.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  await setSettings("finance", {
    invoicePrefix: text(formData, "invoicePrefix") || "INV",
    receiptPrefix: text(formData, "receiptPrefix") || "RCT",
    graceDays: Number(text(formData, "graceDays")) || 0,
    lateFeePercent: Number(text(formData, "lateFeePercent")) || 0,
    reminderLeadDays: Number(text(formData, "reminderLeadDays")) || 7,
    allowPartPayment: formData.get("allowPartPayment") === "on",
  });

  revalidatePath("/settings/integrations");
  return { ok: true, message: "Billing preferences saved." };
}
