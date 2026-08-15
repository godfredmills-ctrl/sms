"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, Save } from "lucide-react";

import { Alert, Button, CardBody, Field, Input } from "@/components/ui";

import {
  changePasswordAction,
  updateProfileAction,
  type AccountState,
} from "./actions";

export function ProfileForm({
  values,
}: {
  values: {
    firstName: string;
    lastName: string;
    otherNames: string;
    email: string;
    phone: string;
    avatarUrl: string;
  };
}) {
  const [state, action] = useActionState<AccountState, FormData>(
    updateProfileAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" required>
            <Input
              id="firstName"
              name="firstName"
              defaultValue={values.firstName}
              required
            />
          </Field>
          <Field label="Last name" htmlFor="lastName" required>
            <Input
              id="lastName"
              name="lastName"
              defaultValue={values.lastName}
              required
            />
          </Field>
        </div>
        <Field label="Other names" htmlFor="otherNames">
          <Input id="otherNames" name="otherNames" defaultValue={values.otherNames} />
        </Field>
        <Field label="Email" htmlFor="email" hint="Used to sign in.">
          <Input id="email" name="email" type="email" defaultValue={values.email} />
        </Field>
        <Field label="Phone" htmlFor="phone" hint="Can also be used to sign in.">
          <Input id="phone" name="phone" defaultValue={values.phone} />
        </Field>
        <Field label="Photo URL" htmlFor="avatarUrl">
          <Input id="avatarUrl" name="avatarUrl" defaultValue={values.avatarUrl} />
        </Field>

        <Submit icon="save" label="Save profile" />
      </CardBody>
    </form>
  );
}

export function PasswordForm({ mustChange }: { mustChange: boolean }) {
  const [state, action] = useActionState<AccountState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {mustChange ? (
          <Alert tone="warning">
            You are still using a password issued by an administrator. Set your own
            before doing anything else.
          </Alert>
        ) : null}
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Current password" htmlFor="currentPassword">
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
          />
        </Field>
        <Field
          label="New password"
          htmlFor="newPassword"
          hint="At least 10 characters. A short phrase beats a mangled word."
          required
        >
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" required>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>

        <Submit icon="key" label="Change password" />

        <p className="text-xs text-[var(--text-subtle)]">
          Changing your password signs you out on every other device.
        </p>
      </CardBody>
    </form>
  );
}

function Submit({ icon, label }: { icon: "save" | "key"; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      {icon === "save" ? <Save className="size-4" /> : <KeyRound className="size-4" />}
      {pending ? "Saving…" : label}
    </Button>
  );
}
