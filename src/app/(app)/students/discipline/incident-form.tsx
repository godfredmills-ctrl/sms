"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ShieldAlert } from "lucide-react";

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

import { recordIncidentAction, type DisciplineState } from "./actions";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SANCTIONS,
  INCIDENT_SEVERITIES,
} from "./fields";

/** Records an incident — the child and the moment, not a case-file ritual. */
export function IncidentForm({ students }: { students: SelectOption[] }) {
  const [state, action] = useActionState<DisciplineState, FormData>(
    recordIncidentAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [sanction, setSanction] = useState<string>("");

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setSanction("");
    }
  }, [state.ok]);

  return (
    <form ref={formRef} action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Student" htmlFor="incident-student" required>
          <SearchableSelect
            id="incident-student"
            name="studentId"
            options={students}
            required
            searchPlaceholder="Name or admission number…"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="incident-category" required>
            <SearchableSelect
              id="incident-category"
              name="category"
              options={[...INCIDENT_CATEGORIES]}
              required
            />
          </Field>
          <Field label="Severity" htmlFor="incident-severity">
            <SearchableSelect
              id="incident-severity"
              name="severity"
              clearable={false}
              defaultValue="MINOR"
              options={[...INCIDENT_SEVERITIES]}
            />
          </Field>
        </div>

        <Field label="What happened" htmlFor="incident-description" required>
          <Textarea
            id="incident-description"
            name="description"
            rows={3}
            required
            placeholder="Factual and specific — this is read years later, by people who were not there."
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="incident-date" hint="Blank means today.">
            <Input id="incident-date" name="incidentAt" type="date" />
          </Field>
          <Field label="Location" htmlFor="incident-location">
            <Input
              id="incident-location"
              name="location"
              placeholder="Classroom, assembly ground…"
            />
          </Field>
        </div>

        <Field label="Witnesses" htmlFor="incident-witnesses">
          <Input
            id="incident-witnesses"
            name="witnesses"
            placeholder="Who else saw it"
          />
        </Field>

        <Field label="Action taken on the spot" htmlFor="incident-action">
          <Input
            id="incident-action"
            name="actionTaken"
            placeholder="Separated the students, informed the head of section"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sanction" htmlFor="incident-sanction" hint="Leave blank if undecided.">
            <SearchableSelect
              id="incident-sanction"
              name="sanction"
              options={[...INCIDENT_SANCTIONS]}
              value={sanction}
              onChange={(value) => setSanction((value as string) ?? "")}
            />
          </Field>
          {sanction === "SUSPENSION" ? (
            <Field label="Days" htmlFor="incident-days">
              <Input
                id="incident-days"
                name="suspensionDays"
                type="number"
                min="1"
                max="30"
                placeholder="3"
              />
            </Field>
          ) : null}
        </div>

        <CheckboxField
          name="notifyGuardian"
          label="Notify the family"
          description="Category and sanction only — the full account stays a conversation."
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
      <ShieldAlert className="size-4" />
      {pending ? "Recording…" : "Record the incident"}
    </Button>
  );
}
