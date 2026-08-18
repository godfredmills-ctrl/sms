"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Save, X } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, CardBody, Field, Input } from "@/components/ui";

import { setCompensationAction, type PayrollState } from "../actions";

/** What each staff member is paid today, keyed by id. */
export type CurrentCompensation = Record<
  string,
  { basic: string; allowances: Array<{ name: string; amount: string }> }
>;

/**
 * A staff member's basic salary and allowances.
 *
 * Allowance rows are added as needed rather than a fixed set: every school
 * names them differently, and a housing allowance called "accommodation" in
 * one school should not need a code change.
 */
export function SalaryForm({
  staff,
  current,
}: {
  staff: SelectOption[];
  current: CurrentCompensation;
}) {
  const [state, action] = useActionState<PayrollState, FormData>(
    setCompensationAction,
    {},
  );
  const [staffId, setStaffId] = useState("");
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.ok) {
      setFormKey((key) => key + 1);
      setStaffId("");
    }
  }, [state]);

  // Choosing someone loads what they are paid now. The form posts the whole
  // compensation — basic and every allowance — so a blank-slate form would
  // silently delete allowances the moment anyone edited a salary.
  const existing = staffId ? current[staffId] : undefined;
  const allowanceRows = existing?.allowances.length
    ? existing.allowances
    : [{ name: "", amount: "" }];

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
            value={staffId}
            onChange={(value) => setStaffId((value as string) ?? "")}
            required
            searchPlaceholder="Name or staff number…"
          />
        </Field>

        <Field
          label="Basic salary (GH₵ per month)"
          htmlFor="salary-basic"
          hint={
            existing?.basic
              ? "Editing what this person is paid now. Clear the field to take them off the payroll."
              : "Leave blank to take someone off the payroll."
          }
        >
          <Input
            key={`basic-${staffId}`}
            id="salary-basic"
            name="basicSalary"
            type="number"
            step="0.01"
            min="0"
            max="100000"
            defaultValue={existing?.basic ?? ""}
            placeholder="1500.00"
          />
        </Field>

        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--text-muted)]">
            Allowances
          </p>
          <AllowanceRows key={`allowances-${staffId}`} initial={allowanceRows} />
        </div>

        <Submit />
      </CardBody>
    </form>
  );
}

/**
 * The allowance list, remounted whenever the chosen staff member changes so
 * it always starts from that person's current allowances.
 */
function AllowanceRows({
  initial,
}: {
  initial: Array<{ name: string; amount: string }>;
}) {
  const [rows, setRows] = useState(initial);

  return (
    <>
      {rows.map((row, index) => (
        <div key={index} className="flex items-start gap-2">
          <Input
            name="allowanceName"
            defaultValue={row.name}
            placeholder="Housing"
            aria-label={`Allowance ${index + 1} name`}
            className="flex-1"
          />
          <Input
            name="allowanceAmount"
            type="number"
            step="0.01"
            min="0"
            max="100000"
            defaultValue={row.amount}
            placeholder="300.00"
            aria-label={`Allowance ${index + 1} amount`}
            className="w-28"
          />
          {rows.length > 1 ? (
            <button
              type="button"
              onClick={() => setRows((all) => all.filter((_, at) => at !== index))}
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
        onClick={() => setRows((all) => [...all, { name: "", amount: "" }])}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)]"
      >
        <Plus className="size-3" />
        Add an allowance
      </button>
    </>
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
