"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ShieldAlert, Trash2 } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
} from "@/components/ui";

import {
  createStaffLoginAction,
  deleteStaffAction,
  setStaffStatusAction,
  type StaffState,
} from "./actions";

const STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "PROBATION", label: "On probation" },
  { value: "ON_LEAVE", label: "On leave" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "RESIGNED", label: "Resigned" },
  { value: "TERMINATED", label: "Terminated" },
  { value: "RETIRED", label: "Retired" },
];

const LEAVING = ["RESIGNED", "TERMINATED", "RETIRED"];

function Submit({ label, busy, variant = "primary" }: { label: string; busy: string; variant?: "primary" | "outline" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="sm" className="w-full" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

/**
 * Employment status, and leaving.
 *
 * Deliberately not part of the profile edit form. Correcting a spelling and
 * recording that somebody has left the school are different acts with
 * different consequences — the second one ends their access — and putting them
 * behind the same Save button invites the second by accident.
 */
export function StaffStatusCard({
  staffId,
  status,
  exitDate,
  exitReason,
}: {
  staffId: string;
  status: string;
  exitDate: string;
  exitReason: string;
}) {
  const [state, action] = useActionState<StaffState, FormData>(setStaffStatusAction, {});
  const [chosen, setChosen] = useState(status);
  const leaving = LEAVING.includes(chosen);

  return (
    <Card>
      <CardHeader
        title="Employment status"
        description="Suspending or ending employment also signs them out everywhere."
      />
      <form action={action}>
        <CardBody className="space-y-3">
          <input type="hidden" name="id" value={staffId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

          <Field label="Status" htmlFor="status">
            <SearchableSelect
              id="status"
              name="status"
              clearable={false}
              value={chosen}
              onChange={(value) => setChosen(value as string)}
              options={STATUSES}
            />
          </Field>

          {leaving ? (
            <>
              <Field label="Last day" htmlFor="exitDate">
                <Input id="exitDate" name="exitDate" type="date" defaultValue={exitDate} />
              </Field>
              <Field label="Reason" htmlFor="exitReason">
                <Input id="exitReason" name="exitReason" defaultValue={exitReason} />
              </Field>
            </>
          ) : null}

          <Submit label="Update status" busy="Saving…" variant="outline" />
        </CardBody>
      </form>
    </Card>
  );
}

/**
 * Creates the login, and links it to this person.
 *
 * The page used to send administrators to Users & roles, which creates an
 * account with no staff link — one that signs in and then cannot take a
 * register, because every one of those checks reads user.staffId.
 */
export function StaffAccountCard({
  staffId,
  roles,
  suggestedEmail,
  suggestedPhone,
}: {
  staffId: string;
  roles: SelectOption[];
  suggestedEmail: string;
  suggestedPhone: string;
}) {
  const [state, action] = useActionState<StaffState, FormData>(createStaffLoginAction, {});

  return (
    <Card>
      <CardHeader
        title="Create a login"
        description="Links the account to this record, so their permissions follow them."
      />
      <form action={action}>
        <CardBody className="space-y-3">
          <input type="hidden" name="id" value={staffId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          {state.ok && state.temporaryPassword ? (
            <Alert tone="success">
              <span className="block">
                Account created. The temporary password is{" "}
                <span className="numeric font-semibold">{state.temporaryPassword}</span>.
              </span>
              <span className="mt-1 block text-xs">
                Write it down now — it is not shown again, and it stops working once
                they sign in and choose their own.
              </span>
            </Alert>
          ) : null}

          <Field label="Email" htmlFor="account-email">
            <Input id="account-email" name="email" type="email" defaultValue={suggestedEmail} />
          </Field>
          <Field label="Phone" htmlFor="account-phone" hint="Either will do; both is better.">
            <Input id="account-phone" name="phone" defaultValue={suggestedPhone} />
          </Field>
          <Field label="Roles" htmlFor="roleIds" required>
            <SearchableSelect id="roleIds" name="roleIds" multiple options={roles} required />
          </Field>

          <Submit label="Create account" busy="Creating…" variant="outline" />
        </CardBody>
      </form>
    </Card>
  );
}

/**
 * Deleting, with the reason it is usually the wrong choice stated up front.
 *
 * The action refuses when there is history attached; this says so before the
 * click rather than after it.
 */
export function DeleteStaffCard({
  staffId,
  name,
  historyCount,
}: {
  staffId: string;
  name: string;
  historyCount: number;
}) {
  const [state, action] = useActionState<StaffState, FormData>(
    async (_previous, formData) => deleteStaffAction(formData),
    {},
  );

  return (
    <Card>
      <CardHeader title="Delete this record" />
      <CardBody className="space-y-3">
        <Alert tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            {historyCount > 0 ? (
              <span>
                {name} has {historyCount} register{historyCount === 1 ? "" : "s"}, mark
                {historyCount === 1 ? "" : "s"} or class assignment
                {historyCount === 1 ? "" : "s"} on record, so this will be refused.
                Set their status to Resigned or Retired instead: the history keeps a
                name against it and they lose access either way.
              </span>
            ) : (
              <span>
                Nothing depends on this record yet, so it can be removed. For anyone
                who has taught here, use the status field instead.
              </span>
            )}
          </span>
        </Alert>

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <form action={action}>
          <input type="hidden" name="id" value={staffId} />
          <Button type="submit" variant="danger" size="sm" className="w-full">
            <Trash2 className="size-4" />
            Delete permanently
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
