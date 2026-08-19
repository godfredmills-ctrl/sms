"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Paperclip, PenSquare, Send, X } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { formatBytes } from "@/lib/utils";

import {
  saveDraftAction,
  sendMessageAction,
  startConversationAction,
  type MessageState,
} from "./actions";

type Attached = { id: string; name: string; size: number };

/**
 * Files on a message.
 *
 * Uploaded as they are chosen rather than on submit, so the send is instant
 * and a failed upload is reported next to the file that failed rather than
 * as a lost message. The ids ride along as hidden inputs.
 */
function AttachmentField({
  attachments,
  setAttachments,
}: {
  attachments: Attached[];
  setAttachments: React.Dispatch<React.SetStateAction<Attached[]>>;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList) {
    setBusy(true);
    setError(null);
    const added: Attached[] = [];
    const failures: string[] = [];

    // Sequential: a handful of photographs from a phone racing through one
    // connection helps nobody.
    for (const file of Array.from(files)) {
      try {
        const body = new FormData();
        body.append("file", file);
        // The narrow mode: no cabinet folder, no publishing, and a short list
        // of formats. See src/app/api/upload/route.ts.
        body.append("purpose", "message");
        const response = await fetch("/api/upload", { method: "POST", body });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error ?? "Upload failed.");
        added.push({
          id: result.file.id,
          name: result.file.originalName ?? file.name,
          size: result.file.sizeBytes ?? file.size,
        });
      } catch (problem) {
        // Every failure, not just the last: picking five files and being told
        // about one of the three that failed is worse than being told none.
        failures.push(`${file.name}: ${(problem as Error).message}`);
      }
    }

    // Functional update: a file removed while this upload was in flight must
    // stay removed, and the closed-over array is from before it happened.
    setAttachments((current) => [...current, ...added]);
    setBusy(false);
    setError(failures.length ? failures.join("  ·  ") : null);
    if (picker.current) picker.current.value = "";
  }

  return (
    <div className="space-y-1.5">
      {attachments.map((file) => (
        <div key={file.id} className="flex items-center gap-2 text-xs">
          <input type="hidden" name="attachmentIds" value={file.id} />
          <Paperclip className="size-3 shrink-0 text-[var(--text-subtle)]" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="numeric shrink-0 text-[var(--text-subtle)]">
            {formatBytes(file.size)}
          </span>
          <button
            type="button"
            onClick={() =>
              setAttachments((current) => current.filter((f) => f.id !== file.id))
            }
            className="text-[var(--text-subtle)] hover:text-[var(--danger)]"
            aria-label={`Remove ${file.name}`}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}

      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}

      <input
        ref={picker}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => event.target.files && upload(event.target.files)}
      />
      <button
        type="button"
        onClick={() => picker.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Paperclip className="size-3" />
        )}
        {busy ? "Uploading…" : "Attach a file"}
      </button>
    </div>
  );
}

