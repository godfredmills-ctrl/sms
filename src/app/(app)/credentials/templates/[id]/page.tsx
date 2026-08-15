import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Image as ImageIcon, Minus, QrCode, Square, Type, Variable } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  PageHeader,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseLayout } from "@/lib/templates";
import { humanise } from "@/lib/utils";

import {
  addElementAction,
  setTemplateBackgroundAction,
  updateTemplateAction,
} from "../actions";
import { TemplateCanvas } from "../template-canvas";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const template = await db.documentTemplate.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: template?.name ?? "Template" };
}

export const dynamic = "force-dynamic";

const PALETTE = [
  { type: "text", label: "Fixed text", icon: Type },
  { type: "field", label: "Data field", icon: Variable },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "line", label: "Divider", icon: Minus },
  { type: "box", label: "Box", icon: Square },
  { type: "qr", label: "Verification QR", icon: QrCode },
];

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("assessment.template.manage");
  const { id } = await params;

  const template = await db.documentTemplate.findUnique({
    where: { id },
    include: {
      file: { select: { id: true, originalName: true, mimeType: true } },
      _count: { select: { certificates: true, transcripts: true } },
    },
  });

  if (!template) notFound();

  const layout = parseLayout(template.layout);
  const issued = template._count.certificates + template._count.transcripts;

  return (
    <>
      <PageHeader
        title={template.name}
        description={`${humanise(template.kind)} · ${template.pageSize} ${humanise(template.orientation)}`}
        breadcrumb={
          <Link href="/credentials/templates" className="hover:text-[var(--text)]">
            Document templates
          </Link>
        }
        action={
          <>
            {template.isDefault ? <Badge tone="success">Default</Badge> : null}
            <Badge tone="neutral">
              {template.source === "UPLOAD" ? "Own artwork" : "In-system"}
            </Badge>
          </>
        }
      />

      {issued > 0 ? (
        <Alert tone="warning" className="mb-4">
          {issued} document{issued === 1 ? " has" : "s have"} already been issued from
          this template. Editing it changes nothing already issued — those are stored
          with their own snapshot — but the next one out will look different.
        </Alert>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {PALETTE.map((entry) => {
          const Icon = entry.icon;
          return (
            <form key={entry.type} action={addElementAction}>
              <input type="hidden" name="id" value={template.id} />
              <input type="hidden" name="type" value={entry.type} />
              <Button type="submit" variant="outline" size="sm">
                <Icon className="size-3.5" />
                {entry.label}
              </Button>
            </form>
          );
        })}
      </div>

      <Card className="mb-4">
        <CardBody>
          <TemplateCanvas
            templateId={template.id}
            layout={layout}
            orientation={template.orientation}
          />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Background"
            description={
              template.source === "UPLOAD"
                ? "Your uploaded artwork sits behind every element."
                : "Set a background image or a flat colour."
            }
          />
          <form action={setTemplateBackgroundAction}>
            <CardBody className="space-y-3">
              <input type="hidden" name="id" value={template.id} />
              <Field
                label="Background image URL"
                htmlFor="backgroundUrl"
                hint={
                  template.file
                    ? `Uploaded file: ${template.file.originalName}`
                    : "Upload artwork in the document cabinet and paste its link."
                }
              >
                <Input
                  id="backgroundUrl"
                  name="backgroundUrl"
                  defaultValue={
                    layout.backgroundUrl ??
                    (template.file ? `/api/files/${template.file.id}` : "")
                  }
                />
              </Field>
              <Field label="Background colour" htmlFor="backgroundColour">
                <Input
                  id="backgroundColour"
                  name="backgroundColour"
                  defaultValue={layout.backgroundColour ?? "#ffffff"}
                />
              </Field>
              <Button type="submit" variant="outline" size="sm" className="w-full">
                Apply background
              </Button>
            </CardBody>
          </form>
        </Card>

        <Card>
          <CardHeader title="Template settings" />
          <form action={updateTemplateAction}>
            <CardBody className="space-y-3">
              <input type="hidden" name="id" value={template.id} />
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" defaultValue={template.name} />
              </Field>
              <Field label="Description" htmlFor="description">
                <Input
                  id="description"
                  name="description"
                  defaultValue={template.description ?? ""}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Page size" htmlFor="pageSize">
                  <Input id="pageSize" name="pageSize" defaultValue={template.pageSize} />
                </Field>
                <Field label="Orientation" htmlFor="orientation">
                  <Input
                    id="orientation"
                    name="orientation"
                    defaultValue={template.orientation}
                  />
                </Field>
              </div>
              <Button type="submit" variant="outline" size="sm" className="w-full">
                Save settings
              </Button>
            </CardBody>
          </form>
        </Card>
      </div>

      <Card className="mt-4">
        <CardBody className="text-xs text-[var(--text-muted)]">
          <p className="mb-1.5 font-medium text-[var(--text)]">
            Why positions are percentages
          </p>
          <p>
            Every element is placed as a percentage of the page rather than in
            millimetres, so one layout prints correctly on A4 and Letter, portrait and
            landscape. Change the paper size and nothing needs re-positioning. The
            preview above is rendered at the real aspect ratio with sample values in
            the data fields, because a page full of placeholder names tells you
            nothing about whether a real name will fit.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
