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
  Textarea,
} from "@/components/ui";

import { createCourseAction, type LmsState } from "./actions";

export function CourseForm({ offerings }: { offerings: SelectOption[] }) {
  const [state, action] = useActionState<LmsState, FormData>(createCourseAction, {});

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Course title" htmlFor="title" required>
          <Input
            id="title"
            name="title"
            required
            placeholder="Integrated Science: JHS 2"
          />
        </Field>

        <Field
          label="Class and subject"
          htmlFor="offeringId"
          hint="Links the course to a class so its students see it automatically."
        >
          <SearchableSelect id="offeringId" name="offeringId" options={offerings} />
        </Field>

        <Field label="Code" htmlFor="code" hint="Generated if left blank.">
          <Input id="code" name="code" placeholder="SCI-JHS2" />
        </Field>

        <Field label="Description" htmlFor="description">
          <Textarea id="description" name="description" rows={2} />
        </Field>

        <Field label="Syllabus" htmlFor="syllabus">
          <Textarea id="syllabus" name="syllabus" rows={3} />
        </Field>

        <div className="space-y-2">
          <CheckboxField
            name="allowDiscussion"
            defaultChecked
            label="Allow discussion"
          />
          <CheckboxField
            name="enforceSequence"
            label="Lessons must be completed in order"
          />
          <CheckboxField
            name="isSelfPaced"
            label="Self-paced"
            description="Ignores the term calendar: for clubs, CPD and holiday programmes."
          />
        </div>

        <Submit />
      </CardBody>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      <Plus className="size-4" />
      {pending ? "Creating…" : "Create course"}
    </Button>
  );
}
