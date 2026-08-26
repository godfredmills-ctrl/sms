"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { FileSignature, Loader2, Paperclip, Save, X } from "lucide-react";

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
import { formatBytes } from "@/lib/utils";

import { createMemoAction, type MemoState } from "../actions";

const KINDS = ["INTERNAL", "CIRCULAR", "DIRECTIVE", "NOTICE", "POLICY"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

type Attachment = { fileId: string; name: string; sizeBytes: number };

/** What a saved draft feeds back into the form to be reopened. */
export type MemoDraft = {
  id: string;
  subject: string;
  body: string;
  kind: string;
  priority: string;
  fromDepartment: string;
  requiresAck: boolean;
  confidential: boolean;
  to: string[];
  cc: string[];
  bcc: string[];
  attachments: Attachment[];
};

export function MemoForm({
  recipients,
  draft,
}: {
  recipients: SelectOption[];
  draft?: MemoDraft;
}) {
  const [state, action] = useActionState<MemoState, FormData>(createMemoAction, {});
  const [to, setTo] = useState<string[]>(draft?.to ?? []);
  const [cc, setCc] = useState<string[]>(draft?.cc ?? []);
  const [bcc, setBcc] = useState<string[]>(draft?.bcc ?? []);
  // CC and BCC start collapsed unless the draft used them — most memos need
  // neither, and two extra empty selects make every memo feel like paperwork.
  const [showCc, setShowCc] = useState(Boolean(draft?.cc.length));
  const [showBcc, setShowBcc] = useState(Boolean(draft?.bcc.length));
  const [attachments, setAttachments] = useState<Attachment[]>(
    draft?.attachments ?? [],
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok && !draft) {
      formRef.current?.reset();
      setTo([]);
      setCc([]);
      setBcc([]);
      setAttachments([]);
    }
  }, [state.ok, draft]);

  async function attach(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/upload", { method: "POST", body });
      const result = (await response.json()) as {
        file?: { id: string; originalName: string; sizeBytes: number };
        error?: string;
      };

      if (!response.ok || !result.file) {
        setUploadError(result.error ?? "The upload failed.");
        return;
      }
      setAttachments((current) => [
        ...current,
        {
          fileId: result.file!.id,
          name: result.file!.originalName,
          sizeBytes: result.file!.sizeBytes,
        },
      ]);
    } catch {
      setUploadError("The upload could not be sent. Check your connection.");
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = "";
    }
  }

  return (
    <form ref={formRef} action={action}>
      {draft ? <input type="hidden" name="draftId" value={draft.id} /> : null}
      {to.map((id) => (
        <input key={id} type="hidden" name="recipientIds" value={id} />
      ))}
      {cc.map((id) => (
        <input key={id} type="hidden" name="ccIds" value={id} />
      ))}
      {bcc.map((id) => (
        <input key={id} type="hidden" name="bccIds" value={id} />
      ))}
      {attachments.map((entry) => (
        <input key={entry.fileId} type="hidden" name="attachmentIds" value={entry.fileId} />
      ))}

      <CardBody className="space-y-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message ?? "Saved."}</Alert> : null}

        <Field label="To" hint="Grouped by department: type to find someone." required>
          <SearchableSelect
            multiple
            placeholder="Choose staff…"
            searchPlaceholder="Name or job title…"
            options={recipients}
            value={to}
            onChange={(next) => setTo(next as string[])}
          />
        </Field>

        {showCc ? (
          <Field label="CC" hint="Kept informed; not expected to act.">
            <SearchableSelect
              multiple
              placeholder="Choose staff…"
              options={recipients}
              value={cc}
              onChange={(next) => setCc(next as string[])}
            />
          </Field>
        ) : null}

        {showBcc ? (
          <Field label="BCC" hint="Receives it; never shown to the other recipients.">
            <SearchableSelect
              multiple
              placeholder="Choose staff…"
              options={recipients}
              value={bcc}
              onChange={(next) => setBcc(next as string[])}
            />
          </Field>
        ) : null}

        {!showCc || !showBcc ? (
          <div className="flex gap-2 text-xs">
            {!showCc ? (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className="text-[var(--primary)] hover:underline"
              >
                + CC
              </button>
            ) : null}
            {!showBcc ? (
              <button
                type="button"
                onClick={() => setShowBcc(true)}
                className="text-[var(--primary)] hover:underline"
              >
                + BCC
              </button>
            ) : null}
          </div>
        ) : null}

        <Field label="Subject" htmlFor="subject" required>
          <Input
            id="subject"
            name="subject"
            required
            defaultValue={draft?.subject}
            placeholder="Results deadline"
          />
        </Field>

        <Field label="Body" htmlFor="body" required>
          <Textarea id="body" name="body" rows={6} required defaultValue={draft?.body} />
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Attachments</span>
            <button
              type="button"
              onClick={() => picker.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--primary)] hover:underline disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Paperclip className="size-3.5" />
              )}
              {uploading ? "Uploading…" : "Attach a file"}
            </button>
          </div>

          <input
            ref={picker}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void attach(file);
            }}
          />

          {uploadError ? (
            <p className="text-xs text-[var(--danger)]">{uploadError}</p>
          ) : null}

          {attachments.length ? (
            <ul className="space-y-1">
              {attachments.map((entry) => (
                <li
                  key={entry.fileId}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs"
                >
                  <Paperclip className="size-3 shrink-0 text-[var(--text-subtle)]" />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  <span className="shrink-0 text-[var(--text-subtle)]">
                    {formatBytes(entry.sizeBytes)}
                  </span>
                  <button
                    type="button"
                    title="Remove attachment"
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.fileId !== entry.fileId),
                      )
                    }
                    className="shrink-0 rounded p-0.5 text-[var(--text-subtle)] hover:text-[var(--text)]"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" htmlFor="kind">
            <SearchableSelect
              id="kind"
              name="kind"
              clearable={false}
              defaultValue={draft?.kind ?? "INTERNAL"}
              options={KINDS.map((value) => ({
                value,
                label: value.charAt(0) + value.slice(1).toLowerCase(),
              }))}
            />
          </Field>
          <Field label="Priority" htmlFor="priority">
            <SearchableSelect
              id="priority"
              name="priority"
              clearable={false}
              defaultValue={draft?.priority ?? "NORMAL"}
              options={PRIORITIES.map((value) => ({
                value,
                label: value.charAt(0) + value.slice(1).toLowerCase(),
              }))}
            />
          </Field>
        </div>

        <Field label="From department" htmlFor="fromDepartment">
          <Input
            id="fromDepartment"
            name="fromDepartment"
            defaultValue={draft?.fromDepartment}
            placeholder="Administration"
          />
        </Field>

        <CheckboxField
          name="requiresAck"
          defaultChecked={draft?.requiresAck}
          label="Require acknowledgement"
          description="Recipients must confirm they have read it, and the count is tracked."
        />
        <CheckboxField
          name="confidential"
          defaultChecked={draft?.confidential}
          label="Confidential"
          description="Marked clearly so it is not forwarded casually."
        />

        {/* Two buttons rather than an "issue immediately" checkbox — the same
            lesson as the student importer, where a mode checkbox nobody read
            meant nothing was ever saved. */}
        <div className="grid grid-cols-2 gap-2">
          <SubmitButton
            mode="draft"
            variant="outline"
            label={draft ? "Save draft" : "Save as draft"}
            busy="Saving…"
            disabled={!to.length}
          />
          <SubmitButton
            mode="issue"
            variant="primary"
            label="Issue now"
            busy="Issuing…"
            disabled={!to.length}
          />
        </div>
      </CardBody>
    </form>
  );
}

function SubmitButton({
  mode,
  label,
  busy,
  variant,
  disabled,
}: {
  mode: "draft" | "issue";
  label: string;
  busy: string;
  variant: "primary" | "outline";
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      name="mode"
      value={mode}
      variant={variant}
      className="w-full"
      disabled={pending || disabled}
    >
      {mode === "issue" ? <FileSignature className="size-4" /> : <Save className="size-4" />}
      {pending ? busy : label}
    </Button>
  );
}
