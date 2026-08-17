import type { MetadataRoute } from "next";

import { db } from "@/lib/db";

// Rendered per request: the theme colour comes from the database, and the
// build machine does not have one.
export const dynamic = "force-dynamic";

/**
 * The installable app's manifest, generated so its colours and name follow
 * the school's settings. This replaced a static file whose green theme_color
 * painted every installed title bar a colour no school chose.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const school = await db.school
    .findFirst({ select: { name: true, shortName: true, branding: true } })
    .catch(() => null);

  const branding = (school?.branding ?? {}) as Record<string, string>;
  const themeColor = /^#[0-9a-fA-F]{6}$/.test(branding.primary ?? "")
    ? branding.primary
    : "#2C66CE";

  return {
    name: school?.name ?? "School Management System",
    short_name: school?.shortName ?? school?.name ?? "School MS",
    description:
      "Student records, attendance, assessment, fees, communication and learning.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f6f7f9",
    theme_color: themeColor,
    lang: "en-GH",
    dir: "ltr",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Search", url: "/search" },
      { name: "Notifications", url: "/notifications" },
    ],
  };
}
