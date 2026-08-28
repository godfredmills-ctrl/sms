"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { UserCheck, UserX } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import { Alert, Button, Field, Input } from "@/components/ui";
import { DEACTIVATION_REASONS, describeDeactivation } from "@/lib/guardian-contact";

import { setGuardianStatusAction, type GuardianState } from "./actions";

function Submit({
  label,
  busy,
  variant = "primary",
  icon,
}: {
  label: string;
  busy: string;
  variant?: "primary" | "outline" | "danger";
  icon: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="sm" className="w-full" disabled={pending}>
      {pending ? null : icon}
      {pending ? busy : label}
    </Button>
  );
}

/**
 * Switching a parent off, and the sentence explaining what that does.
 *
 * The wording matters more than the form. "Deactivate" beside a parent's name
 * reads like "delete" to most people, and the member of staff clicking it is
 * usually doing so because a family situation has changed and they are being
 * careful. So the panel says plainly what stops (contact, and the login) and
 * what does not (their child's family record, and every payment they made).
 */
export function GuardianStatusCard({
  guardianId,
  name,
  isActive,
  reason,
  onDone,
}: {
  guardianId: string;
  name: string;
  isActive: boolean;
  reason: string | null;
  onDone?: () => void;
}) {
  const [state, action] = useActionState<GuardianState, FormData>(
    setGuardianStatusAction,
    {},
  );
  const [chosen, setChosen] = useState("");

  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state.ok, onDone]);

  if (isActive) {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={guardianId} />
        <input type="hidden" name="active" value="0" />

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <div className="rounded-lg bg-[var(--bg-subtle)] p-3 text-sm leading-relaxed">
          <p className="font-medium">{name} stops being a contact.</p>
          <ul className="mt-2 space-y-1 text-[var(--text-muted)]">
            <li>No absence texts, fee reminders or report cards.</li>
            <li>Not printed as the emergency contact on a child&rsquo;s ID card.</li>
            <li>Their portal login closes and they are signed out.</li>
          </ul>
          <p className="mt-2 text-[var(--text-muted)]">
            Nothing is deleted. They stay on their children&rsquo;s family record and on
            every payment they have made.
          </p>
        </div>

        <Field label="Why" htmlFor="reason">
          <SearchableSelect
            id="reason"
            name="reason"
            clearable={false}
            value={chosen}
            onChange={(value) => setChosen(value as string)}
            options={DEACTIVATION_REASONS.map((entry) => ({ ...entry }))}
            placeholder="Choose a reason"
          />
        </Field>

        {chosen === "OTHER" ? (
          <Field
            label="What happened"
            htmlFor="note"
            hint="One line. The next member of staff to open this record reads it."
          >
            <Input id="note" name="note" maxLength={200} />
          </Field>
        ) : null}

        <Submit
          label="Deactivate"
          busy="Saving…"
          variant="danger"
          icon={<UserX className="size-4" />}
        />
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={guardianId} />
      <input type="hidden" name="active" value="1" />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="rounded-lg bg-[var(--bg-subtle)] p-3 text-sm leading-relaxed">
        <p className="font-medium">{name} is not currently contacted.</p>
        <p className="mt-1 text-[var(--text-muted)]">
          Recorded reason: {describeDeactivation(reason)}.
        </p>
        <p className="mt-2 text-[var(--text-muted)]">
          Reactivating puts them back on the school&rsquo;s contact lists and reopens
          their portal login.
        </p>
      </div>

      <Submit
        label="Reactivate"
        busy="Saving…"
        variant="outline"
        icon={<UserCheck className="size-4" />}
      />
    </form>
  );
}
