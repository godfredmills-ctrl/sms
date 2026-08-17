"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Stethoscope } from "lucide-react";

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

import { logClinicVisitAction, type ClinicState } from "./actions";

const OUTCOMES = [
  { value: "RETURNED_TO_CLASS", label: "Returned to class" },
  { value: "SENT_HOME", label: "Sent home" },
  { value: "REFERRED", label: "Referred to hospital" },
  { value: "ADMITTED", label: "Resting in the sick bay" },
];

export function VisitForm({ students }: { students: SelectOption[] }) {
  const [state, action] = useActionState<ClinicState, FormData>(
    logClinicVisitAction,
    {},
  );
  // Remount on success rather than form.reset(): the searchable select keeps
  // its choice in its own state where reset() cannot reach, and state.ok stays
  // true after the first success so an effect watching it fires exactly once.
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.ok) setFormKey((key) => key + 1);
  }, [state]);

  return (
    <form key={formKey} action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Student" htmlFor="visit-student" required>
          <SearchableSelect
            id="visit-student"
            name="studentId"
            options={students}
            required
            searchPlaceholder="Name or admission number…"
          />
        </Field>

        <Field label="Complaint" htmlFor="visit-complaint" required>
          <Input
            id="visit-complaint"
            name="complaint"
            required
            placeholder="Headache and feeling warm"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Temperature °C" htmlFor="visit-temp">
            <Input
              id="visit-temp"
              name="temperature"
              type="number"
              step="0.1"
              min="30"
              max="45"
              placeholder="37.2"
            />
          </Field>
          <Field label="Outcome" htmlFor="visit-outcome">
            <SearchableSelect
              id="visit-outcome"
              name="outcome"
              clearable={false}
              defaultValue="RETURNED_TO_CLASS"
              options={OUTCOMES}
            />
          </Field>
        </div>

        <Field label="Treatment given" htmlFor="visit-treatment">
          <Input
            id="visit-treatment"
            name="treatment"
            placeholder="Rested 30 minutes, temperature re-checked"
          />
        </Field>

        <Field label="Medication given" htmlFor="visit-medication">
          <Input
            id="visit-medication"
            name="medicationGiven"
            placeholder="Paracetamol 250mg"
          />
        </Field>

        <Field label="Notes" htmlFor="visit-notes">
          <Textarea id="visit-notes" name="notes" rows={2} />
        </Field>

        <CheckboxField
          name="notifyGuardian"
          label="Notify the emergency contacts"
          description="Sends immediately, marked urgent when the child is sent home."
        />

        <Submit />
      </CardBody>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <Stethoscope className="size-4" />
      {pending ? "Logging…" : "Log the visit"}
    </Button>
  );
}
