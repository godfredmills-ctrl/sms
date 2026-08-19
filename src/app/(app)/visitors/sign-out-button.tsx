"use client";

import { useState, useTransition } from "react";
import { LogOut, MoonStar } from "lucide-react";

import { Button } from "@/components/ui";

import { closeOpenVisitsAction, signOutVisitorAction } from "./actions";

/** Signs one visitor out from their row in the register. */
export function SignOutButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const data = new FormData();
            data.append("id", id);
            const result = await signOutVisitorAction(data);
            setError(result.error ?? null);
          })
        }
        aria-label={`Sign out ${name}`}
      >
        <LogOut className="size-3.5" />
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {error ? <span className="text-xs text-[var(--danger)]">{error}</span> : null}
    </div>
  );
}

/**
 * The end-of-day tidy.
 *
 * Confirms first, because it stamps a departure time on people whose
 * departure nobody watched — a claim the register should only make when
 * someone has decided to make it.
 */
export function CloseOpenVisitsButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!count) return null;

  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        <MoonStar className="size-4" />
        Close the day
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)]">
        Sign out all {count} still on site?
      </span>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          // Awaited inside the scope, not fired and forgotten: a scope
          // function that returns undefined ends the transition immediately,
          // so `pending` flicked back to false while the server was still
          // closing thirty rows, and the button invited a second click.
          start(async () => {
            await closeOpenVisitsAction();
          })
        }
      >
        {pending ? "Closing…" : "Yes, close"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
