"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCheck, X } from "lucide-react";

import { Alert, Badge, Button, Input, Select } from "@/components/ui";
import {
  MARKABLE,
  formatClock,
  statusLabel,
  statusTone,
  type EffectiveStatus,
} from "@/lib/staff-attendance-rules";

import {
  clearStaffMarkAction,
  markRemainingPresentAction,
  markStaffAction,
  type RegisterState,
} from "./actions";

/**
 * The day at the top of the register.
 *
 * A navigation rather than a form, so the day lives in the URL: the head can
 * keep yesterday open in another tab, and the link they send the bursar is the
 * day they were looking at.
 */
export function DayPicker({ date, max }: { date: string; max: string }) {
  const router = useRouter();

  return (
    <Input
      type="date"
      value={date}
      max={max}
      aria-label="Day"
      className="w-auto"
      onChange={(event) => {
        if (event.target.value) router.push(`/staff/attendance?date=${event.target.value}`);
      }}
    />
  );
}

function Submitting({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="ghost" disabled={pending}>
      {children}
    </Button>
  );
}

/**
 * One person, one day.
 *
 * The times are plain text inputs of the form 07:45 rather than a time picker,
 * because this is copied off a paper book by somebody with the book open, and
 * typing four digits beats operating a spinner forty times.
 */
export function MarkRow({
  staffId,
  name,
  role,
  date,
  status,
  note,
  source,
  arrivedMinutes,
  leftMinutes,
  minutesLate,
  canRecord,
}: {
  staffId: string;
  name: string;
  role: string | null;
  date: string;
  status: EffectiveStatus;
  note: string | null;
  source: "leave" | "register" | "unmarked";
  arrivedMinutes: number | null;
  leftMinutes: number | null;
  minutesLate: number | null;
  canRecord: boolean;
}) {
  const [state, action] = useActionState<RegisterState, FormData>(markStaffAction, {});
  const [clearState, clearAction] = useActionState<RegisterState, FormData>(
    clearStaffMarkAction,
    {},
  );

  // Somebody on approved leave is not markable at all. The row says why rather
  // than offering a control that the action would refuse: a screen that offers
  // something it will not accept is a suggestion box.
  if (source === "leave") {
    return (
      <li className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
        <span className="min-w-0 flex-1">
          {name}
          {role ? <span className="ml-1.5 text-xs text-[var(--text-subtle)]">{role}</span> : null}
        </span>
        <Badge tone="info">On leave</Badge>
        {note ? (
          <span className="text-xs text-[var(--text-subtle)]">{note.toLowerCase()}</span>
        ) : null}
      </li>
    );
  }

  return (
    <li className="px-4 py-2">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="staffId" value={staffId} />
        <input type="hidden" name="date" value={date} />

        <span className="min-w-0 flex-1 text-sm">
          {name}
          {role ? <span className="ml-1.5 text-xs text-[var(--text-subtle)]">{role}</span> : null}
          {minutesLate ? (
            <span className="ml-1.5 text-xs text-[var(--warning)]">
              {minutesLate} min late
            </span>
          ) : null}
        </span>

        {source === "unmarked" ? (
          <Badge tone="neutral">Not marked</Badge>
        ) : (
          <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
        )}

        <Select
          name="status"
          defaultValue={status === "UNMARKED" ? "PRESENT" : status}
          aria-label={`Status for ${name}`}
          className="w-32"
          disabled={!canRecord}
        >
          {MARKABLE.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </Select>

        <Input
          name="arrived"
          defaultValue={formatClock(arrivedMinutes)}
          placeholder="07:45"
          inputMode="numeric"
          aria-label={`Arrived, ${name}`}
          className="w-20 text-center"
          disabled={!canRecord}
        />
        <Input
          name="left"
          defaultValue={formatClock(leftMinutes)}
          placeholder="15:00"
          inputMode="numeric"
          aria-label={`Left, ${name}`}
          className="w-20 text-center"
          disabled={!canRecord}
        />
        <Input
          name="reason"
          defaultValue={note ?? ""}
          placeholder="Reason"
          aria-label={`Reason for ${name}`}
          className="w-40"
          disabled={!canRecord}
        />

        {canRecord ? <Submitting>Save</Submitting> : null}
      </form>

      {canRecord && source === "register" ? (
        <form action={clearAction} className="mt-1">
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="date" value={date} />
          <button
            type="submit"
            className="text-xs text-[var(--text-subtle)] underline-offset-2 hover:underline"
          >
            Clear this mark
          </button>
        </form>
      ) : null}

      {state.error ? (
        <p className="mt-1 text-xs text-[var(--danger)]">{state.error}</p>
      ) : null}
      {clearState.error ? (
        <p className="mt-1 text-xs text-[var(--danger)]">{clearState.error}</p>
      ) : null}
    </li>
  );
}

/**
 * Fill in everybody nobody has mentioned.
 *
 * Only the gaps: pressing it after three absences have been recorded must not
 * turn those three present, which is the one way this button could do harm.
 */
export function MarkRemainingForm({
  date,
  remaining,
}: {
  date: string;
  remaining: number;
}) {
  const [state, action] = useActionState<RegisterState, FormData>(
    markRemainingPresentAction,
    {},
  );

  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="date" value={date} />
        <Button type="submit" size="sm" disabled={remaining === 0}>
          <CheckCheck className="size-3.5" />
          {remaining === 0
            ? "Everybody accounted for"
            : `Mark the remaining ${remaining} present`}
        </Button>
      </form>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
    </div>
  );
}
