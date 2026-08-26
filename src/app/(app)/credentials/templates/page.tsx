import type { Metadata } from "next";
import Link from "next/link";
import { FileImage, LayoutTemplate, Star, Trash2, Upload } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBytes, humanise, relativeTime } from "@/lib/utils";
import { parseLayout } from "@/lib/templates";

import { deleteTemplateAction, setDefaultTemplateAction } from "./actions";
import { TemplateForm } from "./template-form";

export const metadata: Metadata = { title: "Document templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requirePermission("assessment.template.manage");

  const [templates, files] = await Promise.all([
    db.documentTemplate.findMany({
      orderBy: [{ kind: "asc" }, { isDefault: "desc" }, { name: "asc" }],
      include: {
        file: { select: { originalName: true, sizeBytes: true } },
        _count: { select: { certificates: true, transcripts: true } },
      },
    }),
    db.fileAsset.findMany({
      where: {
        OR: [
          { mimeType: { startsWith: "image/" } },
          { mimeType: "application/pdf" },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, originalName: true, sizeBytes: true, mimeType: true },
    }),
  ]);

  const byKind = new Map<string, typeof templates>();
  for (const template of templates) {
    const list = byKind.get(template.kind) ?? [];
    list.push(template);
    byKind.set(template.kind, list);
  }

  const missingDefault = [...byKind.entries()].filter(
    ([, list]) => !list.some((template) => template.isDefault && template.isActive),
  );

  return (
    <>
      <PageHeader
        title="Document templates"
        description="Design transcripts and certificates in the system, or position fields on your own artwork."
        breadcrumb={
          <Link href="/credentials" className="hover:text-[var(--text)]">
            Transcripts &amp; certificates
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Templates"
          value={templates.length}
          tone="violet"
          icon={<LayoutTemplate className="size-4" />}
        />
        <StatCard
          label="Designed in-system"
          value={templates.filter((template) => template.source === "BUILDER").length}
          tone="info"
        />
        <StatCard
          label="From uploaded artwork"
          value={templates.filter((template) => template.source === "UPLOAD").length}
          tone="teal"
          icon={<Upload className="size-4" />}
        />
        <StatCard
          label="Documents issued"
          value={templates.reduce(
            (sum, template) =>
              sum + template._count.certificates + template._count.transcripts,
            0,
          )}
          tone="success"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {templates.length === 0 ? (
            <Card>
              <EmptyState
                icon={<LayoutTemplate className="size-5" />}
                title="No templates yet"
                description="Create one on the right: a new certificate starts from a working layout, not a blank page."
              />
            </Card>
          ) : null}

          {[...byKind.entries()].map(([kind, list]) => (
            <Card key={kind}>
              <CardHeader
                title={humanise(kind)}
                description={`${list.length} template${list.length === 1 ? "" : "s"}`}
                action={
                  missingDefault.some(([entry]) => entry === kind) ? (
                    <Badge tone="warning">No default set</Badge>
                  ) : null
                }
              />
              <ul className="divide-y divide-[var(--border)]">
                {list.map((template) => {
                  const layout = parseLayout(template.layout);
                  const issued =
                    template._count.certificates + template._count.transcripts;

                  return (
                    <li
                      key={template.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/credentials/templates/${template.id}`}
                            className={`text-sm font-medium hover:text-[var(--primary)] ${
                              template.isActive
                                ? ""
                                : "text-[var(--text-subtle)] line-through"
                            }`}
                          >
                            {template.name}
                          </Link>
                          {template.isDefault ? (
                            <Badge tone="success">
                              <Star className="size-2.5" />
                              Default
                            </Badge>
                          ) : null}
                          <Badge tone="neutral">
                            {template.source === "UPLOAD" ? (
                              <>
                                <FileImage className="size-2.5" />
                                Own artwork
                              </>
                            ) : (
                              "In-system"
                            )}
                          </Badge>
                        </div>
                        <p className="text-xs text-[var(--text-subtle)]">
                          {template.pageSize} {humanise(template.orientation)} ·{" "}
                          {layout.elements.length} element
                          {layout.elements.length === 1 ? "" : "s"}
                          {template.file
                            ? ` · ${template.file.originalName} (${formatBytes(template.file.sizeBytes)})`
                            : ""}
                          {issued ? ` · ${issued} issued` : ""} · updated{" "}
                          {relativeTime(template.updatedAt)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {!template.isDefault && template.isActive ? (
                          <form action={setDefaultTemplateAction}>
                            <input type="hidden" name="id" value={template.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              Make default
                            </Button>
                          </form>
                        ) : null}
                        <form action={deleteTemplateAction}>
                          <input type="hidden" name="id" value={template.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            title={
                              issued
                                ? "Retire: it has already issued documents"
                                : "Delete"
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="New template" />
            <TemplateForm
              files={files.map((file) => ({
                value: file.id,
                label: file.originalName,
                description: `${file.mimeType} · ${formatBytes(file.sizeBytes)}`,
              }))}
            />
          </Card>

          <Card>
            <CardBody className="text-xs text-[var(--text-muted)]">
              <p className="mb-1.5 font-medium text-[var(--text)]">
                Templates that have issued documents are retired, not deleted
              </p>
              <p>
                An issued certificate points back at the template that produced it.
                Deleting the template would leave a document that cannot explain how
                it was made, which is exactly what a verifier needs.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
