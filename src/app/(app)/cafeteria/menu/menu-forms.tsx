"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Modal } from "@/components/modal";
import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { ALLERGENS, dayLabel, sittingLabel } from "@/lib/cafeteria-rules";

import {
  activateMenuAction,
  deleteMenuItemAction,
  saveMenuAction,
  saveMenuItemAction,
  type CafeteriaState,
} from "../actions";

function Submit({ label, full = true }: { label: string; full?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className={full ? "w-full" : undefined} disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {pending ? "Saving…" : label}
    </Button>
  );
}

// ---------------------------------------------------------------------------

export function MenuButton({ years, terms }: { years: SelectOption[]; terms: SelectOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<CafeteriaState, FormData>(saveMenuAction, {});
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      setOpen(false);
    }
  }, [state.ok, router]);

  const monday = (() => {
    const now = new Date();
    const back = (now.getDay() === 0 ? 7 : now.getDay()) - 1;
    now.setDate(now.getDate() - back);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New menu
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="New menu">
        <form action={action} className="space-y-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <Field label="Name" htmlFor="name" required>
            <Input id="name" name="name" required placeholder="Term 1 cycle menu" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Academic year" htmlFor="academicYearId" required>
              <SearchableSelect id="academicYearId" name="academicYearId" options={years} clearable={false} />
            </Field>
            <Field label="Term" htmlFor="termId" hint="Optional. A menu can run all year.">
              <SearchableSelect id="termId" name="termId" options={terms} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Cycle length"
              htmlFor="cycleWeeks"
              hint="Weeks before it repeats. Two is usual; one means the same thing every Monday."
            >
              <Input id="cycleWeeks" name="cycleWeeks" type="number" min="1" max="8" defaultValue="2" />
            </Field>
            <Field
              label="Counting from"
              htmlFor="startsOn"
              hint="Week 1 starts on this date's Monday, so the rota never drifts."
            >
              <Input id="startsOn" name="startsOn" type="date" defaultValue={monday} />
            </Field>
          </div>

          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={2} />
          </Field>

          <Submit label="Create the menu" />
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------

export function ActivateMenuForm({ menuId, name }: { menuId: string; name: string }) {
  const [state, action] = useActionState<CafeteriaState, FormData>(activateMenuAction, {});
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={menuId} />
      {state.error ? (
        <span className="text-xs text-[var(--danger)]">{state.error}</span>
      ) : null}
      <ActivateSubmit name={name} />
    </form>
  );
}

function ActivateSubmit({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending} title={`Make ${name} live`}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      Make it live
    </Button>
  );
}

// ---------------------------------------------------------------------------

export type DishValues = {
  id: string;
  dish: string;
  accompaniment: string;
  allergens: string[];
  isVegetarian: boolean;
  notes: string;
};

/**
 * One cell of the rota.
 *
 * The allergens are checkboxes from the controlled list rather than a text
 * box, because free text here is compared against a pupil's recorded allergies
 * and a spelling that does not match produces no warning at all. A silent miss
 * is the worst failure this module has.
 */
export function DishButton({
  menuId,
  week,
  day,
  sitting,
  values,
}: {
  menuId: string;
  week: number;
  day: number;
  sitting: string;
  values?: DishValues;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<CafeteriaState, FormData>(saveMenuItemAction, {});
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      setOpen(false);
    }
  }, [state.ok, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 rounded text-xs text-[var(--text-subtle)] transition-colors hover:text-[var(--primary)]"
      >
        {values ? <Pencil className="size-3" /> : <Plus className="size-3" />}
        {values ? "Edit" : "Add a dish"}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${dayLabel(day)} ${sittingLabel(sitting).toLowerCase()}, week ${week}`}
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="menuId" value={menuId} />
          <input type="hidden" name="weekNumber" value={week} />
          <input type="hidden" name="dayOfWeek" value={day} />
          <input type="hidden" name="sitting" value={sitting} />
          {values ? <input type="hidden" name="id" value={values.id} /> : null}

          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <Field label="Dish" htmlFor="dish" required>
            <Input id="dish" name="dish" required defaultValue={values?.dish} placeholder="Jollof rice and chicken" />
          </Field>

          <Field label="With" htmlFor="accompaniment">
            <Input
              id="accompaniment"
              name="accompaniment"
              defaultValue={values?.accompaniment}
              placeholder="Shito and salad"
            />
          </Field>

          <Field
            label="What is in it"
            hint="Ticked here, warned at the counter. A dish with nothing ticked raises no warnings for anybody."
          >
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {ALLERGENS.map((allergen) => (
                <label
                  key={allergen.key}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm hover:bg-[var(--bg-subtle)]"
                >
                  <input
                    type="checkbox"
                    name="allergens"
                    value={allergen.key}
                    defaultChecked={values?.allergens.includes(allergen.key)}
                    className="accent-[var(--primary)]"
                  />
                  {allergen.label}
                </label>
              ))}
            </div>
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isVegetarian"
              defaultChecked={values?.isVegetarian}
              className="accent-[var(--primary)]"
            />
            Vegetarian
          </label>

          <Field label="Notes" htmlFor="notes">
            <Input id="notes" name="notes" defaultValue={values?.notes} />
          </Field>

          <div className="flex gap-2">
            <Submit label={values ? "Save" : "Add it"} />
            {values ? <RemoveDish id={values.id} onDone={() => setOpen(false)} /> : null}
          </div>
        </form>
      </Modal>
    </>
  );
}

function RemoveDish({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const body = new FormData();
        body.set("id", id);
        await deleteMenuItemAction(body);
        setBusy(false);
        router.refresh();
        onDone();
      }}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      Remove
    </Button>
  );
}
