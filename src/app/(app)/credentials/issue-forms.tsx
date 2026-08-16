"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Award, ScrollText } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Button,
  CardBody,
  CheckboxField,
  Field,
  Input,
} from "@/components/ui";

import {
  issueCertificateAction,
  issueTranscriptAction,
  type CredentialState,
} from "./actions";

export function TranscriptForm({
  students,
  templates,
}: {
  students: SelectOption[];
  /** TRANSCRIPT templates, default first. */
  templates: SelectOption[];
}) {
  const [state, action] = useActionState<CredentialState, FormData>(
    issueTranscriptAction,
    {},
  );
  const [studentId, setStudentId] = useState("");

  return (
    <form action={action}>
      <CardBody className="space-y-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? (
          <Alert tone="success">
            Transcript issued.{" "}
            <a href={`/credentials/transcripts/${state.id}`} className="underline">
              Open it
            </a>
            .
          </Alert>
        ) : null}

        <Field label="Student" required hint="Only approved or published results are included.">
          <SearchableSelect
            name="studentId"
            required
            placeholder="Choose a student…"
            searchPlaceholder="Name or admission number…"
            options={students}
            value={studentId}
            onChange={(next) => setStudentId(next as string)}
          />
        </Field>

        <Field
          label="Template"
          hint={
            templates.length
              ? "Your own layout. Without one, a built-in transcript is used."
              : "No transcript template has been designed yet — a built-in layout will be used."
          }
        >
          <SearchableSelect
            name="templateId"
            options={templates}
            defaultValue={templates[0]?.value}
            placeholder="Built-in layout"
            emptyText="No transcript templates"
          />
        </Field>

        <Field label="Purpose" htmlFor="purpose" hint="Printed on the document.">
          <Input id="purpose" name="purpose" placeholder="University application" />
        </Field>

        <Field label="Issued to" htmlFor="issuedTo">
          <Input id="issuedTo" name="issuedTo" placeholder="University of Ghana" />
        </Field>

        <CheckboxField
          name="isOfficial"
          label="Official copy"
          description="Unofficial copies are marked as such on the printed page."
          defaultChecked
        />

        <Submit label="Issue transcript" icon="transcript" disabled={!studentId} />
      </CardBody>
    </form>
  );
}

const CERTIFICATE_KINDS = [
  "COMPLETION",
  "GRADUATION",
  "MERIT",
  "ATTENDANCE",
  "PARTICIPATION",
  "AWARD",
];

export function CertificateForm({
  students,
  templates,
}: {
  students: SelectOption[];
  templates: SelectOption[];
}) {
  const [state, action] = useActionState<CredentialState, FormData>(
    issueCertificateAction,
    {},
  );

  return (
    <form action={action}>
      <CardBody className="space-y-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? (
          <Alert tone="success">
            Certificate issued.{" "}
            <a href={`/credentials/certificates/${state.id}`} className="underline">
              Open it
            </a>
            .
          </Alert>
        ) : null}

        {templates.length === 0 ? (
          <Alert tone="warning">
            There are no certificate templates yet. Create one below first.
          </Alert>
        ) : null}

        <Field label="Template" required>
          <SearchableSelect
            name="templateId"
            required
            clearable={false}
            placeholder="Choose a template…"
            options={templates}
          />
        </Field>

        <Field label="Title" htmlFor="title" required>
          <Input
            id="title"
            name="title"
            required
            placeholder="Certificate of Completion"
          />
        </Field>

        <Field
          label="Student"
          hint="Leave empty and type a name below for a non-student recipient."
        >
          <SearchableSelect
            name="studentId"
            placeholder="Choose a student…"
            searchPlaceholder="Name or admission number…"
            options={students}
          />
        </Field>

        <Field label="Or recipient name" htmlFor="recipientName">
          <Input id="recipientName" name="recipientName" placeholder="Ama Serwaa" />
        </Field>

        <Field label="Kind" htmlFor="kind">
          <SearchableSelect
            id="kind"
            name="kind"
            clearable={false}
            defaultValue="COMPLETION"
            options={CERTIFICATE_KINDS.map((value) => ({
              value,
              label: value.charAt(0) + value.slice(1).toLowerCase(),
            }))}
          />
        </Field>

        <Field label="Awarded for" htmlFor="awardedFor">
          <Input
            id="awardedFor"
            name="awardedFor"
            placeholder="Outstanding performance in Mathematics"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Signed by" htmlFor="signedBy">
            <Input id="signedBy" name="signedBy" placeholder="Mrs Abena Owusu" />
          </Field>
          <Field label="Signatory title" htmlFor="signatoryTitle">
            <Input id="signatoryTitle" name="signatoryTitle" placeholder="Head Teacher" />
          </Field>
        </div>

        <Submit
          label="Issue certificate"
          icon="certificate"
          disabled={templates.length === 0}
        />
      </CardBody>
    </form>
  );
}

function Submit({
  label,
  icon,
  disabled,
}: {
  label: string;
  icon: "transcript" | "certificate";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const Icon = icon === "transcript" ? ScrollText : Award;
  return (
    <Button type="submit" className="w-full" disabled={pending || disabled}>
      <Icon className="size-4" />
      {pending ? "Issuing…" : label}
    </Button>
  );
}
