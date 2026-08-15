"use client";

import { useState } from "react";
import { Download, Eye, X } from "lucide-react";

import { DataTable, TagList, type Column } from "@/components/data-table";
import { Badge, Button } from "@/components/ui";
import { formatBytes, formatDate, humanise } from "@/lib/utils";

export type DocumentRow = {
  id: string;
  fileId: string;
  title: string;
  folder: string;
  category: string | null;
  tags: string[];
  mimeType: string;
  extension: string | null;
  sizeBytes: number;
  accessLevel: string;
  version: number;
  uploadedBy: string | null;
  createdAt: string;
  previewKind: "image" | "pdf" | "text" | "office" | "none";
};

export function DocumentsTable({ rows }: { rows: DocumentRow[] }) {
  const [preview, setPreview] = useState<DocumentRow | null>(null);

  const columns: Array<Column<DocumentRow>> = [
    {
      id: "title",
      header: "Document",
      accessor: (row) => row.title,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.title}</p>
          <p className="truncate text-xs text-[var(--text-subtle)]">
            {(row.extension ?? "file").toUpperCase()} · {formatBytes(row.sizeBytes)}
            {row.version > 1 ? ` · v${row.version}` : ""}
          </p>
        </div>
      ),
    },
    {
      id: "folder",
      header: "Folder",
      accessor: (row) => row.folder,
      filter: { type: "select", label: "Folder" },
    },
    {
      id: "tags",
      header: "Tags",
      accessor: (row) => row.tags.join(", "),
      cell: (row) => <TagList tags={row.tags} tone="info" />,
      filter: { type: "tags", label: "Tag" },
      sortable: false,
      priority: 2,
    },
    {
      id: "access",
      header: "Access",
      accessor: (row) => row.accessLevel,
      cell: (row) => (
        <Badge tone={row.accessLevel === "PRIVATE" ? "danger" : "neutral"}>
          {humanise(row.accessLevel)}
        </Badge>
      ),
      filter: { type: "select", label: "Access level" },
      priority: 2,
    },
    {
      id: "uploadedBy",
      header: "Uploaded by",
      accessor: (row) => row.uploadedBy ?? "",
      priority: 3,
    },
    {
      id: "createdAt",
      header: "Uploaded",
      accessor: (row) => row.createdAt,
      cell: (row) => formatDate(row.createdAt),
      priority: 2,
    },
    {
      id: "actions",
      header: "",
      sortable: false,
      searchable: false,
      width: "96px",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            title="Preview"
            onClick={() => setPreview(row)}
          >
            <Eye className="size-3.5" />
          </Button>
          <a
            href={`/api/files/${row.fileId}?download=1`}
            className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
            title="Download"
          >
            <Download className="size-3.5" />
          </a>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        storageKey="documents"
        exportFileName="documents"
        searchPlaceholder="Search by title, folder or tag…"
        emptyTitle="No documents"
        emptyDescription="Upload one using the panel on the left."
        initialSort={{ columnId: "createdAt", direction: "desc" }}
      />

      {/* Preview overlay. Everything is served through /api/files so access is
          re-checked on the request, not assumed from the table. */}
      {preview ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <button
            type="button"
            aria-label="Close preview"
            className="absolute inset-0 cursor-default"
            onClick={() => setPreview(null)}
          />
          <div className="card relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{preview.title}</p>
                <p className="text-xs text-[var(--text-subtle)]">
                  {(preview.extension ?? "file").toUpperCase()} ·{" "}
                  {formatBytes(preview.sizeBytes)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/files/${preview.fileId}?download=1`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-xs font-medium"
                >
                  <Download className="size-3.5" />
                  Download
                </a>
                <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-[var(--bg-inset)]">
              {preview.previewKind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/files/${preview.fileId}`}
                  alt={preview.title}
                  className="mx-auto max-h-[75vh] object-contain"
                />
              ) : preview.previewKind === "pdf" ? (
                <iframe
                  src={`/api/files/${preview.fileId}`}
                  title={preview.title}
                  className="h-[75vh] w-full"
                />
              ) : preview.previewKind === "text" ? (
                <iframe
                  src={`/api/files/${preview.fileId}`}
                  title={preview.title}
                  className="h-[75vh] w-full bg-white"
                />
              ) : (
                <div className="p-12 text-center">
                  <p className="text-sm font-medium">
                    {preview.previewKind === "office"
                      ? "Office documents cannot be previewed in the browser"
                      : "This file type has no preview"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Download it to open in the appropriate application.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
