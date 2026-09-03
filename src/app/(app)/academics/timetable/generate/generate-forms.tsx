"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Wand2 } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, Field, Input } from "@/components/ui";

import {
  generateTimetableAction,
  setPeriodsPerWeekAction,
  type GenerateState,
} from "./actions";

function Submit({
  label,
  icon,
  disabled,
}: {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className="w-full" disabled={pending || disabled}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {pending ? "Working…" : label}
    </Button>
  );
}

export function GenerateForm({
  levels,
  disabled,
}: {
  levels: SelectOption[];
  disabled: boolean;
}) {
  const [state, action] = useActionState<GenerateState, FormData>(
    generateTimetableAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <Field
        label="Which classes"
        htmlFor="scope"
        hint="One year group at a time is easier to check than the whole school at once."
      >
        <SearchableSelect
          id="scope"
          name="scope"
          defaultValue="all"
          clearable={false}
          options={[{ value: "all", label: "Every class" }, ...levels]}
        />
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="replace"
          className="mt-0.5 accent-[var(--primary)]"
        />
        <span>
          <span className="font-medium">Replace what is there.</span>
          <span className="block text-[var(--text-muted)]">
            Clears the lessons already placed for these classes and builds again.
            Breaks, assembly and anything labelled by hand are kept. Left
            unticked, it fills the gaps around what exists.
          </span>
        </span>
      </label>

      <Submit label="Build it" icon={<Wand2 className="size-3.5" />} disabled={disabled} />

      {state.shortfalls?.length ? (
        <div className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3">
          <p className="text-sm font-medium">
            These could not be fitted in full.
          </p>
          <p className="mb-2 text-xs text-[var(--text-muted)]">
            Everything that could be placed has been. The usual causes are a
            teacher whose week is already full, and more periods asked for than
            the day holds.
          </p>
          <ul className="space-y-1 text-xs">
            {state.shortfalls.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{row.label}</span>
                <span className="numeric shrink-0">
                  {row.placed} of {row.wanted}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------------------

export type PeriodsRow = {
  id: string;
  subject: string;
  section: string;
  teacher: string | null;
  periodsPerWeek: number;
  doublePeriods: number;
};

/**
 * Every subject in every class, with the two numbers the generator needs.
 *
 * A plain table with inline fields rather than a modal per row. A school
 * setting this up for the first time goes through forty rows in one sitting,
 * and forty modals is forty chances to lose the thread.
 */
export function PeriodsTable({ rows }: { rows: PeriodsRow[] }) {
  const [filter, setFilter] = useState("");

  const shown = filter.trim()
    ? rows.filter((row) =>
        `${row.subject} ${row.section} ${row.teacher ?? ""}`
          .toLowerCase()
          .includes(filter.trim().toLowerCase()),
      )
    : rows;

  return (
    <div className="space-y-3">
      <Input
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter by subject, class or teacher…"
        aria-label="Filter the list"
      />

      <div className="max-h-[520px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--bg-elevated)]">
            <tr className="border-b border-[var(--border)]">
              <th className="py-2 text-left text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                Subject
              </th>
              <th className="py-2 text-left text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                Class
              </th>
              <th className="w-24 py-2 text-left text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                A week
              </th>
              <th className="w-24 py-2 text-left text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                Doubles
              </th>
              <th className="w-20 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {shown.map((row) => (
              <PeriodsRowForm key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Nothing matches that.</p>
      ) : null}
    </div>
  );
}

function PeriodsRowForm({ row }: { row: PeriodsRow }) {
  const [state, action] = useActionState<GenerateState, FormData>(
    setPeriodsPerWeekAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <tr>
      <td className="py-1.5 pr-2">
        <p className="truncate font-medium">{row.subject}</p>
        {row.teacher ? (
          <p className="truncate text-xs text-[var(--text-subtle)]">{row.teacher}</p>
        ) : (
          <p className="truncate text-xs text-[var(--warning)]">No teacher assigned</p>
        )}
        {state.error ? (
          <p className="text-xs text-[var(--danger)]">{state.error}</p>
        ) : null}
      </td>
      <td className="py-1.5 pr-2">
        <span className="text-xs text-[var(--text-muted)]">{row.section}</span>
      </td>
      <td colSpan={3} className="py-1.5">
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="offeringId" value={row.id} />
          <Input
            name="periodsPerWeek"
            type="number"
            min="0"
            max="50"
            defaultValue={String(row.periodsPerWeek)}
            aria-label={`Periods a week for ${row.subject}`}
            className="w-20"
          />
          <Input
            name="doublePeriods"
            type="number"
            min="0"
            step="2"
            defaultValue={String(row.doublePeriods)}
            aria-label={`Double periods for ${row.subject}`}
            className="w-20"
          />
          <SaveCell saved={Boolean(state.ok)} />
        </form>
      </td>
    </tr>
  );
}

function SaveCell({ saved }: { saved: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : saved ? (
        <Check className="size-3.5" />
      ) : null}
      {pending ? "" : saved ? "" : "Set"}
    </Button>
  );
}
