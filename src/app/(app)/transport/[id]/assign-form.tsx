"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { UserPlus, X } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, CardBody, Field, Input, Select } from "@/components/ui";
import { DIRECTIONS } from "@/lib/transport";

import {
  assignTransportAction,
  endTransportAction,
  type TransportState,
} from "../actions";

/** Puts a child on this route, at one of its stops. */
export function AssignForm({
  routeId,
  students,
  stops,
}: {
  routeId: string;
  students: SelectOption[];
  stops: SelectOption[];
}) {
  const [state, action] = useActionState<TransportState, FormData>(
    assignTransportAction,
    {},
  );
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.ok) setFormKey((key) => key + 1);
  }, [state]);

  return (
    <form key={formKey} action={action}>
      <CardBody className="space-y-3">
        <input type="hidden" name="routeId" value={routeId} />

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Child" htmlFor="assign-student" required>
          <SearchableSelect
            id="assign-student"
            name="studentId"
            required
            options={students}
            placeholder="Search by name or admission number…"
            searchPlaceholder="Name or admission number…"
          />
        </Field>

        <Field
          label="Stop"
          htmlFor="assign-stop"
          hint={
            stops.length
              ? "Where they wait. Leave blank only if it is not settled yet."
              : "This route has no stops yet."
          }
        >
          <SearchableSelect
            id="assign-stop"
            name="stopId"
            options={stops}
            placeholder={stops.length ? "Choose a stop…" : "No stops on this route"}
            disabled={stops.length === 0}
          />
        </Field>

        <Field label="Travels" htmlFor="assign-direction">
          <Select id="assign-direction" name="direction" defaultValue="BOTH">
            {DIRECTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Hand over to"
          htmlFor="assign-collected"
          hint="Only if it is not the usual guardian. Printed on the manifest."
        >
          <Input id="assign-collected" name="collectedBy" />
        </Field>

        <Field label="Note for the driver" htmlFor="assign-notes">
          <Input id="assign-notes" name="notes" />
        </Field>

        <Submit />
      </CardBody>
    </form>
  );
}

/** Takes a child off the route from their row on the manifest view. */
export function EndAssignmentButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Take ${name} off this route`}
        className="text-[var(--text-subtle)] hover:text-[var(--danger)]"
      >
        <X className="size-3.5" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-[var(--text-muted)]">Take {name} off?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const data = new FormData();
            data.append("id", id);
            const result = await endTransportAction(data);
            setError(result.error ?? null);
            if (!result.error) setConfirming(false);
          })
        }
        className="font-medium text-[var(--danger)]"
      >
        {pending ? "Removing…" : "Yes"}
      </button>
      <button
        type="button"
        onClick={() => {
          setConfirming(false);
          setError(null);
        }}
        className="text-[var(--text-subtle)]"
      >
        Cancel
      </button>
      {error ? <span className="text-[var(--danger)]">{error}</span> : null}
    </span>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      <UserPlus className="size-4" />
      {pending ? "Adding…" : "Put on this route"}
    </Button>
  );
}
