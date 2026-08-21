"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Plus, X } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  CheckboxField,
  Field,
  Input,
  Textarea,
} from "@/components/ui";

import { saveVenueAction, type ExamState } from "../actions";

export type VenueRow = {
  id: string;
  name: string;
  capacity: number;
  notes: string | null;
  active: boolean;
  /** Papers seated here, so a hall in use is not quietly retired. */
  papers: number;
};

/**
 * The halls the school examines in.
 *
 * Capacity is the number of candidates the room seats with the desks spaced
 * for an examination, which is not the number it seats for an assembly — the
 * allocator fills to this figure, and a hall entered at its assembly capacity
 * puts two candidates within reading distance of each other.
 */
export function VenueEditor({
  venues,
  canManage,
}: {
  venues: VenueRow[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<VenueRow | "new" | null>(null);

  return (
    <div className="space-y-4">
      {canManage && !editing ? (
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Add a hall
        </Button>
      ) : null}

      {editing ? (
        <VenueForm
          row={editing === "new" ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      ) : null}

      {venues.length === 0 ? (
        <p className="text-sm text-[var(--text-subtle)]">
          No halls yet. Candidates cannot be seated until there is somewhere to seat
          them.
        </p>
      ) : (
        <div className="card divide-y divide-[var(--border)]">
          {venues.map((venue) => (
            <div key={venue.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm text-[var(--text)]">
                  {venue.name}
                  {venue.active ? null : <Badge tone="neutral">Not in use</Badge>}
                </p>
                <p className="text-xs text-[var(--text-subtle)]">
                  {[
                    `seats ${venue.capacity}`,
                    venue.papers
                      ? `${venue.papers} paper${venue.papers === 1 ? "" : "s"} seated here`
                      : "not used yet",
                    venue.notes,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setEditing(venue)}
                  aria-label={`Edit ${venue.name}`}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                >
                  <Pencil className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VenueForm({ row, onDone }: { row?: VenueRow; onDone: () => void }) {
  const [state, action] = useActionState<ExamState, FormData>(saveVenueAction, {});

  return (
    <form
      action={action}
      className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
    >
      {row ? <input type="hidden" name="id" value={row.id} /> : null}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--text)]">
          {row ? `Edit ${row.name}` : "New hall"}
        </p>
        <button type="button" onClick={onDone} aria-label="Close">
          <X className="size-4 text-[var(--text-muted)]" />
        </button>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="vn-name" required>
          <Input
            id="vn-name"
            name="name"
            required
            defaultValue={row?.name}
            placeholder="Assembly Hall"
          />
        </Field>
        <Field
          label="Seats"
          htmlFor="vn-capacity"
          required
          hint="Spaced for an examination, not for an assembly."
        >
          <Input
            id="vn-capacity"
            name="capacity"
            inputMode="numeric"
            required
            defaultValue={row ? String(row.capacity) : ""}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="vn-notes">
        <Textarea
          id="vn-notes"
          name="notes"
          rows={2}
          defaultValue={row?.notes ?? ""}
          placeholder="Ceiling fans on the east wall only. Two doors."
        />
      </Field>

      <CheckboxField
        name="active"
        label="In use"
        description="Off keeps it out of the seating picker. Past allocations stay."
        defaultChecked={row?.active ?? true}
      />

      <SaveButton isNew={!row} />
    </form>
  );
}

function SaveButton({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : isNew ? "Add the hall" : "Save"}
    </Button>
  );
}
