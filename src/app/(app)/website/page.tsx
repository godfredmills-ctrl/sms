import type { Metadata } from "next";
import Link from "next/link";
import {
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Home,
  Trash2,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseBlocks } from "@/lib/site-blocks";
import { relativeTime } from "@/lib/utils";

import {
  deletePageAction,
  togglePagePublishedAction,
  toggleSitePublishedAction,
} from "./actions";
import { PageForm, SiteSettingsForm, type SiteValues } from "./forms";

export const metadata: Metadata = { title: "Website" };
export const dynamic = "force-dynamic";

export default async function WebsitePage() {
  const user = await requirePermission("website.read");
  const canManage = userCan(user, "website.manage");
  const canPublish = userCan(user, "website.publish");

  const site = await db.site.findFirst({
    orderBy: { createdAt: "asc" },
    include: {
      pages: { orderBy: { sortKey: "asc" } },
      _count: { select: { media: true, posts: true } },
    },
  });

  if (!site) {
    return (
      <>
        <PageHeader title="Website" />
        <Card>
          <EmptyState
            icon={<Globe className="size-5" />}
            title="No site record"
            description="Run the seed, or create a Site row, to start building the school's public website."
          />
        </Card>
      </>
    );
  }

  const theme = (site.theme ?? {}) as Record<string, string>;
  const contact = (site.contactInfo ?? {}) as Record<string, string>;
  const social = (site.socialLinks ?? {}) as Record<string, string>;

  const values: SiteValues = {
    id: site.id,
    name: site.name,
    domain: site.domain ?? "",
    metaTitle: site.metaTitle ?? "",
    metaDescription: site.metaDescription ?? "",
    logoUrl: site.logoUrl ?? "",
    faviconUrl: site.faviconUrl ?? "",
    ogImageUrl: site.ogImageUrl ?? "",
    googleAnalyticsId: site.googleAnalyticsId ?? "",
    primary: theme.primary ?? "#2C66CE",
    secondary: theme.secondary ?? "#0B2447",
    accent: theme.accent ?? "#E9A319",
    wash: theme.wash ?? "#FAF6EE",
    headingFont: theme.headingFont ?? "serif",
    address: contact.address ?? "",
    phone: contact.phone ?? "",
    email: contact.email ?? "",
    facebook: social.facebook ?? "",
    instagram: social.instagram ?? "",
    x: social.x ?? "",
    youtube: social.youtube ?? "",
  };

  const published = site.pages.filter((page) => page.status === "PUBLISHED");
  const home = site.pages.find((page) => page.isHomePage);
  const emptyPages = site.pages.filter(
    (page) => parseBlocks(page.blocks).length === 0,
  );

  return (
    <>
      <PageHeader
        title="Website"
        description="Build and publish the school's public site."
        action={
          <>
            <Badge tone={site.isPublished ? "success" : "warning"}>
              {site.isPublished ? "Live" : "Not published"}
            </Badge>
            <Link
              href="/site"
              target="_blank"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--bg-subtle)]"
            >
              <ExternalLink className="size-4" />
              Preview
            </Link>
            {canPublish ? (
              <form action={toggleSitePublishedAction}>
                <input type="hidden" name="id" value={site.id} />
                <Button type="submit" disabled={!site.isPublished && !published.length}>
                  {site.isPublished ? (
                    <>
                      <EyeOff className="size-4" />
                      Take offline
                    </>
                  ) : (
                    <>
                      <Eye className="size-4" />
                      Publish site
                    </>
                  )}
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Pages"
          value={site.pages.length}
          hint={`${published.length} published`}
          tone="violet"
          icon={<FileText className="size-4" />}
        />
        <StatCard
          label="Status"
          value={site.isPublished ? "Live" : "Offline"}
          hint={site.publishedAt ? `since ${relativeTime(site.publishedAt)}` : undefined}
          tone={site.isPublished ? "success" : "warning"}
          icon={<Globe className="size-4" />}
        />
        <StatCard label="Media" value={site._count.media} tone="info" />
        <StatCard
          label="Home page"
          value={home ? home.title : "Not set"}
          tone={home ? "teal" : "danger"}
          icon={<Home className="size-4" />}
        />
      </div>

      {!home ? (
        <Alert tone="danger" className="mb-4">
          No page is marked as the home page, so the site root has nothing to serve.
          Open a page and tick &ldquo;home page&rdquo;.
        </Alert>
      ) : null}

      {emptyPages.length ? (
        <Alert tone="warning" className="mb-4">
          {emptyPages.length} page{emptyPages.length === 1 ? " has" : "s have"} no
          content blocks yet: {emptyPages.map((page) => page.title).join(", ")}.
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader
            title="Pages"
            description="Drafts are invisible to the public, whatever the site status."
          />
          {site.pages.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {site.pages.map((page) => {
                const blocks = parseBlocks(page.blocks);
                return (
                  <li
                    key={page.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/website/pages/${page.id}`}
                          className="text-sm font-medium hover:text-[var(--primary)]"
                        >
                          {page.title}
                        </Link>
                        {page.isHomePage ? (
                          <Badge tone="primary">
                            <Home className="size-2.5" />
                            Home
                          </Badge>
                        ) : null}
                        <Badge
                          tone={page.status === "PUBLISHED" ? "success" : "warning"}
                        >
                          {page.status}
                        </Badge>
                        {page.noIndex ? <Badge tone="neutral">No index</Badge> : null}
                      </div>
                      <p className="text-xs text-[var(--text-subtle)]">
                        /site/{page.slug} · {blocks.length} block
                        {blocks.length === 1 ? "" : "s"} · updated{" "}
                        {relativeTime(page.updatedAt)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {canPublish ? (
                        <form action={togglePagePublishedAction}>
                          <input type="hidden" name="id" value={page.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            disabled={page.status !== "PUBLISHED" && blocks.length === 0}
                          >
                            {page.status === "PUBLISHED" ? (
                              <EyeOff className="size-3.5" />
                            ) : (
                              <Eye className="size-3.5" />
                            )}
                          </Button>
                        </form>
                      ) : null}
                      {canManage && !page.isHomePage ? (
                        <form action={deletePageAction}>
                          <input type="hidden" name="id" value={page.id} />
                          <Button type="submit" variant="ghost" size="sm" title="Delete">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={<FileText className="size-5" />}
              title="No pages yet"
              description="Create the home page first."
            />
          )}
        </Card>

        {canManage ? (
          <div className="space-y-4">
            <Card>
              <CardHeader title="New page" />
              <PageForm siteId={site.id} />
            </Card>

            <Card>
              <CardHeader
                title="Site settings"
                description="Branding, contact details and search-engine metadata."
              />
              <SiteSettingsForm values={values} />
            </Card>
          </div>
        ) : null}
      </div>

      <Card className="mt-4">
        <CardBody className="text-xs text-[var(--text-muted)]">
          <p className="mb-1.5 font-medium text-[var(--text)]">
            Why there is no raw HTML block
          </p>
          <p>
            Pages are built from a fixed set of blocks rather than free HTML. A pasted
            snippet from anywhere on the internet would be a cross-site scripting hole
            on the school&rsquo;s own public domain, and the blocks cover what a school
            page actually needs.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
