"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

import { emailCredentialAction, type CredentialState } from "./actions";

/**
 * Emails a credential to the family.
 *
 * The result is reported in place rather than as a toast: "no guardian has an
 * email address" is a fact about the record that the person needs to act on,
 * and it should stay on screen until they have.
 */
export function EmailCredentialButton({
  kind,
  id,
}: {
  kind: "certificate" | "transcript";
  id: string;
}) {
  const [state, action] = useActionState<CredentialState, FormData>(
    emailCredentialAction,
    {},
  );

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <SendButton />
      {state.error || state.message ? (
        <span
          className={cn(
            "max-w-[240px] text-right text-[11px]",
            state.error ? "text-[var(--danger)]" : "text-[var(--success)]",
          )}
        >
          {state.error ?? state.message}
        </span>
      ) : null}
    </form>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      title="Email this to the family"
    >
      <Mail className="size-3.5" />
      {pending ? "Sending…" : "Email"}
    </Button>
  );
}
