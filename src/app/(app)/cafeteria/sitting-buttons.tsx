"use client";

import Link from "next/link";

import { SITTINGS } from "@/lib/cafeteria-rules";
import { cn } from "@/lib/utils";

/**
 * Breakfast, break, lunch, supper.
 *
 * Links rather than buttons, so the sitting is in the address bar. A kitchen
 * screen gets left open and reloaded, and a tab that comes back to the wrong
 * sitting is a register filled in under the wrong meal.
 */
export function SittingButtons({
  current,
  date,
  openSittings,
}: {
  current: string;
  date: string | null;
  /** Reserved: which sittings already have a register open. */
  openSittings?: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {SITTINGS.map((sitting) => {
        const active = sitting.value === current;
        const query = new URLSearchParams({ sitting: sitting.value });
        if (date) query.set("date", date);

        return (
          <Link
            key={sitting.value}
            href={`/cafeteria?${query.toString()}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-text)]"
                : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {sitting.label}
            {openSittings?.includes(sitting.value) ? (
              <span className="ml-1.5 inline-block size-1.5 rounded-full bg-[var(--success)]" />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
