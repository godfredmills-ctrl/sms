"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarPlus } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import { Alert, Button, CardBody, Field } from "@/components/ui";
import { MONTH_NAMES } from "@/lib/payroll";

import { createPayrollRunAction, type PayrollState } from "./actions";

/**
 * Opens a month. Defaults to the month just gone, which is the one a school
 * is almost always paying for.
 */
export function NewRunForm() {
  const [state, action] = useActionState<PayrollState, FormData>(
    createPayrollRunAction,
    {},
  );
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.ok) setFormKey((key) => key + 1);
  }, [state]);

  const now = new Date();
  // The month just ended: January's run is prepared in February.
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const defaultYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const years = [defaultYear + 1, defaultYear, defaultYear - 1, defaultYear - 2];

  return (
    <form key={formKey} action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Month" htmlFor="run-month" required>
            <SearchableSelect
              id="run-month"
              name="month"
              clearable={false}
              defaultValue={String(defaultMonth)}
              options={MONTH_NAMES.map((name, index) => ({
                value: String(index + 1),
                label: name,
              }))}
              required
            />
          </Field>
          <Field label="Year" htmlFor="run-year" required>
            <SearchableSelect
              id="run-year"
              name="year"
              clearable={false}
              defaultValue={String(defaultYear)}
              options={years.map((year) => ({ value: String(year), label: String(year) }))}
              required
            />
          </Field>
        </div>

        <Submit />
      </CardBody>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <CalendarPlus className="size-4" />
      {pending ? "Opening…" : "Open payroll"}
    </Button>
  );
}
