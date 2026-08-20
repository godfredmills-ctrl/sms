"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";

import { Alert, Button, Field, Input, Select } from "@/components/ui";

import { createGuardianLinkAction } from "../actions";

const RELATIONS = [
  "MOTHER",
  "FATHER",
  "GUARDIAN",
  "GRANDMOTHER",
  "GRANDFATHER",
  "AUNT",
  "UNCLE",
  "SIBLING",
  "OTHER",
] as const;

/**
 * Adds a parent from the child's own record.
 *
 * The Family tab has always said "link at least one guardian so the school can
 * contact someone" and offered no way to do it: the action existed, and the
 * only route to a parent was to leave the child, open Guardians, create the
 * person there and link back. At admission — the one moment this is always
 * needed — that is three screens to record a mother's phone number.
 *
 * An existing guardian is matched by phone inside the action rather than
 * duplicated, because siblings share parents and two records for one mother
 * means two sets of reminders and a split fee history.
 */
export function AddGuardian({
  studentId,
  firstName,
}: {
  studentId: string;
  firstName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        Add a parent or guardian
      </Button>
    );
  }

  return (
    <form
      action={(formData) =>
        start(async () => {
          setError(null);
          try {
            await createGuardianLinkAction(formData);
            setOpen(false);
          } catch (problem) {
            setError((problem as Error).message);
          }
        })
      }
      className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] p-3"
    >
      <input type="hidden" name="studentId" value={studentId} />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" htmlFor="g-first" required>
          <Input id="g-first" name="firstName" required autoComplete="off" />
        </Field>
        <Field label="Last name" htmlFor="g-last" required>
          <Input id="g-last" name="lastName" required autoComplete="off" />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Phone"
          htmlFor="g-phone"
          required
          hint="How the school reaches them, and how a parent already on file is recognised."
        >
          <Input id="g-phone" name="phone" inputMode="tel" required autoComplete="off" />
        </Field>
        <Field label="Relation" htmlFor="g-relation">
          <Select id="g-relation" name="relation" defaultValue="MOTHER">
            {RELATIONS.map((relation) => (
              <option key={relation} value={relation}>
                {relation.charAt(0) + relation.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email" htmlFor="g-email">
          <Input id="g-email" name="email" type="email" autoComplete="off" />
        </Field>
        <Field label="Occupation" htmlFor="g-occupation">
          <Input id="g-occupation" name="occupation" autoComplete="off" />
        </Field>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding…" : `Add to ${firstName}'s family`}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
