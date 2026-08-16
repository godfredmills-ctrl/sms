import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseBlocks } from "@/lib/site-blocks";

import { RenderBlock, type NewsItem } from "../blocks";

export const dynamic = "force-dynamic";

async function loadPage(slugPath: string[] | undefined) {
  const site = await db.site.findFirst({
    orderBy: { createdAt: "asc" },
    include: {
      pages: {
        orderBy: { sortKey: "asc" },
        select: { id: true, title: true, slug: true, status: true, isHomePage: true },
      },
    },
  });
  if (!site) return null;

  const slug = slugPath?.join("/") ?? "";

  const page = slug
    ? await db.sitePage.findUnique({ where: { siteId_slug: { siteId: site.id, slug } } })
    : await db.sitePage.findFirst({ where: { siteId: site.id, isHomePage: true } });

  return { site, page };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}): Promise<Metadata> {
  const { path } = await params;
  const loaded = await loadPage(path);
  if (!loaded?.page) return { title: "Not found" };

  const { site, page } = loaded;

  return {
    title: page.metaTitle ?? `${page.title} · ${site.name}`,
    description: page.metaDescription ?? site.metaDescription ?? undefined,
    robots: page.noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      title: page.metaTitle ?? page.title,
      description: page.metaDescription ?? site.metaDescription ?? undefined,
      images: page.ogImageUrl ?? site.ogImageUrl ?? undefined,
    },
  };
}

export default async function PublicSitePage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  const loaded = await loadPage(path);
  if (!loaded?.page) notFound();

  const { site, page } = loaded;

  // A draft page, or an unpublished site, is visible only to signed-in staff
  // so they can preview it. Everyone else gets a 404 rather than a login
  // prompt — the existence of an unfinished page is not public information.
  const isLive = site.isPublished && page.status === "PUBLISHED";
  if (!isLive) {
    const user = await getCurrentUser();
    if (!user || user.portal !== "STAFF") notFound();
  }

  const blocks = parseBlocks(page.blocks);
  const needsNews = blocks.some((block) => block.type === "news");

  const news: NewsItem[] = needsNews
    ? await db.announcement.findMany({
        where: { status: "PUBLISHED", audiences: { has: "GUARDIAN" } },
        orderBy: { publishedAt: "desc" },
        take: 3,
        select: { id: true, title: true, summary: true, publishedAt: true },
      })
    : [];

  const theme = (site.theme ?? {}) as Record<string, string>;
  const contact = (site.contactInfo ?? {}) as Record<string, string>;
  const social = (site.socialLinks ?? {}) as Record<string, string>;

  const menu = site.pages.filter(
    (entry) => entry.status === "PUBLISHED" && !entry.isHomePage,
  );

  return (
    <div
      style={
        {
          "--primary": theme.primary ?? "#2C66CE",
          "--primary-soft": `${theme.primary ?? "#2C66CE"}1a`,
        } as React.CSSProperties
      }
      className="min-h-screen bg-[var(--bg)] text-[var(--text)]"
    >
      {!isLive ? (
        <div className="bg-[var(--warning)] px-4 py-2 text-center text-xs font-medium text-white">
          Preview — this {site.isPublished ? "page is a draft" : "site is offline"} and
          is not visible to the public.
        </div>
      ) : null}

      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/site" className="flex items-center gap-2.5">
            {site.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.logoUrl} alt="" className="h-9 w-auto" />
            ) : null}
            <span className="text-base font-semibold tracking-tight">{site.name}</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {menu.map((entry) => (
              <Link
                key={entry.id}
                href={`/site/${entry.slug}`}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-subtle)] ${
                  entry.slug === page.slug ? "font-medium text-[var(--primary)]" : ""
                }`}
              >
                {entry.title}
              </Link>
            ))}
          </nav>

          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-lg bg-[var(--primary)] px-3.5 text-sm font-medium text-white hover:opacity-90"
          >
            Portal login
          </Link>
        </div>
      </header>

      <main>
        {blocks.map((block) => (
          <RenderBlock
            key={block.id}
            block={block}
            news={news}
            contact={contact}
            accent={theme.primary ?? "#2C66CE"}
          />
        ))}

        {blocks.length === 0 ? (
          <div className="mx-auto max-w-3xl px-6 py-24 text-center">
            <h1 className="text-2xl font-semibold">{page.title}</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              This page has no content yet.
            </p>
          </div>
        ) : null}
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--bg-subtle)] px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold">{site.name}</p>
            {contact.address ? (
              <p className="mt-1 text-xs whitespace-pre-wrap text-[var(--text-muted)]">
                {contact.address}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {[contact.phone, contact.email].filter(Boolean).join(" · ")}
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            {menu.map((entry) => (
              <Link
                key={entry.id}
                href={`/site/${entry.slug}`}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                {entry.title}
              </Link>
            ))}
          </nav>

          <div className="flex gap-3 text-xs">
            {Object.entries(social)
              .filter(([, url]) => url)
              .map(([network, url]) => (
                <a
                  key={network}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--text-muted)] capitalize hover:text-[var(--text)]"
                >
                  {network}
                </a>
              ))}
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-6xl text-xs text-[var(--text-subtle)]">
          © {new Date().getFullYear()} {site.name}. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
