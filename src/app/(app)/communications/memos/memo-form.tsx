"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { FileSignature } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Button,
  CardBody,
  CheckboxField,
  Field,
  Input,
  Textarea,
} from "@/components/ui";

import { createMemoAction, type MemoState } from "../actions";

const KINDS = ["INTERNAL", "CIRCULAR", "DIRECTIVE", "NOTICE", "POLICY"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

export function MemoForm({ recipients }: { recipients: SelectOption[] }) {
  const [state, action] = useActionState<MemoState, FormData>(createMemoAction, {});
  const [selected, setSelected] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setSelected([]);
    }
  }, [state.ok]);

  return (
    <form ref={formRef} action={action}>
      {selected.map((id) => (
        <input key={id} type="hidden" name="recipientIds" value={id} />
      ))}

      <CardBody className="space-y-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">Memo created.</Alert> : null}

        <Field label="Subject" htmlFor="subject" required>
          <Input id="subject" name="subject" required placeholder="Results deadline" />
        </Field>

        <Field label="Body" htmlFor="body" required>
          <Textarea id="body" name="body" rows={6} required />
        </Field>

        <Field
          label="Recipients"
          hint="Grouped by department — type to find someone."
          required
        >
          <SearchableSelect
            multiple
            placeholder="Choose staff…"
            searchPlaceholder="Name or job title…"
            options={recipients}
            value={selected}
            onChange={(next) => setSelected(next as string[])}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" htmlFor="kind">
            <SearchableSelect
              id="kind"
              name="kind"
              clearable={false}
              defaultValue="INTERNAL"
              options={KINDS.map((value) => ({
                value,
                label: value.charAt(0) + value.slice(1).toLowerCase(),
              }))}
            />
          </Field>
          <Field label="Priority" htmlFor="priority">
            <SearchableSelect
              id="priority"
              name="priority"
              clearable={false}
              defaultValue="NORMAL"
              options={PRIORITIES.map((value) => ({
                value,
                label: value.charAt(0) + value.slice(1).toLowerCase(),
              }))}
            />
          </Field>
        </div>

        <Field label="From department" htmlFor="fromDepartment">
          <Input id="fromDepartment" name="fromDepartment" placeholder="Administration" />
        </Field>

        <CheckboxField
          name="requiresAck"
          label="Require acknowledgement"
          description="Recipients must confirm they have read it, and the count is tracked."
        />
        <CheckboxField
          name="confidential"
          label="Confidential"
          description="Marked clearly so it is not forwarded casually."
        />
        <CheckboxField
          name="issueNow"
          label="Issue immediately"
          description="Otherwise it is saved as a draft."
          defaultChecked
        />

        <SubmitButton disabled={!selected.length} />
      </CardBody>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending || disabled}>
      <FileSignature className="size-4" />
      {pending ? "Creating…" : "Create memo"}
    </Button>
  );
}
