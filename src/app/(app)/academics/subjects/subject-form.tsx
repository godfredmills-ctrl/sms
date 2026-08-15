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
} from "@/components/ui";

import { createSubjectAction, setSubjectLevelsAction, type AcademicState } from "../actions";

export function SubjectForm({ departments }: { departments: SelectOption[] }) {
  const [state, action] = useActionState<AcademicState, FormData>(
    createSubjectAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Subject" htmlFor="name" required>
          <Input id="name" name="name" required placeholder="Integrated Science" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code" htmlFor="code" hint="Auto if blank">
            <Input id="code" name="code" placeholder="SCI" />
          </Field>
          <Field label="Short name" htmlFor="shortName">
            <Input id="shortName" name="shortName" placeholder="Science" />
          </Field>
        </div>
        <Field label="Department" htmlFor="department">
          <SearchableSelect
            id="department"
            name="department"
            options={departments}
            searchThreshold={4}
          />
        </Field>
        <Field label="Pass mark" htmlFor="passMark">
          <Input
            id="passMark"
            name="passMark"
            type="number"
            min="0"
            max="100"
            defaultValue={50}
          />
        </Field>

        <div className="space-y-2">
          <CheckboxField
            name="isCore"
            label="Core subject"
            description="Always appears on the report card."
          />
          <CheckboxField name="isElective" label="Elective" />
          <CheckboxField
            name="excludeFromAggregate"
            label="Exclude from aggregate and GPA"
            description="For non-examinable subjects such as Conduct."
          />
        </div>

        <Submit />
      </CardBody>
    </form>
  );
}

/** Which levels a subject is taught at — the curriculum map, one row at a time. */
export function LevelPicker({
  subjectId,
  levels,
  selected,
}: {
  subjectId: string;
  levels: SelectOption[];
  selected: string[];
}) {
  return (
    <form action={setSubjectLevelsAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="subjectId" value={subjectId} />
      <div className="min-w-[200px] flex-1">
        <SearchableSelect
          name="levelIds"
          multiple
          options={levels}
          defaultValue={selected}
          placeholder="Taught at…"
        />
      </div>
      <Button type="submit" variant="ghost" size="sm">
        Save
      </Button>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      <Plus className="size-4" />
      {pending ? "Adding…" : "Add subject"}
    </Button>
  );
}
