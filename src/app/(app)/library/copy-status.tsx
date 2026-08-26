"use client";

import { useState, useTransition } from "react";

import { COPY_STATUSES } from "@/lib/library";

import { setCopyStatusAction } from "./actions";

/**
 * Marking a copy lost, withdrawn or at the binder.
 *
 * The action for this existed from the start and nothing called it — exported,
 * typechecked, unreachable. So there was no way at all to record a missing
 * book, and the only route back from REPAIR was a bug in the return desk that
 * also un-lost anything else it touched.
 *
 * Rendered as the accession chip itself, so the control is where the copy is
 * rather than behind a menu: the librarian is looking at the row that has the
 * number they are holding.
 */
export function CopyStatusChip({
  copyId,
  accessionNo,
  status,
}: {
  copyId: string;
  accessionNo: string;
  status: string;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tone =
    status === "AVAILABLE"
      ? "border-[var(--success)] text-[var(--success)]"
      : status === "ON_LOAN"
        ? "border-[var(--border)] text-[var(--text-subtle)]"
        : "border-[var(--danger)] text-[var(--danger)]";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${accessionNo}, ${status.toLowerCase().replace(/_/g, " ")}. Change it.`}
        className={`numeric rounded border px-1.5 py-0.5 text-[10px] ${tone}`}
      >
        {accessionNo}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <select
        defaultValue={status}
        disabled={pending}
        aria-label={`Status of copy ${accessionNo}`}
        onChange={(event) => {
          const next = event.target.value;
          start(async () => {
            const data = new FormData();
            data.append("copyId", copyId);
            data.append("status", next);
            const result = await setCopyStatusAction(data);
            setError(result.error ?? null);
            if (!result.error) setOpen(false);
          });
        }}
        className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-[10px]"
      >
        {COPY_STATUSES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        className="text-[10px] text-[var(--text-subtle)]"
      >
        Cancel
      </button>
      {error ? <span className="text-[10px] text-[var(--danger)]">{error}</span> : null}
    </span>
  );
}
