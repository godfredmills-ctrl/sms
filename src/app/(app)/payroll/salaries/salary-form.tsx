"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Save, X } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, CardBody, Field, Input } from "@/components/ui";

import { setCompensationAction, type PayrollState } from "../actions";

/**
 * A staff member's basic salary and allowances.
 *
 * Allowance rows are added as needed rather than a fixed set: every school
 * names them differently, and a housing allowance called "accommodation" in
 * one school should not need a code change.
 */
export function SalaryForm({ staff }: { staff: SelectOption[] }) {
  const [state, action] = useActionState<PayrollState, FormData>(
    setCompensationAction,
    {},
  );
  const [rows, setRows] = useState<number[]>([0]);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.ok) {
      setFormKey((key) => key + 1);
      setRows([0]);
    }
  }, [state]);

  return (
    <form key={formKey} action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Staff member" htmlFor="salary-staff" required>
          <SearchableSelect
            id="salary-staff"
            name="staffId"
            options={staff}
            required
            searchPlaceholder="Name or staff number…"
          />
        </Field>

        <Field
          label="Basic salary (GH₵ per month)"
          htmlFor="salary-basic"
          hint="Leave blank to take someone off the payroll."
        >
          <Input
            id="salary-basic"
            name="basicSalary"
            type="number"
            step="0.01"
            min="0"
            placeholder="1500.00"
          />
        </Field>

        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--text-muted)]">
            Allowances
          </p>
          {rows.map((row, index) => (
            <div key={row} className="flex items-start gap-2">
              <Input
                name="allowanceName"
                placeholder="Housing"
                aria-label={`Allowance ${index + 1} name`}
                className="flex-1"
              />
              <Input
                name="allowanceAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder="300.00"
                aria-label={`Allowance ${index + 1} amount`}
                className="w-28"
              />
              {rows.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((id) => id !== row))}
                  className="mt-2 text-[var(--text-subtle)] hover:text-[var(--danger)]"
                  aria-label={`Remove allowance ${index + 1}`}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows((current) => [...current, (current.at(-1) ?? 0) + 1])}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)]"
          >
            <Plus className="size-3" />
            Add an allowance
          </button>
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
      <Save className="size-4" />
      {pending ? "Saving…" : "Save compensation"}
    </Button>
  );
}
