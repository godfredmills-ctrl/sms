"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Save } from "lucide-react";

import {
  Alert,
  Button,
  CardBody,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { ASSET_CONDITIONS, residualFromPercent } from "@/lib/asset-rules";

import { saveAssetAction, type AssetFormState } from "./actions";

export type PickLists = {
  categories: Array<{
    id: string;
    name: string;
    code: string | null;
    usefulLifeYears: number | null;
    residualPercent: number;
  }>;
  locations: Array<{ id: string; name: string; building: string | null }>;
  staff: Array<{ id: string; firstName: string; lastName: string; jobTitle: string | null }>;
  vendors: Array<{ id: string; name: string }>;
};

export type AssetValues = {
  id?: string;
  name?: string;
  description?: string | null;
  categoryId?: string;
  serialNumber?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  condition?: string;
  locationId?: string | null;
  custodianId?: string | null;
  purchasedOn?: string;
  cost?: string;
  residual?: string;
  usefulLifeYears?: string;
  vendorId?: string | null;
  expenseId?: string | null;
  warrantyExpiresOn?: string;
  serviceIntervalMonths?: string;
  lastServicedOn?: string;
  notes?: string | null;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Save className="size-4" />
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function AssetForm({
  lists,
  values = {},
  capitalExpenses = [],
}: {
  lists: PickLists;
  values?: AssetValues;
  capitalExpenses?: Array<{ id: string; reference: string; description: string }>;
}) {
  const [state, action] = useActionState<AssetFormState, FormData>(saveAssetAction, {});
  const [categoryId, setCategoryId] = useState(values.categoryId ?? "");
  const [cost, setCost] = useState(values.cost ?? "");

  const category = lists.categories.find((entry) => entry.id === categoryId);

  // What the category implies, shown rather than silently applied — a bursar
  // who can see "5 years, GH₵1,200 residual" before saving will notice when it
  // is wrong for this particular thing, which is the only moment anybody ever
  // will.
  const impliedResidual =
    category && cost
      ? residualFromPercent(Math.round(Number(cost.replace(/[^0-9.]/g, "")) * 100) || 0, category.residualPercent)
      : 0;

  return (
    <form action={action}>
      <CardBody className="space-y-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What is it" htmlFor="name" hint="As somebody would say it aloud.">
            <Input
              id="name"
              name="name"
              required
              defaultValue={values.name}
              placeholder="Toyota Hiace minibus"
            />
          </Field>

          <Field label="Category" htmlFor="categoryId">
            <Select
              id="categoryId"
              name="categoryId"
              required
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Choose…</option>
              {lists.categories.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {category ? (
          <p className="rounded-lg bg-[var(--bg-subtle)] p-2.5 text-xs text-[var(--text-muted)]">
            {category.usefulLifeYears
              ? `Things in this category are written off over ${category.usefulLifeYears} year${category.usefulLifeYears === 1 ? "" : "s"}`
              : "Things in this category are not depreciated — they are carried at cost"}
            {category.residualPercent > 0
              ? `, keeping ${category.residualPercent}% of their cost at the end.`
              : "."}{" "}
            Both can be overridden below for this one item.
          </p>
        ) : null}

        <Field label="Description" htmlFor="description">
          <Textarea id="description" name="description" rows={2} defaultValue={values.description ?? ""} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Serial number" htmlFor="serialNumber" hint="What is stamped on it.">
            <Input id="serialNumber" name="serialNumber" defaultValue={values.serialNumber ?? ""} />
          </Field>
          <Field label="Model" htmlFor="model">
            <Input id="model" name="model" defaultValue={values.model ?? ""} />
          </Field>
          <Field label="Make" htmlFor="manufacturer">
            <Input id="manufacturer" name="manufacturer" defaultValue={values.manufacturer ?? ""} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Condition" htmlFor="condition">
            <Select id="condition" name="condition" defaultValue={values.condition ?? "GOOD"}>
              {ASSET_CONDITIONS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Where it is" htmlFor="locationId">
            <Select id="locationId" name="locationId" defaultValue={values.locationId ?? ""}>
              <option value="">Not recorded</option>
              {lists.locations.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {[entry.name, entry.building].filter(Boolean).join(" · ")}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Who is answerable for it"
            htmlFor="custodianId"
            hint="Leave blank for anything nobody signs out."
          >
            <Select id="custodianId" name="custodianId" defaultValue={values.custodianId ?? ""}>
              <option value="">Nobody in particular</option>
              {lists.staff.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.firstName} {entry.lastName}
                  {entry.jobTitle ? ` — ${entry.jobTitle}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Bought on" htmlFor="purchasedOn">
            <Input id="purchasedOn" name="purchasedOn" type="date" defaultValue={values.purchasedOn} />
          </Field>

          <Field label="What it cost" htmlFor="cost" hint="In cedis.">
            <Input
              id="cost"
              name="cost"
              inputMode="decimal"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              placeholder="180000.00"
            />
          </Field>

          <Field
            label="Useful life (years)"
            htmlFor="usefulLifeYears"
            hint={
              category?.usefulLifeYears
                ? `Blank uses the category's ${category.usefulLifeYears}.`
                : "Blank means it is not depreciated."
            }
          >
            <Input
              id="usefulLifeYears"
              name="usefulLifeYears"
              type="number"
              min={0}
              defaultValue={values.usefulLifeYears}
            />
          </Field>

          <Field
            label="Worth at the end"
            htmlFor="residual"
            hint={
              impliedResidual > 0
                ? `Blank uses the category's ${category?.residualPercent}% — about GH₵${(impliedResidual / 100).toFixed(2)}.`
                : "Blank means nothing at the end."
            }
          >
            <Input id="residual" name="residual" inputMode="decimal" defaultValue={values.residual} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bought from" htmlFor="vendorId">
            <Select id="vendorId" name="vendorId" defaultValue={values.vendorId ?? ""}>
              <option value="">Not recorded</option>
              {lists.vendors.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="The bill that bought it"
            htmlFor="expenseId"
            hint="Links this thing to the money that paid for it. One bill can buy many things."
          >
            <Select id="expenseId" name="expenseId" defaultValue={values.expenseId ?? ""}>
              <option value="">Not linked</option>
              {capitalExpenses.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.reference} — {entry.description.slice(0, 60)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Warranty runs out" htmlFor="warrantyExpiresOn">
            <Input
              id="warrantyExpiresOn"
              name="warrantyExpiresOn"
              type="date"
              defaultValue={values.warrantyExpiresOn}
            />
          </Field>
          <Field
            label="Service every (months)"
            htmlFor="serviceIntervalMonths"
            hint="A bus, a generator, a lift. Blank for anything that is not serviced."
          >
            <Input
              id="serviceIntervalMonths"
              name="serviceIntervalMonths"
              type="number"
              min={0}
              defaultValue={values.serviceIntervalMonths}
            />
          </Field>
          <Field label="Last serviced" htmlFor="lastServicedOn">
            <Input
              id="lastServicedOn"
              name="lastServicedOn"
              type="date"
              defaultValue={values.lastServicedOn}
            />
          </Field>
        </div>

        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={2} defaultValue={values.notes ?? ""} />
        </Field>

        <div className="flex gap-2 pt-1">
          <Submit label={values.id ? "Save changes" : "Add to the register"} />
        </div>
      </CardBody>
    </form>
  );
}
