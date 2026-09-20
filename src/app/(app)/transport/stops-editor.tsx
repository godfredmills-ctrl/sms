"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ClipboardPaste, Plus, X } from "lucide-react";

import { Alert, Button, Input } from "@/components/ui";
import { parseStops, type StopRow } from "@/lib/transport-stops";

/**
 * The stops on a route, as rows.
 *
 * This replaced a single textarea of "name | landmark | 06:40 | 15:40" lines,
 * and the reason is not that the textarea was ugly. It is that a line carries
 * no identity. Matching a typed line back to the stop it means could only be
 * done by name, so correcting the spelling of a stop was indistinguishable
 * from deleting it and adding a different one, and every child assigned to it
 * was left behind on a stop that no longer appeared on the route.
 *
 * A row carries its stop id in a hidden field. Renaming is now an update to a
 * known row and the children never notice, which is the whole point.
 *
 * Two things the textarea was right about, kept:
 *
 *   Order is position. The stops are in the order the bus drives them, and
 *   moving one is moving it up or down, not typing a number into a "sequence"
 *   box and hoping nothing else collides with it.
 *
 *   A route arrives already written down, on paper or in a WhatsApp message.
 *   Making somebody fill in eleven rows by hand is how a route ends up not
 *   entered at all, so Paste a list is still here. It reads the old format and
 *   turns it into rows, which are then corrected in place.
 */

/** What a pasted route looks like, shown in the box rather than explained. */
const PASTE_EXAMPLE = [
  "Spintex Junction | opposite Total | 06:40 | 15:40",
  "Baatsona | by the traffic light | 06:55 | 15:25",
  "Tema Community 7 | 07:15 | 15:05",
].join("\n");

/** A row in the editor. The key is local and never leaves the browser. */
type Row = StopRow & { key: string };

let counter = 0;
const nextKey = () => `row-${(counter += 1)}`;

const blank = (): Row => ({
  key: nextKey(),
  id: null,
  name: "",
  landmark: null,
  pickupTime: null,
  dropoffTime: null,
});

