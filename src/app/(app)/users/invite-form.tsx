"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { UserPlus } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, CardBody, Field, Input } from "@/components/ui";

import { inviteUserAction, type UserState } from "./actions";

export function InviteForm({ roles }: { roles: SelectOption[] }) {
  const [state, action] = useActionState<UserState, FormData>(inviteUserAction, {});

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.temporaryPassword ? (
          <Alert tone="success" title={state.message}>
            <p className="text-xs">
              Give this password to the user. It is shown once and stops working the
              moment they sign in.
            </p>
            <p className="numeric mt-1 text-base font-semibold">
              {state.temporaryPassword}
            </p>
          </Alert>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" required>
            <Input id="firstName" name="firstName" required />
          </Field>
          <Field label="Last name" htmlFor="lastName" required>
            <Input id="lastName" name="lastName" required />
          </Field>
        </div>
        <Field label="Other names" htmlFor="otherNames">
          <Input id="otherNames" name="otherNames" />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" />
        </Field>
        <Field label="Phone" htmlFor="phone" hint="Either an email or a phone is required.">
          <Input id="phone" name="phone" placeholder="024 123 4567" />
        </Field>
        <Field label="Roles" htmlFor="roleIds" required>
          <SearchableSelect id="roleIds" name="roleIds" multiple options={roles} required />
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
      <UserPlus className="size-4" />
      {pending ? "Creating…" : "Create account"}
    </Button>
  );
}
