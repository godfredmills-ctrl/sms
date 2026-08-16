"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, Paperclip, X } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import { formatBytes } from "@/lib/utils";

type PendingDocument = {
  fileId: string;
  name: string;
  sizeBytes: number;
  category: string;
};

/**
 * Documents attached while creating a person, rather than afterwards.
 *
 * Admission is when the birth certificate and the passport photograph are
 * actually in front of the registrar — sending them to a Documents tab that
 * only exists once the record is saved means the papers get scanned "later",
 * and later is how a school database ends up with four hundred students and
 * sixty birth certificates.
 *
 * Files upload immediately, to the private store, and ride along in the form
 * as hidden JSON. If the form is abandoned the rows are never created and the
 * orphaned objects cost a fraction of a penny — the same trade storeFile
 * already makes.
 */
export function DocumentsField({
  categories,
}: {
  categories: Array<{ value: string; label: string }>;
}) {
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [category, setCategory] = useState(categories[0]?.value ?? "OTHER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/upload", { method: "POST", body });
      const result = (await response.json()) as {
        file?: { id: string; originalName: string; sizeBytes: number };
        error?: string;
      };

      if (!response.ok || !result.file) {
        setError(result.error ?? "The upload failed.");
        return;
      }

      setDocuments((current) => [
        ...current,
        {
          fileId: result.file!.id,
          name: result.file!.originalName,
          sizeBytes: result.file!.sizeBytes,
          category,
        },
      ]);
    } catch {
      setError("The upload could not be sent. Check your connection.");
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = "";
    }
  }

  const labelFor = (value: string) =>
    categories.find((entry) => entry.value === value)?.label ?? value;

  return (
    <div className="space-y-2">
      {/* One hidden input per document; the action parses each as JSON. */}
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

      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <SearchableSelect
            clearable={false}
            value={category}
            onChange={(value) => setCategory(value as string)}
            options={categories}
          />
        </div>
        <button
          type="button"
          onClick={() => picker.current?.click()}
          disabled={busy}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--bg-subtle)] disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>

      <input
        ref={picker}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}

      {documents.length ? (
        <ul className="space-y-1">
          {documents.map((entry) => (
            <li
              key={entry.fileId}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs"
            >
              <Paperclip className="size-3 shrink-0 text-[var(--text-subtle)]" />
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              <span className="shrink-0 rounded bg-[var(--bg)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                {labelFor(entry.category)}
              </span>
              <span className="shrink-0 text-[var(--text-subtle)]">
                {formatBytes(entry.sizeBytes)}
              </span>
              <button
                type="button"
                title="Remove"
                onClick={() =>
                  setDocuments((current) =>
                    current.filter((item) => item.fileId !== entry.fileId),
                  )
                }
                className="shrink-0 rounded p-0.5 text-[var(--text-subtle)] hover:text-[var(--text)]"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--text-subtle)]">
          Nothing attached yet. Documents can also be added from the profile later.
        </p>
      )}
    </div>
  );
}
