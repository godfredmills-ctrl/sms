"use client";

import { useRef, useState } from "react";
import { Eye, FileText, Loader2, Upload, X } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import { formatBytes } from "@/lib/utils";

type PendingDocument = {
  fileId: string;
  name: string;
  sizeBytes: number;
  category: string;
  mimeType: string;
};

/**
 * Documents attached while creating a person, rather than afterwards.
 *
 * Admission is when the birth certificate and the photograph are actually in
 * front of the registrar — sending them to a Documents tab that only exists
 * once the record is saved means the papers get scanned "later", and later is
 * how a school database ends up with four hundred students and sixty birth
 * certificates.
 *
 * Files upload immediately, to the private store, and ride along in the form
 * as hidden JSON. If the form is abandoned the rows are never created and the
 * orphaned objects cost a fraction of a penny — the same trade storeFile
 * already makes. Because the bytes are already stored, previews come straight
 * from /api/files with its session check: what you see is what was actually
 * received, not what the browser thinks it sent.
 */
export function DocumentsField({
  categories,
}: {
  categories: Array<{ value: string; label: string }>;
}) {
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [category, setCategory] = useState(categories[0]?.value ?? "OTHER");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | File[]) {
    setBusy(true);
    setError(null);

    // Sequential rather than parallel: three scans from a phone camera are
    // big, and racing them through one connection helps nobody.
    for (const file of Array.from(files)) {
      try {
        const body = new FormData();
        body.append("file", file);

        const response = await fetch("/api/upload", { method: "POST", body });
        const result = (await response.json()) as {
          file?: { id: string; originalName: string; sizeBytes: number; mimeType: string };
          error?: string;
        };

        if (!response.ok || !result.file) {
          setError(result.error ?? `"${file.name}" failed to upload.`);
          continue;
        }

        const stored = result.file;
        setDocuments((current) => [
          ...current,
          {
            fileId: stored.id,
            name: stored.originalName,
            sizeBytes: stored.sizeBytes,
            mimeType: stored.mimeType,
            category,
          },
        ]);
      } catch {
        setError("The upload could not be sent. Check your connection.");
        break;
      }
    }

    setBusy(false);
    if (picker.current) picker.current.value = "";
  }

  const labelFor = (value: string) =>
    categories.find((entry) => entry.value === value)?.label ?? value;

  return (
    <div className="space-y-2">
      {documents.map((entry) => (
        <input
          key={entry.fileId}
          type="hidden"
          name="documents"
          value={JSON.stringify({
            fileId: entry.fileId,
            category: entry.category,
            title: entry.name,
          })}
        />
      ))}

      <SearchableSelect
        clearable={false}
        value={category}
        onChange={(value) => setCategory(value as string)}
        options={categories}
      />

      {/* The drop zone doubles as the browse button. dragleave fires on every
          child boundary, so the flag only clears when the pointer actually
          leaves the zone's rectangle. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => picker.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") picker.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          ) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length) void upload(event.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragging
            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
            : "border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]"
        }`}
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin text-[var(--text-subtle)]" />
        ) : (
          <Upload className="size-5 text-[var(--text-subtle)]" />
        )}
        <span className="text-sm font-medium">
          {busy ? "Uploading…" : dragging ? "Drop to upload" : "Drop files here, or browse"}
        </span>
        <span className="text-xs text-[var(--text-subtle)]">
          Filed as “{labelFor(category)}” — change the category above between files.
        </span>
      </div>

      <input
        ref={picker}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) void upload(event.target.files);
        }}
      />

      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}

      {documents.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {documents.map((entry) => {
            const isImage = entry.mimeType.startsWith("image/");
            return (
              <li
                key={entry.fileId}
                className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-2"
              >
                {/* The thumbnail is fetched back from the store, so it shows
                    what was received rather than what was picked. */}
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${entry.fileId}`}
                    alt=""
                    className="size-12 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded bg-[var(--bg)] text-[var(--text-subtle)]">
                    <FileText className="size-5" />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{entry.name}</p>
                  <p className="text-[11px] text-[var(--text-subtle)]">
                    {labelFor(entry.category)} · {formatBytes(entry.sizeBytes)}
                  </p>
                </div>

                <a
                  href={`/api/files/${entry.fileId}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Preview in a new tab"
                  className="shrink-0 rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
                >
                  <Eye className="size-3.5" />
                </a>
                <button
                  type="button"
                  title="Remove"
                  onClick={() =>
                    setDocuments((current) =>
                      current.filter((item) => item.fileId !== entry.fileId),
                    )
                  }
                  className="shrink-0 rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-[var(--text-subtle)]">
          Nothing attached yet. Documents can also be added from the profile later.
        </p>
      )}
    </div>
  );
}
