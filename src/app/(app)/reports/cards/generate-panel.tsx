"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import { Alert, Button, CardBody, CheckboxField, Field } from "@/components/ui";

import { generateReportCardsAction, type GenerateState } from "./actions";

export type PickerOption = { value: string; label: string; description?: string };

export function GeneratePanel({
  classes,
  terms,
  scales,
  defaultTermId,
}: {
  classes: PickerOption[];
  terms: PickerOption[];
  scales: PickerOption[];
  defaultTermId?: string;
}) {
  const [state, action] = useActionState<GenerateState, FormData>(
    generateReportCardsAction,
    {},
  );
  const [classSectionId, setClassSectionId] = useState("");

  return (
    <form action={action}>
      <CardBody className="space-y-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        {state.ok ? (
          <Alert tone="success">
            Generated {state.generated} report card
            {state.generated === 1 ? "" : "s"}
            {state.skipped ? `, skipped ${state.skipped} already published` : ""}.
            {state.errors?.length ? ` ${state.errors.length} had problems.` : ""}
          </Alert>
        ) : null}

        <Field label="Class" htmlFor="classSectionId" required>
          <SearchableSelect
            id="classSectionId"
            name="classSectionId"
            required
            placeholder="Choose a class…"
            options={classes}
            value={classSectionId}
            onChange={(next) => setClassSectionId(next as string)}
          />
        </Field>

        <Field label="Term" htmlFor="termId" required>
          <SearchableSelect
            id="termId"
            name="termId"
            required
            clearable={false}
            defaultValue={defaultTermId}
            options={terms}
          />
        </Field>

        <Field
          label="Grading scale"
          htmlFor="gradeScaleId"
          hint="Leave empty to use the school default."
        >
          <SearchableSelect
            id="gradeScaleId"
            name="gradeScaleId"
            placeholder="School default"
            options={scales}
          />
        </Field>

        <CheckboxField
          name="overwrite"
          label="Rebuild published report cards"
          description="Off by default, so re-running cannot overwrite results families have already seen."
        />

        <SubmitButton disabled={!classSectionId} />

        <p className="text-xs text-[var(--text-subtle)]">
          Positions and class averages are computed across the whole class, so
          generating is done a class at a time.
        </p>
      </CardBody>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending || disabled}>
      <Sparkles className="size-4" />
      {pending ? "Generating…" : "Generate report cards"}
    </Button>
  );
}
