import type { Metadata } from "next";
import { Download, FileText, FolderOpen } from "lucide-react";

import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBytes, formatDate, fullName } from "@/lib/utils";

import { NotLinked } from "../not-linked";
import { wardIdsFor } from "../wards";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

export default async function GuardianDocumentsPage() {
  const user = await requireUser();
  if (!user.guardianId) return <NotLinked title="Documents" />;

  const studentIds = await wardIdsFor(user.guardianId);
  if (!studentIds.length) return <NotLinked title="Documents" />;

  const [shared, personal] = await Promise.all([
    // School-wide and public documents only. Staff-level and role-restricted
    // material is never surfaced in a parent portal, whatever its folder.
    db.document.findMany({
      where: {
        isArchived: false,
        accessLevel: { in: ["PUBLIC", "SCHOOL_WIDE"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        category: true,
        createdAt: true,
        fileId: true,
        folder: { select: { name: true } },
        file: { select: { sizeBytes: true, extension: true } },
      },
    }),
    // A guardian sees the documents held on their own child's file. There is no
    // separate visibility flag because there does not need to be: these are the
    // child's records, and the guardian is who the school holds them for.
    db.studentDocument.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { uploadedAt: "desc" },
      include: {
        file: { select: { id: true, sizeBytes: true, extension: true } },
        student: { select: { firstName: true, lastName: true, otherNames: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Documents"
        description="School handbooks and circulars, plus documents held on your children's files."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Your children's documents"
            description="Records held on your children's files."
          />
          {personal.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {personal.map((document) => (
                <li key={document.id} className="px-5 py-3">
                  <a
                    href={`/api/files/${document.file.id}?download=1`}
                    className="flex items-center gap-2.5 hover:text-[var(--primary)]"
                  >
                    <FileText className="size-4 shrink-0 text-[var(--text-subtle)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {document.title}
                      </span>
                      <span className="block truncate text-xs text-[var(--text-subtle)]">
                        {fullName(document.student)} ·{" "}
                        {(document.file.extension ?? "file").toUpperCase()} ·{" "}
                        {formatBytes(document.file.sizeBytes)} ·{" "}
                        {formatDate(document.uploadedAt)}
                      </span>
                    </span>
                    <Download className="size-3.5 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<FolderOpen className="size-5" />}
              title="Nothing shared yet"
              description="Birth certificates, medical forms and similar records appear here when the school makes them visible."
            />
          )}
        </Card>

        <Card>
          <CardHeader
            title="School documents"
            description="Handbooks, policies and circulars."
          />
          {shared.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {shared.map((document) => (
                <li key={document.id} className="px-5 py-3">
                  <a
                    href={`/api/files/${document.fileId}?download=1`}
                    className="flex items-center gap-2.5 hover:text-[var(--primary)]"
                  >
                    <FileText className="size-4 shrink-0 text-[var(--text-subtle)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {document.title}
                      </span>
                      <span className="block truncate text-xs text-[var(--text-subtle)]">
                        {document.folder?.name ?? document.category ?? "General"} ·{" "}
                        {formatBytes(document.file.sizeBytes)} ·{" "}
                        {formatDate(document.createdAt)}
                      </span>
                    </span>
                    <Download className="size-3.5 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<FolderOpen className="size-5" />}
              title="No school documents published"
            />
          )}
        </Card>
      </div>
    </>
  );
}
