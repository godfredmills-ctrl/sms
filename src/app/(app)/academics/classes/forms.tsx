"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, CardBody, Field, Input } from "@/components/ui";

import {
  createClassLevelAction,
  createOfferingAction,
  createSectionAction,
  type AcademicState,
} from "../actions";

const STAGES: SelectOption[] = [
  { value: "CRECHE", label: "Creche" },
  { value: "NURSERY", label: "Nursery" },
  { value: "KINDERGARTEN", label: "Kindergarten" },
  { value: "PRIMARY", label: "Primary" },
  { value: "JHS", label: "Junior High" },
  { value: "SHS", label: "Senior High" },
  { value: "SIXTH_FORM", label: "Sixth form" },
];

export function LevelForm() {
  const [state, action] = useActionState<AcademicState, FormData>(
    createClassLevelAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Level name" htmlFor="level-name" required>
          <Input id="level-name" name="name" required placeholder="JHS 1" />
        </Field>
        <Field label="Stage" htmlFor="stage">
          <SearchableSelect id="stage" name="stage" options={STAGES} />
        </Field>
        <Field
          label="Sequence"
          htmlFor="sequence"
          hint="Order across the school. Drives promotion at year end."
        >
          <Input id="sequence" name="sequence" type="number" min="1" />
        </Field>
        <Field label="Curriculum" htmlFor="curriculum">
          <Input id="curriculum" name="curriculum" placeholder="GES" />
        </Field>
        <Submit label="Add level" />
      </CardBody>
    </form>
  );
}

export function SectionForm({
  levels,
  teachers,
}: {
  levels: SelectOption[];
  teachers: SelectOption[];
}) {
  const [state, action] = useActionState<AcademicState, FormData>(
    createSectionAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Level" htmlFor="classLevelId" required>
          <SearchableSelect
            id="classLevelId"
            name="classLevelId"
            options={levels}
            required
          />
        </Field>
        <Field label="Class name" htmlFor="section-name" required>
          <Input id="section-name" name="name" required placeholder="Gold" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Capacity" htmlFor="capacity">
            <Input id="capacity" name="capacity" type="number" min="1" defaultValue={30} />
          </Field>
          <Field label="Room" htmlFor="roomName">
            <Input id="roomName" name="roomName" />
          </Field>
        </div>
        <Field label="Stream" htmlFor="stream">
          <SearchableSelect
            id="stream"
            name="stream"
            options={[
              { value: "SCIENCE", label: "Science" },
              { value: "ARTS", label: "Arts" },
              { value: "BUSINESS", label: "Business" },
              { value: "GENERAL", label: "General" },
              { value: "TECHNICAL", label: "Technical" },
            ]}
          />
        </Field>
        <Field label="Form teacher" htmlFor="formTeacherId">
          <SearchableSelect id="formTeacherId" name="formTeacherId" options={teachers} />
        </Field>
        <Submit label="Create class" />
      </CardBody>
    </form>
  );
}

export function OfferingForm({
  sections,
  subjects,
  teachers,
}: {
  sections: SelectOption[];
  subjects: SelectOption[];
  teachers: SelectOption[];
}) {
  const [state, action] = useActionState<AcademicState, FormData>(
    createOfferingAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Class" htmlFor="offering-class" required>
          <SearchableSelect
            id="offering-class"
            name="classSectionId"
            options={sections}
            required
          />
        </Field>
        <Field label="Subject" htmlFor="offering-subject" required>
          <SearchableSelect
            id="offering-subject"
            name="subjectId"
            options={subjects}
            required
          />
        </Field>
        <Field
          label="Teacher"
          htmlFor="offering-teacher"
          hint="The one whose gradebook and register this is."
        >
          <SearchableSelect id="offering-teacher" name="teacherId" options={teachers} />
        </Field>
        <Field
          label="Also teaching"
          htmlFor="offering-coteachers"
          hint="Co-teachers and lab assistants. They see this class too."
        >
          <SearchableSelect
            id="offering-coteachers"
            name="coTeacherIds"
            multiple
            options={teachers}
            placeholder="Nobody else"
          />
        </Field>
        <Field label="Room" htmlFor="offering-room">
          <Input id="offering-room" name="room" />
        </Field>
        <Submit label="Assign subject" />
      </CardBody>
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      <Plus className="size-4" />
      {pending ? "Saving…" : label}
    </Button>
  );
}
