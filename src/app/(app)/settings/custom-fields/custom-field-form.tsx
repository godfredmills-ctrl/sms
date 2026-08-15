"use client";

import { useActionState, useState } from "react";
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

import { createCustomFieldAction, type FormState } from "../actions";

const ENTITIES: SelectOption[] = [
  { value: "STUDENT", label: "Student" },
  { value: "STAFF", label: "Staff" },
  { value: "GUARDIAN", label: "Guardian" },
  { value: "ENROLLMENT", label: "Enrollment" },
  { value: "INVOICE", label: "Invoice" },
  { value: "PAYMENT", label: "Payment" },
  { value: "DOCUMENT", label: "Document" },
  { value: "COURSE", label: "Course" },
  { value: "APPLICATION", label: "Application" },
];

const TYPES: SelectOption[] = [
  { value: "TEXT", label: "Text", group: "Basic" },
  { value: "TEXTAREA", label: "Paragraph", group: "Basic" },
  { value: "RICHTEXT", label: "Rich text", group: "Basic" },
  { value: "NUMBER", label: "Whole number", group: "Numeric" },
  { value: "DECIMAL", label: "Decimal", group: "Numeric" },
  { value: "CURRENCY", label: "Money (GH₵)", group: "Numeric" },
  { value: "DATE", label: "Date", group: "Date & time" },
  { value: "DATETIME", label: "Date and time", group: "Date & time" },
  { value: "BOOLEAN", label: "Yes / no", group: "Choice" },
  { value: "SELECT", label: "Choose one", group: "Choice" },
  { value: "MULTISELECT", label: "Choose several", group: "Choice" },
  { value: "EMAIL", label: "Email address", group: "Contact" },
  { value: "PHONE", label: "Phone number", group: "Contact" },
  { value: "URL", label: "Web address", group: "Contact" },
  { value: "FILE", label: "File upload", group: "Attachment" },
];

export function CustomFieldForm({ optionSets }: { optionSets: SelectOption[] }) {
  const [state, action] = useActionState<FormState, FormData>(
    createCustomFieldAction,
    {},
  );
  const [type, setType] = useState("TEXT");
  const needsOptions = type === "SELECT" || type === "MULTISELECT";

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Field label" htmlFor="label" required>
          <Input id="label" name="label" required placeholder="Bus route" />
        </Field>

        <Field label="Attach to" htmlFor="entity" required>
          <SearchableSelect
            id="entity"
            name="entity"
            required
            clearable={false}
            defaultValue="STUDENT"
            options={ENTITIES}
          />
        </Field>

        <Field label="Type" htmlFor="type" required>
          <SearchableSelect
            id="type"
            name="type"
            required
            clearable={false}
            value={type}
            onChange={(value) => setType(value as string)}
            options={TYPES}
          />
        </Field>

        {needsOptions ? (
          <Field
            label="Options come from"
            htmlFor="optionSetId"
            hint="Create the list under Dropdown options first."
            required
          >
            <SearchableSelect
              id="optionSetId"
              name="optionSetId"
              required
              options={optionSets}
              emptyText="No lists yet"
            />
          </Field>
        ) : null}

        <Field
          label="Section"
          htmlFor="section"
          hint="Groups the field on the profile page."
        >
          <Input
            id="section"
            name="section"
            defaultValue="Additional Information"
          />
        </Field>

        <Field label="Help text" htmlFor="helpText">
          <Input id="helpText" name="helpText" />
        </Field>

        <div className="space-y-2">
          <CheckboxField name="isRequired" label="Required" />
          <CheckboxField
            name="showInList"
            label="Show as a column in lists"
            description="Adds it to the data table, where it can be filtered and exported."
          />
          <CheckboxField
            name="showInPortal"
            label="Visible in student and parent portals"
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
      {pending ? "Adding…" : "Add field"}
    </Button>
  );
}
