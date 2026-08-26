"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2, Unlink } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  Field,
  Input,
} from "@/components/ui";

import {
  createGuardianLoginAction,
  deleteGuardianAction,
  linkWardAction,
  unlinkWardAction,
  type GuardianState,
} from "./actions";

const RELATIONS = [
  { value: "MOTHER", label: "Mother" },
  { value: "FATHER", label: "Father" },
  { value: "STEP_MOTHER", label: "Step-mother" },
  { value: "STEP_FATHER", label: "Step-father" },
  { value: "GRANDMOTHER", label: "Grandmother" },
  { value: "GRANDFATHER", label: "Grandfather" },
  { value: "AUNT", label: "Aunt" },
  { value: "UNCLE", label: "Uncle" },
  { value: "SISTER", label: "Sister" },
  { value: "BROTHER", label: "Brother" },
  { value: "COUSIN", label: "Cousin" },
  { value: "SPONSOR", label: "Sponsor" },
  { value: "GUARDIAN", label: "Guardian" },
  { value: "OTHER", label: "Other" },
];

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" className="w-full" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

/** Links a student, with the flags that decide billing, pick-up and reports. */
export function LinkWardCard({
  guardianId,
  students,
}: {
  guardianId: string;
  students: SelectOption[];
}) {
  const [state, action] = useActionState<GuardianState, FormData>(linkWardAction, {});

  return (
    <Card>
      <CardHeader
        title="Link a ward"
        description="The flags matter: they decide who is billed, who is called first, and who may collect the child."
      />
      <form action={action}>
        <CardBody className="space-y-3">
          <input type="hidden" name="guardianId" value={guardianId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

          <Field label="Student" htmlFor="studentId" required>
            <SearchableSelect id="studentId" name="studentId" options={students} required />
          </Field>
          <Field label="Relationship" htmlFor="relation">
            <SearchableSelect
              id="relation"
              name="relation"
              clearable={false}
              defaultValue="GUARDIAN"
              options={RELATIONS}
            />
          </Field>

          <CheckboxField
            name="isPrimary"
            label="Primary contact"
            description="First call for everything about this child."
          />
          <CheckboxField
            name="isBillPayer"
            label="Bill payer"
            description="Receives invoices and fee reminders."
          />
          <CheckboxField
            name="isEmergency"
            label="Emergency contact"
            description="Called from the clinic."
          />

          <Submit label="Link ward" busy="Linking…" />
        </CardBody>
      </form>
    </Card>
  );
}

export function UnlinkWardButton({
  guardianId,
  studentId,
}: {
  guardianId: string;
  studentId: string;
}) {
  return (
    <form action={unlinkWardAction}>
      <input type="hidden" name="guardianId" value={guardianId} />
      <input type="hidden" name="studentId" value={studentId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        title="Unlink this ward. The student and the guardian both remain."
      >
        <Unlink className="size-3.5" />
        Unlink
      </Button>
    </form>
  );
}

export function GuardianAccountCard({
  guardianId,
  suggestedEmail,
  suggestedPhone,
  hasWards,
}: {
  guardianId: string;
  suggestedEmail: string;
  suggestedPhone: string;
  hasWards: boolean;
}) {
  const [state, action] = useActionState<GuardianState, FormData>(
    createGuardianLoginAction,
    {},
  );

  return (
    <Card>
      <CardHeader
        title="Create a portal login"
        description="Fees, results, attendance and messages for their wards."
      />
      <form action={action}>
        <CardBody className="space-y-3">
          <input type="hidden" name="id" value={guardianId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          {state.ok && state.temporaryPassword ? (
            <Alert tone="success">
              <span className="block">
                Account created. The temporary password is{" "}
                <span className="numeric font-semibold">{state.temporaryPassword}</span>.
              </span>
              <span className="mt-1 block text-xs">
                Pass it on now: it is not shown again, and it stops working once they
                sign in and choose their own.
              </span>
            </Alert>
          ) : null}

          {!hasWards ? (
            <Alert tone="info">Link a ward first: an empty portal helps nobody.</Alert>
          ) : null}

          <Field label="Email" htmlFor="portal-email">
            <Input id="portal-email" name="email" type="email" defaultValue={suggestedEmail} />
          </Field>
          <Field label="Phone" htmlFor="portal-phone">
            <Input id="portal-phone" name="phone" defaultValue={suggestedPhone} />
          </Field>

          <Submit label="Create account" busy="Creating…" />
        </CardBody>
      </form>
    </Card>
  );
}

export function DeleteGuardianCard({
  guardianId,
  name,
  wardCount,
  paymentCount,
}: {
  guardianId: string;
  name: string;
  wardCount: number;
  paymentCount: number;
}) {
  const [state, action] = useActionState<GuardianState, FormData>(
    async (_previous, formData) => deleteGuardianAction(formData),
    {},
  );

  const blocked = wardCount > 0 || paymentCount > 0;

  return (
    <Card>
      <CardHeader title="Delete this record" />
      <CardBody className="space-y-3">
        <Alert tone="warning">
          {blocked
            ? `${name} ${wardCount ? `is linked to ${wardCount} ward${wardCount === 1 ? "" : "s"}` : ""}${wardCount && paymentCount ? " and " : ""}${paymentCount ? `has ${paymentCount} payment${paymentCount === 1 ? "" : "s"} on the ledger` : ""}, so this will be refused. Unlink the wards first; payment history keeps its payer.`
            : "Nothing depends on this record, so it can be removed."}
        </Alert>

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <form action={action}>
          <input type="hidden" name="id" value={guardianId} />
          <Button type="submit" variant="danger" size="sm" className="w-full">
            <Trash2 className="size-4" />
            Delete permanently
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
