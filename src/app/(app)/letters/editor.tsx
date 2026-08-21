"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw, Save, Trash2 } from "lucide-react";

import { RichText } from "@/components/rich-text";
import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";

import {
  deleteDocumentAction,
  saveDocumentAction,
  setDocumentStatusAction,
  type WritingState,
} from "./actions";
import { DOCUMENT_KINDS } from "./kinds";

export type DocumentDraft = {
  id: string;
  kind: string;
  reference: string;
  title: string;
  body: string;
  recipient: string;
  salutation: string;
  closing: string;
  signatoryName: string;
  signatoryTitle: string;
  footnote: string;
  status: string;
  aboutStaffId: string;
  aboutStudentId: string;
};

/**
 * Writing a letter, a report or a proposal.
 *
 * The text is the page: the addressee, signature and reference are a column
 * beside it rather than a form the writer works through first. Somebody
 * opening this has something to say, and the wrapper is the part they fill in
 * afterwards.
 *
 * A final document is read-only here. Editing what was signed and sent, in
 * place and with no record, is how a file comes to disagree with the copy in
 * somebody's drawer.
 */
export function DocumentEditor({
  draft,
  staff,
  students,
  canFinalise,
  defaultSignatory,
}: {
  draft?: DocumentDraft;
  staff: SelectOption[];
  students: SelectOption[];
  canFinalise: boolean;
  defaultSignatory?: { name: string; title: string };
}) {
  const router = useRouter();
  const [state, action] = useActionState<WritingState, FormData>(saveDocumentAction, {});
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const isFinal = draft?.status === "FINAL";

  /**
   * Puts a final document back into draft.
   *
   * The other direction is a submission rather than a call, because it has to
   * carry the text on the screen with it. Reopening carries nothing: the
   * document is read-only at that point, so there is nothing unsaved to lose.
   */
  async function reopen() {
    if (!draft) return;
    setBusy("DRAFT");
    setProblem(null);
    const data = new FormData();
    data.append("id", draft.id);
    data.append("status", "DRAFT");
    const result = await setDocumentStatusAction(data);
    setBusy(null);
    if (result.error) setProblem(result.error);
    else router.refresh();
  }

  async function remove() {
    if (!draft) return;
    setBusy("delete");
    setProblem(null);
    const data = new FormData();
    data.append("id", draft.id);
    const result = await deleteDocumentAction(data);
    setBusy(null);
    if (result.error) setProblem(result.error);
    else router.push("/letters");
  }

  if (isFinal) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="This document is final">
          It was issued as it stands. Reopen it as a draft to make a change —
          that is recorded, so the file and the copy in somebody&rsquo;s drawer
          cannot quietly diverge.
        </Alert>
        {problem ? <Alert tone="danger">{problem}</Alert> : null}
        {canFinalise ? (
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={reopen}
          >
            <RotateCcw className="size-4" />
            {busy === "DRAFT" ? "Reopening…" : "Reopen as a draft"}
          </Button>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            Ask someone who can finalise documents to reopen it.
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {draft ? <input type="hidden" name="id" value={draft.id} /> : null}

      <div className="min-w-0 space-y-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {problem ? <Alert tone="danger">{problem}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Title" htmlFor="doc-title" required>
          <Input
            id="doc-title"
            name="title"
            required
            defaultValue={draft?.title}
            placeholder="Staff Development Proposal 2026/2027"
          />
        </Field>

        <div>
          <label
            htmlFor="doc-body"
            className="mb-1.5 block text-sm font-medium text-[var(--text)]"
          >
            The document
          </label>
          <RichText id="doc-body" name="body" defaultValue={draft?.body ?? ""} />
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Details" />
          <CardBody className="space-y-3">
            <Field label="Kind" htmlFor="doc-kind">
              <Select id="doc-kind" name="kind" defaultValue={draft?.kind ?? "LETTER"}>
                {DOCUMENT_KINDS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Reference"
              htmlFor="doc-reference"
              hint="Quoted in any reply. Must be unique."
            >
              <Input
                id="doc-reference"
                name="reference"
                defaultValue={draft?.reference}
                placeholder="GCS/HR/2026/014"
              />
            </Field>

            <Field
              label="Addressed to"
              htmlFor="doc-recipient"
              hint="One line each. Leave empty for a report."
            >
              <Textarea
                id="doc-recipient"
                name="recipient"
                rows={3}
                defaultValue={draft?.recipient}
                placeholder={"The Board of Governors\nGolden Crest International School\nAccra"}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Salutation" htmlFor="doc-salutation">
                <Input
                  id="doc-salutation"
                  name="salutation"
                  defaultValue={draft?.salutation}
                  placeholder="Dear Sir,"
                />
              </Field>
              <Field label="Closing" htmlFor="doc-closing">
                <Input
                  id="doc-closing"
                  name="closing"
                  defaultValue={draft?.closing ?? "Yours faithfully,"}
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Signature" description="Needed before it can be final." />
          <CardBody className="space-y-3">
            <Field label="Signed by" htmlFor="doc-signatory">
              <Input
                id="doc-signatory"
                name="signatoryName"
                defaultValue={draft?.signatoryName ?? defaultSignatory?.name ?? ""}
              />
            </Field>
            <Field label="Their title" htmlFor="doc-signatory-title">
              <Input
                id="doc-signatory-title"
                name="signatoryTitle"
                defaultValue={draft?.signatoryTitle ?? defaultSignatory?.title ?? ""}
              />
            </Field>
            <Field
              label="Note at the foot"
              htmlFor="doc-footnote"
              hint="Distribution, validity — printed small."
            >
              <Input id="doc-footnote" name="footnote" defaultValue={draft?.footnote} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="About" description="Only if it concerns one person." />
          <CardBody className="space-y-3">
            <Field label="A member of staff" htmlFor="doc-staff">
              <SearchableSelect
                id="doc-staff"
                name="aboutStaffId"
                options={staff}
                defaultValue={draft?.aboutStaffId || undefined}
                placeholder="Nobody in particular"
              />
            </Field>
            <Field label="A pupil" htmlFor="doc-student">
              <SearchableSelect
                id="doc-student"
                name="aboutStudentId"
                options={students}
                defaultValue={draft?.aboutStudentId || undefined}
                placeholder="Nobody in particular"
              />
            </Field>
          </CardBody>
        </Card>

        <div className="flex flex-wrap gap-2">
          <SaveButton isNew={!draft} />
          {canFinalise ? (
            // A submit, not a separate call. Finalising on its own issued
            // whatever was last stored, so edits made and not yet saved were
            // dropped — and the document was read-only afterwards, so the
            // writer could not simply put them back. This saves what is on
            // the screen and finalises that.
            <FinaliseButton />
          ) : null}
          {draft ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy !== null}
              onClick={remove}
            >
              <Trash2 className="size-4" />
              {busy === "delete" ? "Deleting…" : "Delete"}
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function SaveButton({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="intent" value="save" disabled={pending}>
      <Save className="size-4" />
      {pending ? "Saving…" : isNew ? "Create" : "Save"}
    </Button>
  );
}

/**
 * Save and issue, in one submission.
 *
 * The value rides on the button, so the server knows which of the two was
 * pressed and the same validation runs either way.
 */
function FinaliseButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      name="intent"
      value="final"
      variant="secondary"
      disabled={pending}
    >
      <CheckCircle2 className="size-4" />
      Save and mark final
    </Button>
  );
}
