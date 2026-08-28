"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Loader2, Receipt, UserPlus } from "lucide-react";

import { Modal } from "@/components/modal";
import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, Field, Input } from "@/components/ui";
import { formatMoney } from "@/lib/money";

import {
  billSubscriptionsAction,
  setSubscriptionStatusAction,
  subscribeAction,
  type CafeteriaState,
} from "../actions";

function Submit({ label, variant }: { label: string; variant?: "primary" | "outline" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} className="w-full" disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function SubscribeButton({
  termId,
  plans,
  students,
}: {
  termId: string;
  plans: SelectOption[];
  students: SelectOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<CafeteriaState, FormData>(subscribeAction, {});
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      setOpen(false);
    }
  }, [state.ok, router]);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={plans.length === 0}>
        <UserPlus className="size-4" />
        Put a pupil on a plan
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Onto a meal plan">
        <form action={action} className="space-y-4">
          <input type="hidden" name="termId" value={termId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <Field label="Pupil" htmlFor="studentId" required>
            <SearchableSelect
              id="studentId"
              name="studentId"
              options={students}
              clearable={false}
              placeholder="Search by name or admission number"
            />
          </Field>

          <Field label="Plan" htmlFor="planId" required>
            <SearchableSelect id="planId" name="planId" options={plans} clearable={false} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From" htmlFor="startsOn" hint="Defaults to the first day of term.">
              <Input id="startsOn" name="startsOn" type="date" />
            </Field>
            <Field label="Until" htmlFor="endsOn" hint="Leave empty to run to the end of term.">
              <Input id="endsOn" name="endsOn" type="date" />
            </Field>
          </div>

          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            A pupil already on a different plan this term has that one ended the
            day before this starts, rather than overwritten. The weeks already
            billed under it stay explainable.
          </p>

          <Submit label="Put them on it" />
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------

export function BillButton({
  termId,
  count,
  totalMinor,
}: {
  termId: string;
  count: number;
  totalMinor: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<CafeteriaState, FormData>(
    billSubscriptionsAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Receipt className="size-4" />
        Raise the charges
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Raise the meal charges">
        <form action={action} className="space-y-4">
          <input type="hidden" name="termId" value={termId} />

          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

          <div className="rounded-lg bg-[var(--bg-subtle)] p-3 text-sm leading-relaxed">
            <p className="font-medium">
              {count} {count === 1 ? "charge" : "charges"}, {formatMoney(totalMinor)}.
            </p>
            <p className="mt-1 text-[var(--text-muted)]">
              Each is added as a line on that family&rsquo;s existing invoice for the
              term. Every subscription is stamped as charged in the same
              transaction that writes the line, so running this again finds
              nothing rather than billing twice.
            </p>
          </div>

          <Submit label="Raise them" />
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------

export function StatusButton({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<CafeteriaState, FormData>(
    setSubscriptionStatusAction,
    {},
  );
  const [chosen, setChosen] = useState(status);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      setOpen(false);
    }
  }, [state.ok, router]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Change
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`${name}: meal plan`}>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <Field label="Status" htmlFor="status">
            <SearchableSelect
              id="status"
              name="status"
              clearable={false}
              value={chosen}
              onChange={(value) => setChosen(String(value))}
              options={[
                { value: "ACTIVE", label: "Active", description: "Served on the plan" },
                {
                  value: "SUSPENDED",
                  label: "Suspended",
                  description: "Still served, but charged at the counter",
                },
                { value: "ENDED", label: "Ended", description: "Off the plan" },
              ]}
            />
          </Field>

          {chosen === "ENDED" ? (
            <Field label="Last day" htmlFor="endsOn" hint="Defaults to today.">
              <Input id="endsOn" name="endsOn" type="date" />
            </Field>
          ) : null}

          <Field label="Why" htmlFor="reason">
            <Input
              id="reason"
              name="reason"
              maxLength={200}
              placeholder="Fees in arrears, reviewed at half term"
            />
          </Field>

          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            Suspending does not turn a child away from the counter. It moves the
            meal from the plan to cash, so the school has a record of what was
            eaten and what it cost. A system that can refuse a child lunch over
            a billing question is not one a school should be running.
          </p>

          <Submit label="Save" variant="outline" />
        </form>
      </Modal>
    </>
  );
}