/** The reply box at the foot of an open thread. */
export function ReplyBox({
  conversationId,
  draft = "",
}: {
  conversationId: string;
  /** An unsent reply from a previous visit. */
  draft?: string;
}) {
  const [state, action] = useActionState<MessageState, FormData>(sendMessageAction, {});
  const [attachments, setAttachments] = useState<Attached[]>([]);
  const [body, setBody] = useState(draft);
  const formRef = useRef<HTMLFormElement>(null);

  // A new thread means a different draft — and ONLY a new thread. Keyed on
  // the draft prop as well, this re-ran whenever the server sent a fresh
  // value, rewinding the textarea under the cursor and emptying the
  // attachment list mid-compose.
  const loadedFor = useRef(conversationId);
  useEffect(() => {
    if (loadedFor.current === conversationId) return;
    loadedFor.current = conversationId;
    setBody(draft);
    setAttachments([]);
  }, [conversationId, draft]);

  // The draft saves itself a moment after typing stops. A draft you have to
  // remember to save is not a draft, and saving on every keystroke would
  // write a row per character.
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (body === draft) return;
    pending.current = body;
    const timer = setTimeout(() => {
      const data = new FormData();
      data.append("conversationId", conversationId);
      data.append("body", body);
      void saveDraftAction(data);
      pending.current = null;
    }, 1200);
    return () => clearTimeout(timer);
  }, [body, draft, conversationId]);

  // Leaving the page or switching threads cancels the timer above, which
  // used to throw the draft away — the one moment a draft exists to survive.
  // This flushes whatever was still waiting.
  useEffect(() => {
    const id = conversationId;
    return () => {
      if (pending.current === null) return;
      const data = new FormData();
      data.append("conversationId", id);
      data.append("body", pending.current);
      void saveDraftAction(data);
    };
  }, [conversationId]);

  // Cleared only once the server has actually accepted it. `action` is a
  // dispatch and returns immediately, so awaiting it waits for nothing —
  // clearing there threw away the reply and its attachments whenever a send
  // was refused, which is exactly when the words matter most.
  const sentAt = useRef<MessageState | null>(null);
  useEffect(() => {
    if (state.ok && state !== sentAt.current) {
      sentAt.current = state;
      pending.current = null;
      setBody("");
      setAttachments([]);
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-2 border-t border-[var(--border)] p-4"
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="flex items-end gap-2">
        <Textarea
          name="body"
          rows={2}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a reply…"
          aria-label="Reply"
          className="flex-1"
        />
        <SendButton />
      </div>

      <AttachmentField attachments={attachments} setAttachments={setAttachments} />
    </form>
  );
}

export function NewConversation({ people }: { people: SelectOption[] }) {
  const [open, setOpen] = useState(false);
  const [showCopies, setShowCopies] = useState(false);
  const [attachments, setAttachments] = useState<Attached[]>([]);
  const [state, action] = useActionState<MessageState, FormData>(
    startConversationAction,
    {},
  );

  // Sending closes the dialog and forgets what was in it. Left open, the
  // attachments and recipients stayed selected and the next Send re-sent
  // the same files to the same people.
  useEffect(() => {
    if (state.ok) {
      setAttachments([]);
      setShowCopies(false);
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <PenSquare className="size-4" />
        New message
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={() => setOpen(false)}
      />
      <div className="card relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
          <p className="text-sm font-semibold">New message</p>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </Button>
        </div>

        <form action={action} className="space-y-3 p-5">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">Message sent.</Alert> : null}

          <Field label="To" htmlFor="recipientIds" required>
            <SearchableSelect
              id="recipientIds"
              name="recipientIds"
              multiple
              required
              options={people}
              placeholder="Search staff, parents and students…"
            />
          </Field>

          {showCopies ? (
            <>
              <Field
                label="Cc"
                htmlFor="ccIds"
                hint="Everyone in the conversation sees who is copied."
              >
                <SearchableSelect
                  id="ccIds"
                  name="ccIds"
                  multiple
                  options={people}
                  placeholder="Copy someone in…"
                />
              </Field>
              <Field
                label="Bcc"
                htmlFor="bccIds"
                hint="Nobody but you sees these names — not even each other."
              >
                <SearchableSelect
                  id="bccIds"
                  name="bccIds"
                  multiple
                  options={people}
                  placeholder="Blind copy…"
                />
              </Field>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowCopies(true)}
              className="text-xs font-medium text-[var(--primary)]"
            >
              Add Cc or Bcc
            </button>
          )}

          <Field label="Subject" htmlFor="subject" hint="Optional, but it helps later.">
            <Input id="subject" name="subject" />
          </Field>

          <Field label="Message" htmlFor="body" required>
            <Textarea id="body" name="body" rows={4} />
          </Field>

          <AttachmentField attachments={attachments} setAttachments={setAttachments} />

          <SendButton label="Send message" full />
        </form>
      </div>
    </div>
  );
}

function SendButton({ label, full }: { label?: string; full?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={full ? "w-full" : undefined}>
      <Send className="size-4" />
      {pending ? "Sending…" : (label ?? "Send")}
    </Button>
  );
}
