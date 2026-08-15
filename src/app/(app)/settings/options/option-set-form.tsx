"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import { Alert, Button, CardBody, Field, Input } from "@/components/ui";

import { createOptionSetAction, type FormState } from "../actions";

const ENTITIES = [
  { value: "STUDENT", label: "Student" },
  { value: "STAFF", label: "Staff" },
  { value: "GUARDIAN", label: "Guardian" },
  { value: "ENROLLMENT", label: "Enrollment" },
  { value: "INVOICE", label: "Invoice" },
  { value: "PAYMENT", label: "Payment" },
  { value: "DOCUMENT", label: "Document" },
  { value: "ELECTION", label: "Election" },
  { value: "COURSE", label: "Course" },
  { value: "APPLICATION", label: "Application" },
];

export function OptionSetForm() {
  const [state, action] = useActionState<FormState, FormData>(
    createOptionSetAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="List name" htmlFor="label" required>
          <Input id="label" name="label" required placeholder="Boarding house" />
        </Field>
        <Field
          label="Key"
          htmlFor="key"
          hint="Left blank, it is derived from the name."
        >
          <Input id="key" name="key" placeholder="student.house" />
        </Field>
        <Field label="Applies to" htmlFor="entity">
          <SearchableSelect id="entity" name="entity" options={ENTITIES} />
        </Field>
        <Field label="Description" htmlFor="description">
          <Input id="description" name="description" />
        </Field>
        <Submit />
      </CardBody>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      <Plus className="size-4" />
      {pending ? "Creating…" : "Create list"}
    </Button>
  );
}
