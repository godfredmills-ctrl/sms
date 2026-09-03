"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Wand2, X } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { COVER_KINDS, isLost, type Candidate } from "@/lib/cover-rules";

import {
  arrangeCoverAction,
  autoArrangeAction,
  clearCoverAction,
  type CoverState,
} from "./actions";

/**
 * The date at the top of the board.
 *
 * A plain navigation rather than a form: the day is in the URL, so a deputy
 * head can keep tomorrow open in a second tab, and the link they send the head
 * of department is the day they were looking at.
 */
export function DayPicker({ date }: { date: string }) {
  const router = useRouter();

  return (
    <Input
      type="date"
      value={date}
      aria-label="Day"
      className="w-auto"
      onChange={(event) => {
        if (event.target.value)
          router.push(`/cover?date=${event.target.value}`);
      }}
    />
  );
}

/**
 * One hole, and what to do about it.
 *
 * The candidates arrive already ranked and already filtered: everybody in the
 * list is free at that minute. Nothing here re-derives that, because the
 * moment the form has its own opinion about who is free it is one refactor
 * away from disagreeing with the action, and the school finds out by sending
 * somebody to a room that is already occupied.
 */
export function ArrangeForm({
  date,
  slotId,
  candidates,
  current,
}: {
  date: string;
  slotId: string;
  candidates: Candidate[];
  current: {
    kind: string;
    coverStaffId: string | null;
    note: string | null;
  } | null;
}) {
  const [state, action] = useActionState<CoverState, FormData>(
    arrangeCoverAction,
    {},
  );
  const [kind, setKind] = useState(current?.kind ?? "TEACHER");
  const [open, setOpen] = useState(false);

  const lost = isLost(kind);
  const best = candidates[0];

  /*
   * A settled period is one line, not an open editor.
   *
   * The first version left the form expanded on every arranged row, so a
   * finished day was a page of textareas the deputy head had to scroll past to
   * reach the two periods that still needed them. What is already decided is
   * shown by the card around this; all this needs to offer is a way to change
   * it.
   */
  if (!open && current) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
          Change it
        </Button>
        <ClearButton date={date} slotId={slotId} />
      </div>
    );
  }

  if (!open) {
    return (
      <div className="space-y-2">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        {best ? (
          // One click for the answer the ranking already worked out, and the
          // list for the times a deputy head knows something the ranking does
          // not — which is most days, and is why the list is one click away
          // rather than hidden.
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="slotId" value={slotId} />
            <input type="hidden" name="kind" value="TEACHER" />
            <input type="hidden" name="coverStaffId" value={best.staffId} />
            <Assign label={`Give it to ${best.name}`} />
            <span className="text-xs text-[var(--text-subtle)]">
              {best.because}
              {best.caution ? ` · ${best.caution}` : ""}
            </span>
            <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
              Somebody else
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="danger">Nobody is free</Badge>
            <span className="text-xs text-[var(--text-subtle)]">
              Every teaching member of staff is in a room or out. Merge it, or
              record the period as lost.
            </span>
            <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
              Decide
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl bg-[var(--bg-subtle)] p-3">
      <form action={action} className="space-y-3">
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="slotId" value={slotId} />

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What happens" htmlFor={`kind-${slotId}`}>
            <Select
              id={`kind-${slotId}`}
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              {COVER_KINDS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>

          {lost ? null : (
            <Field label="Who takes it" htmlFor={`cover-${slotId}`} required>
              <SearchableSelect
                id={`cover-${slotId}`}
                name="coverStaffId"
                clearable={false}
                defaultValue={current?.coverStaffId ?? best?.staffId ?? ""}
                placeholder="Choose somebody free"
                options={candidates.map((candidate) => ({
                  value: candidate.staffId,
                  label: candidate.name,
                  description: candidate.caution
                    ? `${candidate.because} · ${candidate.caution}`
                    : candidate.because,
                }))}
              />
            </Field>
          )}
        </div>

        <p className="text-xs text-[var(--text-subtle)]">
          {COVER_KINDS.find((entry) => entry.value === kind)?.hint}
        </p>

        <Field
          label={lost ? "Why" : "What the class is to do"}
          htmlFor={`note-${slotId}`}
          required={lost}
          hint={
            lost
              ? "A lost period without a reason is the row nobody can answer for at the end of term."
              : "Optional. Whatever the absent teacher left, or exercise 4B."
          }
        >
          <Textarea
            id={`note-${slotId}`}
            name="note"
            rows={2}
            defaultValue={current?.note ?? ""}
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Assign label={current ? "Change it" : "Arrange it"} />
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>

      {/* Its own form, and a sibling rather than a child: a form inside a form
          is not markup a browser has any obligation to make sense of. */}
      {current ? <ClearButton date={date} slotId={slotId} /> : null}
    </div>
  );
}

function Assign({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Check className="size-4" />
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** Back to uncovered, which is not the same as covered by nobody. */
export function ClearButton({
  date,
  slotId,
}: {
  date: string;
  slotId: string;
}) {
  const [state, action] = useActionState<CoverState, FormData>(
    clearCoverAction,
    {},
  );

  return (
    <form action={action} className="inline">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="slotId" value={slotId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Clear />
    </form>
  );
}

function Clear() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" disabled={pending}>
      <X className="size-4" />
      {pending ? "Clearing…" : "Clear"}
    </Button>
  );
}

/**
 * Fill the rest of the board in one go.
 *
 * The alternative at ten to seven in the morning is asking whoever is standing
 * in the corridor, and whoever is standing in the corridor is the same three
 * people every week.
 */
export function AutoArrangeForm({
  date,
  holes,
}: {
  date: string;
  holes: number;
}) {
  const [state, action] = useActionState<CoverState, FormData>(
    autoArrangeAction,
    {},
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="date" value={date} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}
      <Auto holes={holes} />
    </form>
  );
}

function Auto({ holes }: { holes: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending || holes === 0}>
      <Wand2 className="size-4" />
      {pending ? "Arranging…" : `Fill the remaining ${holes}`}
    </Button>
  );
}
