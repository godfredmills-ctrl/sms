"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

import { Alert, Button, CardBody, Field, Input } from "@/components/ui";

import { createGradeScaleAction, type FormState } from "../actions";

export function ScaleForm() {
  const [state, action] = useActionState<FormState, FormData>(
    createGradeScaleAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Name" htmlFor="name" required>
          <Input id="name" name="name" required placeholder="WASSCE" />
        </Field>
        <Field label="Code" htmlFor="code" hint="Derived from the name if blank.">
          <Input id="code" name="code" placeholder="WASSCE" />
        </Field>
        <Field
          label="Highest grade point"
          htmlFor="maxPoint"
          hint="Used to normalise GPA — 4.0, 7.0, or blank for none."
        >
          <Input id="maxPoint" name="maxPoint" type="number" step="0.1" min="0" />
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
      {pending ? "Creating…" : "Create scale"}
    </Button>
  );
}
