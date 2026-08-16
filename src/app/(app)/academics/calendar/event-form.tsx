"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { CalendarPlus } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import {
  Alert,
  Button,
  CardBody,
  CheckboxField,
  Field,
  Input,
  Textarea,
} from "@/components/ui";

import { createCalendarEventAction, type AcademicState } from "../actions";

export const EVENT_CATEGORIES = [
  { value: "GENERAL", label: "General" },
  { value: "HOLIDAY", label: "Holiday" },
  { value: "EXAM", label: "Examinations" },
  { value: "PTA", label: "PTA" },
  { value: "SPORTS", label: "Sports" },
  { value: "CULTURAL", label: "Cultural" },
  { value: "TRIP", label: "Excursion" },
  { value: "CPD", label: "Staff training" },
  { value: "MEETING", label: "Meeting" },
];

export function EventForm() {
  const [state, action] = useActionState<AcademicState, FormData>(
    createCalendarEventAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Title" htmlFor="ev-title" required>
          <Input id="ev-title" name="title" required placeholder="Speech and prize-giving day" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" htmlFor="ev-start" required>
            <Input id="ev-start" name="startsAt" type="date" required />
          </Field>
          <Field label="Ends" htmlFor="ev-end" hint="Blank for one day">
            <Input id="ev-end" name="endsAt" type="date" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="ev-category">
            <SearchableSelect
              id="ev-category"
              name="category"
              clearable={false}
              defaultValue="GENERAL"
              options={EVENT_CATEGORIES}
            />
          </Field>
          <Field label="Location" htmlFor="ev-location">
            <Input id="ev-location" name="location" placeholder="Assembly hall" />
          </Field>
        </div>

        <Field label="Details" htmlFor="ev-description">
          <Textarea id="ev-description" name="description" rows={2} />
        </Field>

        <Field label="Shown to" htmlFor="ev-audiences" hint="Everyone, unless narrowed.">
          <SearchableSelect
            id="ev-audiences"
            name="audiences"
            multiple
            defaultValue={["STAFF", "STUDENT", "GUARDIAN"]}
            options={[
              { value: "STAFF", label: "Staff" },
              { value: "STUDENT", label: "Students" },
              { value: "GUARDIAN", label: "Parents" },
            ]}
          />
        </Field>

        <CheckboxField
          name="isHoliday"
          label="School is closed"
          description="Holidays are excluded from school-day counts."
        />

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
      {pending ? "Adding…" : "Add to calendar"}
    </Button>
  );
}
