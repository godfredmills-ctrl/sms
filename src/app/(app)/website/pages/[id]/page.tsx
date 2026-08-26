import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { ImageField } from "@/components/image-field";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { BLOCK_DEFS, blockDef, parseBlocks } from "@/lib/site-blocks";

import {
  addBlockAction,
  deleteBlockAction,
  moveBlockAction,
  togglePagePublishedAction,
  updateBlockAction,
  updatePageAction,
} from "../../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const page = await db.sitePage.findUnique({
    where: { id },
    select: { title: true },
  });
  return { title: page?.title ?? "Page" };
}

export const dynamic = "force-dynamic";

export default async function EditPagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("website.manage");
  const { id } = await params;

  const page = await db.sitePage.findUnique({
    where: { id },
    include: { site: { select: { name: true, isPublished: true } } },
  });

  if (!page) notFound();

  const blocks = parseBlocks(page.blocks);
  const canPublish = userCan(user, "website.publish");

  return (
    <>
      <PageHeader
        title={page.title}
        description={`/site/${page.slug} · ${page.site.name}`}
        breadcrumb={
          <Link href="/website" className="hover:text-[var(--text)]">
            Website
          </Link>
        }
        action={
          <>
            <Badge tone={page.status === "PUBLISHED" ? "success" : "warning"}>
              {page.status}
            </Badge>
            <Link
              href={`/site/${page.slug}`}
              target="_blank"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--bg-subtle)]"
            >
              <ExternalLink className="size-4" />
              Preview
            </Link>
            {canPublish ? (
              <form action={togglePagePublishedAction}>
                <input type="hidden" name="id" value={page.id} />
                <Button type="submit" disabled={page.status !== "PUBLISHED" && !blocks.length}>
                  {page.status === "PUBLISHED" ? (
                    <>
                      <EyeOff className="size-4" />
                      Unpublish
                    </>
                  ) : (
                    <>
                      <Eye className="size-4" />
                      Publish page
                    </>
                  )}
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      {page.status === "PUBLISHED" && !page.site.isPublished ? (
        <Alert tone="info" className="mb-4">
          This page is published but the site itself is offline, so nobody outside the
          school can see it yet.
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {blocks.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Plus className="size-5" />}
                title="No blocks yet"
                description="Add one from the palette on the right: a hero banner is the usual place to start."
              />
            </Card>
          ) : null}

          {blocks.map((block, index) => {
            const def = blockDef(block.type);
            if (!def) return null;

            return (
              <Card key={block.id}>
                <CardHeader
                  title={def.label}
                  description={def.description}
                  action={
                    <>
                      <form action={moveBlockAction}>
                        <input type="hidden" name="pageId" value={page.id} />
                        <input type="hidden" name="blockId" value={block.id} />
                        <input type="hidden" name="direction" value="up" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={index === 0}
                          title="Move up"
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                      </form>
                      <form action={moveBlockAction}>
                        <input type="hidden" name="pageId" value={page.id} />
                        <input type="hidden" name="blockId" value={block.id} />
                        <input type="hidden" name="direction" value="down" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={index === blocks.length - 1}
                          title="Move down"
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                      </form>
                      <form action={deleteBlockAction}>
                        <input type="hidden" name="pageId" value={page.id} />
                        <input type="hidden" name="blockId" value={block.id} />
                        <Button type="submit" variant="ghost" size="sm" title="Remove">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </form>
                    </>
                  }
                />

                <form action={updateBlockAction}>
                  <CardBody className="space-y-3">
                    <input type="hidden" name="pageId" value={page.id} />
                    <input type="hidden" name="blockId" value={block.id} />

                    {def.fields.map((field) => (
                      <Field
                        key={field.key}
                        label={field.label}
                        htmlFor={`${block.id}-${field.key}`}
                        hint={field.hint}
                      >
                        {field.kind === "textarea" || field.kind === "list" ? (
                          <Textarea
                            id={`${block.id}-${field.key}`}
                            name={field.key}
                            rows={field.kind === "list" ? 4 : 3}
                            defaultValue={block.props[field.key] ?? ""}
                          />
                        ) : field.kind === "image" ? (
                          // An upload control, not a URL box — pasting
                          // addresses is the flow that produced images that
                          // rendered on screen and nowhere else.
                          <ImageField
                            id={`${block.id}-${field.key}`}
                            name={field.key}
                            defaultValue={block.props[field.key] ?? ""}
                          />
                        ) : (
                          <Input
                            id={`${block.id}-${field.key}`}
                            name={field.key}
                            defaultValue={block.props[field.key] ?? ""}
                          />
                        )}
                      </Field>
                    ))}

                    <Button type="submit" variant="outline" size="sm">
                      Save block
                    </Button>
                  </CardBody>
                </form>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Add a block" />
            <CardBody className="space-y-1.5">
              {BLOCK_DEFS.map((def) => (
                <form key={def.type} action={addBlockAction}>
                  <input type="hidden" name="pageId" value={page.id} />
                  <input type="hidden" name="type" value={def.type} />
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-[var(--border)] p-2.5 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--bg-subtle)]"
                  >
                    <span className="block text-sm font-medium">{def.label}</span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      {def.description}
                    </span>
                  </button>
                </form>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Page settings" />
            <form action={updatePageAction}>
              <CardBody className="space-y-3">
                <input type="hidden" name="id" value={page.id} />

                <Field label="Title" htmlFor="title">
                  <Input id="title" name="title" defaultValue={page.title} />
                </Field>
                <Field label="Search engine title" htmlFor="metaTitle">
                  <Input
                    id="metaTitle"
                    name="metaTitle"
                    defaultValue={page.metaTitle ?? ""}
                  />
                </Field>
                <Field label="Description" htmlFor="metaDescription">
                  <Textarea
                    id="metaDescription"
                    name="metaDescription"
                    rows={2}
                    defaultValue={page.metaDescription ?? ""}
                  />
                </Field>

                <div className="space-y-2">
                  <CheckboxField
                    name="isHomePage"
                    defaultChecked={page.isHomePage}
                    label="This is the home page"
                    description="Only one page can be the home page."
                  />
                  <CheckboxField
                    name="noIndex"
                    defaultChecked={page.noIndex}
                    label="Hide from search engines"
                  />
                </div>

                <Button type="submit" variant="outline" size="sm" className="w-full">
                  Save page settings
                </Button>
              </CardBody>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
