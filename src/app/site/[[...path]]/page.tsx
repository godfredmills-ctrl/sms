import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Facebook, Instagram, Mail, MapPin, Phone, Youtube } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseBlocks } from "@/lib/site-blocks";

import { RenderBlock, tint, type NewsItem, type SiteTheme } from "../blocks";
import { NewsletterForm } from "../newsletter";

/**
 * A colour a school typed, or the fallback when it cannot be trusted.
 *
 * Inline style objects are serialised into the style attribute, so a value
 * carrying ";" could smuggle extra declarations into the page. Colours are
 * names, hex, or functional notation — nothing needs a semicolon.
 */
function safeColour(value: string | undefined, fallback: string): string {
  const colour = (value ?? "").trim();
  if (!colour || !/^[#a-zA-Z0-9(),.%\s/-]+$/.test(colour) || colour.length > 64) {
    return fallback;
  }
  return colour;
}

/**
 * The highlight darkened until small text passes on white.
 *
 * Only six-digit hex is darkened arithmetically; any other notation falls
 * back to a fixed dark amber, which is honest — a legible site beats an
 * exactly-matching illegible one.
 */
function darkenForText(colour: string): string {
  const match = colour.match(/^#([0-9a-f]{6})$/i);
  if (!match) return "#8A6100";
  const value = Number.parseInt(match[1], 16);
  const scale = (channel: number) => Math.round(channel * 0.62);
  const r = scale((value >> 16) & 255);
  const g = scale((value >> 8) & 255);
  const b = scale(value & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

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

const SOCIAL_ICONS: Record<string, typeof Facebook> = {
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
};

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
  const newsBlock = blocks.find((block) => block.type === "news");

  // "How many" comes from the block, clamped to something sensible — the
  // field existed in the editor for a while before anything read it.
  const newsCount = Math.min(
    Math.max(Number.parseInt(newsBlock?.props.count ?? "3", 10) || 3, 1),
    12,
  );

  // Website posts first — they are written for the public — falling back to
  // guardian announcements so a school that has never opened the posts screen
  // still has a living news section.
  let news: NewsItem[] = [];
  if (newsBlock) {
    const posts = await db.sitePost.findMany({
      where: { siteId: site.id, status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: newsCount,
      select: { id: true, title: true, excerpt: true, publishedAt: true },
    });

    news = posts.length
      ? posts.map((post) => ({
          id: post.id,
          title: post.title,
          summary: post.excerpt,
          publishedAt: post.publishedAt,
        }))
      : await db.announcement.findMany({
          where: { status: "PUBLISHED", audiences: { has: "GUARDIAN" } },
          orderBy: { publishedAt: "desc" },
          take: newsCount,
          select: { id: true, title: true, summary: true, publishedAt: true },
        });
  }

  const rawTheme = (site.theme ?? {}) as Record<string, string>;
  // Display extras a school sets in site settings: the small line under the
  // school name, and the footer tagline.
  const globals = (site.globals ?? {}) as Record<string, string>;
  const contact = (site.contactInfo ?? {}) as Record<string, string>;
  const social = (site.socialLinks ?? {}) as Record<string, string>;

  /**
   * Four colours drive the whole design; a school changes them under
   * Website → Site settings and everything follows — bands, buttons, tags,
   * the footer. Serif display headings unless the theme says otherwise.
   */
  const gold = safeColour(rawTheme.accent, "#E9A319");
  const theme: SiteTheme = {
    primary: safeColour(rawTheme.primary, "#2C66CE"),
    navy: safeColour(rawTheme.secondary, "#0B2447"),
    gold,
    goldText: darkenForText(gold),
    cream: safeColour(rawTheme.wash, "#FAF6EE"),
  };
  const headingFont =
    rawTheme.headingFont === "sans"
      ? "inherit"
      : `Georgia, 'Times New Roman', serif`;

  const menu = site.pages.filter(
    (entry) => entry.status === "PUBLISHED" && !entry.isHomePage,
  );

  // The header's Apply button goes to the admissions page when one exists.
  const admissions = menu.find((entry) => entry.slug === "admissions");

  // The GA snippet only ships on the live site, and only for an id that looks
  // like one — this string ends up inside a script tag.
  const gaId =
    isLive && /^G-[A-Z0-9]{4,20}$/.test(site.googleAnalyticsId ?? "")
      ? site.googleAnalyticsId
      : null;

  return (
    <div
      style={
        {
          "--primary": theme.primary,
          "--primary-soft": tint(theme.primary, 10),
          "--heading-font": headingFont,
          // The public site is always light, whatever the admin theme on this
          // browser says — otherwise selection and form controls invert.
          colorScheme: "light",
        } as React.CSSProperties
      }
      className="min-h-screen bg-white text-slate-800"
    >
      {gaId ? (
        <>
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`,
            }}
          />
        </>
      ) : null}

      {!isLive ? (
        <div className="bg-amber-600 px-4 py-2 text-center text-xs font-semibold text-white">
          Preview — this {site.isPublished ? "page is a draft" : "site is offline"} and
          is not visible to the public.
        </div>
      ) : null}

      {/* Utility bar: how to reach the school, and the doors into the portals. */}
      <div style={{ background: theme.navy }} className="text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-6 py-1.5 text-[11px]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {contact.address ? (
              <span className="inline-flex items-center gap-1.5 text-white/80">
                <MapPin className="size-3" style={{ color: theme.gold }} />
                {contact.address}
              </span>
            ) : null}
            {contact.phone ? (
              <a
                href={`tel:${contact.phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-1.5 text-white/80 hover:text-white"
              >
                <Phone className="size-3" style={{ color: theme.gold }} />
                {contact.phone}
              </a>
            ) : null}
            {contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="hidden items-center gap-1.5 text-white/80 hover:text-white sm:inline-flex"
              >
                <Mail className="size-3" style={{ color: theme.gold }} />
                {contact.email}
              </a>
            ) : null}
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-white/80 hover:text-white">
              Parent Portal
            </Link>
            <Link href="/login" className="text-white/80 hover:text-white">
              Student Login
            </Link>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/site" className="flex min-w-0 items-center gap-2.5">
            {site.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.logoUrl} alt="" className="h-10 w-auto shrink-0" />
            ) : null}
            <span className="min-w-0">
              <span
                className="block truncate text-lg leading-tight font-bold tracking-tight"
                style={{ fontFamily: "var(--heading-font)", color: theme.navy }}
              >
                {site.name}
              </span>
              {globals.nameCaption ? (
                <span
                  className="block truncate text-[9px] font-semibold tracking-[0.28em] uppercase"
                  style={{ color: theme.goldText }}
                >
                  {globals.nameCaption}
                </span>
              ) : null}
            </span>
          </Link>

          <nav className="hidden items-center gap-0.5 lg:flex">
            {[{ id: "home", title: "Home", slug: "", isHomePage: true }, ...menu].map(
              (entry) => {
                const active = entry.isHomePage
                  ? page.isHomePage
                  : entry.slug === page.slug;
                return (
                  <Link
                    key={entry.id}
                    href={entry.isHomePage ? "/site" : `/site/${entry.slug}`}
                    className="relative px-3 py-2 text-[13px] font-semibold tracking-wide uppercase"
                    style={{ color: active ? theme.navy : "#64748b" }}
                  >
                    {entry.title}
                    {active ? (
                      <span
                        className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full"
                        style={{ background: theme.gold }}
                      />
                    ) : null}
                  </Link>
                );
              },
            )}
          </nav>

          <Link
            href={admissions ? `/site/${admissions.slug}` : "/login"}
            className="inline-flex h-10 shrink-0 items-center rounded-md px-5 text-sm font-bold shadow-sm transition-opacity hover:opacity-90"
            style={{ background: theme.gold, color: theme.navy }}
          >
            {admissions ? "Apply Now" : "Portal login"}
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
            theme={theme}
          />
        ))}

        {blocks.length === 0 ? (
          <div className="mx-auto max-w-3xl px-6 py-24 text-center">
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: "var(--heading-font)", color: theme.navy }}
            >
              {page.title}
            </h1>
            <p className="mt-2 text-sm text-slate-500">This page has no content yet.</p>
          </div>
        ) : null}
      </main>

      <footer style={{ background: theme.navy }} className="text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <div className="flex items-center gap-2.5">
              {site.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={site.logoUrl} alt="" className="h-10 w-auto" />
              ) : null}
              <p
                className="text-base leading-tight font-bold"
                style={{ fontFamily: "var(--heading-font)" }}
              >
                {site.name}
              </p>
            </div>
            {globals.tagline || site.metaDescription ? (
              <p className="mt-3 text-xs leading-relaxed text-white/60">
                {globals.tagline || site.metaDescription}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              {Object.entries(social)
                .filter(([, url]) => url)
                .map(([network, url]) => {
                  const Icon = SOCIAL_ICONS[network];
                  return (
                    <a
                      key={network}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      title={network}
                      className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                    >
                      {Icon ? (
                        <Icon className="size-3.5" />
                      ) : (
                        <span className="text-[10px] font-bold uppercase">
                          {network.slice(0, 2)}
                        </span>
                      )}
                    </a>
                  );
                })}
            </div>
          </div>

          <div>
            <p
              className="text-sm font-bold tracking-wide uppercase"
              style={{ color: theme.gold }}
            >
              Quick links
            </p>
            <nav className="mt-3 space-y-1.5">
              {menu.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/site/${entry.slug}`}
                  className="block text-xs text-white/70 hover:text-white"
                >
                  {entry.title}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <p
              className="text-sm font-bold tracking-wide uppercase"
              style={{ color: theme.gold }}
            >
              Resources
            </p>
            <nav className="mt-3 space-y-1.5 text-xs">
              <Link href="/login" className="block text-white/70 hover:text-white">
                Parent Portal
              </Link>
              <Link href="/login" className="block text-white/70 hover:text-white">
                Student Login
              </Link>
              <Link href="/login" className="block text-white/70 hover:text-white">
                Staff Login
              </Link>
              <Link href="/verify" className="block text-white/70 hover:text-white">
                Verify a Document
              </Link>
            </nav>
          </div>

          <div>
            <p
              className="text-sm font-bold tracking-wide uppercase"
              style={{ color: theme.gold }}
            >
              Contact us
            </p>
            <div className="mt-3 space-y-2 text-xs text-white/70">
              {contact.address ? (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" style={{ color: theme.gold }} />
                  <span className="whitespace-pre-wrap">{contact.address}</span>
                </p>
              ) : null}
              {contact.phone ? (
                <p className="flex items-center gap-2">
                  <Phone className="size-3.5 shrink-0" style={{ color: theme.gold }} />
                  {contact.phone}
                </p>
              ) : null}
              {contact.email ? (
                <p className="flex items-center gap-2">
                  <Mail className="size-3.5 shrink-0" style={{ color: theme.gold }} />
                  {contact.email}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <p
              className="text-sm font-bold tracking-wide uppercase"
              style={{ color: theme.gold }}
            >
              Newsletter
            </p>
            <p className="mt-3 mb-3 text-xs text-white/60">
              Stay updated with our latest news and events.
            </p>
            <NewsletterForm gold={theme.gold} navy={theme.navy} />
          </div>
        </div>

        <div className="border-t border-white/10">
          <p className="mx-auto max-w-6xl px-6 py-4 text-center text-[11px] text-white/50">
            © {new Date().getFullYear()} {site.name}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
