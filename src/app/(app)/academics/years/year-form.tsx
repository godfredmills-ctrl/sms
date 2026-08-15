"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarPlus } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import { Alert, Button, CardBody, Field, Input } from "@/components/ui";

import { createAcademicYearAction, type AcademicState } from "../actions";

export function YearForm() {
  const [state, action] = useActionState<AcademicState, FormData>(
    createAcademicYearAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Year name" htmlFor="name" required>
          <Input id="name" name="name" required placeholder="2026/2027" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts" htmlFor="startDate" required>
            <Input id="startDate" name="startDate" type="date" required />
          </Field>
          <Field label="Ends" htmlFor="endDate" required>
            <Input id="endDate" name="endDate" type="date" required />
          </Field>
        </div>
        <Field
          label="Terms"
          htmlFor="terms"
          hint="Created evenly across the year; adjust the dates afterwards."
        >
          <SearchableSelect
            id="terms"
            name="terms"
            clearable={false}
            defaultValue="3"
            options={[
              { value: "2", label: "2 semesters" },
              { value: "3", label: "3 terms" },
              { value: "4", label: "4 quarters" },
            ]}
          />
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
      <CalendarPlus className="size-4" />
      {pending ? "Creating…" : "Create year"}
    </Button>
  );
}
