"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRightLeft, ScanLine, Trash2, Wrench } from "lucide-react";

import {
  Alert,
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { ASSET_CONDITIONS, ASSET_STATUSES } from "@/lib/asset-rules";

import {
  moveAssetAction,
  recordMaintenanceAction,
  setAssetStatusAction,
  verifyAssetAction,
  type AssetFormState,
} from "../actions";

function Submit({ label, icon }: { label: string; icon: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {icon}
      {pending ? "Working…" : label}
    </Button>
  );
}

function Outcome({ state }: { state: AssetFormState }) {
  if (state.error) return <Alert tone="danger">{state.error}</Alert>;
  if (state.ok && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

export function MovePanel({
  id,
  locations,
  staff,
  currentLocationId,
  currentCustodianId,
}: {
  id: string;
  locations: Array<{ id: string; name: string; building: string | null }>;
  staff: Array<{ id: string; firstName: string; lastName: string }>;
  currentLocationId: string | null;
  currentCustodianId: string | null;
}) {
  const [state, action] = useActionState<AssetFormState, FormData>(moveAssetAction, {});

  return (
    <form action={action} className="space-y-3">
      <Outcome state={state} />
      <input type="hidden" name="id" value={id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Move it to" htmlFor="toLocationId">
          <Select id="toLocationId" name="toLocationId" defaultValue={currentLocationId ?? ""}>
            <option value="">Not recorded</option>
            {locations.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {[entry.name, entry.building].filter(Boolean).join(" · ")}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Sign it out to" htmlFor="toStaffId">
          <Select id="toStaffId" name="toStaffId" defaultValue={currentCustodianId ?? ""}>
            <option value="">Nobody: return it to the school</option>
            {staff.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.firstName} {entry.lastName}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Why" htmlFor="move-note" hint="Optional, and the thing the history is worth reading for.">
        <Input id="move-note" name="note" placeholder="Taken to the ICT lab for the term" />
      </Field>

      <Submit label="Record the move" icon={<ArrowRightLeft className="size-3.5" />} />
    </form>
  );
}

/**
 * The stock-take panel.
 *
 * Two outcomes, and the second one matters more: somebody walked to where the
 * register says a thing is and it was not there. Recording that is what turns
 * a list into a register.
 */
export function VerifyPanel({ id, condition }: { id: string; condition: string }) {
  const [state, action] = useActionState<AssetFormState, FormData>(verifyAssetAction, {});

  return (
    <form action={action} className="space-y-3">
      <Outcome state={state} />
      <input type="hidden" name="id" value={id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Was it there?" htmlFor="seen">
          <Select id="seen" name="seen" defaultValue="yes">
            <option value="yes">Yes: I have seen it</option>
            <option value="no">No: it could not be found</option>
          </Select>
        </Field>

        <Field
          label="Condition"
          htmlFor="verify-condition"
          hint="Only applied when it was found."
        >
          <Select id="verify-condition" name="condition" defaultValue={condition}>
            {ASSET_CONDITIONS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Note" htmlFor="verify-note">
        <Input id="verify-note" name="note" placeholder="Checked during the end-of-term count" />
      </Field>

      <Submit label="Record the check" icon={<ScanLine className="size-3.5" />} />
    </form>
  );
}

export function ServicePanel({
  id,
  vendors,
}: {
  id: string;
  vendors: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState<AssetFormState, FormData>(
    recordMaintenanceAction,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <Outcome state={state} />
      <input type="hidden" name="id" value={id} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="What" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue="SERVICE">
            <option value="SERVICE">Routine service</option>
            <option value="REPAIR">Repair</option>
            <option value="INSPECTION">Inspection</option>
          </Select>
        </Field>
        <Field label="When" htmlFor="performedOn">
          <Input id="performedOn" name="performedOn" type="date" />
        </Field>
        <Field label="Cost" htmlFor="service-cost" hint="In cedis. Leave blank if free.">
          <Input id="service-cost" name="cost" inputMode="decimal" />
        </Field>
      </div>

      <Field label="What was done" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={2}
          required
          placeholder="Oil and filter change, brake pads replaced"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Who did it" htmlFor="service-vendor">
          <Select id="service-vendor" name="vendorId" defaultValue="">
            <option value="">Not recorded</option>
            {vendors.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Next one due" htmlFor="nextDueOn" hint="Optional: the interval works this out otherwise.">
          <Input id="nextDueOn" name="nextDueOn" type="date" />
        </Field>
      </div>

      <Submit label="Record it" icon={<Wrench className="size-3.5" />} />
    </form>
  );
}

export function StatusPanel({
  id,
  status,
  netBookMinor,
}: {
  id: string;
  status: string;
  netBookMinor: number;
}) {
  const [state, action] = useActionState<AssetFormState, FormData>(setAssetStatusAction, {});

  return (
    <form action={action} className="space-y-3">
      <Outcome state={state} />
      <input type="hidden" name="id" value={id} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Change it to" htmlFor="status">
          <Select id="status" name="status" defaultValue={status}>
            {ASSET_STATUSES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="On" htmlFor="disposedOn" hint="Only used when disposing.">
          <Input id="disposedOn" name="disposedOn" type="date" />
        </Field>
        <Field
          label="Sold for"
          htmlFor="proceeds"
          hint={`Compared with GH₵${(netBookMinor / 100).toFixed(2)} on the books.`}
        >
          <Input id="proceeds" name="proceeds" inputMode="decimal" />
        </Field>
      </div>

      <Field label="Note" htmlFor="status-note">
        <Input id="status-note" name="note" placeholder="Sold to a parent at the agreed valuation" />
      </Field>

      <p className="text-xs text-[var(--text-muted)]">
        Disposing of a thing takes it off what the school holds and clears its
        location and custodian. It stays on the register, and the gain or loss
        against its written-down value is carried into the accounts.
      </p>

      <Submit label="Record it" icon={<Trash2 className="size-3.5" />} />
    </form>
  );
}
