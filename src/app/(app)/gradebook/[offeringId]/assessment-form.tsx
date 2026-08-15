"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

import { Alert, Button, Field, Input, Select } from "@/components/ui";

import { createAssessment, type AssessmentFormState } from "../actions";

const CATEGORIES = [
  "CLASSWORK",
  "HOMEWORK",
  "QUIZ",
  "TEST",
  "PROJECT",
  "PRACTICAL",
  "PRESENTATION",
  "MIDTERM",
  "EXAM",
  "MOCK",
  "PARTICIPATION",
] as const;

/**
 * Client component so validation comes back inline — the weight check in
 * particular ("only 30% is left for this subject") is the sort of thing a
 * teacher needs to see next to the field, not as a page-level failure.
 */
export function AssessmentForm({
  offeringId,
  remainingWeight,
}: {
  offeringId: string;
  remainingWeight: number;
}) {
  const [state, action] = useActionState<AssessmentFormState, FormData>(
    createAssessment,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the form after a successful add so the next one can be typed straight in.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="offeringId" value={offeringId} />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">Assessment added.</Alert> : null}

      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" placeholder="Class Test 2" required />
      </Field>

      <Field label="Type" htmlFor="category">
        <Select id="category" name="category" defaultValue="TEST">
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Out of" htmlFor="maxScore" required>
          <Input
            id="maxScore"
            name="maxScore"
            type="number"
            min="1"
            step="1"
            defaultValue={20}
            required
          />
        </Field>
        <Field
          label="Weight %"
          htmlFor="weight"
          hint={`${remainingWeight}% left`}
          required
        >
          <Input
            id="weight"
            name="weight"
            type="number"
            min="0"
            max={Math.max(remainingWeight, 0)}
            step="1"
            defaultValue={Math.min(10, Math.max(0, remainingWeight))}
            required
          />
        </Field>
      </div>

      <Field label="Date conducted" htmlFor="conductedOn">
        <Input id="conductedOn" name="conductedOn" type="date" />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isExam"
          className="size-4 rounded accent-[var(--primary)]"
        />
        This is the terminal exam
      </label>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <Plus className="size-4" />
      {pending ? "Adding…" : "Add assessment"}
    </Button>
  );
}
