"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ClipboardCheck, PackagePlus, PackageMinus, Save } from "lucide-react";

import {
  Alert,
  Button,
  CardBody,
  CheckboxField,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { MOVEMENT_KINDS } from "@/lib/stock-rules";

import {
  recordCountAction,
  recordMovementAction,
  saveStockCategoryAction,
  saveStockItemAction,
  type StoreFormState,
} from "./actions";

export type StockPickLists = {
  categories: Array<{ id: string; name: string; code: string | null }>;
  locations: Array<{ id: string; name: string; building: string | null }>;
  staff: Array<{ id: string; firstName: string; lastName: string; jobTitle: string | null }>;
  vendors: Array<{ id: string; name: string }>;
};

function Submit({ label, icon }: { label: string; icon: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {icon}
      {pending ? "Working…" : label}
    </Button>
  );
}

function Outcome({ state }: { state: StoreFormState }) {
  if (state.error) return <Alert tone="danger">{state.error}</Alert>;
  if (state.ok && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

// -----------------------------------------------------------------------------
// The item
// -----------------------------------------------------------------------------

export type ItemValues = {
  id?: string;
  name?: string;
  description?: string | null;
  categoryId?: string;
  unit?: string;
  reorderLevel?: string;
  reorderQuantity?: string;
  locationId?: string | null;
  perishable?: boolean;
  expiresOn?: string;
  active?: boolean;
  notes?: string | null;
};

export function ItemForm({
  lists,
  values = {},
}: {
  lists: StockPickLists;
  values?: ItemValues;
}) {
  const [state, action] = useActionState<StoreFormState, FormData>(saveStockItemAction, {});
  const [perishable, setPerishable] = useState(values.perishable ?? false);

  return (
    <form action={action}>
      <CardBody className="space-y-4">
        <Outcome state={state} />
        {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What is it" htmlFor="name">
            <Input id="name" name="name" required defaultValue={values.name} placeholder="Rice, perfumed" />
          </Field>
          <Field label="Category" htmlFor="categoryId">
            <Select id="categoryId" name="categoryId" required defaultValue={values.categoryId ?? ""}>
              <option value="">Choose…</option>
              {lists.categories.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Unit"
            htmlFor="unit"
            hint="How the store counts it: sack, ream, box, litre, each."
          >
            <Input id="unit" name="unit" defaultValue={values.unit ?? "each"} />
          </Field>
          <Field
            label="Reorder at"
            htmlFor="reorderLevel"
            hint="Buy more at or below this. Blank means nobody is watching it."
          >
            <Input id="reorderLevel" name="reorderLevel" inputMode="decimal" defaultValue={values.reorderLevel} />
          </Field>
          <Field
            label="Order back up to"
            htmlFor="reorderQuantity"
            hint="Blank falls back to the reorder level."
          >
            <Input
              id="reorderQuantity"
              name="reorderQuantity"
              inputMode="decimal"
              defaultValue={values.reorderQuantity}
            />
          </Field>
        </div>

        <Field label="Where it is kept" htmlFor="locationId" hint="Shared with the asset register.">
          <Select id="locationId" name="locationId" defaultValue={values.locationId ?? ""}>
            <option value="">Not recorded</option>
            {lists.locations.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {[entry.name, entry.building].filter(Boolean).join(" · ")}
              </option>
            ))}
          </Select>
        </Field>

        <CheckboxField
          name="perishable"
          label="It has a date on it"
          description="Food, medicines, chemicals. The store will warn before it goes off."
          defaultChecked={values.perishable ?? false}
          onChange={(event) => setPerishable(event.currentTarget.checked)}
        />

        {perishable ? (
          <Field
            label="Best before"
            htmlFor="expiresOn"
            hint="The date on what is currently on the shelf. Each delivery can update it."
          >
            <Input id="expiresOn" name="expiresOn" type="date" defaultValue={values.expiresOn} />
          </Field>
        ) : null}

        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={2} defaultValue={values.notes ?? ""} />
        </Field>

        <CheckboxField
          name="active"
          label="In use"
          description="Turn off for something the store no longer keeps. Its history stays."
          defaultChecked={values.active ?? true}
        />

        <div className="flex gap-2 pt-1">
          <Submit
            label={values.id ? "Save changes" : "Add to the store"}
            icon={<Save className="size-3.5" />}
          />
        </div>
      </CardBody>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Movements
// -----------------------------------------------------------------------------

export function ReceiveForm({
  itemId,
  unit,
  perishable,
  vendors,
}: {
  itemId: string;
  unit: string;
  perishable: boolean;
  vendors: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState<StoreFormState, FormData>(recordMovementAction, {});

  return (
    <form action={action} className="space-y-3">
      <Outcome state={state} />
      <input type="hidden" name="itemId" value={itemId} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Kind" htmlFor="receive-kind">
          <Select id="receive-kind" name="kind" defaultValue="RECEIPT">
            {MOVEMENT_KINDS.filter((entry) => entry.inward && entry.value !== "ADJUSTMENT_UP").map(
              (entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field label={`How many ${unit}`} htmlFor="receive-quantity">
          <Input id="receive-quantity" name="quantity" inputMode="decimal" required />
        </Field>
        <Field
          label={`Cost per ${unit}`}
          htmlFor="receive-cost"
          hint="In cedis. This is what moves the average."
        >
          <Input id="receive-cost" name="unitCost" inputMode="decimal" />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="When" htmlFor="receive-date">
          <Input id="receive-date" name="occurredOn" type="date" />
        </Field>
        <Field label="From" htmlFor="receive-vendor">
          <Select id="receive-vendor" name="vendorId" defaultValue="">
            <option value="">Not recorded</option>
            {vendors.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </Select>
        </Field>
        {perishable ? (
          <Field label="Best before" htmlFor="receive-expiry">
            <Input id="receive-expiry" name="expiresOn" type="date" />
          </Field>
        ) : (
          <Field label="Delivery note" htmlFor="receive-ref">
            <Input id="receive-ref" name="reference" placeholder="DN-4471" />
          </Field>
        )}
      </div>

      <Field label="Note" htmlFor="receive-note">
        <Input id="receive-note" name="note" />
      </Field>

      <Submit label="Record the delivery" icon={<PackagePlus className="size-3.5" />} />
    </form>
  );
}

export function IssueForm({
  itemId,
  unit,
  onHand,
  staff,
}: {
  itemId: string;
  unit: string;
  onHand: string;
  staff: Array<{ id: string; firstName: string; lastName: string }>;
}) {
  const [state, action] = useActionState<StoreFormState, FormData>(recordMovementAction, {});

  return (
    <form action={action} className="space-y-3">
      <Outcome state={state} />
      <input type="hidden" name="itemId" value={itemId} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Kind" htmlFor="issue-kind">
          <Select id="issue-kind" name="kind" defaultValue="ISSUE">
            {MOVEMENT_KINDS.filter(
              (entry) => !entry.inward && entry.value !== "ADJUSTMENT_DOWN",
            ).map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`How many ${unit}`} htmlFor="issue-quantity" hint={`${onHand} on the shelf.`}>
          <Input id="issue-quantity" name="quantity" inputMode="decimal" required />
        </Field>
        <Field label="When" htmlFor="issue-date">
          <Input id="issue-date" name="occurredOn" type="date" />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="To whom" htmlFor="issue-staff">
          <Select id="issue-staff" name="issuedToId" defaultValue="">
            <option value="">Not recorded</option>
            {staff.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.firstName} {entry.lastName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="For which part of the school" htmlFor="issue-dept">
          <Input id="issue-dept" name="issuedToDept" placeholder="Dining hall" />
        </Field>
      </div>

      <Field label="What for" htmlFor="issue-note">
        <Input id="issue-note" name="note" placeholder="Week 4 provisions" />
      </Field>

      <p className="text-xs text-[var(--text-muted)]">
        A voucher number is issued automatically, and is what the person taking the
        goods signs for.
      </p>

      <Submit label="Issue it" icon={<PackageMinus className="size-3.5" />} />
    </form>
  );
}

export function CountForm({
  itemId,
  unit,
  onHand,
}: {
  itemId: string;
  unit: string;
  onHand: string;
}) {
  const [state, action] = useActionState<StoreFormState, FormData>(recordCountAction, {});

  return (
    <form action={action} className="space-y-3">
      <Outcome state={state} />
      <input type="hidden" name="itemId" value={itemId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={`Counted (${unit})`}
          htmlFor="counted"
          hint={`The book says ${onHand}.`}
        >
          <Input id="counted" name="counted" inputMode="decimal" required />
        </Field>
        <Field label="When" htmlFor="count-date">
          <Input id="count-date" name="occurredOn" type="date" />
        </Field>
      </div>

      <Field label="Note" htmlFor="count-note">
        <Input id="count-note" name="note" placeholder="End-of-term count" />
      </Field>

      <p className="text-xs text-[var(--text-muted)]">
        The difference is recorded as an adjustment, not the count — the balance
        stays the sum of the movements. A count that agrees writes nothing.
      </p>

      <Submit label="Record the count" icon={<ClipboardCheck className="size-3.5" />} />
    </form>
  );
}

// -----------------------------------------------------------------------------
// Categories
// -----------------------------------------------------------------------------

export function StockCategoryForm({
  values = {},
}: {
  values?: {
    id?: string;
    name?: string;
    code?: string | null;
    sortOrder?: number;
    active?: boolean;
    notes?: string | null;
  };
}) {
  const [state, action] = useActionState<StoreFormState, FormData>(
    saveStockCategoryAction,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <Outcome state={state} />
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" htmlFor={`sc-name-${values.id ?? "new"}`}>
          <Input
            id={`sc-name-${values.id ?? "new"}`}
            name="name"
            required
            defaultValue={values.name}
            placeholder="Provisions"
          />
        </Field>
        <Field
          label="Code"
          htmlFor={`sc-code-${values.id ?? "new"}`}
          hint="Used in the item code: STM/PRV/0012."
        >
          <Input
            id={`sc-code-${values.id ?? "new"}`}
            name="code"
            maxLength={6}
            defaultValue={values.code ?? ""}
            placeholder="PRV"
          />
        </Field>
        <Field label="Order" htmlFor={`sc-sort-${values.id ?? "new"}`}>
          <Input
            id={`sc-sort-${values.id ?? "new"}`}
            name="sortOrder"
            type="number"
            defaultValue={values.sortOrder ?? 0}
          />
        </Field>
      </div>

      <CheckboxField
        name="active"
        label="In use"
        defaultChecked={values.active ?? true}
      />

      <Submit
        label={values.id ? "Save" : "Add the category"}
        icon={<Save className="size-3.5" />}
      />
    </form>
  );
}
