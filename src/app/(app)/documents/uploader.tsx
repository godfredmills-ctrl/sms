"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, FileCheck2, X } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import { Alert, Button, Field, Input } from "@/components/ui";
import { cn, formatBytes } from "@/lib/utils";

const ACCESS_LEVELS = [
  { value: "STAFF", label: "All staff", description: "Anyone with a staff login" },
  { value: "ROLE_RESTRICTED", label: "Restricted", description: "Selected roles only" },
  { value: "SCHOOL_WIDE", label: "School-wide", description: "Staff, students and parents" },
  { value: "PRIVATE", label: "Private", description: "Only me" },
];

/**
 * Upload with drag-and-drop.
 *
 * Uses a plain fetch to /api/upload rather than a server action: a server
 * action would buffer the whole file through the action payload, and this way
 * the browser reports progress and the size limit is enforced before a large
 * file is sent at all.
 */
export function DocumentUploader({
  folders,
}: {
  folders: Array<{ value: string; label: string; description?: string }>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [folderId, setFolderId] = useState(folders[0]?.value ?? "");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    { tone: "success" | "danger"; message: string } | null
  >(null);

  async function submit(formData: FormData) {
    if (!file) return;
    setBusy(true);
    setResult(null);

    formData.set("file", file);
    formData.set("folderId", folderId);

    try {
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setResult({ tone: "danger", message: body.error ?? "Upload failed." });
        return;
      }

      setResult({ tone: "success", message: `"${file.name}" uploaded.` });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (error) {
      setResult({ tone: "danger", message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={submit} className="space-y-4 p-5">
      {result ? <Alert tone={result.tone}>{result.message}</Alert> : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files?.[0];
          if (dropped) setFile(dropped);
        }}
        className={cn(
          "rounded-xl border-2 border-dashed p-6 text-center transition-colors",
          dragging
            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
            : "border-[var(--border-strong)]",
        )}
      >
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileCheck2 className="size-5 text-[var(--success)]" />
            <div className="min-w-0 text-left">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-[var(--text-subtle)]">{formatBytes(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              aria-label="Remove file"
              className="rounded p-1 text-[var(--text-subtle)] hover:text-[var(--text)]"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <>
            <CloudUpload className="mx-auto mb-2 size-6 text-[var(--text-subtle)]" />
            <p className="text-sm">Drop a file here, or</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => inputRef.current?.click()}
            >
              Choose a file
            </Button>
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              PDF, images, Word, Excel, PowerPoint — up to 25MB
            </p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </div>

      <Field label="Folder" required>
        <SearchableSelect
          clearable={false}
          options={folders}
          value={folderId}
          onChange={(next) => setFolderId(next as string)}
          placeholder="Choose a folder…"
        />
      </Field>

      <Field label="Title" htmlFor="title" hint="Defaults to the file name.">
        <Input id="title" name="title" placeholder="Staff handbook 2026" />
      </Field>

      <Field label="Tags" htmlFor="tags" hint="Comma separated — these drive the filters.">
        <Input id="tags" name="tags" placeholder="policy, hr, 2026" />
      </Field>

      <Field label="Who can see it" htmlFor="accessLevel">
        <SearchableSelect
          id="accessLevel"
          name="accessLevel"
          clearable={false}
          defaultValue="STAFF"
          options={ACCESS_LEVELS}
        />
      </Field>

      <Button type="submit" className="w-full" disabled={!file || !folderId || busy}>
        <CloudUpload className="size-4" />
        {busy ? "Uploading…" : "Upload document"}
      </Button>
    </form>
  );
}
