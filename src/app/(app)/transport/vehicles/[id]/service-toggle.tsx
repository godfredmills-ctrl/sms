"use client";

import { useState, useTransition } from "react";
import { Ban, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui";

import { setVehicleActiveAction } from "../../actions";

/**
 * Takes a bus off the road, or puts it back.
 *
 * The action for this was written with the module and called from nowhere —
 * exported, typechecked, unreachable — so a bus that broke down could not be
 * taken out of the capacity arithmetic, and a route would go on reporting
 * seats that were sitting on a ramp in Tema.
 *
 * Taking one off confirms first: it changes what every route it serves is
 * judged against, and can tip a route into over capacity from a click that
 * looked like housekeeping.
 */
export function ServiceToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function apply(next: boolean) {
    start(async () => {
      const data = new FormData();
      data.append("id", id);
      data.append("isActive", String(next));
      const result = await setVehicleActiveAction(data);
      setError(result.error ?? null);
      if (!result.error) setConfirming(false);
    });
  }

  if (!isActive) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button size="sm" disabled={pending} onClick={() => apply(true)}>
          <RotateCcw className="size-4" />
          {pending ? "Putting back…" : "Back in service"}
        </Button>
        {error ? <span className="text-xs text-[var(--danger)]">{error}</span> : null}
      </div>
    );
  }

  if (!confirming) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
        <Ban className="size-4" />
        Take off the road
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-muted)]">
          Its seats stop counting. Take it off?
        </span>
        <Button size="sm" disabled={pending} onClick={() => apply(false)}>
          {pending ? "Taking off…" : "Yes"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
      {error ? <span className="text-xs text-[var(--danger)]">{error}</span> : null}
    </div>
  );
}
