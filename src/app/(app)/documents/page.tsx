import type { Metadata } from "next";
import { FolderOpen, FolderPlus, HardDrive, Lock } from "lucide-react";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { SearchableSelect } from "@/components/select-search";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { previewKindFor } from "@/lib/storage";
import { formatBytes, slugify } from "@/lib/utils";

import { DocumentsTable, type DocumentRow } from "./documents-table";
import { DocumentUploader } from "./uploader";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

async function createFolder(formData: FormData) {
  "use server";
  const { authorize } = await import("@/lib/auth");
  const user = await authorize("document.folder.manage");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const slug = slugify(name);
  await db.documentFolder.create({
    data: {
      name,
      slug,
      path: `/${slug}`,
      accessLevel: String(formData.get("accessLevel") ?? "STAFF") as never,
      description: String(formData.get("description") ?? "") || null,
      createdById: user.id,
    },
  });

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/documents");
}

export default async function DocumentsPage() {
  const user = await requirePermission("document.read");
  const canUpload = userCan(user, "document.upload");
  const canManageFolders = userCan(user, "document.folder.manage");

  const [folders, documents] = await Promise.all([
    db.documentFolder.findMany({
      orderBy: [{ sortKey: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        accessLevel: true,
        allowedRoleIds: true,
        _count: { select: { documents: true } },
      },
    }),
    db.document.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        title: true,
        tags: true,
        category: true,
        accessLevel: true,
        allowedRoleIds: true,
        version: true,
        createdAt: true,
        fileId: true,
        folder: { select: { name: true, accessLevel: true, allowedRoleIds: true } },
        file: {
          select: {
            mimeType: true,
            extension: true,
            sizeBytes: true,
            uploadedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
  ]);

  // Access is re-checked here rather than assumed from the route: the cabinet
  // mixes school-wide handbooks with restricted board minutes.
  const permits = (level: string, allowedRoleIds: string[]) => {
    switch (level) {
      case "PUBLIC":
      case "SCHOOL_WIDE":
        return true;
      case "STAFF":
        return user.portal === "STAFF";
      case "ROLE_RESTRICTED":
        return allowedRoleIds.some((role) => user.roleKeys.includes(role));
      default:
        return false;
    }
  };

  const isSuperAdmin = user.roleKeys.includes("super_admin");

  // A folder's own access level was stored, selected, displayed — and never
  // consulted. Documents were filtered by their own level only, and a document
  // takes the default STAFF unless somebody sets it, so anything filed into
  // "Board minutes" without being individually restricted was readable by every
  // staff account. The folder is the restriction a school actually configures;
  // putting a document inside one has to mean something.
  const folderPermits = (
    folder: { accessLevel: string; allowedRoleIds: string[] } | null,
  ) => !folder || permits(folder.accessLevel, folder.allowedRoleIds);

  const visible = documents.filter(
    (document) =>
      isSuperAdmin ||
      (folderPermits(document.folder) &&
        permits(document.accessLevel, document.allowedRoleIds)),
  );

  const visibleFolders = folders.filter(
    (folder) => isSuperAdmin || permits(folder.accessLevel, folder.allowedRoleIds),
  );

  const rows: DocumentRow[] = visible.map((document) => ({
    id: document.id,
    fileId: document.fileId,
    title: document.title,
    folder: document.folder?.name ?? "Unfiled",
    category: document.category,
    tags: document.tags,
    mimeType: document.file.mimeType,
    extension: document.file.extension,
    sizeBytes: document.file.sizeBytes,
    accessLevel: document.accessLevel,
    version: document.version,
    uploadedBy: document.file.uploadedBy
      ? `${document.file.uploadedBy.firstName} ${document.file.uploadedBy.lastName}`
      : null,
    createdAt: document.createdAt.toISOString(),
    previewKind: previewKindFor(document.file.mimeType),
  }));

  const totalBytes = rows.reduce((sum, row) => sum + row.sizeBytes, 0);
  const restricted = rows.filter((row) =>
    ["ROLE_RESTRICTED", "PRIVATE"].includes(row.accessLevel),
  ).length;

  return (
    <>
      <PageHeader
        title="Document Cabinet"
        description="Policies, circulars, minutes and records — with access control and previews."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Documents"
          value={rows.length.toLocaleString()}
          tone="violet"
          icon={<FolderOpen className="size-4" />}
        />
        <StatCard label="Folders" value={visibleFolders.length} tone="info" />
        <StatCard
          label="Storage used"
          value={formatBytes(totalBytes)}
          tone="teal"
          icon={<HardDrive className="size-4" />}
        />
        <StatCard
          label="Restricted"
          value={restricted}
          tone={restricted ? "warning" : "success"}
          icon={<Lock className="size-4" />}
          hint="Role-limited or private"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          {canUpload && visibleFolders.length ? (
            <Card>
              <CardHeader title="Upload" description="Drag a file in, or browse." />
              <DocumentUploader
                folders={visibleFolders.map((folder) => ({
                  value: folder.id,
                  label: folder.name,
                  description: `${folder._count.documents} documents`,
                }))}
              />
            </Card>
          ) : null}

          {canManageFolders ? (
            <Card>
              <CardHeader title="New folder" />
              <form action={createFolder}>
                <CardBody className="space-y-3">
                  <Field label="Name" htmlFor="name" required>
                    <Input id="name" name="name" required placeholder="Examinations" />
                  </Field>
                  <Field label="Description" htmlFor="description">
                    <Input id="description" name="description" />
                  </Field>
                  <Field label="Default access" htmlFor="accessLevel">
                    <SearchableSelect
                      id="accessLevel"
                      name="accessLevel"
                      clearable={false}
                      defaultValue="STAFF"
                      options={[
                        { value: "STAFF", label: "All staff" },
                        { value: "ROLE_RESTRICTED", label: "Restricted roles" },
                        { value: "SCHOOL_WIDE", label: "School-wide" },
                      ]}
                    />
                  </Field>
                  <Button type="submit" variant="outline" className="w-full">
                    <FolderPlus className="size-4" />
                    Create folder
                  </Button>
                </CardBody>
              </form>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Folders" />
            <ul className="divide-y divide-[var(--border)]">
              {visibleFolders.map((folder) => (
                <li
                  key={folder.id}
                  className="flex items-center gap-2.5 px-5 py-2.5 text-sm"
                >
                  <FolderOpen className="size-4 shrink-0 text-[var(--text-subtle)]" />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <span className="numeric text-xs text-[var(--text-subtle)]">
                    {folder._count.documents}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <DocumentsTable rows={rows} />
      </div>
    </>
  );
}
