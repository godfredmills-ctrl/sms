"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Loader2, Pencil, Plus } from "lucide-react";

import { Modal } from "@/components/modal";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { SITTINGS } from "@/lib/cafeteria-rules";

import { savePlanAction, type CafeteriaState } from "../actions";

export type PlanValues = {
  id: string;
  code: string;
  name: string;
  description: string;
  sittings: string[];
  price: string;
  perMeal: string;
  isActive: boolean;
};

export function PlanButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New plan
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="New meal plan">
        <PlanForm onSaved={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function PlanEditButton({ plan }: { plan: PlanValues }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" />
        Edit
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Edit ${plan.name}`}>
        <PlanForm values={plan} onSaved={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {pending ? "Saving…" : label}
    </Button>
  );
}

function PlanForm({ values, onSaved }: { values?: PlanValues; onSaved: () => void }) {
  const [state, action] = useActionState<CafeteriaState, FormData>(savePlanAction, {});
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      onSaved();
    }
  }, [state.ok, router, onSaved]);

  return (
    <form action={action} className="space-y-4">
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" required>
          <Input id="name" name="name" required defaultValue={values?.name} placeholder="Lunch only" />
        </Field>
        <Field label="Code" htmlFor="code" required hint="Short, and it appears on the invoice line.">
          <Input id="code" name="code" required defaultValue={values?.code} placeholder="LUNCH" />
        </Field>
      </div>

      <Field label="Description" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={values?.description}
          placeholder="One hot meal at midday, Monday to Friday."
        />
      </Field>

      <Field
        label="Sittings it covers"
        required
        hint="A plan that covers nothing would sell, bill, and then turn the child away at every counter."
      >
        <div className="flex flex-wrap gap-2">
          {SITTINGS.map((sitting) => (
            <label
              key={sitting.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--bg-subtle)]"
            >
              <input
                type="checkbox"
                name="sittings"
                value={sitting.value}
                defaultChecked={values?.sittings.includes(sitting.value)}
                className="accent-[var(--primary)]"
              />
              {sitting.label}
            </label>
          ))}
        </div>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Price a term" htmlFor="price" hint="In cedis.">
          <Input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={values?.price ?? "0.00"}
          />
        </Field>
        <Field
          label="One meal off-plan"
          htmlFor="perMeal"
          hint="Charged when somebody on this plan comes to a sitting it does not cover."
        >
          <Input
            id="perMeal"
            name="perMeal"
            type="number"
            step="0.01"
            min="0"
            defaultValue={values?.perMeal ?? "0.00"}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={values ? values.isActive : true}
          className="accent-[var(--primary)]"
        />
        On sale. Withdrawing a plan leaves everybody already on it exactly where
        they are; it only stops new families choosing it.
      </label>

      <Submit label={values?.id ? "Save changes" : "Create the plan"} />
    </form>
  );
}
