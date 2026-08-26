import type { Metadata } from "next";
import Link from "next/link";
import { Image as ImageIcon, Sparkles, TriangleAlert } from "lucide-react";

import { Alert, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseTransforms } from "@/lib/image-transforms";
import { formatBytes } from "@/lib/utils";

import { MediaLibrary, type MediaItem } from "./media-library";

export const metadata: Metadata = { title: "Media library" };
export const dynamic = "force-dynamic";

export default async function MediaPage() {
  await requirePermission("website.manage");

  const site = await db.site.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  if (!site) {
    return (
      <>
        <PageHeader title="Media library" />
        <Card>
          <EmptyState
            icon={<ImageIcon className="size-5" />}
            title="No site record"
            description="Create the website first."
          />
        </Card>
      </>
    );
  }

  const media = await db.siteMedia.findMany({
    where: { siteId: site.id },
    orderBy: { createdAt: "desc" },
    include: {
      file: { select: { id: true, originalName: true, sizeBytes: true } },
    },
  });

  const items: MediaItem[] = media.map((entry) => {
    const transforms = parseTransforms(entry.transforms);
    return {
      id: entry.id,
      fileId: entry.file.id,
      fileName: entry.file.originalName,
      sizeLabel: formatBytes(entry.file.sizeBytes),
      altText: entry.altText,
      caption: entry.caption,
      folder: entry.folder ?? "uncategorised",
      tags: entry.tags,
      transforms,
      edited: Object.keys(transforms).length > 0,
    };
  });

  const totalBytes = media.reduce((sum, entry) => sum + entry.file.sizeBytes, 0);
  const missingAlt = items.filter((item) => !item.altText).length;
  const edited = items.filter((item) => item.edited).length;

  return (
    <>
      <PageHeader
        title="Media library"
        description="Images for the school website, with crop, filters and resizing built in."
        breadcrumb={
          <Link href="/website" className="hover:text-[var(--text)]">
            Website
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Images"
          value={items.length}
          tone="violet"
          icon={<ImageIcon className="size-4" />}
        />
        <StatCard label="Storage used" value={formatBytes(totalBytes)} tone="info" />
        <StatCard
          label="Edited"
          value={edited}
          hint="Crop, filter or resize applied"
          tone="teal"
          icon={<Sparkles className="size-4" />}
        />
        <StatCard
          label="Missing alt text"
          value={missingAlt}
          tone={missingAlt ? "warning" : "success"}
          icon={<TriangleAlert className="size-4" />}
        />
      </div>

      {missingAlt > 0 ? (
        <Alert tone="warning" className="mb-4">
          {missingAlt} image{missingAlt === 1 ? " has" : "s have"} no alt text. Screen
          readers announce nothing for them, and search engines cannot index what the
          picture shows: both matter on a school&rsquo;s public site.
        </Alert>
      ) : null}

      <MediaLibrary siteId={site.id} items={items} />
    </>
  );
}
