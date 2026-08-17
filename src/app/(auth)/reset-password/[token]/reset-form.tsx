"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import { Alert, Button, Field, Input } from "@/components/ui";

import { completePasswordResetAction, type ResetState } from "../../reset-actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<ResetState, FormData>(
    completePasswordResetAction,
    {},
  );

  if (state.ok) {
    return (
      <div className="mt-4 space-y-3">
        <Alert tone="success">Password changed. Sign in with the new one.</Alert>
        <Link
          href="/login"
          className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-text)] hover:opacity-90"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label="New password" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          autoFocus
        />
      </Field>
      <Field label="Repeat it" htmlFor="confirm" required>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
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
      {pending ? "Saving…" : "Save new password"}
    </Button>
  );
}