export function StopsEditor({ stops }: { stops: StopRow[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    stops.length ? stops.map((stop) => ({ ...stop, key: nextKey() })) : [blank()],
  );
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<StopRow>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  const remove = (key: string) =>
    setRows((current) => {
      const next = current.filter((row) => row.key !== key);
      return next.length ? next : [blank()];
    });

  const move = (index: number, by: -1 | 1) =>
    setRows((current) => {
      const target = index + by;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  /**
   * Pasted lines become new rows, appended.
   *
   * Appended rather than replacing, because the rows already on screen carry
   * ids and the pasted ones cannot. Wiping the list to paste over it would
   * turn every existing stop into a deletion, which is exactly the harm this
   * editor exists to stop.
   */
  const absorb = () => {
    const parsed = parseStops(pasted);
    if (parsed.problems.length) {
      const first = parsed.problems[0];
      setPasteError(
        `Line ${first.line}: ${first.message}${
          parsed.problems.length > 1 ? ` (${parsed.problems.length - 1} more like it.)` : ""
        }`,
      );
      return;
    }
    if (parsed.stops.length === 0) {
      setPasteError("There are no stops in that.");
      return;
    }

    setRows((current) => {
      const existing = new Set(current.map((row) => row.name.trim().toLowerCase()));
      const added = parsed.stops
        .filter((stop) => !existing.has(stop.name.toLowerCase()))
        .map((stop) => ({
          key: nextKey(),
          id: null,
          name: stop.name,
          landmark: stop.landmark,
          pickupTime: stop.pickupTime,
          dropoffTime: stop.dropoffTime,
        }));
      // An untouched blank starter row would otherwise sit above the paste.
      const kept = current.filter((row) => row.name.trim() !== "");
      return [...kept, ...added];
    });

    setPasted("");
    setPasteError(null);
    setPasting(false);
  };

  return (
    <div className="space-y-2">
      {/*
        Stacked, not a row of columns.

        This form lives in a 22rem sidebar. Laid out as five columns it had
        about twenty points of width for the stop name and the same for the
        landmark, because the breakpoint that turned the columns on measures
        the VIEWPORT and the space that matters is the CARD. A wide monitor
        made the fields narrower, which is the wrong way round and exactly
        what a viewport breakpoint does to a component inside a sidebar.

        So each stop is a small block: the name across the top where it has
        room to be read, the landmark under it, and the two times side by
        side because they are short and belong together.
      */}
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li
            key={row.key}
            className="space-y-2 rounded-lg border border-[var(--border)] p-2.5"
          >
            {/* Identity travels with the row. Without it a rename is a deletion. */}
            <input type="hidden" name="stopId" value={row.id ?? ""} />

            {/*
              The buttons get their own column rather than sharing the name's
              row. Sharing it made the stop name narrower than the landmark
              beneath it, which reads as though the landmark were the more
              important of the two.
            */}
            <div className="flex items-start gap-1.5">
              <span className="numeric w-4 shrink-0 pt-2 text-center text-xs text-[var(--text-subtle)]">
                {index + 1}
              </span>

              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  name="stopName"
                  value={row.name}
                  onChange={(event) => update(row.key, { name: event.target.value })}
                  placeholder="Spintex Junction"
                  aria-label={`Stop ${index + 1} name`}
                />
                <Input
                  name="stopLandmark"
                  value={row.landmark ?? ""}
                  onChange={(event) => update(row.key, { landmark: event.target.value || null })}
                  placeholder="Landmark: opposite Total"
                  aria-label={`Stop ${index + 1} landmark`}
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-0.5 block text-[11px] text-[var(--text-subtle)]">
                      Pick-up
                    </span>
                    <Input
                      type="time"
                      name="stopPickup"
                      value={row.pickupTime ?? ""}
                      onChange={(event) =>
                        update(row.key, { pickupTime: event.target.value || null })
                      }
                      aria-label={`Stop ${index + 1} pick-up time`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[11px] text-[var(--text-subtle)]">
                      Drop-off
                    </span>
                    <Input
                      type="time"
                      name="stopDropoff"
                      value={row.dropoffTime ?? ""}
                      onChange={(event) =>
                        update(row.key, { dropoffTime: event.target.value || null })
                      }
                      aria-label={`Stop ${index + 1} drop-off time`}
                    />
                  </label>
                </div>
              </div>

              <div className="flex shrink-0 flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Move ${row.name || `stop ${index + 1}`} earlier`}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Move ${row.name || `stop ${index + 1}`} later`}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(row.key)}
                  aria-label={`Remove ${row.name || `stop ${index + 1}`}`}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setRows((current) => [...current, blank()])}
        >
          <Plus className="size-3.5" />
          Add a stop
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setPasting((open) => !open)}
        >
          <ClipboardPaste className="size-3.5" />
          Paste a list
        </Button>
      </div>

      {pasting ? (
        <div className="space-y-2 rounded-lg border border-[var(--border)] p-3">
          <p className="text-xs text-[var(--text-subtle)]">
            One stop per line, in order. Name, then landmark, pick-up and
            drop-off, separated by a vertical bar. Anything you leave out is fine.
          </p>
          <textarea
            value={pasted}
            onChange={(event) => {
              setPasted(event.target.value);
              setPasteError(null);
            }}
            rows={4}
            className="input w-full font-mono text-xs"
            placeholder={PASTE_EXAMPLE}
          />
          {pasteError ? <Alert tone="danger">{pasteError}</Alert> : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={absorb} disabled={!pasted.trim()}>
              Add these stops
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPasting(false);
                setPasteError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-[var(--text-subtle)]">
        A stop with children assigned cannot be removed until they are moved.
        Renaming one is safe: it keeps its place and its passengers.
      </p>
    </div>
  );
}
