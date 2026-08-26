"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Button,
  CardBody,
  CheckboxField,
  Field,
  Input,
  Textarea,
} from "@/components/ui";

import {
  createFeeCategoryAction,
  createFeeStructureAction,
  type FinanceFormState,
} from "../actions";

export function CategoryForm() {
  const [state, action] = useActionState<FinanceFormState, FormData>(
    createFeeCategoryAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Category" htmlFor="cat-name" required>
          <Input id="cat-name" name="name" required placeholder="PTA Levy" />
        </Field>
        <Field label="Code" htmlFor="cat-code" hint="Auto if blank">
          <Input id="cat-code" name="code" placeholder="PTA" />
        </Field>
        <Field label="GL code" htmlFor="glCode" hint="For your accounting export">
          <Input id="glCode" name="glCode" />
        </Field>
        <div className="space-y-2">
          <CheckboxField
            name="isRecurring"
            defaultChecked
            label="Billed every term"
            description="One-off fees such as admission are billed once."
          />
          <CheckboxField
            name="isOptional"
            label="Optional"
            description="Guardians opt in: school bus, lunch, clubs."
          />
        </div>
        <Submit label="Add category" />
      </CardBody>
    </form>
  );
}

export function StructureForm({
  years,
  terms,
  levels,
}: {
  years: SelectOption[];
  terms: SelectOption[];
  levels: SelectOption[];
}) {
  const [state, action] = useActionState<FinanceFormState, FormData>(
    createFeeStructureAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Name" htmlFor="struct-name" required>
          <Input
            id="struct-name"
            name="name"
            required
            placeholder="JHS 1: Day: Term 1"
          />
        </Field>
        <Field label="Academic year" htmlFor="academicYearId" required>
          <SearchableSelect
            id="academicYearId"
            name="academicYearId"
            options={years}
            defaultValue={years[0]?.value}
            clearable={false}
            required
          />
        </Field>
        <Field label="Term" htmlFor="termId" hint="Leave blank to bill in every term">
          <SearchableSelect id="termId" name="termId" options={terms} />
        </Field>
        <Field label="Class level" htmlFor="classLevelId" hint="Blank applies school-wide">
          <SearchableSelect id="classLevelId" name="classLevelId" options={levels} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Applies to" htmlFor="boarderType">
            <SearchableSelect
              id="boarderType"
              name="boarderType"
              clearable={false}
              defaultValue="ALL"
              options={[
                { value: "ALL", label: "All students" },
                { value: "BOARDER", label: "Boarders" },
                { value: "DAY", label: "Day students" },
              ]}
            />
          </Field>
          <Field label="Fee band" htmlFor="studentType">
            <SearchableSelect
              id="studentType"
              name="studentType"
              clearable={false}
              defaultValue="ALL"
              options={[
                { value: "ALL", label: "All" },
                { value: "LOCAL", label: "Local" },
                { value: "INTERNATIONAL", label: "International" },
              ]}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date" htmlFor="dueDate">
            <Input id="dueDate" name="dueDate" type="date" />
          </Field>
          <Field
            label="Minimum first payment"
            htmlFor="minimumFirstPayment"
            hint="GH₵, optional"
          >
            <Input
              id="minimumFirstPayment"
              name="minimumFirstPayment"
              inputMode="decimal"
            />
          </Field>
        </div>
        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={2} />
        </Field>
        <Submit label="Create structure" />
      </CardBody>
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      <Plus className="size-4" />
      {pending ? "Saving…" : label}
    </Button>
  );
}
