"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { blockDef, parseBlocks, type Block } from "@/lib/site-blocks";
import { generateCode } from "@/lib/crypto";
import { slugify } from "@/lib/utils";

export type SiteState = { ok?: boolean; error?: string; message?: string; id?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function updateSiteAction(
  _previous: SiteState,
  formData: FormData,
): Promise<SiteState> {
  try {
    await authorize("website.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "Missing site." };

  const name = text(formData, "name");
  if (!name) return { error: "The site needs a name." };

  await db.site.update({
    where: { id },
    data: {
      name,
      domain: text(formData, "domain") || null,
      metaTitle: text(formData, "metaTitle") || null,
      metaDescription: text(formData, "metaDescription") || null,
      logoUrl: text(formData, "logoUrl") || null,
      faviconUrl: text(formData, "faviconUrl") || null,
      ogImageUrl: text(formData, "ogImageUrl") || null,
      googleAnalyticsId: text(formData, "googleAnalyticsId") || null,
      theme: {
        primary: text(formData, "primary") || "#2C66CE",
        accent: text(formData, "accent") || "#0E9F6E",
        font: text(formData, "font") || "system",
        radius: text(formData, "radius") || "12px",
      },
      contactInfo: {
        address: text(formData, "address"),
        phone: text(formData, "phone"),
        email: text(formData, "email"),
      },
      socialLinks: {
        facebook: text(formData, "facebook"),
        instagram: text(formData, "instagram"),
        x: text(formData, "x"),
        youtube: text(formData, "youtube"),
      },
    },
  });

  revalidatePath("/website");
  return { ok: true, message: "Site settings saved." };
}

/**
 * Publishing the site is a separate act from saving it.
 *
 * The public renderer refuses to serve an unpublished site, so this switch is
 * the only thing standing between a half-written page and the school's
 * prospective parents.
 */
export async function toggleSitePublishedAction(formData: FormData) {
  const user = await authorize("website.publish");

  const id = text(formData, "id");
  if (!id) return;

  const site = await db.site.findUnique({
    where: { id },
    select: {
      isPublished: true,
      name: true,
      pages: { where: { status: "PUBLISHED" }, select: { id: true } },
    },
  });
  if (!site) return;

  // A site with no published page would serve a 404 at its own address.
  if (!site.isPublished && site.pages.length === 0) return;

  await db.site.update({
    where: { id },
    data: {
      isPublished: !site.isPublished,
      publishedAt: site.isPublished ? undefined : new Date(),
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: site.isPublished ? "website.unpublish" : "website.publish",
      entity: "Site",
      entityId: id,
      summary: `${site.isPublished ? "Took down" : "Published"} ${site.name}`,
    },
  });

  revalidatePath("/website");
}

export async function createPageAction(
  _previous: SiteState,
  formData: FormData,
): Promise<SiteState> {
  try {
    await authorize("website.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const siteId = text(formData, "siteId");
  const title = text(formData, "title");
  if (!siteId || !title) return { error: "Give the page a title." };

  const slug = slugify(text(formData, "slug") || title);

  const clash = await db.sitePage.findUnique({
    where: { siteId_slug: { siteId, slug } },
    select: { id: true },
  });
  if (clash) return { error: `A page already lives at /${slug}.` };

  const last = await db.sitePage.findFirst({
    where: { siteId },
    orderBy: { sortKey: "desc" },
    select: { sortKey: true },
  });

  const page = await db.sitePage.create({
    data: {
      siteId,
      title,
      slug,
      sortKey: (last?.sortKey ?? 0) + 10,
      status: "DRAFT",
      blocks: [] as never,
    },
  });

  revalidatePath("/website");
  return { ok: true, id: page.id, message: `Created "${title}".` };
}

export async function addBlockAction(formData: FormData) {
  await authorize("website.manage");

  const pageId = text(formData, "pageId");
  const type = text(formData, "type");
  const def = blockDef(type);
  if (!pageId || !def) return;

  const page = await db.sitePage.findUnique({
    where: { id: pageId },
    select: { blocks: true },
  });
  if (!page) return;

  const blocks = parseBlocks(page.blocks);
  blocks.push({
    id: generateCode(8).toLowerCase(),
    type: def.type,
    props: { ...def.defaults },
  });

  await db.sitePage.update({
    where: { id: pageId },
    data: { blocks: blocks as never },
  });

  revalidatePath(`/website/pages/${pageId}`);
}

export async function updateBlockAction(formData: FormData) {
  await authorize("website.manage");

  const pageId = text(formData, "pageId");
  const blockId = text(formData, "blockId");
  if (!pageId || !blockId) return;

  const page = await db.sitePage.findUnique({
    where: { id: pageId },
    select: { blocks: true },
  });
  if (!page) return;

  const blocks = parseBlocks(page.blocks);
  const block = blocks.find((entry) => entry.id === blockId);
  if (!block) return;

  const def = blockDef(block.type);
  if (!def) return;

  // Only fields the block declares are written. A posted key the block does
  // not know about is either a stale form or someone probing, and neither
  // should end up rendered on the public site.
  for (const field of def.fields) {
    block.props[field.key] = String(formData.get(field.key) ?? "");
  }

  await db.sitePage.update({
    where: { id: pageId },
    data: { blocks: blocks as never },
  });

  revalidatePath(`/website/pages/${pageId}`);
}

export async function moveBlockAction(formData: FormData) {
  await authorize("website.manage");

  const pageId = text(formData, "pageId");
  const blockId = text(formData, "blockId");
  const direction = text(formData, "direction");
  if (!pageId || !blockId) return;

  const page = await db.sitePage.findUnique({
    where: { id: pageId },
    select: { blocks: true },
  });
  if (!page) return;

  const blocks = parseBlocks(page.blocks);
  const index = blocks.findIndex((entry) => entry.id === blockId);
  if (index < 0) return;

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= blocks.length) return;

  const reordered: Block[] = [...blocks];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  await db.sitePage.update({
    where: { id: pageId },
    data: { blocks: reordered as never },
  });

  revalidatePath(`/website/pages/${pageId}`);
}

export async function deleteBlockAction(formData: FormData) {
  await authorize("website.manage");

  const pageId = text(formData, "pageId");
  const blockId = text(formData, "blockId");
  if (!pageId || !blockId) return;

  const page = await db.sitePage.findUnique({
    where: { id: pageId },
    select: { blocks: true },
  });
  if (!page) return;

  await db.sitePage.update({
    where: { id: pageId },
    data: {
      blocks: parseBlocks(page.blocks).filter(
        (entry) => entry.id !== blockId,
      ) as never,
    },
  });

  revalidatePath(`/website/pages/${pageId}`);
}

export async function updatePageAction(formData: FormData) {
  await authorize("website.manage");

  const id = text(formData, "id");
  if (!id) return;

  const isHomePage = formData.get("isHomePage") === "on";

  const page = await db.sitePage.findUnique({
    where: { id },
    select: { siteId: true },
  });
  if (!page) return;

  await db.$transaction([
    // Exactly one home page. Two would make which one loads depend on row
    // order, which is not a decision anyone should be making by accident.
    ...(isHomePage
      ? [
          db.sitePage.updateMany({
            where: { siteId: page.siteId },
            data: { isHomePage: false },
          }),
        ]
      : []),
    db.sitePage.update({
      where: { id },
      data: {
        title: text(formData, "title") || undefined,
        metaTitle: text(formData, "metaTitle") || null,
        metaDescription: text(formData, "metaDescription") || null,
        noIndex: formData.get("noIndex") === "on",
        isHomePage,
      },
    }),
  ]);

  revalidatePath(`/website/pages/${id}`);
  revalidatePath("/website");
}

export async function togglePagePublishedAction(formData: FormData) {
  await authorize("website.publish");

  const id = text(formData, "id");
  if (!id) return;

  const page = await db.sitePage.findUnique({
    where: { id },
    select: { status: true, blocks: true },
  });
  if (!page) return;

  // An empty page published is a blank screen with the school's name on it.
  if (page.status !== "PUBLISHED" && parseBlocks(page.blocks).length === 0) return;

  await db.sitePage.update({
    where: { id },
    data: {
      status: page.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED",
      publishedAt: page.status === "PUBLISHED" ? undefined : new Date(),
    },
  });

  revalidatePath("/website");
  revalidatePath(`/website/pages/${id}`);
}

export async function deletePageAction(formData: FormData) {
  await authorize("website.manage");

  const id = text(formData, "id");
  if (!id) return;

  const page = await db.sitePage.findUnique({
    where: { id },
    select: { isHomePage: true },
  });
  // Deleting the home page would leave the site serving nothing at its root.
  if (!page || page.isHomePage) return;

  await db.sitePage.delete({ where: { id } });
  revalidatePath("/website");
}
