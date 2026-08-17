"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarOff, Check, X } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import {
  Alert,
  Button,
  CardBody,
  Field,
  Input,
  Textarea,
} from "@/components/ui";

import { decideLeaveAction, requestLeaveAction, type LeaveState } from "./actions";

export const LEAVE_TYPES = [
  { value: "ANNUAL", label: "Annual leave" },
  { value: "SICK", label: "Sick leave" },
  { value: "MATERNITY", label: "Maternity leave" },
  { value: "PATERNITY", label: "Paternity leave" },
  { value: "STUDY", label: "Study leave" },
  { value: "COMPASSIONATE", label: "Compassionate leave" },
  { value: "UNPAID", label: "Unpaid leave" },
];

export function RequestLeaveForm() {
  const [state, action] = useActionState<LeaveState, FormData>(
    requestLeaveAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Type" htmlFor="leave-type" required>
          <SearchableSelect
            id="leave-type"
            name="leaveType"
            clearable={false}
            defaultValue="ANNUAL"
            options={LEAVE_TYPES}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="First day" htmlFor="leave-start" required>
            <Input id="leave-start" name="startDate" type="date" required />
          </Field>
          <Field label="Last day" htmlFor="leave-end" hint="Blank for one day.">
            <Input id="leave-end" name="endDate" type="date" />
          </Field>
        </div>

        <Field label="Reason" htmlFor="leave-reason" hint="Optional, seen by the approver.">
          <Textarea id="leave-reason" name="reason" rows={2} />
        </Field>

        <Submit />
        <p className="text-xs text-[var(--text-subtle)]">
          Weekends are not counted. Whoever holds the approval permission is
          notified the moment you submit.
        </p>
      </CardBody>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <CalendarOff className="size-4" />
      {pending ? "Requesting…" : "Request leave"}
    </Button>
  );
}

/** Approve/reject, inline on the queue row, with an optional note. */
export function DecideButtons({ requestId }: { requestId: string }) {
  const [state, action] = useActionState<LeaveState, FormData>(decideLeaveAction, {});
  const [comments, setComments] = useState("");

  if (state.ok) {
    return <span className="text-xs text-[var(--success)]">{state.message}</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {state.error ? (
        <span className="text-xs text-[var(--danger)]">{state.error}</span>
      ) : null}
      <div className="flex items-center gap-1.5">
        <input
          value={comments}
          onChange={(event) => setComments(event.target.value)}
          placeholder="Note (optional)"
          className="h-8 w-36 rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-xs outline-none focus:border-[var(--primary)]"
        />
        <form action={action}>
          <input type="hidden" name="id" value={requestId} />
          <input type="hidden" name="decision" value="APPROVED" />
          <input type="hidden" name="comments" value={comments} />
          <DecideSubmit tone="approve" />
        </form>
        <form action={action}>
          <input type="hidden" name="id" value={requestId} />
          <input type="hidden" name="decision" value="REJECTED" />
          <input type="hidden" name="comments" value={comments} />
          <DecideSubmit tone="reject" />
        </form>
      </div>
    </div>
  );
}

function DecideSubmit({ tone }: { tone: "approve" | "reject" }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={tone === "approve" ? "primary" : "outline"}
      disabled={pending}
      title={tone === "approve" ? "Approve" : "Reject"}
    >
      {tone === "approve" ? <Check className="size-3.5" /> : <X className="size-3.5" />}
    </Button>
  );
}
