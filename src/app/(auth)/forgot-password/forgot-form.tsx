"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Field, Input } from "@/components/ui";

import { requestPasswordResetAction, type ResetState } from "../reset-actions";

export function ForgotPasswordForm() {
  const [state, action] = useActionState<ResetState, FormData>(
    requestPasswordResetAction,
    {},
  );

  if (state.ok) {
    return (
      <Alert tone="success" className="mt-4">
        If an account exists for that address, a reset link is on its way. It works
        for one hour.
      </Alert>
    );
  }

  return (
    <form action={action} className="mt-4 space-y-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label="Email or phone" htmlFor="identifier" required>
        <Input
          id="identifier"
          name="identifier"
          required
          autoFocus
          placeholder="you@example.com or 024 123 4567"
        />
      </Field>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Sending…" : "Send reset link"}
    </Button>
  );
}
