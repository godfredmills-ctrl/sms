"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { deleteAssessment } from "../actions";

/**
 * Removes an assessment column, and the marks in it.
 *
 * The action has always existed — scoped to the teacher, refusing anything
 * published — and nothing called it, so a column created by a slip of the
 * keyboard stayed in the gradebook and on every average computed from it for
 * the rest of the term.
 *
 * It says how many marks go with it before it does anything, because the
 * count is the part a teacher will not have in mind and the part they cannot
 * get back.
 */
export function DeleteAssessment({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title={`Delete ${title}`}
        aria-label={`Delete the assessment ${title}`}
        className="mt-0.5 text-[var(--text-subtle)] hover:text-[var(--danger)]"
      >
        <Trash2 className="mx-auto size-3" />
      </button>
    );
  }

  return (
    <span className="mt-1 flex flex-col items-center gap-0.5 text-[10px] font-normal">
      <span className="text-[var(--text-muted)]">Delete, with its marks?</span>
      <span className="flex gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await deleteAssessment(id);
              setError(result?.error ?? null);
              if (!result?.error) setConfirming(false);
            })
          }
          className="font-semibold text-[var(--danger)]"
        >
          {pending ? "Deleting…" : "Yes"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          className="text-[var(--text-subtle)]"
        >
          Cancel
        </button>
      </span>
      {error ? (
        <span className="max-w-40 text-[var(--danger)]">{error}</span>
      ) : null}
    </span>
  );
}
