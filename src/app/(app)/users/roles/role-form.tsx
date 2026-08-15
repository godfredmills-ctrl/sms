"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import { Alert, Button, CardBody, Field, Input } from "@/components/ui";

import { createRoleAction, type RoleState } from "../actions";

export function RoleForm() {
  const [state, action] = useActionState<RoleState, FormData>(createRoleAction, {});

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Role name" htmlFor="name" required>
          <Input id="name" name="name" required placeholder="Examinations Officer" />
        </Field>
        <Field label="Key" htmlFor="key" hint="Derived from the name if blank.">
          <Input id="key" name="key" placeholder="exams_officer" />
        </Field>
        <Field label="Portal" htmlFor="portal">
          <SearchableSelect
            id="portal"
            name="portal"
            clearable={false}
            defaultValue="STAFF"
            options={[
              { value: "STAFF", label: "Staff" },
              { value: "STUDENT", label: "Student" },
              { value: "GUARDIAN", label: "Guardian" },
            ]}
          />
        </Field>
        <Field
          label="Rank"
          htmlFor="rank"
          hint="Lower ranks sort first. Use it to order seniority."
        >
          <Input id="rank" name="rank" type="number" defaultValue={100} />
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
      {pending ? "Creating…" : "Create role"}
    </Button>
  );
}
