"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";

import { deletePaperAction, savePaperAction, type ExamState } from "../actions";

export type PaperDraft = {
  id: string;
  subjectId: string;
  classLevelId: string;
  title: string;
  /** "2026-03-16T09:00", the shape a datetime-local input wants. */
  startsAt: string;
  durationMins: number;
  maxMarks: string;
  weight: string;
  materials: string;
  notes: string;
};

export type Option = { id: string; name: string };

/**
 * Adding a paper to the timetable.
 *
 * A paper is a subject for a year group at an hour — not for a class. A year
 * group sits a subject together, in one hall, from one paper; splitting it by
 * class would mean two sets of questions and two sets of marks that a report
 * card then has to reconcile.
 */
export function PaperEditor({
  sessionId,
  subjects,
  levels,
  defaultDate,
}: {
  sessionId: string;
  subjects: Option[];
  levels: Option[];
  /** The first day of the examinations, so a new paper lands inside them. */
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add a paper
      </Button>
    );
  }

  return (
    <PaperForm
      sessionId={sessionId}
      subjects={subjects}
      levels={levels}
      defaultDate={defaultDate}
      onDone={() => setOpen(false)}
    />
  );
}

export function PaperForm({
  sessionId,
  draft,
  subjects,
  levels,
  defaultDate,
  onDone,
}: {
  sessionId: string;
  draft?: PaperDraft;
  subjects: Option[];
  levels: Option[];
  defaultDate: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ExamState, FormData>(savePaperAction, {});

  return (
    <form
      action={action}
      className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      {draft ? <input type="hidden" name="id" value={draft.id} /> : null}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--text)]">
          {draft ? "Edit paper" : "New paper"}
        </p>
        <button type="button" onClick={onDone} aria-label="Close">
          <X className="size-4 text-[var(--text-muted)]" />
        </button>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Subject" htmlFor="pp-subject" required>
          <Select id="pp-subject" name="subjectId" required defaultValue={draft?.subjectId}>
            <option value="">Choose…</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Year group" htmlFor="pp-level" required>
          <Select id="pp-level" name="classLevelId" required defaultValue={draft?.classLevelId}>
            <option value="">Choose…</option>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Starts" htmlFor="pp-when" required>
          <Input
            id="pp-when"
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={draft?.startsAt ?? `${defaultDate}T09:00`}
          />
        </Field>
        <Field label="Minutes" htmlFor="pp-mins" required>
          <Input
            id="pp-mins"
            name="durationMins"
            inputMode="numeric"
            required
            defaultValue={String(draft?.durationMins ?? 90)}
          />
        </Field>
        <Field label="Out of" htmlFor="pp-marks">
          <Input
            id="pp-marks"
            name="maxMarks"
            inputMode="numeric"
            defaultValue={draft?.maxMarks}
            placeholder="100"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Weight (%)"
          htmlFor="pp-weight"
          hint="Its share of the subject mark. Needed before marks can be entered."
        >
          <Input
            id="pp-weight"
            name="weight"
            inputMode="decimal"
            defaultValue={draft?.weight}
            placeholder="70"
          />
        </Field>
      </div>

      <Field label="Part" htmlFor="pp-title" hint="&ldquo;Paper 1&rdquo;, &ldquo;Objective&rdquo;. Leave empty if there is only one.">
        <Input id="pp-title" name="title" defaultValue={draft?.title} />
      </Field>

      <Field
        label="What to bring"
        htmlFor="pp-materials"
        hint="Printed on the timetable and the candidate slip."
      >
        <Input
          id="pp-materials"
          name="materials"
          defaultValue={draft?.materials}
          placeholder="Calculator, mathematical set"
        />
      </Field>

      <Field label="Notes" htmlFor="pp-notes">
        <Textarea id="pp-notes" name="notes" rows={2} defaultValue={draft?.notes} />
      </Field>

      <SaveButton isNew={!draft} />
    </form>
  );
}

function SaveButton({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : isNew ? "Add the paper" : "Save"}
    </Button>
  );
}

/** Removing a paper that has not been sat. */
export function DeletePaper({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <>
      {problem ? (
        <Alert tone="danger" className="mt-2">
          {problem}
        </Alert>
      ) : null}
      <button
        type="button"
        disabled={busy}
        aria-label="Remove this paper"
        onClick={async () => {
          setBusy(true);
          setProblem(null);
          const data = new FormData();
          data.append("id", id);
          const result = await deletePaperAction(data);
          setBusy(false);
          if (result.error) setProblem(result.error);
        }}
        className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
      >
        <Trash2 className="size-4" />
      </button>
    </>
  );
}

/** The pencil that swaps a timetable row for the form above it. */
export function EditPaper({
  sessionId,
  draft,
  subjects,
  levels,
}: {
  sessionId: string;
  draft: PaperDraft;
  subjects: Option[];
  levels: Option[];
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <PaperForm
        sessionId={sessionId}
        draft={draft}
        subjects={subjects}
        levels={levels}
        defaultDate={draft.startsAt.slice(0, 10)}
        onDone={() => setOpen(false)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Edit this paper"
      className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
    >
      <Pencil className="size-4" />
    </button>
  );
}
