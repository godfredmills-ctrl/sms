import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";

import { MarkdownPreview } from "@/components/rich-text";
import { Badge, LinkButton, PageHeader } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseMarkdown } from "@/lib/markdown";
import { formatDateTime } from "@/lib/utils";

import { DOCUMENT_KINDS } from "../kinds";
import { DocumentEditor } from "../editor";
import { peopleForPickers } from "../people";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const document = await db.writtenDocument.findUnique({
    where: { id },
    select: { title: true },
  });
  return { title: document?.title ?? "Document" };
}

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("letter.read");
  const { id } = await params;

  const document = await db.writtenDocument.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      reference: true,
      title: true,
      body: true,
      recipient: true,
      salutation: true,
      closing: true,
      signatoryName: true,
      signatoryTitle: true,
      footnote: true,
      status: true,
      finalisedAt: true,
      updatedAt: true,
      aboutStaffId: true,
      aboutStudentId: true,
      author: { select: { firstName: true, lastName: true } },
    },
  });

  if (!document) notFound();

  const canWrite = userCan(user, "letter.write");
  const { staff, students } = canWrite
    ? await peopleForPickers()
    : { staff: [], students: [] };

  return (
    <div>
      <PageHeader
        title={document.title}
        description={
          [
            DOCUMENT_KINDS.find((entry) => entry.value === document.kind)?.label,
            document.reference,
            document.author
              ? `written by ${document.author.firstName} ${document.author.lastName}`
              : null,
            document.finalisedAt
              ? `issued ${formatDateTime(document.finalisedAt)}`
              : `last edited ${formatDateTime(document.updatedAt)}`,
          ]
            .filter(Boolean)
            .join("  ·  ")
        }
        breadcrumb={
          <Link href="/letters" className="hover:text-[var(--text)]">
            Letters &amp; reports
          </Link>
        }
        action={
          <>
            <Badge tone={document.status === "FINAL" ? "success" : "warning"}>
              {document.status === "FINAL" ? "Final" : "Draft"}
            </Badge>
            <LinkButton
              href={`/api/written/${document.id}`}
              target="_blank"
              size="sm"
              variant="secondary"
            >
              <Printer className="size-4" />
              Print
            </LinkButton>
          </>
        }
      />

      {canWrite ? (
        <DocumentEditor
          draft={{
            id: document.id,
            kind: document.kind,
            reference: document.reference ?? "",
            title: document.title,
            body: document.body,
            recipient: document.recipient.join("\n"),
            salutation: document.salutation ?? "",
            closing: document.closing ?? "",
            signatoryName: document.signatoryName ?? "",
            signatoryTitle: document.signatoryTitle ?? "",
            footnote: document.footnote ?? "",
            status: document.status,
            aboutStaffId: document.aboutStaffId ?? "",
            aboutStudentId: document.aboutStudentId ?? "",
          }}
          staff={staff}
          students={students}
          canFinalise={userCan(user, "letter.finalise")}
        />
      ) : (
        <ReadOnly body={document.body} />
      )}
    </div>
  );
}

/** For someone who may read the register but not write in it. */
function ReadOnly({ body }: { body: string }) {
  return (
    <div className="card p-6">
      <MarkdownPreview blocks={parseMarkdown(body)} />
    </div>
  );
}
