"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

/**
 * Re-fetches the current page's server data in place.
 *
 * router.refresh() re-runs the Server Components without touching client
 * state, so filters, scroll position and half-typed form fields survive. The
 * spinner runs for the length of the transition — a refresh button that gives
 * no sign it did anything gets pressed five times.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title="Refresh the data on this page"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] disabled:opacity-60"
    >
      <RotateCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
    </button>
  );
}
