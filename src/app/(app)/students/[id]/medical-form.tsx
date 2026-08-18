"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { HeartPulse, Plus, X } from "lucide-react";

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

import { updateStudentMedicalAction, type StudentState } from "../actions";

const SEVERITIES = [
  { value: "MILD", label: "Mild" },
  { value: "MODERATE", label: "Moderate" },
  { value: "SEVERE", label: "Severe" },
  { value: "ANAPHYLAXIS", label: "Anaphylaxis" },
];

export type MedicalValues = {
  bloodGroup: string;
  genotype: string;
  nhisNumber: string;
  dietaryRestrictions: string;
  emergencyInstructions: string;
  doctorName: string;
  doctorPhone: string;
  consentToTreat: boolean;
  allergies: Array<{ name: string; severity: string; reaction: string }>;
  conditions: Array<{ condition: string; notes: string }>;
  medications: Array<{ name: string; dosage: string }>;
};

/**
 * The medical record, editable.
 *
 * The clinic could log a visit but nothing could record the allergy that
 * made it urgent. Severity is a fixed list because the emergency banner on
 * the profile, the clinic list and the ID card all read it to decide what to
 * show — free text there would mean a severe allergy that nothing highlights.
 */
export function MedicalForm({
  studentId,
  values,
}: {
  studentId: string;
  values: MedicalValues;
}) {
  const [state, action] = useActionState<StudentState, FormData>(
    updateStudentMedicalAction,
    {},
  );

  const [allergies, setAllergies] = useState(
    values.allergies.length ? values.allergies : [{ name: "", severity: "MILD", reaction: "" }],
  );
  const [conditions, setConditions] = useState(
    values.conditions.length ? values.conditions : [{ condition: "", notes: "" }],
  );
  const [medications, setMedications] = useState(
    values.medications.length ? values.medications : [{ name: "", dosage: "" }],
  );

  return (
    <form action={action}>
      <CardBody className="space-y-4">
        <input type="hidden" name="studentId" value={studentId} />
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Blood group" htmlFor="bloodGroup">
            <Input id="bloodGroup" name="bloodGroup" defaultValue={values.bloodGroup} placeholder="O+" />
          </Field>
          <Field label="Genotype" htmlFor="genotype" hint="AA, AS, SS…">
            <Input id="genotype" name="genotype" defaultValue={values.genotype} />
          </Field>
          <Field label="NHIS number" htmlFor="medicalNhisNumber">
            <Input
              id="medicalNhisNumber"
              name="medicalNhisNumber"
              defaultValue={values.nhisNumber}
            />
          </Field>
        </div>

        {/* --- Allergies ---------------------------------------------------- */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--text-muted)]">Allergies</p>
          {allergies.map((entry, index) => (
            <div key={index} className="flex items-start gap-2">
              <Input
                name="allergyName"
                defaultValue={entry.name}
                placeholder="Peanuts"
                aria-label={`Allergy ${index + 1}`}
                className="flex-1"
              />
              <div className="w-36">
                <SearchableSelect
                  name="allergySeverity"
                  options={SEVERITIES}
                  defaultValue={entry.severity || "MILD"}
                  clearable={false}
                  aria-label={`Allergy ${index + 1} severity`}
                />
              </div>
              <Input
                name="allergyReaction"
                defaultValue={entry.reaction}
                placeholder="Swelling, hives"
                aria-label={`Allergy ${index + 1} reaction`}
                className="flex-1"
              />
              {allergies.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setAllergies((all) => all.filter((_, at) => at !== index))}
                  className="mt-2 text-[var(--text-subtle)] hover:text-[var(--danger)]"
                  aria-label={`Remove allergy ${index + 1}`}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
          <AddRow
            label="Add an allergy"
            onClick={() =>
              setAllergies((all) => [...all, { name: "", severity: "MILD", reaction: "" }])
            }
          />
        </div>

        {/* --- Conditions --------------------------------------------------- */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--text-muted)]">Conditions</p>
          {conditions.map((entry, index) => (
            <div key={index} className="flex items-start gap-2">
              <Input
                name="conditionName"
                defaultValue={entry.condition}
                placeholder="Asthma"
                aria-label={`Condition ${index + 1}`}
                className="flex-1"
              />
              <Input
                name="conditionNote"
                defaultValue={entry.notes}
                placeholder="Inhaler kept with the nurse"
                aria-label={`Condition ${index + 1} notes`}
                className="flex-1"
              />
              {conditions.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setConditions((all) => all.filter((_, at) => at !== index))}
                  className="mt-2 text-[var(--text-subtle)] hover:text-[var(--danger)]"
                  aria-label={`Remove condition ${index + 1}`}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
          <AddRow
            label="Add a condition"
            onClick={() => setConditions((all) => [...all, { condition: "", notes: "" }])}
          />
        </div>

        {/* --- Medications -------------------------------------------------- */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--text-muted)]">
            Medication kept at school
          </p>
          {medications.map((entry, index) => (
            <div key={index} className="flex items-start gap-2">
              <Input
                name="medicationName"
                defaultValue={entry.name}
                placeholder="Salbutamol inhaler"
                aria-label={`Medication ${index + 1}`}
                className="flex-1"
              />
              <Input
                name="medicationDosage"
                defaultValue={entry.dosage}
                placeholder="2 puffs as needed"
                aria-label={`Medication ${index + 1} dosage`}
                className="flex-1"
              />
              {medications.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setMedications((all) => all.filter((_, at) => at !== index))}
                  className="mt-2 text-[var(--text-subtle)] hover:text-[var(--danger)]"
                  aria-label={`Remove medication ${index + 1}`}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
          <AddRow
            label="Add a medication"
            onClick={() => setMedications((all) => [...all, { name: "", dosage: "" }])}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Dietary restrictions" htmlFor="dietaryRestrictions">
            <Input
              id="dietaryRestrictions"
              name="dietaryRestrictions"
              defaultValue={values.dietaryRestrictions}
            />
          </Field>
          <Field label="Family doctor" htmlFor="doctorName">
            <Input id="doctorName" name="doctorName" defaultValue={values.doctorName} />
          </Field>
          <Field label="Doctor's phone" htmlFor="doctorPhone">
            <Input id="doctorPhone" name="doctorPhone" defaultValue={values.doctorPhone} />
          </Field>
        </div>

        <Field
          label="Emergency instructions"
          htmlFor="emergencyInstructions"
          hint="Read out on the profile banner and printed on the ID card's back."
        >
          <Textarea
            id="emergencyInstructions"
            name="emergencyInstructions"
            rows={2}
            defaultValue={values.emergencyInstructions}
          />
        </Field>

        <CheckboxField
          name="consentToTreat"
          defaultChecked={values.consentToTreat}
          label="The family consents to basic first aid and medication at school"
        />

        <Submit />
      </CardBody>
    </form>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)]"
    >
      <Plus className="size-3" />
      {label}
    </button>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <HeartPulse className="size-4" />
      {pending ? "Saving…" : "Save the medical record"}
    </Button>
  );
}
