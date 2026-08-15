"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateCode } from "@/lib/crypto";
import { parseLayout, starterLayout, type TemplateElement } from "@/lib/templates";

export type TemplateState = { ok?: boolean; error?: string; message?: string; id?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function num(formData: FormData, key: string, fallback: number): number {
  const parsed = Number(text(formData, key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function createTemplateAction(
  _previous: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  let user;
  try {
    user = await authorize("assessment.template.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const name = text(formData, "name");
  const kind = text(formData, "kind") || "CERTIFICATE";
  if (!name) return { error: "Name the template." };

  const source = text(formData, "source") || "BUILDER";
  const fileId = text(formData, "fileId") || null;

  if (source === "UPLOAD" && !fileId) {
    return {
      error:
        "Upload the base PDF first, then create the template — fields are positioned on top of it.",
    };
  }

  const template = await db.documentTemplate.create({
    data: {
      name,
      kind,
      source,
      fileId,
      description: text(formData, "description") || null,
      pageSize: text(formData, "pageSize") || "A4",
      orientation: text(formData, "orientation") || "PORTRAIT",
      // An uploaded PDF starts with no elements — the school positions what it
      // needs onto its own artwork. A builder template starts from a working
      // layout, because a blank page is not a starting point anyone wants.
      layout: (source === "UPLOAD"
        ? { elements: [] }
        : starterLayout(kind)) as never,
      createdById: user.id,
    },
  });

  revalidatePath("/credentials/templates");
  return { ok: true, id: template.id, message: `Created "${name}".` };
}

export async function updateTemplateAction(formData: FormData) {
  await authorize("assessment.template.manage");

  const id = text(formData, "id");
  if (!id) return;

  await db.documentTemplate.update({
    where: { id },
    data: {
      name: text(formData, "name") || undefined,
      description: text(formData, "description") || null,
      pageSize: text(formData, "pageSize") || undefined,
      orientation: text(formData, "orientation") || undefined,
    },
  });

  revalidatePath(`/credentials/templates/${id}`);
}

export async function setTemplateBackgroundAction(formData: FormData) {
  await authorize("assessment.template.manage");

  const id = text(formData, "id");
  if (!id) return;

  const template = await db.documentTemplate.findUnique({
    where: { id },
    select: { layout: true },
  });
  if (!template) return;

  const layout = parseLayout(template.layout);
  layout.backgroundUrl = text(formData, "backgroundUrl") || undefined;
  layout.backgroundColour = text(formData, "backgroundColour") || "#ffffff";

  await db.documentTemplate.update({
    where: { id },
    data: { layout: layout as never },
  });

  revalidatePath(`/credentials/templates/${id}`);
}

export async function addElementAction(formData: FormData) {
  await authorize("assessment.template.manage");

  const id = text(formData, "id");
  const type = text(formData, "type");
  if (!id || !type) return;

  const template = await db.documentTemplate.findUnique({
    where: { id },
    select: { layout: true },
  });
  if (!template) return;

  const layout = parseLayout(template.layout);

  layout.elements.push({
    id: generateCode(6).toLowerCase(),
    type: type as TemplateElement["type"],
    x: 10,
    y: 10,
    width: type === "qr" ? 8 : 40,
    height: type === "line" ? 0.3 : type === "qr" ? 8 : 6,
    value: text(formData, "value") || (type === "text" ? "New text" : ""),
    fontSize: 12,
    fontWeight: "normal",
    align: "left",
    colour: "#0f172a",
  });

  await db.documentTemplate.update({
    where: { id },
    data: { layout: layout as never },
  });

  revalidatePath(`/credentials/templates/${id}`);
}

export async function updateElementAction(formData: FormData) {
  await authorize("assessment.template.manage");

  const id = text(formData, "id");
  const elementId = text(formData, "elementId");
  if (!id || !elementId) return;

  const template = await db.documentTemplate.findUnique({
    where: { id },
    select: { layout: true },
  });
  if (!template) return;

  const layout = parseLayout(template.layout);
  const element = layout.elements.find((entry) => entry.id === elementId);
  if (!element) return;

  // Positions are clamped to the page. An element at x=140 is invisible on
  // every printed copy while looking fine in the editor's own scroll area.
  element.x = Math.min(100, Math.max(0, num(formData, "x", element.x)));
  element.y = Math.min(100, Math.max(0, num(formData, "y", element.y)));
  element.width = Math.min(100, Math.max(0.5, num(formData, "width", element.width)));
  element.height = Math.min(100, Math.max(0.2, num(formData, "height", element.height)));
  element.value = text(formData, "value");
  element.fontSize = Math.min(72, Math.max(6, num(formData, "fontSize", element.fontSize)));
  element.fontWeight = formData.get("bold") === "on" ? "bold" : "normal";
  element.italic = formData.get("italic") === "on";
  element.align = (text(formData, "align") || "left") as TemplateElement["align"];
  element.colour = text(formData, "colour") || "#0f172a";

  await db.documentTemplate.update({
    where: { id },
    data: { layout: layout as never },
  });

  revalidatePath(`/credentials/templates/${id}`);
}

export async function deleteElementAction(formData: FormData) {
  await authorize("assessment.template.manage");

  const id = text(formData, "id");
  const elementId = text(formData, "elementId");
  if (!id || !elementId) return;

  const template = await db.documentTemplate.findUnique({
    where: { id },
    select: { layout: true },
  });
  if (!template) return;

  const layout = parseLayout(template.layout);
  layout.elements = layout.elements.filter((entry) => entry.id !== elementId);

  await db.documentTemplate.update({
    where: { id },
    data: { layout: layout as never },
  });

  revalidatePath(`/credentials/templates/${id}`);
}

export async function setDefaultTemplateAction(formData: FormData) {
  const user = await authorize("assessment.template.manage");

  const id = text(formData, "id");
  if (!id) return;

  const template = await db.documentTemplate.findUnique({
    where: { id },
    select: { kind: true, name: true },
  });
  if (!template) return;

  await db.$transaction([
    // Default is per kind, not global: a school has one default certificate
    // and one default transcript, and they are unrelated choices.
    db.documentTemplate.updateMany({
      where: { kind: template.kind },
      data: { isDefault: false },
    }),
    db.documentTemplate.update({
      where: { id },
      data: { isDefault: true, isActive: true },
    }),
  ]);

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "assessment.template.default",
      entity: "DocumentTemplate",
      entityId: id,
      summary: `${template.name} is now the default ${template.kind.toLowerCase()}`,
    },
  });

  revalidatePath("/credentials/templates");
}

export async function deleteTemplateAction(formData: FormData) {
  await authorize("assessment.template.manage");

  const id = text(formData, "id");
  if (!id) return;

  const used = await db.issuedCertificate.count({ where: { templateId: id } });
  // A template already used to issue a document stays: the issued copy points
  // at it, and a certificate that cannot explain how it was produced is worth
  // less than one that can.
  if (used > 0) {
    await db.documentTemplate.update({
      where: { id },
      data: { isActive: false, isDefault: false },
    });
  } else {
    await db.documentTemplate.delete({ where: { id } });
  }

  revalidatePath("/credentials/templates");
}
