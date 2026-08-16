import type { MetadataRoute } from "next";

import { db } from "@/lib/db";
import { env } from "@/lib/env";

// Rendered per request: the sitemap reads the database, and the build machine
// does not have one.
export const dynamic = "force-dynamic";

/**
 * The public site's sitemap.
 *
 * Only published, indexable pages of a published site are listed — the app
 * itself lives behind a login and has no business in a search engine. A parent
 * searching the school's name finding its website is the whole reason the
 * website module exists, and without this file crawlers are left to guess.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await db.site.findFirst({
    where: { isPublished: true },
    select: {
      pages: {
        where: { status: "PUBLISHED", noIndex: false },
        select: { slug: true, isHomePage: true, updatedAt: true },
      },
    },
  });

  if (!site) return [];

  return site.pages.map((page) => ({
    url: page.isHomePage ? `${env.appUrl}/site` : `${env.appUrl}/site/${page.slug}`,
    lastModified: page.updatedAt,
    changeFrequency: page.isHomePage ? "weekly" : "monthly",
    priority: page.isHomePage ? 1 : 0.7,
  }));
}
