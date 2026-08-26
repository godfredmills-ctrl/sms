"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Save } from "lucide-react";

import {
  Alert,
  Button,
  CheckboxField,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";

import {
  saveAssetCategoryAction,
  saveAssetLocationAction,
  type AssetFormState,
} from "../actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {label.startsWith("Add") ? <Plus className="size-3.5" /> : <Save className="size-3.5" />}
      {pending ? "Saving…" : label}
    </Button>
  );
}

function Outcome({ state }: { state: AssetFormState }) {
  if (state.error) return <Alert tone="danger">{state.error}</Alert>;
  if (state.ok && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

export type CategoryValues = {
  id?: string;
  name?: string;
  code?: string | null;
  usefulLifeYears?: number | null;
  residualPercent?: number;
  sortOrder?: number;
  active?: boolean;
  notes?: string | null;
};

export function CategoryForm({ values = {} }: { values?: CategoryValues }) {
  const [state, action] = useActionState<AssetFormState, FormData>(
    saveAssetCategoryAction,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <Outcome state={state} />
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor={`cat-name-${values.id ?? "new"}`}>
          <Input
            id={`cat-name-${values.id ?? "new"}`}
            name="name"
            required
            defaultValue={values.name}
            placeholder="ICT equipment"
          />
        </Field>
        <Field
          label="Code"
          htmlFor={`cat-code-${values.id ?? "new"}`}
          hint="Two or three letters. It becomes the middle of every tag: STM/ICT/0042."
        >
          <Input
            id={`cat-code-${values.id ?? "new"}`}
            name="code"
            maxLength={6}
            defaultValue={values.code ?? ""}
            placeholder="ICT"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Useful life (years)"
          htmlFor={`cat-life-${values.id ?? "new"}`}
          hint="Blank means this kind is not depreciated: land, mostly."
        >
          <Input
            id={`cat-life-${values.id ?? "new"}`}
            name="usefulLifeYears"
            type="number"
            min={0}
            defaultValue={values.usefulLifeYears ?? ""}
          />
        </Field>
        <Field
          label="Worth at the end (%)"
          htmlFor={`cat-res-${values.id ?? "new"}`}
          hint="Of cost. A vehicle is usually worth something; a laptop is not."
        >
          <Input
            id={`cat-res-${values.id ?? "new"}`}
            name="residualPercent"
            type="number"
            min={0}
            max={100}
            defaultValue={values.residualPercent ?? 0}
          />
        </Field>
        <Field label="Order" htmlFor={`cat-sort-${values.id ?? "new"}`}>
          <Input
            id={`cat-sort-${values.id ?? "new"}`}
            name="sortOrder"
            type="number"
            defaultValue={values.sortOrder ?? 0}
          />
        </Field>
      </div>

      <CheckboxField
        name="active"
        label="In use"
        description="Turn off to keep the category out of new entries without disturbing what is already filed under it."
        defaultChecked={values.active ?? true}
      />

      <Submit label={values.id ? "Save" : "Add the category"} />
    </form>
  );
}

export type LocationValues = {
  id?: string;
  name?: string;
  building?: string | null;
  room?: string | null;
  campusId?: string | null;
  sortOrder?: number;
  active?: boolean;
  notes?: string | null;
};

export function LocationForm({
  values = {},
  campuses,
}: {
  values?: LocationValues;
  campuses: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState<AssetFormState, FormData>(
    saveAssetLocationAction,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <Outcome state={state} />
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" htmlFor={`loc-name-${values.id ?? "new"}`}>
          <Input
            id={`loc-name-${values.id ?? "new"}`}
            name="name"
            required
            defaultValue={values.name}
            placeholder="Science laboratory"
          />
        </Field>
        <Field label="Building" htmlFor={`loc-building-${values.id ?? "new"}`}>
          <Input
            id={`loc-building-${values.id ?? "new"}`}
            name="building"
            defaultValue={values.building ?? ""}
            placeholder="Science block"
          />
        </Field>
        <Field label="Room" htmlFor={`loc-room-${values.id ?? "new"}`}>
          <Input
            id={`loc-room-${values.id ?? "new"}`}
            name="room"
            defaultValue={values.room ?? ""}
            placeholder="Lab 2"
          />
        </Field>
      </div>

      {campuses.length > 1 ? (
        <Field label="Campus" htmlFor={`loc-campus-${values.id ?? "new"}`}>
          <Select
            id={`loc-campus-${values.id ?? "new"}`}
            name="campusId"
            defaultValue={values.campusId ?? ""}
          >
            <option value="">Not specified</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field label="Notes" htmlFor={`loc-notes-${values.id ?? "new"}`}>
        <Textarea
          id={`loc-notes-${values.id ?? "new"}`}
          name="notes"
          rows={2}
          defaultValue={values.notes ?? ""}
        />
      </Field>

      <CheckboxField
        name="active"
        label="In use"
        description="Turn off for a room that no longer exists. Anything recorded as being there keeps its history."
        defaultChecked={values.active ?? true}
      />

      <Submit label={values.id ? "Save" : "Add the location"} />
    </form>
  );
}
