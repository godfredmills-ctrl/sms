"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save } from "lucide-react";

import {
  Alert,
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";

import { saveSessionAction, type ExamState } from "./actions";

export type SessionDraft = {
  id: string;
  name: string;
  termId: string;
  startsOn: string;
  endsOn: string;
  instructions: string;
};

export type TermOption = {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
};

/**
 * Setting up a run of examinations.
 *
 * Choosing a term fills the dates from it, because a school's examinations sit
 * in the last fortnight of the term and typing the dates again is how they end
 * up a week out from the term they belong to.
 */
export function SessionForm({
  draft,
  terms,
  onDone,
}: {
  draft?: SessionDraft;
  terms: TermOption[];
  onDone?: () => void;
}) {
  const [state, action] = useActionState<ExamState, FormData>(saveSessionAction, {});

  return (
    <form action={action} className="space-y-3">
      {draft ? <input type="hidden" name="id" value={draft.id} /> : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <Field label="Name" htmlFor="ex-name" required>
        <Input
          id="ex-name"
          name="name"
          required
          defaultValue={draft?.name}
          placeholder="End of Term 1 Examinations"
        />
      </Field>

      <Field label="Term" htmlFor="ex-term" hint="What the results will be filed under.">
        <Select id="ex-term" name="termId" defaultValue={draft?.termId ?? terms[0]?.id ?? ""}>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First day" htmlFor="ex-from" required>
          <Input
            id="ex-from"
            name="startsOn"
            type="date"
            required
            defaultValue={draft?.startsOn ?? terms[0]?.startsOn ?? ""}
          />
        </Field>
        <Field label="Last day" htmlFor="ex-to" required>
          <Input
            id="ex-to"
            name="endsOn"
            type="date"
            required
            defaultValue={draft?.endsOn ?? terms[0]?.endsOn ?? ""}
          />
        </Field>
      </div>

      <Field
        label="Instructions to candidates"
        htmlFor="ex-instructions"
        hint="Printed at the head of every hall list and candidate slip."
      >
        <Textarea
          id="ex-instructions"
          name="instructions"
          rows={3}
          defaultValue={draft?.instructions}
          placeholder="No mobile phones in the hall. Be seated fifteen minutes before the paper begins. Bring your own pen, pencil and mathematical set."
        />
      </Field>

      <div className="flex gap-2">
        <SaveButton isNew={!draft} />
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function SaveButton({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Save className="size-4" />
      {pending ? "Saving…" : isNew ? "Set them up" : "Save"}
    </Button>
  );
}
