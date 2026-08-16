"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2, X } from "lucide-react";

/**
 * A text field for an image address, with an upload button that fills it in.
 *
 * The field it replaces asked schools to upload artwork elsewhere, copy the
 * link and paste it back. That worked, but it is three steps to do one thing,
 * and it left people holding a URL whose exact form mattered — the address
 * copied out of a browser is absolute, and the renderers that read it were
 * fussy about that. Uploading here produces the right form by construction.
 *
 * The text input stays, and stays editable. A school that already has an
 * address, or that wants to point at an image in the media library, should not
 * have to re-upload it to use this screen.
 *
 * Everything uploaded here is published rather than filed privately. These are
 * logos, crests and letterhead — images whose whole purpose is to be seen — and
 * they appear on pages nobody signs in for: the login screen, the public site,
 * the verification page a scanned certificate leads to. A privately filed image
 * would load for the staff member who uploaded it and 401 for everyone else,
 * which is a bug that only shows up in front of the people it matters to.
 * Making that a choice on the form would only mean choosing wrong.
 */
export function ImageField({
  name,
  id,
  defaultValue = "",
  /** Sent to /api/upload; only images are offered. */
  accept = "image/*",
}: {
  name: string;
  id?: string;
  defaultValue?: string;
  accept?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("visibility", "public");

      const response = await fetch("/api/upload", { method: "POST", body });
      const result = (await response.json()) as {
        ok?: boolean;
        file?: { url: string };
        error?: string;
      };

      if (!response.ok || !result.file) {
        setError(result.error ?? "The upload failed.");
        return;
      }
      setValue(result.file.url);
    } catch {
      setError("The upload could not be sent. Check your connection.");
    } finally {
      setBusy(false);
      // Clearing lets the same file be chosen again after a failure.
      if (picker.current) picker.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          id={id ?? name}
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-sm outline-none focus:border-[var(--primary)]"
          placeholder="Upload an image, or paste an address"
        />
        <button
          type="button"
          onClick={() => picker.current?.click()}
          disabled={busy}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--bg-subtle)] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImageUp className="size-4" />
          )}
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>

      <input
        ref={picker}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}

      {value ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-2">
          {/* Next's image component wants known dimensions and a configured
              host; this is an arbitrary address the school just typed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            className="size-12 shrink-0 rounded object-contain"
          />
          <p className="min-w-0 flex-1 truncate text-xs text-[var(--text-subtle)]">
            {value}
          </p>
          <button
            type="button"
            onClick={() => setValue("")}
            title="Clear"
            className="shrink-0 rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
