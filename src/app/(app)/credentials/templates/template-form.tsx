"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import { Alert, Button, CardBody, Field, Input, Textarea } from "@/components/ui";
import { TEMPLATE_KINDS } from "@/lib/templates";

import { createTemplateAction, type TemplateState } from "./actions";

export function TemplateForm({
  files,
}: {
  files: Array<{ value: string; label: string; description?: string }>;
}) {
  const [state, action] = useActionState<TemplateState, FormData>(
    createTemplateAction,
    {},
  );
  const [source, setSource] = useState("BUILDER");

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Template name" htmlFor="name" required>
          <Input
            id="name"
            name="name"
            required
            placeholder="Graduation certificate 2026"
          />
        </Field>

        <Field label="Kind" htmlFor="kind" required>
          <SearchableSelect
            id="kind"
            name="kind"
            clearable={false}
            defaultValue="CERTIFICATE"
            options={TEMPLATE_KINDS}
          />
        </Field>

        <Field label="Start from" htmlFor="source">
          <SearchableSelect
            id="source"
            name="source"
            clearable={false}
            value={source}
            onChange={(value) => setSource(value as string)}
            options={[
              {
                value: "BUILDER",
                label: "Design in the system",
                description: "Starts from a working layout you rearrange.",
              },
              {
                value: "UPLOAD",
                label: "Your own artwork",
                description: "Position fields on top of a PDF or image you supply.",
              },
            ]}
          />
        </Field>

        {source === "UPLOAD" ? (
          <Field
            label="Base file"
            htmlFor="fileId"
            hint="Upload it in the document cabinet first."
            required
          >
            <SearchableSelect
              id="fileId"
              name="fileId"
              required
              options={files}
              emptyText="No files uploaded yet"
            />
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Page size" htmlFor="pageSize">
            <SearchableSelect
              id="pageSize"
              name="pageSize"
              clearable={false}
              defaultValue="A4"
              options={[
                { value: "A4", label: "A4" },
                { value: "A5", label: "A5" },
                { value: "LETTER", label: "US Letter" },
              ]}
            />
          </Field>
          <Field label="Orientation" htmlFor="orientation">
            <SearchableSelect
              id="orientation"
              name="orientation"
              clearable={false}
              defaultValue="PORTRAIT"
              options={[
                { value: "PORTRAIT", label: "Portrait" },
                { value: "LANDSCAPE", label: "Landscape" },
              ]}
            />
          </Field>
        </div>

        <Field label="Description" htmlFor="description">
          <Textarea id="description" name="description" rows={2} />
        </Field>

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
      {pending ? "Creating…" : "Create template"}
    </Button>
  );
}
