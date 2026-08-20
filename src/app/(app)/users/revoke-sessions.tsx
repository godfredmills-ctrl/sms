"use client";

import { useState, useTransition } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui";

import { revokeSessionsAction } from "./actions";

/**
 * Signs an account out everywhere.
 *
 * The users page has always counted each person's live sessions and offered
 * nothing to do about it — the action existed, authorised and audited, with
 * no caller. So the one moment it is for, a laptop left on a desk or an
 * account someone else has the password to, had no answer short of disabling
 * the account entirely.
 *
 * Confirms first: it is not destructive, but it does throw someone out of
 * whatever they were in the middle of, and the count beside the button is a
 * number rather than a list of people.
 */
export function RevokeSessions({
  userId,
  name,
  count,
}: {
  userId: string;
  name: string;
  count: number;
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--danger)]"
      >
        Sign out
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-[var(--text-muted)]">
        End {count} session{count === 1 ? "" : "s"} for {name}?
      </span>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const data = new FormData();
            data.append("userId", userId);
            const result = await revokeSessionsAction(data);
            setError(result?.error ?? null);
            if (!result?.error) setConfirming(false);
          })
        }
      >
        <LogOut className="size-3.5" />
        {pending ? "Ending…" : "Yes"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      {error ? <span className="text-[var(--danger)]">{error}</span> : null}
    </span>
  );
}
