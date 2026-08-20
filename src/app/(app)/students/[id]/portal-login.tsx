"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, ShieldCheck } from "lucide-react";

import { Alert, Button } from "@/components/ui";

import { createStudentLoginAction, type LoginState } from "../actions";

/**
 * Gives a pupil a way into the portal.
 *
 * The credentials are shown once, here, and never again — the password is
 * stored only as a hash, and the account is marked must-change, so this
 * screen is the single moment anyone can read it. That is why it is a panel
 * on the page rather than a toast: a toast that disappears while the office
 * is writing on a slip is a login nobody can use, and the only way back is to
 * delete the account and make another.
 */
export function PortalLogin({
  studentId,
  hasLogin,
  firstName,
}: {
  studentId: string;
  hasLogin: boolean;
  firstName: string;
}) {
  const [state, action] = useActionState<LoginState, FormData>(
    createStudentLoginAction,
    {},
  );

  if (state.ok && state.username) {
    return (
      <Alert tone="success" title="Portal login created">
        <p className="mb-2 text-sm">
          Write these down now — the password is not shown again, and {firstName} will
          be asked to change it at first sign-in.
        </p>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
          <dt className="text-[var(--text-muted)]">Username</dt>
          <dd className="numeric font-medium">{state.username}</dd>
          <dt className="text-[var(--text-muted)]">Password</dt>
          <dd className="numeric font-medium">{state.temporaryPassword}</dd>
        </dl>
      </Alert>
    );
  }

  if (hasLogin) {
    return (
      <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <ShieldCheck className="size-3.5 shrink-0 text-[var(--success)]" />
        {firstName} has a portal login. Reset the password from Users if it is
        forgotten.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="studentId" value={studentId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <p className="text-xs text-[var(--text-muted)]">
        {firstName} cannot sign in to the student portal yet.
      </p>
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      <KeyRound className="size-4" />
      {pending ? "Creating…" : "Create a portal login"}
    </Button>
  );
}
