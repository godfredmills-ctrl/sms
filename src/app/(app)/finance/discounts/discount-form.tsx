"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { BadgePercent } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, CardBody, Field, Input, Textarea } from "@/components/ui";

import { createDiscountAction, type FinanceFormState } from "../actions";

export function DiscountForm({
  students,
  categories,
  years,
}: {
  students: SelectOption[];
  categories: SelectOption[];
  years: SelectOption[];
}) {
  const [state, action] = useActionState<FinanceFormState, FormData>(
    createDiscountAction,
    {},
  );
  const [type, setType] = useState("PERCENTAGE");

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Student" htmlFor="studentId" required>
          <SearchableSelect
            id="studentId"
            name="studentId"
            options={students}
            required
            placeholder="Search students…"
          />
        </Field>

        <Field label="Award" htmlFor="name" required>
          <Input id="name" name="name" required placeholder="Staff child" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" htmlFor="type">
            <SearchableSelect
              id="type"
              name="type"
              clearable={false}
              value={type}
              onChange={(value) => setType(value as string)}
              options={[
                { value: "PERCENTAGE", label: "Percentage" },
                { value: "FIXED", label: "Fixed amount" },
              ]}
            />
          </Field>
          <Field
            label={type === "PERCENTAGE" ? "Percent" : "Amount (GH₵)"}
            htmlFor="value"
            required
          >
            <Input
              id="value"
              name="value"
              inputMode="decimal"
              required
              placeholder={type === "PERCENTAGE" ? "50" : "500.00"}
            />
          </Field>
        </div>

        <Field
          label="Applies to"
          htmlFor="categoryId"
          hint="Blank applies the award to the whole bill."
        >
          <SearchableSelect id="categoryId" name="categoryId" options={categories} />
        </Field>

        <Field label="Academic year" htmlFor="academicYearId">
          <SearchableSelect id="academicYearId" name="academicYearId" options={years} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" htmlFor="startsOn">
            <Input id="startsOn" name="startsOn" type="date" />
          </Field>
          <Field label="Ends" htmlFor="endsOn">
            <Input id="endsOn" name="endsOn" type="date" />
          </Field>
        </div>

        <Field label="Sponsor" htmlFor="sponsorName">
          <Input id="sponsorName" name="sponsorName" placeholder="Alumni Trust" />
        </Field>

        <Field label="Reason" htmlFor="reason">
          <Textarea id="reason" name="reason" rows={2} />
        </Field>

        <Submit />
      </CardBody>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      <BadgePercent className="size-4" />
      {pending ? "Awarding…" : "Award discount"}
    </Button>
  );
}
