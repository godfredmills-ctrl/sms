"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { FilePlus, X } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { SOURCES } from "@/lib/admission-rules";

import { saveApplicationAction, type AdmissionState } from "./actions";

/**
 * Starting an application against an applicant who has no file yet.
 *
 * The pupil record comes first — a child is admitted under Students, which is
 * where the name, the date of birth and the guardians are captured. This adds
 * the intake to it: which year group, how they found the school, whether a
 * brother or sister is already here, and whether the assessment fee is paid.
 */
export function StartApplication({
  applicants,
  levels,
  enrolled,
}: {
  /** Applicant records with no application yet. */
  applicants: SelectOption[];
  levels: SelectOption[];
  /** Pupils already on the roll, for the sibling link. */
  enrolled: SelectOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<AdmissionState, FormData>(
    saveApplicationAction,
    {},
  );

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <FilePlus className="size-4" />
        Start an application
      </Button>
    );
  }

  return (
    <Card className="mb-5">
      <CardHeader
        title="Start an application"
        description="For an applicant already admitted under Students."
        action={
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </Button>
        }
      />
      <CardBody>
        {applicants.length === 0 ? (
          <Alert tone="info">
            Every applicant already has an application. Admit a new one under Students
            first — the pupil record holds the name, the date of birth and the family.
          </Alert>
        ) : (
          <form action={action} className="space-y-3">
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
            {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Applicant" htmlFor="app-student" required>
                <SearchableSelect
                  id="app-student"
                  name="studentId"
                  options={applicants}
                  required
                  placeholder="Search by name or reference"
                />
              </Field>
              <Field label="Applying for" htmlFor="app-level">
                <SearchableSelect
                  id="app-level"
                  name="applyingForLevelId"
                  options={levels}
                  placeholder="Year group"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="How they found us" htmlFor="app-source">
                <Select id="app-source" name="source" defaultValue="WALK_IN">
                  {SOURCES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Brother or sister here"
                htmlFor="app-sibling"
                hint="In practice the strongest claim on a place."
              >
                <SearchableSelect
                  id="app-sibling"
                  name="siblingId"
                  options={enrolled}
                  placeholder="Nobody"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Assessment fee" htmlFor="app-fee">
                <Input id="app-fee" name="applicationFee" inputMode="decimal" placeholder="150.00" />
              </Field>
              <CheckboxField
                name="applicationFeePaid"
                label="Fee paid"
                description="Shown against them on the board until it is."
              />
            </div>

            <Field label="Notes" htmlFor="app-notes">
              <Textarea id="app-notes" name="notes" rows={2} />
            </Field>

            <SaveButton />
          </form>
        )}
      </CardBody>
    </Card>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Start it"}
    </Button>
  );
}
